import {
  createArticleVersion,
  isSameRevisionContent,
  type Revision,
  type RevisionSource,
} from "@newsplatform/domain";
import { MODEL_MAX_RETRIES, MODEL_RETRY_DELAY_MS, requestReservationUsd } from "./openai/client.ts";
import { prioritizeStories } from "./priority.ts";
import * as claimGeneratePrompt from "./prompts/claim-generate.ts";
import * as contradictionPrompt from "./prompts/contradiction-label.ts";
import * as evidenceExtractPrompt from "./prompts/evidence-extract.ts";
import * as gatePrompt from "./prompts/gate.ts";
import { BatchInputSchema } from "./schemas.ts";
import * as claimGenerate from "./stages/claim-generate.ts";
import * as contradiction from "./stages/contradiction.ts";
import * as evidenceExtract from "./stages/evidence-extract.ts";
import * as gate from "./stages/gate.ts";
import * as revisionStage from "./stages/revision.ts";
import {
  type ArticleInput,
  BatchDeadlineError,
  type BatchDeps,
  type BatchInput,
  type BatchReport,
  type BatchResult,
  BudgetExceededError,
  type ConfirmedRevision,
  type DroppedClaim,
  type ModelClient,
  type ModelRequest,
  ModelResponseError,
  ModelTransportError,
  type ModelUsage,
  StageFailure,
} from "./types.ts";

/** 개정판이 기록하는 프롬프트 버전(`<단계>@<정수>`, `src/prompts/`). */
export const PROMPT_VERSIONS = {
  evidenceExtract: evidenceExtractPrompt.PROMPT.version,
  claimGenerate: claimGeneratePrompt.PROMPT.version,
  gate: gatePrompt.PROMPT.version,
  contradictionLabel: contradictionPrompt.PROMPT.version,
} as const;

/** 리포트 사용량 줄의 순서. 수집·중복 제거·임베딩·사건 배정은 #21에서 통과 단계라 없다. */
const STAGES = [
  evidenceExtract.STAGE,
  claimGenerate.STAGE,
  gate.STAGE,
  contradiction.STAGE,
  revisionStage.STAGE,
] as const;

type Usage = { tokens: number; spend: number };

/** 동시에 처리하는 사건 수(스펙 "개발 중 결정 항목" 잡 큐 동시성, #55 Ruling). */
export const BATCH_CONCURRENCY = 4;

/**
 * 예산·기한·재시도를 맡는 클라이언트(#55). 호출마다 예약액을 남은 예산과 비교해 넘으면 호출하지 않고
 * `BudgetExceededError`, 배치 기한이 지났으면 `BatchDeadlineError`를 던진다(둘 다 그 사건을 미룬다).
 * 전송 오류·429·5xx는 시도마다 다시 예약하며 `MODEL_MAX_RETRIES`회 재시도하고, 제한 시간 초과처럼
 * 응답 없이 과금될 수 있는 시도는 예약액을 지출로 센다. 실패한 응답도 이미 쓴 사용량을 센다.
 * 동시 사건이 같은 예산을 나눠 쓰므로 예약은 진행 중인 호출까지 합쳐 본다.
 */
function budgetedClient(
  inner: ModelClient,
  usage: Map<string, Usage>,
  input: BatchInput,
  deps: BatchDeps,
): ModelClient {
  const reservationOf = deps.reservation ?? requestReservationUsd;
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let reserved = 0;
  const add = (stage: string, used: ModelUsage) => {
    const entry = usage.get(stage) ?? { tokens: 0, spend: 0 };
    usage.set(stage, { tokens: entry.tokens + used.tokens, spend: entry.spend + used.spend });
  };
  const reserve = (request: ModelRequest): number => {
    if (input.deadline !== undefined && deps.clock() >= input.deadline) {
      throw new BatchDeadlineError(request.stage, request.key);
    }
    const reservation = reservationOf(request);
    const remaining = input.dailyBudget.spend - totalUsage(usage).spend - reserved;
    if (reservation > remaining || totalUsage(usage).tokens >= input.dailyBudget.tokens) {
      throw new BudgetExceededError(request.stage, request.key, reservation, remaining);
    }
    reserved += reservation;
    return reservation;
  };
  return {
    modelId: inner.modelId,
    async complete(request) {
      for (let attempt = 0; ; attempt++) {
        const reservation = reserve(request);
        try {
          const response = await inner.complete(request);
          reserved -= reservation;
          add(request.stage, response.usage);
          return response;
        } catch (error) {
          reserved -= reservation;
          if (error instanceof ModelResponseError) add(request.stage, error.usage);
          if (error instanceof ModelTransportError) {
            if (error.billable) add(request.stage, { tokens: 0, spend: reservation });
            if (error.retryable && attempt < MODEL_MAX_RETRIES) {
              await sleep(MODEL_RETRY_DELAY_MS * 2 ** attempt);
              continue;
            }
          }
          throw error;
        }
      }
    },
  };
}

