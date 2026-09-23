import { createArticleVersion, type Revision, type RevisionSource } from "@newsplatform/domain";
import { BatchInputSchema } from "./schemas.ts";
import * as claimGenerate from "./stages/claim-generate.ts";
import * as contradiction from "./stages/contradiction.ts";
import * as evidenceExtract from "./stages/evidence-extract.ts";
import * as gate from "./stages/gate.ts";
import * as revisionStage from "./stages/revision.ts";
import type { ArticleInput, BatchDeps, BatchInput, BatchReport, BatchResult } from "./types.ts";

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

/**
 * 배치 한 번(docs/spec/v1.md "배치와 비용"). 기사를 사건별로 묶어 사건마다
 * 근거 추출 → 주장 생성 → 게이트 1단계 → 상충 판정 → 개정판 생성을 돈다.
 * 사건 단위 원자성: 한 단계라도 실패하면 그 사건의 개정판을 만들지 않고 리포트에 사유를
 * 남긴 뒤 다음 사건으로 넘어간다. 배치 자체는 입력 스키마 위반이 아니면 던지지 않는다.
 */
export async function runBatch(rawInput: BatchInput, deps: BatchDeps): Promise<BatchResult> {
  const input = BatchInputSchema.parse(rawInput);

  // 기록된 클라이언트는 사용량을 보고하지 않으므로 #21에서는 늘 0이다. 실제 모델 클라이언트가
  // 사용량을 돌려주게 되면 단계 호출마다 여기에 더한다.
  const usage = new Map<string, Usage>(STAGES.map((stage) => [stage, { tokens: 0, spend: 0 }]));
  const revisions: Revision[] = [];
  const failures: { storyId: string; reason: string }[] = [];
  let deferred = 0;

  for (const [storyId, articles] of groupByStory(input.articles)) {
    if (budgetReached(usage, input)) {
      deferred++;
      continue;
    }
    try {
      revisions.push(await processStory(storyId, articles, input, deps));
    } catch (error) {
      failures.push({ storyId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const report: BatchReport = {
    processed: revisions.length,
    deferred,
    failed: failures.length,
    failures,
    usage: STAGES.map((stage) => ({ stage, ...(usage.get(stage) ?? { tokens: 0, spend: 0 }) })),
    budgetReached: budgetReached(usage, input),
  };

  return { revisions, changes: [], report };
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
): Promise<Revision> {
  // 사건 배정은 #21에서 통과 단계다: 기사가 이미 가진 storyId가 아는 사건이어야 한다(M2a에서 채운다).
  const state = input.existingStories.find((s) => s.story.id === storyId);
  if (storyId === "" || state === undefined) throw new Error("실패: 사건 미배정");

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
    const { contradictionStatus } = await contradiction.runContradictionLabel(
      {
        storyId,
        claimKey: claim.claimKey,
        evidence: evidence.map((item) => ({
          quoteId: item.quoteId,
          sourceId: item.origin.source.id,
          rightsTier: item.origin.source.rightsTier,
        })),
      },
      deps.modelClient,
    );
    claims.push({
      claimKey: claim.claimKey,
      text: claim.text,
      claimType: claim.claimType,
      modality: claim.modality,
      contradictionStatus,
      evidence: evidence.map(({ origin, ...item }) => ({
        ...item,
        articleId: origin.article.id,
        sourceId: origin.source.id,
        sourceUrl: origin.article.url,
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
  return revisionStage.runRevision({
    story: { id: state.story.id, slug: state.story.slug },
    title: generated.title,
    publishedAt: deps.clock(),
    promptVersions: PROMPT_VERSIONS,
    modelId: MODEL_ID,
    claims,
    sources,
  });
}
