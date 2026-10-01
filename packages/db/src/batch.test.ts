import { describe, expect, it } from "vitest";
import {
  addBatchRunSpend,
  clearStoriesDeferred,
  DEFERRED_STALE_MS,
  finishBatchRun,
  loadBatchRunsSince,
  loadBatchStories,
  loadLastCompletedSlot,
  loadSpendBetween,
  markStoriesDeferred,
  startBatchRun,
} from "./batch.ts";
import { loadRevisionToExtend } from "./gdelt.ts";
import { confirmRevision } from "./publish.ts";
import { articles, articleVersions, sources, stories } from "./schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";
import { fixture, publishFixture } from "./test-fixtures.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const now = new Date("2026-09-27T08:00:00.000Z"); // KST 17:00
const LEASE_MS = 90 * 60 * 1000;
const slot = (key: string, at: Date) => ({ slotKey: key, slotAt: at, now, leaseMs: LEASE_MS });
const SLOT_17 = "2026-09-27T17:00+09:00";
const SLOT_05 = "2026-09-27T05:00+09:00";
const at05 = new Date("2026-09-26T20:00:00.000Z");
/** KST 날짜 범위(UTC 15:00 시작). 워커 `kstDayRange`와 같은 계산이지만 db 테스트는 워커를 import하지 않는다. */
function kstDayOf(instant: Date): { from: Date; to: Date } {
  const kst = instant.getTime() + 9 * 60 * 60 * 1000;
  const start = Math.floor(kst / 86_400_000) * 86_400_000 - 9 * 60 * 60 * 1000;
  return { from: new Date(start), to: new Date(start + 86_400_000) };
}

maybe("슬롯 원장과 리스", () => {
  it("same slot run twice processes once", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      expect(await startBatchRun(db, slot(SLOT_17, now))).toEqual({ kind: "started", attempt: 1 });
      await addBatchRunSpend(db, { slotKey: SLOT_17, spendUsd: 0.3 });
      await finishBatchRun(db, {
        slotKey: SLOT_17,
        status: "completed",
        finishedAt: now,
        report: { processed: 1 },
      });
      expect(await startBatchRun(db, slot(SLOT_17, now))).toEqual({
        kind: "already-completed",
        finishedAt: now,
      });
      expect(await loadLastCompletedSlot(db)).toEqual({ slotKey: SLOT_17, slotAt: now });
    } finally {
      await cleanup();
    }
  });

  it("lease prevents concurrent batches, and a failed or expired run can be retried", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await startBatchRun(db, slot(SLOT_05, at05));
      expect(await startBatchRun(db, slot(SLOT_17, now))).toMatchObject({
        kind: "busy",
        slotKey: SLOT_05,
      });
      // 같은 슬롯을 다시 시작해도 리스가 살아 있으면 막힌다.
      expect(await startBatchRun(db, slot(SLOT_05, at05))).toMatchObject({ kind: "busy" });

      await finishBatchRun(db, {
        slotKey: SLOT_05,
        status: "failed",
        finishedAt: now,
        error: "boom",
      });
      // 실패한 슬롯은 시도 횟수를 올려 다시 돈다.
      expect(await startBatchRun(db, slot(SLOT_05, at05))).toEqual({ kind: "started", attempt: 2 });
      // 리스가 만료된 채 남은 실행(죽은 프로세스)은 다른 슬롯을 막지 않는다.
      const later = new Date(now.getTime() + LEASE_MS + 1);
      expect(await startBatchRun(db, { ...slot(SLOT_17, now), now: later })).toEqual({
        kind: "started",
        attempt: 1,
      });
    } finally {
      await cleanup();
    }
  });

  it("retry accumulates spend, and spend is visible in the ledger before finish", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const day = kstDayOf(now);
      await startBatchRun(db, slot(SLOT_05, at05));
      await addBatchRunSpend(db, { slotKey: SLOT_05, spendUsd: 1.1 });
      // 아직 끝나지 않았어도 지출은 원장에 있다(실행 중 죽어도 남는다).
      expect(await loadSpendBetween(db, day)).toBeCloseTo(1.1, 10);
      await finishBatchRun(db, { slotKey: SLOT_05, status: "failed", finishedAt: now, error: "x" });

      // 재시도의 지출은 이전 시도 위에 쌓인다(덮어쓰지 않는다).
      await startBatchRun(db, slot(SLOT_05, at05));
      await addBatchRunSpend(db, { slotKey: SLOT_05, spendUsd: 0.1 });
      await finishBatchRun(db, { slotKey: SLOT_05, status: "completed", finishedAt: now });
      expect(await loadSpendBetween(db, day)).toBeCloseTo(1.2, 10);

      // 지출 합은 시도 시작 시각(`started_at`)의 KST 날짜로 센다 — 어제 시작한 실행은 오늘에 들지 않는다.
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      await startBatchRun(db, { ...slot("2026-09-26T17:00+09:00", yesterday), now: yesterday });
      await addBatchRunSpend(db, { slotKey: "2026-09-26T17:00+09:00", spendUsd: 0.5 });
      expect(await loadSpendBetween(db, day)).toBeCloseTo(1.2, 10);
      expect((await loadBatchRunsSince(db, now)).map((r) => r.slot_key)).toEqual([]);
      expect((await loadBatchRunsSince(db, at05)).map((r) => r.slot_key).sort()).toEqual([SLOT_05]);
    } finally {
      await cleanup();
    }
  });
});

