import {
  createArticleVersion,
  isSameRevisionContent,
  type Revision,
  type RevisionSource,
} from "@newsplatform/domain";
import { BatchInputSchema } from "./schemas.ts";
import * as claimGenerate from "./stages/claim-generate.ts";
import * as contradiction from "./stages/contradiction.ts";
import * as evidenceExtract from "./stages/evidence-extract.ts";
import * as gate from "./stages/gate.ts";
import * as revisionStage from "./stages/revision.ts";
import {
  type ArticleInput,
  type BatchDeps,
  type BatchInput,
  type BatchReport,
  type BatchResult,
  type ConfirmedRevision,
  type DroppedClaim,
  StageFailure,
} from "./types.ts";

/** 개정판이 기록하는 프롬프트 버전(`<단계>@<정수>`). */
export const PROMPT_VERSIONS = {
  evidenceExtract: "evidence-extract@1",
  claimGenerate: "claim-generate@1",
  contradictionLabel: "contradiction-label@1",
} as const;

/** #21 Ruling 4: 이 티켓은 기록된 응답만 쓴다. */
const MODEL_ID = "recorded";

/** 리포트 사용량 줄의 순서. 수집·중복 제거·임베딩·사건 배정은 #21에서 통과 단계라 없다. */
const STAGES = [
  evidenceExtract.STAGE,
  claimGenerate.STAGE,
  gate.STAGE,
  contradiction.STAGE,
  revisionStage.STAGE,
] as const;

type Usage = { tokens: number; spend: number };

/** 사건 하나의 처리 결과: 새 개정판, 또는 이전 개정판과 같아 확인만 함(Ruling 22-11). */
type StoryOutcome =
  | { readonly kind: "revision"; readonly revision: Revision }
  | { readonly kind: "confirmed"; readonly confirmed: ConfirmedRevision };

/**
 * 배치 한 번(docs/spec/v1.md "배치와 비용"). 기사를 사건별로 묶어 사건마다
 * 근거 추출 → 주장 생성 → 게이트 1단계 → 상충 판정 → 개정판 생성을 돈다.
 * 사건 단위 원자성: 한 단계라도 실패하면 그 사건의 개정판을 만들지 않고 리포트에 사유를
 * 남긴 뒤 다음 사건으로 넘어간다. 배치 자체는 입력 스키마 위반이 아니면 던지지 않는다.
 * 상충 판정이 미발행(가드 ①)으로 정한 주장은 그 주장만 빼고 `droppedClaims`에 남긴다(Ruling 22-4).
 * 이전 개정판과 내용이 같으면 개정판 대신 `confirmed`에 확인만 남긴다(스펙 134행, Ruling 22-11).
 */
export async function runBatch(rawInput: BatchInput, deps: BatchDeps): Promise<BatchResult> {
  const input = BatchInputSchema.parse(rawInput);

  // 기록된 클라이언트는 사용량을 보고하지 않으므로 #21에서는 늘 0이다. 실제 모델 클라이언트가
  // 사용량을 돌려주게 되면 단계 호출마다 여기에 더한다.
  const usage = new Map<string, Usage>(STAGES.map((stage) => [stage, { tokens: 0, spend: 0 }]));
  const revisions: Revision[] = [];
  const confirmed: ConfirmedRevision[] = [];
  const failures: { storyId: string; reason: string }[] = [];
  // 실패한 사건의 빠진 주장도 남긴다(이유 추적용).
  const droppedClaims: DroppedClaim[] = [];
  let deferred = 0;

  for (const [storyId, articles] of groupByStory(input.articles)) {
    if (budgetReached(usage, input)) {
      deferred++;
      continue;
    }
    try {
      const outcome = await processStory(storyId, articles, input, deps, droppedClaims);
      if (outcome.kind === "revision") revisions.push(outcome.revision);
      else confirmed.push(outcome.confirmed);
    } catch (error) {
      failures.push({ storyId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const report: BatchReport = {
    processed: revisions.length + confirmed.length,
    deferred,
    failed: failures.length,
    failures,
    droppedClaims,
    usage: STAGES.map((stage) => ({ stage, ...(usage.get(stage) ?? { tokens: 0, spend: 0 }) })),
    budgetReached: budgetReached(usage, input),
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

function budgetReached(usage: ReadonlyMap<string, Usage>, input: BatchInput): boolean {
  let tokens = 0;
  let spend = 0;
  for (const entry of usage.values()) {
    tokens += entry.tokens;
    spend += entry.spend;
  }
  return tokens >= input.dailyBudget.tokens || spend >= input.dailyBudget.spend;
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
  for (const { version } of processable) {
    const { output, dropped } = await evidenceExtract.runEvidenceExtract(
      { articleVersionId: version.id, body: version.body },
      deps.modelClient,
    );
    for (const quote of output.quotes) {
      located.push({ quoteId: quote.quoteId, articleVersionId: version.id, span: quote.span });
      quoteIds.push(quote.quoteId);
    }
    for (const quote of dropped) quoteIds.push(quote.quoteId);
  }

  // 2. 주장 생성
  const generated = await claimGenerate.runClaimGenerate(
    { storyId, articleVersionIds: processable.map((v) => v.version.id), quoteIds },
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

  // 4. 상충 판정
  const byVersionId = new Map(versions.map((v) => [v.version.id, v]));
  const claims: revisionStage.RevisionInput["claims"] = [];
  for (const [index, claim] of generated.claims.entries()) {
    const evidence = (gated[index]?.evidence ?? []).map((item) => {
      const origin = byVersionId.get(item.articleVersionId);
      if (origin === undefined) throw new Error(`기사 버전 없음: ${item.articleVersionId}`);
      return { ...item, origin };
    });
    const claimId = revisionStage.claimId(story.slug, claim.claimKey);
    const { result, differsIn } = await contradiction.runContradictionLabel(
      {
        storyId,
        claimKey: claim.claimKey,
        previous: latest?.claims.find((c) => c.id === claimId)?.contradictionStatus,
        evidence: evidence.map((item) => ({
          quoteId: item.quoteId,
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

  // 5. 개정판 생성
  const sources: RevisionSource[] = versions.map(({ article, source }) => ({
    sourceId: source.id,
    articleId: article.id,
    articleTitle: article.title,
    articleUrl: article.url,
    publishedAt: article.publishedAt,
    rightsTier: source.rightsTier,
  }));
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
    modelId: MODEL_ID,
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
