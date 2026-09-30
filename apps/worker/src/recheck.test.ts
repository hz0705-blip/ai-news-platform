import { loadGnewsLedgerDay, loadRevisionChanges } from "@newstrail/db";
import {
  articleRechecks,
  articles,
  articleVersions,
  createMigrationDb,
  readTestDbUrl,
  sources,
  stories,
  toSourceRow,
  toStoryRow,
} from "@newstrail/db/testing";
import {
  articleVersionIdFor,
  createArticleVersion,
  normalizeBody,
  sha256Hex,
} from "@newstrail/domain";
import {
  createRecordedModelClient,
  LIVE_REFERENCE_TIME,
  loadDemoStoryFixture,
  loadRecordedRecheck,
  MODEL_ID,
} from "@newstrail/pipeline";
import { describe, expect, it } from "vitest";
import { runBatchSlot } from "./run-batch-slot.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

/** 실제 기사로 기록한 사건(#86)과 그 기사의 실제 GNews 정확 제목 조회 응답. */
const live = loadDemoStoryFixture("live-korea-pow-transfer");
const recorded = loadRecordedRecheck("korea-pow-transfer");
const article = live.articles[0] as (typeof live.articles)[number];
// LIVE_REFERENCE_TIME = 2026-09-27 17:00 KST 슬롯. 12시간 뒤 슬롯이 첫 재수집 일정이다.
const SLOT_FIRST = "2026-09-27T17:00+09:00";
const SLOT_RECHECK = "2026-09-28T05:00+09:00";
const RECHECK_AT = new Date(LIVE_REFERENCE_TIME.getTime() + 12 * 60 * 60 * 1000);

const INSERTED =
  "The presidential office said on Tuesday that consultations with Kaltenia would continue through diplomatic channels.";
const editedBody = (() => {
  const body = recorded.body as { articles: { content: string }[] };
  return (body.articles[0]?.content ?? "").replace("\n", `\n${INSERTED}\n`);
})();
const newVersionId = articleVersionIdFor(article.meta.id, sha256Hex(normalizeBody(editedBody)));

async function seed(db: Awaited<ReturnType<typeof createMigrationDb>>["db"]) {
  await db.insert(sources).values(live.sources.map(toSourceRow));
  await db.insert(stories).values({
    ...toStoryRow(live.story),
    last_new_report_at: LIVE_REFERENCE_TIME,
    last_processed_at: LIVE_REFERENCE_TIME,
  });
  await db.insert(articles).values({
    id: article.meta.id,
    source_id: article.meta.sourceId,
    story_id: live.story.id,
    url: article.meta.url,
    normalized_url: article.meta.url,
    external_id: null,
    title: article.meta.title,
    description: null,
    published_at: article.meta.publishedAt,
    topics: [...article.meta.topics],
    embedding: null,
  });
  const version = createArticleVersion({
    id: article.meta.articleVersionId,
    articleId: article.meta.id,
    rawBody: article.rawBody,
    capturedAt: LIVE_REFERENCE_TIME,
  });
  await db.insert(articleVersions).values({
    id: version.id,
    article_id: version.articleId,
    body: version.body,
    normalization_version: version.normalizationVersion,
    body_hash: version.bodyHash,
    captured_at: version.capturedAt,
    body_expires_at: new Date(article.meta.publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
  });
}

/**
 * GNews 대역: 정확 제목 조회(`in=title`)에는 기록된 실제 응답의 본문에 문단 하나를 넣어 돌려주고(원문 변경),
 * 토픽 수집 요청에는 빈 결과를 돌려준다. 네트워크는 타지 않는다.
 */
const gnewsFetch: typeof fetch = async (input) => {
  const requested = new URL(input instanceof Request ? input.url : input);
  const body =
    requested.searchParams.get("in") === "title"
      ? {
          ...(recorded.body as object),
          articles: (recorded.body as { articles: object[] }).articles.map((a) => ({
            ...a,
            content: editedBody,
          })),
        }
      : { totalArticles: 0, articles: [] };
  return new Response(JSON.stringify(body), { status: 200 });
};

function deps(db: Awaited<ReturnType<typeof createMigrationDb>>["db"], at: Date) {
  const [claimRecord] = Object.values(live.recorded.claimGenerate);
  return {
    db,
    embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
    // 새 버전의 근거 추출·주장 생성은 이전 버전의 실제 기록(같은 인용문)을 새 멱등키로 돌려준다.
    modelClient: createRecordedModelClient("live-korea-pow-transfer", {
      modelId: MODEL_ID,
      override: {
        "evidence-extract": {
          [newVersionId]: live.recorded.evidenceExtract[article.meta.articleVersionId],
        },
        "claim-generate": {
          [`${live.story.id}:${sha256Hex(newVersionId).slice(0, 12)}`]: claimRecord,
        },
      },
    }),
    clock: () => at,
    log: () => {},
  };
}

maybe("원문 재수집 단계(#86, 실 DB·기록된 GNews 응답)", () => {
  it("새 버전 → 사건 재처리 → 원문 변경 변화, 원장·일정·리포트 기록", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(db);
      // 첫 슬롯: 수집 없이 첫 개정판을 낸다(재수집 일정 전).
      const first = await runBatchSlot({ slotKey: SLOT_FIRST }, deps(db, LIVE_REFERENCE_TIME));
      expect(first.kind === "completed" && first.report.published).toBe(1);

      // 12시간 뒤 슬롯: 수집(빈 결과) → 재수집(새 버전) → 재처리(개정판 2, 원문 변경).
      const second = await runBatchSlot(
        { slotKey: SLOT_RECHECK },
        { ...deps(db, RECHECK_AT), gnews: { fetch: gnewsFetch, apiKey: "test-key" } },
      );
      if (second.kind !== "completed") throw new Error("배치가 완료되지 않았다");
      const { report } = second;
      expect(report.recheck).toEqual({
        due: 1,
        attempted: 1,
        found: 1,
        unconfirmed: 0,
        requestFailures: 0,
        newVersions: 1,
        correctionCandidates: 0,
        requestCount: 1,
        // 수집 4회(토픽 넷 × 1페이지) + 재수집 1회.
        ledger: { utcDate: "2026-09-27", remaining: 995, recheckRemaining: 599 },
        stoppedByLedger: false,
        storyIds: [live.story.id],
      });
      expect(report.published).toBe(1);
      expect(report.spanRealignmentRatio).toBe(1);
      expect(await loadGnewsLedgerDay(db, "2026-09-27")).toEqual({
        utcDate: "2026-09-27",
        discovery: 4,
        recheck: 1,
      });
      const recheckRows = await db.select().from(articleRechecks);
      expect(recheckRows).toHaveLength(1);
      expect(recheckRows[0]).toMatchObject({
        article_id: article.meta.id,
        slot: "12h",
        outcome: "찾음",
        article_version_id: newVersionId,
      });
      // 재수집은 신규 보도 시계를 리셋하지 않는다.
      const [story] = await db.select().from(stories);
      expect(story?.last_new_report_at).toEqual(LIVE_REFERENCE_TIME);

      const changes = await loadRevisionChanges(db, {
        revisionId: "live-korea-pow-transfer:rev-2",
      });
      expect(changes).toEqual([
        { kind: "원문 변경", articleId: article.meta.id, articleVersionId: newVersionId },
      ]);
    } finally {
      await cleanup();
    }
  });
});