async function seedLiveStory(db: Awaited<ReturnType<typeof createMigrationDb>>["db"]) {
  await db.insert(sources).values({
    id: "gnews:src",
    name: "Src",
    rights_tier: "본문 처리 + 발췌 표시",
    region: "us",
    ownership: "불명",
    language: "영어",
    is_fictional: false,
    wire_id: null,
    external_id: "src",
  });
  await db.insert(stories).values({
    id: "story-live",
    slug: "story-live",
    title: "Live",
    topics: ["기술·AI"],
    is_demo: false,
    lifecycle: "활성",
    centroid: null,
    last_new_report_at: now,
    last_processed_at: now,
    deferred_at: null,
  });
  await db.insert(articles).values({
    id: "a-live",
    source_id: "gnews:src",
    story_id: "story-live",
    url: "https://example.com/live",
    normalized_url: "https://example.com/live",
    external_id: null,
    title: "Live title",
    description: null,
    published_at: now,
    topics: ["기술·AI"],
    embedding: null,
  });
  await db.insert(articleVersions).values({
    id: "av-live",
    article_id: "a-live",
    body: "Live body.",
    normalization_version: 1,
    body_hash: "h",
    captured_at: now,
    body_expires_at: now,
  });
}

maybe("배치 대상 사건", () => {
  it("입력이 바뀐 라이브 사건만 고르고, 데모·확인된 사건은 빼며, 미룬 사건은 표시와 함께 온다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      // 데모 사건은 개정판이 없어도 대상이 아니다.
      await db.insert(stories).values({
        id: "story-demo",
        slug: "story-demo",
        title: "Demo",
        topics: ["기술·AI"],
        is_demo: true,
        lifecycle: "종료",
        centroid: null,
        last_new_report_at: null,
        last_processed_at: null,
        deferred_at: null,
      });
      const first = await loadBatchStories(db, { now });
      expect(first.stories.map((s) => s.story.id)).toEqual(["story-live"]);
      expect(first.stories[0]?.articles).toEqual([
        expect.objectContaining({
          id: "a-live",
          articleVersionId: "av-live",
          rawBody: "Live body.",
        }),
      ]);
      expect(first.sources.map((s) => s.id)).toEqual(["gnews:src"]);
      expect(first.stories[0]?.latestRevision).toBeUndefined();
      expect(first.stories[0]?.deferredSince).toBeUndefined();

      // 개정판을 발행(확인 시각 = 처리 시각)하면 입력이 바뀌지 않은 한 다시 고르지 않는다.
      await publishFixture(db, {
        ...fixture,
        story: { ...fixture.story, id: "story-live", slug: "story-live", isDemo: false },
        revision: {
          ...fixture.revision,
          id: "story-live:rev-1",
          storyId: "story-live",
          publishedAt: now,
        },
      });
      expect((await loadBatchStories(db, { now })).stories).toEqual([]);

      // 미루면 다시 대상이고, 처리 표시를 지우면 빠진다.
      await markStoriesDeferred(db, { storyIds: ["story-live"], at: now });
      const deferred = await loadBatchStories(db, { now });
      expect(deferred.stories[0]?.deferredSince).toEqual(now);
      expect(deferred.stories[0]?.latestRevision?.id).toBe("story-live:rev-1");
      await clearStoriesDeferred(db, ["story-live"]);
      expect((await loadBatchStories(db, { now })).stories).toEqual([]);

      // 확인만 된 뒤 새 처리(배정)가 있으면 다시 대상이다.
      const later = new Date(now.getTime() + 60_000);
      await confirmRevision(db, { revisionId: "story-live:rev-1", checkedAt: later });
      expect((await loadBatchStories(db, { now })).stories).toEqual([]);
      await db.update(stories).set({ last_processed_at: new Date(later.getTime() + 1) });
      expect((await loadBatchStories(db, { now })).stories.map((s) => s.story.id)).toEqual([
        "story-live",
      ]);
    } finally {
      await cleanup();
    }
  });
});

