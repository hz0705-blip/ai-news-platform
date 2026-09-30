import {
  ACTIVE_WINDOW_MS,
  type ArticleVersionRecord,
  type AssignmentCandidate,
  type Claim,
  cosineSimilarity,
  createArticleVersion,
  deriveReprocessContext,
  type Revision,
  type Source,
  type Story,
  TOPICS,
  type Topic,
} from "@newstrail/domain";
import { latestSlotAtOrBefore, slotKeyOf } from "@newstrail/domain/batch-slot";
import { runBatch } from "../batch-run.ts";
import { type AssignmentOutcome, type AssignmentStore, runAssignment } from "../stages/assign.ts";
import type {
  ArticleInput,
  BatchReport,
  ConfirmedRevision,
  EmbeddingClient,
  ModelClient,
  ModelRequest,
  StoryState,
} from "../types.ts";
import type { LocalPacket } from "./packet.ts";

/**
 * 도착 스트림 평가 실행(#149, 스펙 "골든셋과 평가": 여러 사건이 섞인 도착 스트림 단위).
 * 개발셋 패킷의 기사를 발행 시각 순으로 05·17시 KST 슬롯에 나눠, 슬롯마다 운영과 같은 순서로
 * 사건 배정(`runAssignment`) → 입력이 바뀐 사건만 `runBatch`를 돈다. 사건 상태(배정 후보·최신 개정판·주장 이력)는
 * 메모리에서 슬롯 사이로 잇는다(DB 없음). 사건 배정은 패킷 소속을 모른 채 처음부터 한다.
 */

const SLOT_MS = 12 * 60 * 60 * 1000;

/** 실행 한 번(도착 스트림 + 판정자) 합계 상한(USD). 호출 전 예약으로 지킨다. */
export const EVAL_RUN_CAP_USD = 3;
/** 판정자 몫으로 남겨 두는 금액. 도착 스트림은 상한에서 이것을 뺀 만큼만 쓴다. */
export const JUDGE_RESERVE_USD = 1;

/** 기사가 들어오는 슬롯: 발행 시각 이후 첫 05·17시 KST 슬롯. 슬롯 시각에 정확히 발행된 기사는 그 슬롯이다. */
export function arrivalSlot(publishedAt: Date): Date {
  const latest = latestSlotAtOrBefore(publishedAt);
  return latest.getTime() === publishedAt.getTime()
    ? latest
    : latestSlotAtOrBefore(new Date(publishedAt.getTime() + SLOT_MS));
}

export interface StreamArticle {
  readonly packetId: string;
  readonly article: LocalPacket["articles"][number];
  readonly topic: Topic;
}

/** 패킷 기사를 한 스트림으로 섞어 슬롯별로 나눈다. 슬롯 안은 발행 시각·기사 식별자 순. */
export function splitArrivalStream(
  packets: readonly LocalPacket[],
): { readonly slotAt: Date; readonly articles: readonly StreamArticle[] }[] {
  const all = packets
    .flatMap((p) =>
      p.articles.map((article) => ({ packetId: p.packetId, article, topic: p.topic })),
    )
    .sort(
      (x, y) =>
        x.article.publishedAt.localeCompare(y.article.publishedAt) ||
        x.article.articleId.localeCompare(y.article.articleId),
    );
  const slots = new Map<number, StreamArticle[]>();
  for (const item of all) {
    const at = arrivalSlot(new Date(item.article.publishedAt)).getTime();
    slots.set(at, [...(slots.get(at) ?? []), item]);
  }
  return [...slots]
    .sort(([a], [b]) => a - b)
    .map(([at, articles]) => ({ slotAt: new Date(at), articles }));
}

/**
 * 메모리 사건 배정 저장소: DB `findCandidateStories`와 같은 모양(가장 가까운 기사 K×4건의 사건 → 활성 창 72시간 안 →
 * 중심·대표 기사 유사도, 중심 내림차순 K건). 중심은 소속 기사 임베딩의 평균, 대표 기사는 발행 시각·식별자 순 첫 기사.
 */
