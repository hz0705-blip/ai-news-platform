import { batchRuns, loadPublishedStory } from "@newsplatform/db";
import {
  articles,
  articleVersions,
  createMigrationDb,
  sources,
  stories,
  toSourceRow,
  toStoryRow,
} from "@newsplatform/db/testing";
import { createArticleVersion } from "@newsplatform/domain";
import {
  createRecordedModelClient,
  LIVE_REFERENCE_TIME,
  loadDemoStoryFixture,
  MODEL_ID,
} from "@newsplatform/pipeline";
import { describe, expect, it } from "vitest";
import { runBatchSlot } from "./run-batch-slot.ts";
import { findMissedSlotKeys } from "./schedule.ts";

const url = process.env.DATABASE_MIGRATION_URL;
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_MIGRATION_URL 없음 — 실 DB 테스트 건너뜀\n");

const SLOT_17 = "2026-09-27T17:00+09:00";
const SLOT_05 = "2026-09-27T05:00+09:00";
const live = loadDemoStoryFixture("live-hormuz-proposal");

/** 실제 기사로 기록한 픽스처를 dev DB에 넣는다(사건 하나, 기사 둘, 개정판 없음). 기록의 멱등키가 사건·기사 버전 id를 담으므로 id를 그대로 쓴다. */
async function seedLiveStory(db: Awaited<ReturnType<typeof createMigrationDb>>["db"]) {
  await db.insert(sources).values(live.sources.map(toSourceRow));
  await db.insert(stories).values({
    ...toStoryRow(live.story),
    last_new_report_at: LIVE_REFERENCE_TIME,
    last_processed_at: LIVE_REFERENCE_TIME,
  });
  for (const article of live.articles) {
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
      body_expires_at: LIVE_REFERENCE_TIME,
    });
  }
}

function deps(db: Awaited<ReturnType<typeof createMigrationDb>>["db"], tags: string[]) {
  return {
    db,
    embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
    modelClient: createRecordedModelClient("live-hormuz-proposal", { modelId: MODEL_ID }),
    clock: () => LIVE_REFERENCE_TIME,
    invalidateCache: async (sent: readonly string[]) => {
      tags.push(...sent);
    },
    log: () => {},
  };
}

maybe("슬롯 배치(수집 건너뜀, 기록된 응답)", () => {
  it("same slot run twice processes once; report, ledger and cache tags are written", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);

      const tags: string[] = [];
      const first = await runBatchSlot({ slotKey: SLOT_17 }, deps(db, tags));
      expect(first.kind).toBe("completed");
      if (first.kind !== "completed") return;
      expect(first.report).toMatchObject({
        slotKey: SLOT_17,
        attempt: 1,
        collection: { skipped: true },
        published: 1,
        confirmed: 0,
        deferred: 0,
        failed: 0,
        spend: { budgetUsd: 1.2, previousTodayUsd: 0, budgetReached: false },
        cacheInvalidated: true,
      });
      expect(first.report.pipeline.usage.map((u) => u.stage)).toContain("gate");
      expect(tags).toEqual(["today:ko", `story:${live.story.id}:latest`]);

      const page = await loadPublishedStory(db, { slug: live.story.slug });
      expect(page?.revision.revisionNumber).toBe(1);
      expect(page?.claims.length).toBe(live.golden.claims.length);

      const second = await runBatchSlot({ slotKey: SLOT_17 }, deps(db, tags));
      expect(second).toEqual({ kind: "skipped", reason: "already-completed" });
      const rows = await db.select().from(batchRuns);
      expect(rows.map((r) => [r.slot_key, r.status, r.attempt])).toEqual([
        [SLOT_17, "completed", 1],
      ]);
      expect(rows[0]?.report).toMatchObject({ published: 1 });
    } finally {
      await cleanup();
    }
  });

  it("missed slot is recovered on worker start", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const now = new Date("2026-09-27T09:00:00.000Z"); // KST 18:00
      expect(await findMissedSlotKeys(db, { now })).toEqual([SLOT_05, SLOT_17]);
      const done = await runBatchSlot({ slotKey: SLOT_05 }, deps(db, []));
      expect(done.kind).toBe("completed");
      expect(await findMissedSlotKeys(db, { now })).toEqual([SLOT_17]);
    } finally {
      await cleanup();
    }
  });
});