maybe("48시간 넘게 미룬 사건", () => {
  const stale = new Date(now.getTime() - DEFERRED_STALE_MS - 60_000);
  const recent = new Date(now.getTime() - DEFERRED_STALE_MS + 60_000);

  it("loadBatchStories skips stories deferred over 48h without new article versions", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      // 기사 버전(av-live, captured_at = now)보다 뒤에 미룬 것으로 둔다 — 미룬 뒤 새 버전 없음.
      await db.update(articleVersions).set({ captured_at: new Date(stale.getTime() - 1) });
      await db.update(stories).set({ deferred_at: stale });
      expect((await loadBatchStories(db, { now })).stories).toEqual([]);
      // 행과 deferred_at은 지우지 않는다.
      const [row] = await db.select().from(stories);
      expect(row?.deferred_at).toEqual(stale);

      // 48시간 안이면 미룬 시각과 함께 온다.
      await db.update(stories).set({ deferred_at: recent });
      const loaded = await loadBatchStories(db, { now });
      expect(loaded.stories.map((s) => s.story.id)).toEqual(["story-live"]);
      expect(loaded.stories[0]?.deferredSince).toEqual(recent);
    } finally {
      await cleanup();
    }
  });

  it("loadBatchStories returns a stale deferred story with a new version but without deferredSince", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      // av-live(captured_at = now)는 미룬 뒤에 들어온 새 버전이다.
      await db.update(stories).set({ deferred_at: stale });
      const loaded = await loadBatchStories(db, { now });
      expect(loaded.stories.map((s) => s.story.id)).toEqual(["story-live"]);
      expect(loaded.stories[0]?.deferredSince).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("markStoriesDeferred restarts deferred_at older than 48h and keeps a recent one", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      await db.update(stories).set({ deferred_at: stale });
      await markStoriesDeferred(db, { storyIds: ["story-live"], at: now });
      expect((await db.select().from(stories))[0]?.deferred_at).toEqual(now);

      await db.update(stories).set({ deferred_at: recent });
      await markStoriesDeferred(db, { storyIds: ["story-live"], at: now });
      expect((await db.select().from(stories))[0]?.deferred_at).toEqual(recent);
    } finally {
      await cleanup();
    }
  });
});

maybe("재처리 필요 조건", () => {
  it("배치 대상(loadBatchStories)과 출처 추가 바탕(loadRevisionToExtend)은 같은 조건의 정·역이다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      /** [배치 대상인가, 확장할 개정판이 있는가] — 늘 정확히 하나만 참이다. */
      const sides = async () => [
        (await loadBatchStories(db, { now })).stories.some((s) => s.story.id === "story-live"),
        (await loadRevisionToExtend(db, "story-live")) !== undefined,
      ];
      // 개정판 없음 → 재처리 필요.
      expect(await sides()).toEqual([true, false]);

      await publishFixture(db, {
        ...fixture,
        story: { ...fixture.story, id: "story-live", slug: "story-live", isDemo: false },
        revision: {
          ...fixture.revision,
          id: "story-live:rev-1",
          storyId: "story-live",
          publishedAt: now,
        },
      });
      // 처리 시각 = 확인 시각 → 재처리 필요 없음.
      expect(await sides()).toEqual([false, true]);

      // 미룸 → 재처리 필요.
      await markStoriesDeferred(db, { storyIds: ["story-live"], at: now });
      expect(await sides()).toEqual([true, false]);
      await clearStoriesDeferred(db, ["story-live"]);

      // 처리 시각이 확인 시각보다 늦음 → 재처리 필요.
      await db.update(stories).set({ last_processed_at: new Date(now.getTime() + 1) });
      expect(await sides()).toEqual([true, false]);

      // 처리 시각 없음 → 늦지 않은 것으로 본다.
      await db.update(stories).set({ last_processed_at: null });
      expect(await sides()).toEqual([false, true]);
    } finally {
      await cleanup();
    }
  });
});