/** 사건 하나의 처리 결과: 새 개정판, 또는 이전 개정판과 같아 확인만 함(Ruling 22-11). */
type StoryOutcome =
  | { readonly kind: "revision"; readonly revision: Revision }
  | { readonly kind: "confirmed"; readonly confirmed: ConfirmedRevision };

/** 사건 하나가 배치 안에서 끝난 모양. 미룸은 실패가 아니다(다음 배치에서 우선). */
type StoryResult =
  | { readonly kind: "done"; readonly outcome: StoryOutcome }
  | { readonly kind: "deferred"; readonly reason: "budget" | "deadline" }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * 배치 한 번(docs/spec/v1.md "배치와 비용"). 기사를 사건별로 묶어 우선순위(`prioritizeStories`)로
 * 늘어놓고 `concurrency`개씩 동시에, 사건마다 근거 추출 → 주장 생성 → 게이트 1단계 → 게이트 2단계 →
 * 상충 판정 → 개정판 생성을 돈다. 출력 순서는 우선순위 순이다.
 * 사건 단위 원자성: 한 단계라도 실패하면 그 사건의 개정판을 만들지 않고 리포트에 사유를
 * 남긴 뒤 다음 사건으로 넘어간다. 배치 자체는 입력 스키마 위반이 아니면 던지지 않는다.
 * 예산이나 기한에 닿은 사건은 미루고(`deferredStories`), 그 뒤 사건은 시작하지 않는다.
 * 게이트 2단계를 통과하지 못했거나 상충 판정이 미발행(가드 ①)으로 정한 주장은 그 주장만 빼고
 * `droppedClaims`에 남긴다(Ruling 22-4).
 * 이전 개정판과 내용이 같으면 개정판 대신 `confirmed`에 확인만 남긴다(스펙 134행, Ruling 22-11).
 */
export async function runBatch(rawInput: BatchInput, deps: BatchDeps): Promise<BatchResult> {
  const input = BatchInputSchema.parse(rawInput);

  // 기록된 클라이언트의 사용량은 0이다. 실제 모델 클라이언트는 응답 usage를 USD로 바꿔 돌려준다.
  const usage = new Map<string, Usage>(STAGES.map((stage) => [stage, { tokens: 0, spend: 0 }]));
  const storyDeps = { ...deps, modelClient: budgetedClient(deps.modelClient, usage, input, deps) };
  // 실패한 사건의 빠진 주장도 남긴다(이유 추적용).
  const droppedClaims: DroppedClaim[] = [];

  const groups = prioritizeStories(
    [...groupByStory(input.articles)].map(([storyId, articles]) => {
      const state = input.existingStories.find((s) => s.story.id === storyId);
      return {
        storyId,
        articles,
        articleCount: articles.length,
        topics: state?.story.topics ?? [],
        ...(state?.deferredSince === undefined ? {} : { deferredSince: state.deferredSince }),
      };
    }),
  );

  // 사건이 끝날 때마다 그 사이의 사용량 증분을 호출자에게 넘긴다(원장에 지출을 증분 기록, #55).
  let reported: Usage = { tokens: 0, spend: 0 };
  const reportUsage = async () => {
    const total = totalUsage(usage);
    const delta = { tokens: total.tokens - reported.tokens, spend: total.spend - reported.spend };
    reported = total;
    if (deps.onUsage !== undefined && (delta.tokens > 0 || delta.spend > 0)) {
      await deps.onUsage(delta);
    }
  };

  // 한 사건이 예산·기한에 닿으면 아직 시작하지 않은 사건은 모두 미룬다.
  let stopped: "budget" | "deadline" | undefined;
  const results = await mapConcurrently(
    groups,
    input.concurrency ?? BATCH_CONCURRENCY,
    async (group): Promise<StoryResult> => {
      if (stopped !== undefined) return { kind: "deferred", reason: stopped };
      try {
        const outcome = await processStory(
          group.storyId,
          group.articles,
          input,
          storyDeps,
          droppedClaims,
        );
        return { kind: "done", outcome };
      } catch (error) {
        if (error instanceof BudgetExceededError || error instanceof BatchDeadlineError) {
          const reason = error instanceof BudgetExceededError ? "budget" : "deadline";
          stopped ??= reason;
          return { kind: "deferred", reason };
        }
        return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
      } finally {
        await reportUsage();
      }
    },
  );
  await reportUsage();

  const revisions: Revision[] = [];
  const confirmed: ConfirmedRevision[] = [];
  const failures: { storyId: string; reason: string }[] = [];
  const deferredStories: string[] = [];
  let deadlineReached = false;
  for (const [index, result] of results.entries()) {
    const storyId = groups[index]?.storyId ?? "";
    if (result.kind === "done") {
      if (result.outcome.kind === "revision") revisions.push(result.outcome.revision);
      else confirmed.push(result.outcome.confirmed);
    } else if (result.kind === "deferred") {
      deferredStories.push(storyId);
      if (result.reason === "deadline") deadlineReached = true;
    } else {
      failures.push({ storyId, reason: result.reason });
    }
  }

  const report: BatchReport = {
    processed: revisions.length + confirmed.length,
    deferred: deferredStories.length,
    failed: failures.length,
    failures,
    deferredStories,
    droppedClaims,
    usage: STAGES.map((stage) => ({ stage, ...(usage.get(stage) ?? { tokens: 0, spend: 0 }) })),
    budgetReached: stopped === "budget" || budgetReached(usage, input),
    deadlineReached,
  };

  return { revisions, confirmed, changes: [], report };
}

