import {
  articleVersionIdFor,
  createArticleVersion,
  judgeRecheckedBody,
} from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { runBatch } from "./batch-run.ts";
import { LIVE_REFERENCE_TIME, loadDemoStoryFixture } from "./fixtures.ts";
import { MODEL_ID } from "./openai/client.ts";
import { createRecordedModelClient } from "./recorded.ts";
import { searchByExactTitle } from "./sources/gnews.ts";
import {
  createRecordedRecheckFetch,
  loadRecordedRecheck,
  type RecordedGnewsResponse,
} from "./sources/gnews-recorded.ts";
import { idempotencyKey as claimGenerateKey } from "./stages/claim-generate.ts";

/**
 * 원문 재수집 리플레이(#86): 기록된 GNews 정확 제목 조회 응답(`fixtures/gnews-recheck/korea-pow-transfer.json`,
 * 2026-09-29 기록)과 그 기사로 실제 모델을 돌려 기록한 사건(`fixtures/live-korea-pow-transfer`)을 쓴다.
 * 두 픽스처의 기사 본문·제목·URL은 직접 쓴 가상 텍스트로 바꿨다(#143).
 * 기록된 응답의 본문은 저장된 버전과 같으므로(해시 동일), 새 버전은 응답 본문에 문단을 넣어 만든다.
 * 새 버전의 근거 추출·주장 생성 응답은 같은 인용문을 가리키는 기록(이전 버전의 실제 응답)을 새 멱등키로 돌려준다.
 */
const live = loadDemoStoryFixture("live-korea-pow-transfer");
const recorded = loadRecordedRecheck("korea-pow-transfer");
const article = live.articles[0] as (typeof live.articles)[number];
const target = {
  title: article.meta.title,
  url: article.meta.url,
  publishedAt: article.meta.publishedAt,
};
const previousVersion = createArticleVersion({
  id: article.meta.articleVersionId,
  articleId: article.meta.id,
  rawBody: article.rawBody,
  capturedAt: LIVE_REFERENCE_TIME,
});
const recheckAt = new Date(LIVE_REFERENCE_TIME.getTime() + 12 * 60 * 60 * 1000);

/** 기록된 응답에서 대상 기사의 본문만 바꾼다. */
function withContent(edit: (content: string) => string): RecordedGnewsResponse {
  const body = recorded.body as { totalArticles: number; articles: { content: string }[] };
  return {
    ...recorded,
    body: { ...body, articles: body.articles.map((a) => ({ ...a, content: edit(a.content) })) },
  };
}

async function recheck(response: RecordedGnewsResponse) {
  const { result } = await searchByExactTitle(target, {
    fetch: createRecordedRecheckFetch(response),
    apiKey: "test-key",
  });
  if (result.kind !== "found") throw new Error("기록된 응답에서 기사를 찾지 못했다");
  return judgeRecheckedBody(previousVersion, result.article.content);
}

/** 재수집이 만든 새 버전으로 사건을 재처리한다(이전 개정판 = 기록 때의 정답). */
async function reprocess(judged: Awaited<ReturnType<typeof recheck>>) {
  if (judged.kind !== "새 버전") throw new Error("새 버전이 아니다");
  const versionId = articleVersionIdFor(article.meta.id, judged.bodyHash);
  const [claimRecord] = Object.values(live.recorded.claimGenerate);
  const newClaimKey = claimGenerateKey({
    storyId: live.story.id,
    articleVersionIds: [versionId],
    quoteIds: [],
    articles: [],
  });
  return {
    versionId,
    result: await runBatch(
      {
        articles: [
          {
            ...article.meta,
            articleVersionId: versionId,
            rawBody: judged.body,
            ...(judged.change === "정정 후보"
              ? { correctionCandidate: true, correctionFirstReprocess: true }
              : {}),
          },
        ],
        now: recheckAt,
        dailyBudget: { tokens: 1_000_000, spend: 1 },
        sources: live.sources,
        existingStories: [
          {
            story: live.story,
            latestRevision: live.golden,
            previousVersionBodies: [
              { articleVersionId: previousVersion.id, body: previousVersion.body },
            ],
          },
        ],
      },
      {
        modelClient: createRecordedModelClient("live-korea-pow-transfer", {
          modelId: MODEL_ID,
          override: {
            "evidence-extract": {
              [versionId]: live.recorded.evidenceExtract[previousVersion.id],
            },
            "claim-generate": { [newClaimKey]: claimRecord },
          },
        }),
        embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
        clock: () => recheckAt,
      },
    ),
  };
}

describe("원문 재수집 리플레이(#86)", () => {
  it("기록된 실제 재조회는 저장된 버전과 같아 변경 없음", async () => {
    expect(await recheck(recorded)).toEqual({ kind: "변경 없음" });
  });

  it("새 버전 → 사건 재처리 → 원문 변경 변화", async () => {
    const inserted =
      "The presidential office said on Tuesday that consultations with Kaltenia would continue through diplomatic channels.";
    const judged = await recheck(
      withContent((content) => content.replace("\n", `\n${inserted}\n`)),
    );
    expect(judged).toMatchObject({ kind: "새 버전", change: "원문 변경" });

    const { versionId, result } = await reprocess(judged);
    const [revision] = result.revisions;
    expect(revision?.id).toBe("live-korea-pow-transfer:rev-2");
    // 좌표 정렬로 이전 근거가 새 버전으로 옮겨져 주장 식별자가 이어진다.
    expect(revision?.claims.map((c) => c.id)).toEqual(live.golden.claims.map((c) => c.id));
    expect(result.report.spanRealignment).toEqual({ attempted: 3, aligned: 3 });
    // 근거만 새 버전 좌표로 옮겨졌으므로 주장 변화는 없고 원문 변경 하나다.
    expect(result.changes).toEqual([
      {
        storyId: live.story.id,
        revisionId: "live-korea-pow-transfer:rev-2",
        changes: [{ kind: "원문 변경", articleId: article.meta.id, articleVersionId: versionId }],
      },
    ]);
  });

  it("근거 구간이 그대로 옮겨진 주장은 상태가 바뀌지 않는다", async () => {
    const judged = await recheck(
      withContent(
        (content) =>
          `${content}\nCorrection: An earlier version of this article misstated the day the ambassador was summoned.`,
      ),
    );
    expect(judged).toMatchObject({ kind: "새 버전", change: "정정 후보" });

    // 정정 표지 문단만 붙어 모든 근거가 새 좌표로 그대로 옮겨지고 문장도 같다 → 명시 정정 입력 없음(#94).
    const { result } = await reprocess(judged);
    expect(result.report.spanRealignment).toEqual({ attempted: 3, aligned: 3 });
    // 상태가 그대로이고 정정 후보 버전은 원문 변경이 아니므로 변화 0건 → 새 개정판 없이 확인만 한다.
    expect(result.revisions).toEqual([]);
    expect(result.confirmed).toEqual([
      { storyId: live.story.id, revisionId: live.golden.id, checkedAt: recheckAt },
    ]);
  });
});
