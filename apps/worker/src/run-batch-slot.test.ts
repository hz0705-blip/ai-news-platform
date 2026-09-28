import {
  addBatchRunSpend,
  batchRuns,
  finishBatchRun,
  loadPublishedStory,
  startBatchRun,
} from "@newsplatform/db";
import {
  articles,
  articleVersions,
  createMigrationDb,
  EMBEDDING_DIMENSIONS,
  readTestDbUrl,
  sources,
  stories,
  toSourceRow,
  toStoryRow,
} from "@newsplatform/db/testing";
import { createArticleVersion } from "@newsplatform/domain";
import {
  createRecordedGdeltFetch,
  createRecordedModelClient,
  LIVE_REFERENCE_TIME,
  loadDemoStoryFixture,
  MODEL_ID,
} from "@newsplatform/pipeline";
import { describe, expect, it } from "vitest";
import { runBatchSlot } from "./run-batch-slot.ts";
import { findMissedSlotKeys } from "./schedule.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const SLOT_17 = "2026-09-27T17:00+09:00";
const SLOT_05 = "2026-09-27T05:00+09:00";
const live = loadDemoStoryFixture("live-hormuz-proposal");

/** 실제 기사로 기록한 픽스처를 테스트 DB에 넣는다(사건 하나, 기사 둘, 개정판 없음). 기록의 멱등키가 사건·기사 버전 id를 담으므로 id를 그대로 쓴다. */
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

  it("a recovered previous-day slot run today shares today's cap", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      // 오늘(KST 09-27) 05:00 슬롯이 이미 $1.0을 썼다.
      await startBatchRun(db, {
        slotKey: SLOT_05,
        slotAt: new Date("2026-09-26T20:00:00.000Z"),
        now: new Date("2026-09-26T20:00:00.000Z"),
        leaseMs: 1,
      });
      await addBatchRunSpend(db, { slotKey: SLOT_05, spendUsd: 1.0 });
      await finishBatchRun(db, {
        slotKey: SLOT_05,
        status: "completed",
        finishedAt: new Date("2026-09-26T20:30:00.000Z"),
      });
      // 어제 17:00 슬롯을 오늘 회복해 돌리면 예산은 슬롯 날짜가 아니라 오늘 기준이다.
      const result = await runBatchSlot({ slotKey: "2026-09-26T17:00+09:00" }, deps(db, []));
      expect(result.kind).toBe("completed");
      if (result.kind !== "completed") return;
      expect(result.report.spend.previousTodayUsd).toBeCloseTo(1.0, 10);
      expect(result.report.published).toBe(1);
      const rows = await db.select().from(batchRuns);
      expect(rows.find((r) => r.slot_key === "2026-09-26T17:00+09:00")?.started_at).toEqual(
        LIVE_REFERENCE_TIME,
      );
    } finally {
      await cleanup();
    }
  });

  it("today tag expires after the ledger row is completed, and on failure", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      // 발행 0건이어도 오늘 태그를 만료하고, 만료 시점에 원장은 이미 completed다.
      const seen: (string | undefined)[] = [];
      const tags: string[] = [];
      await runBatchSlot(
        { slotKey: SLOT_05 },
        {
          ...deps(db, tags),
          invalidateCache: async (sent: readonly string[]) => {
            tags.push(...sent);
            const [row] = await db.select().from(batchRuns);
            seen.push(row?.status);
          },
        },
      );
      expect(tags).toEqual(["today:ko"]);
      expect(seen).toEqual(["completed"]);

      // 완료 뒤 무효화가 실패해도(웹 장애) 슬롯은 completed로 남는다.
      const done = await runBatchSlot(
        { slotKey: SLOT_17 },
        {
          ...deps(db, []),
          invalidateCache: async () => {
            throw new Error("web down");
          },
        },
      );
      expect(done).toMatchObject({ kind: "completed", report: { cacheInvalidated: false } });
      const rows = await db.select().from(batchRuns);
      expect(rows.find((r) => r.slot_key === SLOT_17)?.status).toBe("completed");

      // 단계가 실패하면 원장 failed 뒤 오늘 태그를 만료한다(배정 단계 로그가 던지게 해 실패를 만든다).
      const failSeen: (string | undefined)[] = [];
      await expect(
        runBatchSlot(
          { slotKey: "2026-09-26T17:00+09:00" },
          {
            ...deps(db, []),
            invalidateCache: async () => {
              const row = (await db.select().from(batchRuns)).find(
                (r) => r.slot_key === "2026-09-26T17:00+09:00",
              );
              failSeen.push(row?.status);
            },
            log: (event: Record<string, unknown>) => {
              if (event.stage === "assign") throw new Error("stage down");
            },
          },
        ),
      ).rejects.toThrow("stage down");
      expect(failSeen).toEqual(["failed"]);
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

/** 1536차원 기저 벡터 하나. */
function axis(i: number): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  v[i] = 1;
  return v;
}

