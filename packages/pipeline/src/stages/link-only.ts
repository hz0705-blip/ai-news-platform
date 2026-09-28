import {
  ASSIGNMENT_THRESHOLDS,
  type AssignmentCandidate,
  type AssignmentThresholds,
  articleIdFor,
  decideAssignment,
  embeddingInputFor,
  type Revision,
  revisionWithSources,
  type Source,
} from "@newsplatform/domain";
import type { GdeltLink } from "../sources/gdelt.ts";
import type { EmbeddingClient } from "../types.ts";

/** 링크만 기사 단계가 쓰는 저장소 포트. 검색·쓰기는 DB가, 판정은 도메인이 한다. */
export interface LinkOnlyStore {
  /** 정규화 URL → 기존 기사 식별자. 없는 URL은 빠진다. */
  findArticleIdsByUrl(normalizedUrls: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** 기존 기사의 관측(GDELT가 본 시각)을 기록한다. 새 기사가 아니다. */
  recordObservations(
    items: readonly { readonly articleId: string; readonly observedAt: Date }[],
  ): Promise<void>;
  findCandidates(
    embedding: readonly number[],
    options: { readonly now: Date; readonly k: number },
  ): Promise<readonly AssignmentCandidate[]>;
  /** 링크만 기사(본문 버전 없음)를 사건에 붙여 저장한다. 출처가 없으면 함께 만든다. */
  saveLinkOnlyArticle(input: {
    readonly articleId: string;
    readonly storyId: string;
    readonly source: Source;
    readonly link: GdeltLink;
  }): Promise<void>;
  /**
   * 출처 추가 개정판의 바탕이 될 최신 개정판(출처 구획은 방금 붙은 링크를 포함한 현재 기사들).
   * 개정판이 없거나 모델 재처리를 기다리는 사건(미룸·입력 변경)이면 undefined — 그 사건의 다음 개정판이 링크를 담는다.
   */
  loadRevisionToExtend(storyId: string): Promise<Revision | undefined>;
  publishRevision(revision: Revision): Promise<void>;
}

export type LinkOutcome =
  | { readonly url: string; readonly kind: "observed"; readonly articleId: string }
  | { readonly url: string; readonly kind: "attached"; readonly storyId: string }
  | { readonly url: string; readonly kind: "discarded"; readonly reason: string };

export interface LinkOnlyResult {
  readonly outcomes: readonly LinkOutcome[];
  /** 출처 추가 개정판을 발행한 사건. */
  readonly revisedStoryIds: readonly string[];
  readonly usage: { readonly tokens: number; readonly spend: number };
}

/**
 * GDELT 링크를 붙인다(docs/spec/v1.md "개발 중 결정 항목" GDELT 수집, "사건 배정", "개정판 생성 조건", #77).
 * 1. 정규화 URL이 기존 기사와 같으면 그 기사의 관측으로만 기록한다.
 * 2. 새 URL은 제목만 임베딩해(`embeddingInputFor`, 설명·본문 없음) 보통의 사건 배정(임계값·마진)을 거친다.
 *    붙으면 링크만 기사로 저장하고, 못 붙으면 새 사건을 만들지 않고 버린다(근거 없는 사건은 발행할 수 없다).
 * 3. 링크가 붙은 사건은 모델을 부르지 않고 이전 개정판의 주장·상태를 그대로 둔 채 출처만 바뀐 새 개정판을
 *    발행한다(변화 "출처 추가", 비용 0). 링크만 기사는 근거가 없으므로 보도 원점 수는 그대로다.
 * 같은 URL이 여러 사건 결과에 나오면 처음 것만 쓴다.
 */
export async function attachLinkOnlyArticles(
  input: {
    readonly linksByStory: readonly { readonly links: readonly GdeltLink[] }[];
    readonly sources: readonly Source[];
    readonly now: Date;
    readonly thresholds?: AssignmentThresholds;
  },
  deps: { readonly embeddingClient: EmbeddingClient; readonly store: LinkOnlyStore },
): Promise<LinkOnlyResult> {
  const thresholds = input.thresholds ?? ASSIGNMENT_THRESHOLDS;
  const sourceById = new Map(input.sources.map((s) => [s.id, s]));
  const links = new Map<string, GdeltLink>();
  for (const group of input.linksByStory) {
    for (const link of group.links) {
      if (!links.has(link.normalizedUrl)) links.set(link.normalizedUrl, link);
    }
  }
  const outcomes: LinkOutcome[] = [];
  if (links.size === 0) {
    return { outcomes, revisedStoryIds: [], usage: { tokens: 0, spend: 0 } };
  }

  const existing = await deps.store.findArticleIdsByUrl([...links.keys()]);
  const observations: { articleId: string; observedAt: Date }[] = [];
  const fresh: GdeltLink[] = [];
  for (const link of links.values()) {
    const articleId = existing.get(link.normalizedUrl);
    if (articleId === undefined) {
      fresh.push(link);
      continue;
    }
    observations.push({ articleId, observedAt: link.observedAt });
    outcomes.push({ url: link.url, kind: "observed", articleId });
  }
  if (observations.length > 0) await deps.store.recordObservations(observations);

  const embedded =
    fresh.length === 0
      ? { vectors: [], usage: { tokens: 0, spend: 0 } }
      : await deps.embeddingClient.embed(
          fresh.map((link) =>
            embeddingInputFor({ title: link.title, description: undefined, body: "" }),
          ),
        );
  if (embedded.vectors.length !== fresh.length) {
    throw new Error(`임베딩 수 불일치: 요청 ${fresh.length}, 응답 ${embedded.vectors.length}`);
  }

  const attachedStories: string[] = [];
  for (const [i, link] of fresh.entries()) {
    const embedding = embedded.vectors[i];
    if (embedding === undefined) throw new Error(`임베딩 없음: ${link.url}`);
    const candidates = await deps.store.findCandidates(embedding, {
      now: input.now,
      k: thresholds.candidates,
    });
    const decision = decideAssignment({ candidates, now: input.now, thresholds });
    if (decision.kind !== "assign") {
      outcomes.push({ url: link.url, kind: "discarded", reason: decision.reason });
      continue;
    }
    const source = sourceById.get(link.sourceId);
    if (source === undefined) throw new Error(`링크의 출처 없음: ${link.sourceId}`);
    await deps.store.saveLinkOnlyArticle({
      articleId: articleIdFor(link.normalizedUrl),
      storyId: decision.storyId,
      source,
      link,
    });
    outcomes.push({ url: link.url, kind: "attached", storyId: decision.storyId });
    if (!attachedStories.includes(decision.storyId)) attachedStories.push(decision.storyId);
  }

  const revisedStoryIds: string[] = [];
  for (const storyId of attachedStories) {
    const previous = await deps.store.loadRevisionToExtend(storyId);
    if (previous === undefined) continue;
    await deps.store.publishRevision(
      revisionWithSources(previous, previous.sources, {
        revisionNumber: previous.revisionNumber + 1,
        publishedAt: input.now,
      }),
    );
    revisedStoryIds.push(storyId);
  }
  return { outcomes, revisedStoryIds, usage: embedded.usage };
}