export function createMemoryAssignmentStore(): AssignmentStore & {
  readonly topicsOf: (storyId: string) => readonly Topic[];
  readonly titleOf: (storyId: string) => string;
} {
  const articles: {
    id: string;
    storyId: string;
    embedding: readonly number[];
    publishedAt: Date;
  }[] = [];
  const stories = new Map<
    string,
    { title: string; topics: readonly Topic[]; lastNewReportAt: Date }
  >();
  const union = (a: readonly Topic[], b: readonly Topic[]) =>
    TOPICS.filter((t) => a.includes(t) || b.includes(t));
  return {
    async findCandidates(embedding, { now, k }) {
      const nearest = [...articles]
        .map((a) => ({ a, similarity: cosineSimilarity(a.embedding, embedding) }))
        .sort((x, y) => y.similarity - x.similarity || x.a.id.localeCompare(y.a.id))
        .slice(0, k * 4);
      const storyIds = [...new Set(nearest.map((n) => n.a.storyId))];
      const candidates: AssignmentCandidate[] = [];
      for (const storyId of storyIds) {
        const story = stories.get(storyId);
        if (
          story === undefined ||
          story.lastNewReportAt.getTime() < now.getTime() - ACTIVE_WINDOW_MS
        )
          continue;
        const members = articles
          .filter((a) => a.storyId === storyId)
          .sort(
            (x, y) => x.publishedAt.getTime() - y.publishedAt.getTime() || x.id.localeCompare(y.id),
          );
        const first = members[0];
        if (first === undefined) continue;
        const centroid = embedding.map(
          (_, i) => members.reduce((sum, m) => sum + (m.embedding[i] ?? 0), 0) / members.length,
        );
        candidates.push({
          storyId,
          centroidSimilarity: cosineSimilarity(centroid, embedding),
          representativeSimilarity: cosineSimilarity(first.embedding, embedding),
          lastNewReportAt: story.lastNewReportAt,
        });
      }
      return candidates
        .sort(
          (x, y) =>
            y.centroidSimilarity - x.centroidSimilarity || x.storyId.localeCompare(y.storyId),
        )
        .slice(0, k);
    },
    async assignToStory(input) {
      const story = stories.get(input.storyId);
      if (story === undefined) throw new Error(`사건 없음: ${input.storyId}`);
      articles.push({ id: input.articleId, ...input });
      stories.set(input.storyId, {
        title: story.title,
        topics: union(story.topics, input.topics),
        lastNewReportAt:
          story.lastNewReportAt < input.publishedAt ? input.publishedAt : story.lastNewReportAt,
      });
    },
    async createStory(input) {
      articles.push({ id: input.articleId, storyId: input.story.id, ...input });
      stories.set(input.story.id, {
        title: input.story.title,
        topics: input.story.topics,
        lastNewReportAt: input.publishedAt,
      });
    },
    async keepOnStory() {},
    topicsOf: (storyId) => stories.get(storyId)?.topics ?? [],
    titleOf: (storyId) => stories.get(storyId)?.title ?? "",
  };
}

/** 모델 응답 하나(기록 형식). 채점이 게이트 라벨·상충 라벨·주장을 여기서 읽는다. */
export interface ResponseRecord {
  readonly slotKey: string;
  readonly stage: string;
  readonly key: string;
  readonly output: unknown;
}

export interface SlotRecord {
  readonly slotKey: string;
  readonly slotAt: string;
  readonly arrivals: readonly string[];
  readonly assignment: readonly AssignmentOutcome[];
  /** 이번 슬롯에 `runBatch`에 넣은 사건. */
  readonly stories: readonly string[];
  readonly report: BatchReport;
  readonly revisions: readonly Revision[];
  readonly confirmed: readonly ConfirmedRevision[];
  /** 배정 + `runBatch`의 벽시계 시간. */
  readonly durationMs: number;
  readonly embeddingUsd: number;
  readonly modelUsd: number;
}