maybe("GDELT 단계(기록된 GDELT 응답)", () => {
  it("link-only articles attach to the published story as a source-added revision with zero model calls", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      // 사건 배정 후보가 되도록 기사 임베딩·중심을 사건 축에 둔다.
      const storyAxis = JSON.stringify(axis(0));
      await sql`update articles set embedding = ${storyAxis}::vector where story_id = ${live.story.id}`;
      await sql`update stories set centroid = ${storyAxis}::vector where id = ${live.story.id}`;

      const model = createRecordedModelClient("live-hormuz-proposal", { modelId: MODEL_ID });
      let modelCalls = 0;
      const callsAt: Record<string, number> = {};
      const run = (slotKey: string) =>
        runBatchSlot(
          { slotKey },
          {
            ...deps(db, []),
            modelClient: {
              modelId: model.modelId,
              complete: (request) => {
                modelCalls++;
                return model.complete(request);
              },
            },
            // 링크 제목만 임베딩한다: Hormuz가 있으면 사건 축, 없으면 직교 축(배정 실패 → 버림).
            embeddingClient: {
              embed: async (texts: readonly string[]) => ({
                vectors: texts.map((t) => (/hormuz/i.test(t) ? axis(0) : axis(1))),
                usage: { tokens: texts.length, spend: 0 },
              }),
            },
            gdelt: { fetch: createRecordedGdeltFetch(), sleep: async () => {} },
            log: (event: Record<string, unknown>) => {
              if (typeof event.stage === "string") callsAt[event.stage] = modelCalls;
            },
          },
        );

      const result = await run(SLOT_17);
      expect(result.kind).toBe("completed");
      if (result.kind !== "completed") return;
      const gdelt = result.report.gdelt;
      if (!("attached" in gdelt))
        throw new Error(`GDELT 단계가 돌지 않았다: ${JSON.stringify(gdelt)}`);
      expect(gdelt).toMatchObject({
        requestCount: 1,
        failures: [],
        revisedStoryIds: [live.story.id],
      });
      expect(gdelt.attached).toBeGreaterThan(0);
      expect(gdelt.discarded).toBeGreaterThan(0);
      // 발행 뒤 GDELT 단계에서 모델 호출이 없다.
      expect(callsAt.gdelt).toBe(callsAt.pipeline);

      const page = await loadPublishedStory(db, { slug: live.story.slug });
      expect(page?.revision.revisionNumber).toBe(2);
      expect(page?.claims.length).toBe(live.golden.claims.length);
      const linkRows = (await db.select().from(articles)).filter((r) => r.is_link_only);
      expect(linkRows).toHaveLength(gdelt.attached);
      expect(linkRows.every((r) => r.story_id === live.story.id && r.observed_at !== null)).toBe(
        true,
      );
      // 버린 링크로 새 사건을 만들지 않는다.
      expect(await db.select({ id: stories.id }).from(stories)).toEqual([{ id: live.story.id }]);

      // 다음 배치는 이 사건을 모델로 다시 처리하지 않는다(링크만 기사는 입력 변경이 아니다).
      const before = modelCalls;
      const next = await run("2026-09-28T05:00+09:00");
      expect(next).toMatchObject({ kind: "completed", report: { published: 0 } });
      expect(modelCalls).toBe(before);

      // 입력이 바뀌어(처리 시각 갱신) 같은 내용으로 재처리되면 확인만 한다 — 링크만 출처가 이어져야 같은 개정판이다.
      await sql`update stories set last_processed_at = now() + interval '1 day' where id = ${live.story.id}`;
      const reprocessed = await run("2026-09-28T17:00+09:00");
      expect(reprocessed).toMatchObject({
        kind: "completed",
        report: { published: 0, confirmed: 1 },
      });
      expect(modelCalls).toBeGreaterThan(before);
      const after = await loadPublishedStory(db, { slug: live.story.slug });
      expect(after?.revision.revisionNumber).toBe(2);
    } finally {
      await cleanup();
    }
  });
});