/** 입력 순서를 지키며 기사를 `storyId`별로 묶는다. */
function groupByStory(articles: readonly ArticleInput[]): Map<string, ArticleInput[]> {
  const groups = new Map<string, ArticleInput[]>();
  for (const article of articles) {
    const group = groups.get(article.storyId);
    if (group === undefined) groups.set(article.storyId, [article]);
    else group.push(article);
  }
  return groups;
}

/** 입력 순서대로 시작해 최대 `limit`개를 동시에 돌리고, 결과는 입력 순서로 돌려준다. */
async function mapConcurrently<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

function totalUsage(usage: ReadonlyMap<string, Usage>): Usage {
  let tokens = 0;
  let spend = 0;
  for (const entry of usage.values()) {
    tokens += entry.tokens;
    spend += entry.spend;
  }
  return { tokens, spend };
}

function budgetReached(usage: ReadonlyMap<string, Usage>, input: BatchInput): boolean {
  const total = totalUsage(usage);
  return total.tokens >= input.dailyBudget.tokens || total.spend >= input.dailyBudget.spend;
}

async function processStory(
  storyId: string,
  articles: readonly ArticleInput[],
  input: BatchInput,
  deps: BatchDeps,
  droppedClaims: DroppedClaim[],
): Promise<StoryOutcome> {
  // 사건 배정은 #21에서 통과 단계다: 기사가 이미 가진 storyId가 아는 사건이어야 한다(M2a에서 채운다).
  const state = input.existingStories.find((s) => s.story.id === storyId);
  if (storyId === "" || state === undefined) throw new Error("실패: 사건 미배정");
  const { story, latestRevision: latest } = state;
  const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
  if (latest !== undefined && latest.storyId !== story.id) {
    throw new StageFailure(
      revisionStage.STAGE,
      `${story.id}:rev:${revisionNumber}`,
      "이전 개정판의 사건이 다르다",
    );
  }

  const versions = articles.map((article) => {
    const source = input.sources.find((s) => s.id === article.sourceId);
    if (source === undefined) throw new Error("실패: 출처 미등록");
    const version = createArticleVersion({
      id: article.articleVersionId,
      articleId: article.id,
      rawBody: article.rawBody,
      capturedAt: input.now,
    });
    return { article, source, version };
  });

  // 링크만 기사는 근거 추출·게이트를 거치지 않고 출처 구획으로만 간다(Ruling 15).
  const processable = versions.filter((v) => v.source.rightsTier === "본문 처리 + 발췌 표시");

  // 1. 근거 추출
  const located: gate.GateInput["located"] = [];
  const quoteIds: string[] = [];
  const claimArticles: claimGenerate.ClaimGenerateInput["articles"] = [];
  for (const { version, article, source } of processable) {
    const { output, dropped } = await evidenceExtract.runEvidenceExtract(
      { articleVersionId: version.id, body: version.body },
      deps.modelClient,
    );
    for (const quote of output.quotes) {
      located.push({ quoteId: quote.quoteId, articleVersionId: version.id, span: quote.span });
      quoteIds.push(quote.quoteId);
    }
    for (const quote of dropped) quoteIds.push(quote.quoteId);
    claimArticles.push({
      sourceName: source.name,
      title: article.title,
      quotes: output.quotes.map(({ quoteId, quote }) => ({ quoteId, quote })),
    });
  }
  const duplicate = quoteIds.find((id, index) => quoteIds.indexOf(id) !== index);
  if (duplicate !== undefined) {
    throw new StageFailure(evidenceExtract.STAGE, storyId, `인용문 식별자 중복: ${duplicate}`);
  }

  // 2. 주장 생성
  const generated = await claimGenerate.runClaimGenerate(
    {
      storyId,
      articleVersionIds: processable.map((v) => v.version.id),
      quoteIds,
      articles: claimArticles,
    },
    deps.modelClient,
  );

  // 3. 게이트 1단계
  const articleVersions = processable.map(({ version, source }) => ({
    articleVersionId: version.id,
    body: version.body,
    normalizationVersion: version.normalizationVersion,
    rightsTier: source.rightsTier,
  }));
  const gated = generated.claims.map((claim) =>
    gate.runGate({
      storyId,
      claimKey: claim.claimKey,
      quoteIds: claim.quoteIds,
      located,
      articleVersions,
    }),
  );

  // 3-2. 게이트 2단계, 4. 상충 판정
  const byVersionId = new Map(versions.map((v) => [v.version.id, v]));
  const claims: revisionStage.RevisionInput["claims"] = [];
  for (const [index, claim] of generated.claims.entries()) {
    const passed = gated[index]?.evidence ?? [];
    const support = await gate.runGateSupport(
      {
        storyId,
        claimKey: claim.claimKey,
        claim: { text: claim.text, claimType: claim.claimType, modality: claim.modality },
        evidence: passed.map(({ quoteId, spanText }) => ({ quoteId, spanText })),
      },
      deps.modelClient,
    );
    if (!support.publish) {
      droppedClaims.push({ storyId, claimKey: claim.claimKey, reason: support.reason });
      continue;
    }
    const kept = new Set(support.kept);
    const evidence = passed
      .filter((item) => kept.has(item.quoteId))
      .map((item) => {
        const origin = byVersionId.get(item.articleVersionId);
        if (origin === undefined) throw new Error(`기사 버전 없음: ${item.articleVersionId}`);
        return { ...item, origin };
      });
    const claimId = revisionStage.claimId(story.slug, claim.claimKey);
    const { result, differsIn } = await contradiction.runContradictionLabel(
      {
        storyId,
        claimKey: claim.claimKey,
        claimText: claim.text,
        previous: latest?.claims.find((c) => c.id === claimId)?.contradictionStatus,
        evidence: evidence.map((item) => ({
          quoteId: item.quoteId,
          quote: item.spanText,
          sourceId: item.origin.source.id,
          rightsTier: item.origin.source.rightsTier,
          ...(item.origin.source.wireId === undefined ? {} : { wireId: item.origin.source.wireId }),
        })),
      },
      deps.modelClient,
    );
    if (!result.publish) {
      droppedClaims.push({ storyId, claimKey: claim.claimKey, reason: result.reason });
      continue;
    }
    claims.push({
      claimKey: claim.claimKey,
      text: claim.text,
      claimType: claim.claimType,
      modality: claim.modality,
      contradictionStatus: result.status,
      evidence: evidence.map(({ origin, ...item }) => ({
        ...item,
        articleId: origin.article.id,
        sourceId: origin.source.id,
        sourceUrl: origin.article.url,
        differsIn: differsIn[item.quoteId],
      })),
    });
  }

  // 5. 개정판 생성. 출처 구획 = 본문 있는 기사 + 붙은 링크만 기사(#77).
  const sources: RevisionSource[] = [
    ...versions.map(({ article, source }) => ({
      sourceId: source.id,
      articleId: article.id,
      articleTitle: article.title,
      articleUrl: article.url,
      publishedAt: article.publishedAt,
      rightsTier: source.rightsTier,
    })),
    ...(state.linkOnlySources ?? []),
  ];
  if (claims.length === 0) {
    throw new StageFailure(
      revisionStage.STAGE,
      `${story.id}:rev:${revisionNumber}`,
      "표시할 주장이 없다",
    );
  }
  // Ruling 22-8: 이전 개정판에서 보도 상충이던 주장이 이번 개정판에 없으면 그 에피소드는 아직 열려 있다.
  const publishedClaimIds = new Set(
    claims.map((c) => revisionStage.claimId(story.slug, c.claimKey)),
  );
  const openEpisodes =
    latest?.claims.filter(
      (c) => c.contradictionStatus === "보도 상충" && !publishedClaimIds.has(c.id),
    ).length ?? 0;
  const draft = revisionStage.runRevision({
    story: { id: story.id, slug: story.slug },
    revisionNumber,
    openEpisodes,
    title: generated.title,
    publishedAt: deps.clock(),
    promptVersions: PROMPT_VERSIONS,
    modelId: deps.modelClient.modelId,
    claims,
    sources,
  });
  if (latest !== undefined && isSameRevisionContent(latest, draft)) {
    return {
      kind: "confirmed",
      confirmed: { storyId: story.id, revisionId: latest.id, checkedAt: input.now },
    };
  }
  return { kind: "revision", revision: draft };
}