export interface StreamResult {
  readonly slots: readonly SlotRecord[];
  readonly responses: readonly ResponseRecord[];
  /** 기사 식별자 → 배정된 사건. 배정 전에 멈춘 기사는 없다. */
  readonly assignments: Readonly<Record<string, string>>;
  readonly unprocessed: {
    /** 예산 상한으로 멈춰 배정하지 않은 기사. */
    readonly articles: readonly string[];
    /** 끝까지 개정판이 없거나, 마지막 입력이 반영되지 않은 사건(사유: 예산·실패). */
    readonly stories: readonly { readonly storyId: string; readonly reason: string }[];
  };
  readonly stoppedByBudget: boolean;
}

export interface StreamDeps {
  readonly modelClient: ModelClient;
  readonly embeddingClient: EmbeddingClient;
  /** 이 실행의 파이프라인 한도(USD) 중 남은 값. 지출이 생길 때마다 호출자가 원장에 적는다. */
  readonly remainingUsd: () => number;
  readonly onSpend: (entry: { readonly stage: string; readonly spendUsd: number }) => void;
  readonly now?: () => number;
  readonly reservation?: (request: ModelRequest) => number;
  readonly log?: (line: string) => void;
}

/** 운영 배치의 토큰 한도는 USD 한도보다 먼저 닿지 않도록 크게 둔다(평가 한도는 USD). */
const TOKEN_LIMIT = 1_000_000_000;

export async function runArrivalStream(
  packets: readonly LocalPacket[],
  sources: readonly Source[],
  deps: StreamDeps,
): Promise<StreamResult> {
  const now = deps.now ?? Date.now;
  const store = createMemoryAssignmentStore();
  const assignments: Record<string, string> = {};
  const byId = new Map(packets.flatMap((p) => p.articles.map((a) => [a.articleId, a])));
  const topicOf = new Map(packets.flatMap((p) => p.articles.map((a) => [a.articleId, p.topic])));
  const state = new Map<
    string,
    {
      latest?: Revision;
      checkedAt?: Date;
      history: (readonly Claim[])[];
      capturedAt: Map<string, Date>;
    }
  >();
  const pending = new Map<string, string>(); // 사건 → 마지막 미처리 사유
  const slots: SlotRecord[] = [];
  const responses: ResponseRecord[] = [];
  const stream = splitArrivalStream(packets);
  let stoppedByBudget = false;
  const notAssigned: string[] = [];

  for (const { slotAt, articles } of stream) {
    const slotKey = slotKeyOf(slotAt);
    if (stoppedByBudget) {
      notAssigned.push(...articles.map((a) => a.article.articleId));
      continue;
    }
    const started = now();
    const assigned = await runAssignment(
      {
        now: slotAt,
        articles: articles.map(({ article, topic }) => ({
          id: article.articleId,
          storyId: null,
          title: article.title,
          description: article.description ?? undefined,
          body: article.body,
          publishedAt: new Date(article.publishedAt),
          topics: [topic],
        })),
      },
      { embeddingClient: deps.embeddingClient, store },
    );
    deps.onSpend({ stage: "embedding", spendUsd: assigned.usage.spend });
    for (const outcome of assigned.outcomes) {
      assignments[outcome.articleId] = outcome.storyId;
      pending.set(outcome.storyId, "미처리");
      const entry = state.get(outcome.storyId) ?? { history: [], capturedAt: new Map() };
      entry.capturedAt.set(outcome.articleId, slotAt);
      state.set(outcome.storyId, entry);
    }

    const storyIds = [...pending.keys()].sort();
    const existingStories: StoryState[] = [];
    const batchArticles: ArticleInput[] = [];
    for (const storyId of storyIds) {
      const entry = state.get(storyId);
      if (entry === undefined) continue;
      const members = [...entry.capturedAt.keys()].flatMap((id) => {
        const article = byId.get(id);
        return article === undefined ? [] : [article];
      });
      const versions: ArticleVersionRecord[] = members.map((a) => ({
        articleId: a.articleId,
        articleVersionId: a.articleVersionId,
        body: createArticleVersion({
          id: a.articleVersionId,
          articleId: a.articleId,
          rawBody: a.body,
          capturedAt: entry.capturedAt.get(a.articleId) ?? slotAt,
        }).body,
        capturedAt: entry.capturedAt.get(a.articleId) ?? slotAt,
        correctionCandidate: false,
      }));
      const context = deriveReprocessContext({
        latestRevision: entry.latest,
        latestCheckedAt: entry.checkedAt,
        claimHistory: entry.history,
        articleVersions: versions,
      });
      const story: Story = {
        id: storyId,
        slug: storyId,
        title: store.titleOf(storyId),
        topics: store.topicsOf(storyId),
        isDemo: false,
        lifecycle: "활성",
      };
      existingStories.push({
        story,
        ...(context.latestRevision === undefined ? {} : { latestRevision: context.latestRevision }),
        ...(context.previousVersionBodies === undefined
          ? {}
          : { previousVersionBodies: context.previousVersionBodies }),
        ...(context.openEpisodeClaims === undefined
          ? {}
          : { openEpisodeClaims: context.openEpisodeClaims }),
      });
      for (const a of members) {
        batchArticles.push({
          id: a.articleId,
          sourceId: a.sourceId,
          storyId,
          url: a.url,
          title: a.title,
          publishedAt: new Date(a.publishedAt),
          topics: [topicOf.get(a.articleId) ?? story.topics[0] ?? "기술·AI"],
          articleVersionId: a.articleVersionId,
          rawBody: a.body,
        });
      }
    }

    const recording: ModelClient = {
      modelId: deps.modelClient.modelId,
      async complete(request) {
        const response = await deps.modelClient.complete(request);
        responses.push({
          slotKey,
          stage: request.stage,
          key: request.key,
          output: response.output,
        });
        return response;
      },
    };
    const result = await runBatch(
      {
        articles: batchArticles,
        now: slotAt,
        dailyBudget: { tokens: TOKEN_LIMIT, spend: Math.max(0, deps.remainingUsd()) },
        sources,
        existingStories,
      },
      {
        modelClient: recording,
        embeddingClient: deps.embeddingClient,
        clock: () => slotAt,
        ...(deps.reservation === undefined ? {} : { reservation: deps.reservation }),
        onUsage: async (delta) => deps.onSpend({ stage: "pipeline", spendUsd: delta.spend }),
      },
    );

    for (const revision of result.revisions) {
      const entry = state.get(revision.storyId);
      if (entry === undefined) continue;
      entry.latest = revision;
      entry.checkedAt = slotAt;
      entry.history.push(revision.claims);
      pending.delete(revision.storyId);
    }
    for (const confirmed of result.confirmed) {
      const entry = state.get(confirmed.storyId);
      if (entry !== undefined) entry.checkedAt = slotAt;
      pending.delete(confirmed.storyId);
    }
    for (const failure of result.report.failures) pending.set(failure.storyId, failure.reason);
    for (const storyId of result.report.deferredStories) pending.set(storyId, "예산 상한");

    const modelUsd = result.report.usage.reduce((sum, u) => sum + u.spend, 0);
    slots.push({
      slotKey,
      slotAt: slotAt.toISOString(),
      arrivals: articles.map((a) => a.article.articleId),
      assignment: assigned.outcomes,
      stories: storyIds,
      report: result.report,
      revisions: result.revisions,
      confirmed: result.confirmed,
      durationMs: now() - started,
      embeddingUsd: assigned.usage.spend,
      modelUsd,
    });
    deps.log?.(
      `${slotKey} 기사 ${articles.length} 사건 ${storyIds.length} 개정판 ${result.revisions.length} 실패 ${result.report.failed} 미룸 ${result.report.deferred} $${modelUsd.toFixed(4)}`,
    );
    if (result.report.deferred > 0) stoppedByBudget = true;
  }

  return {
    slots,
    responses,
    assignments,
    unprocessed: {
      articles: notAssigned,
      stories: [...pending].map(([storyId, reason]) => ({ storyId, reason })),
    },
    stoppedByBudget,
  };
}
