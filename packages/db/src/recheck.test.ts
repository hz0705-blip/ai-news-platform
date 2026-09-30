import { readFileSync } from "node:fs";
import { createArticleVersion, planRechecks } from "@newstrail/domain";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadBatchStories } from "./batch.ts";
import { confirmRevision } from "./publish.ts";
import {
  addGnewsRequests,
  loadDormantSampledToday,
  loadGnewsLedgerDay,
  loadRecheckCandidates,
  loadRecheckTargets,
  saveRecheckResult,
} from "./recheck.ts";
import { applyRetention } from "./retention.ts";
import { articleRechecks, articles, articleVersions, evidence, stories } from "./schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";
import { fixture, publishFixture } from "./test-fixtures.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const HOUR = 60 * 60 * 1000;
// 픽스처 기사 버전의 수집 시각 + 12시간.
const now = new Date(fixture.revision.publishedAt.getTime() + 12 * HOUR);

/** 픽스처(데모·종료 사건)를 발행하고 재수집 대상이 되도록 라이브·활성 사건으로 바꾼다. */
async function seedLiveStory(db: Awaited<ReturnType<typeof createMigrationDb>>["db"]) {
  await publishFixture(db, fixture);
  await db
    .update(stories)
    .set({
      is_demo: false,
      lifecycle: "활성",
      last_new_report_at: fixture.revision.publishedAt,
      last_processed_at: fixture.revision.publishedAt,
    })
    .where(eq(stories.id, fixture.story.id));
}

maybe("원문 재수집 저장(#86, 실 DB)", () => {
  it("원장·재수집 일정 저장", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);

      // 원장: UTC 날짜 행에 용도별로 더한다.
      await addGnewsRequests(db, { utcDate: "2026-09-17", purpose: "discovery", count: 4 });
      await addGnewsRequests(db, { utcDate: "2026-09-17", purpose: "recheck", count: 2 });
      await addGnewsRequests(db, { utcDate: "2026-09-17", purpose: "recheck", count: 1 });
      expect(await loadGnewsLedgerDay(db, "2026-09-17")).toEqual({
        utcDate: "2026-09-17",
        discovery: 4,
        recheck: 3,
      });
      expect(await loadGnewsLedgerDay(db, "2026-09-18")).toEqual({
        utcDate: "2026-09-18",
        discovery: 0,
        recheck: 0,
      });

      // 일정: 본문 있는 기사 둘이 후보이고(링크만 기사 Atlas는 버전이 없어 빠진다), 12시간째라 둘 다 대상이다.
      const candidates = await loadRecheckCandidates(db, now);
      expect(candidates.map((c) => c.articleId)).toEqual(["a-harbor", "a-meridian"]);
      expect(planRechecks({ candidates, now })).toEqual([
        { articleId: "a-harbor", slot: "12h" },
        { articleId: "a-meridian", slot: "12h" },
      ]);

      // 미확인은 일정만 기록하고 사건을 올리지 않는다.
      await saveRecheckResult(db, {
        articleId: "a-harbor",
        storyId: fixture.story.id,
        slot: "12h",
        checkedAt: now,
        outcome: "미확인",
      });
      // 새 버전(정정 후보)은 버전·일정·사건 재처리 표시를 한 트랜잭션에 쓴다.
      const [target] = await loadRecheckTargets(db, ["a-meridian"]);
      expect(target?.latest.id).toBe("av-meridian");
      const version = createArticleVersion({
        id: "av-meridian-2",
        articleId: "a-meridian",
        rawBody: `${target?.latest.body}\nCorrection: an earlier version misnamed the port.`,
        capturedAt: now,
      });
      const newVersion = {
        version,
        publishedAt: fixture.revision.publishedAt,
        correctionCandidate: true,
      };
      const input = {
        articleId: "a-meridian",
        storyId: fixture.story.id,
        slot: "12h" as const,
        checkedAt: now,
        outcome: "찾음" as const,
        newVersion,
      };
      expect(await saveRecheckResult(db, input)).toBe(true);
      // 같은 일정·같은 본문을 다시 저장해도 행이 늘지 않는다.
      expect(await saveRecheckResult(db, input)).toBe(false);

      const rechecks = await db.select().from(articleRechecks).orderBy(articleRechecks.article_id);
      expect(rechecks.map((r) => [r.article_id, r.slot, r.outcome, r.article_version_id])).toEqual([
        ["a-harbor", "12h", "미확인", null],
        ["a-meridian", "12h", "찾음", "av-meridian-2"],
      ]);
      const [saved] = await db
        .select()
        .from(articleVersions)
        .where(eq(articleVersions.id, "av-meridian-2"));
      expect(saved?.correction_candidate).toBe(true);
      expect(saved?.body_expires_at).toEqual(
        new Date(fixture.revision.publishedAt.getTime() + 30 * 24 * HOUR),
      );

      // 한 일정은 다시 하지 않는다.
      const after = await loadRecheckCandidates(db, now);
      expect(planRechecks({ candidates: after, now })).toEqual([]);
      expect(await loadDormantSampledToday(db, now.toISOString().slice(0, 10))).toEqual({});

      // 재처리 대상: 배치가 사건을 다시 읽고, 새 버전은 정정 후보로, 옛 버전 본문은 좌표 정렬용으로 온다.
      const { stories: batch } = await loadBatchStories(db, { now });
      expect(batch.map((s) => s.story.id)).toEqual([fixture.story.id]);
      const meridian = batch[0]?.articles.find((a) => a.id === "a-meridian");
      expect(meridian).toMatchObject({
        articleVersionId: "av-meridian-2",
        correctionCandidate: true,
        correctionFirstReprocess: true,
      });
      expect(batch[0]?.previousVersionBodies?.map((v) => v.articleVersionId)).toEqual([
        "av-meridian",
      ]);

      // 정정 후보 버전은 다음 배치 재처리에서 다시 명시 정정을 주지 않는다(#94): 그 배치가 확인(또는 발행)한 뒤
      // 다른 입력으로 사건이 다시 올라와도 정정 후보 표시만 남고 첫 재처리 표시는 없다.
      await confirmRevision(db, {
        revisionId: fixture.revision.id,
        checkedAt: new Date(now.getTime() + HOUR),
      });
      await db
        .update(stories)
        .set({ last_processed_at: new Date(now.getTime() + 2 * HOUR) })
        .where(eq(stories.id, fixture.story.id));
      const { stories: later } = await loadBatchStories(db, { now });
      const again = later[0]?.articles.find((a) => a.id === "a-meridian");
      expect(again).toMatchObject({ articleVersionId: "av-meridian-2", correctionCandidate: true });
      expect(again?.correctionFirstReprocess).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("마이그레이션 뒤 기존 행 보존", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      const migration = readFileSync(
        new URL("../drizzle/0009_recheck_ledger.sql", import.meta.url),
        "utf8",
      );
      // 표 둘과 열 하나를 더할 뿐 기존 행을 고치거나 지우지 않는다.
      // (외래 키의 `ON DELETE/UPDATE no action` 절은 동작이 아니라 제약 선언이다.)
      expect(migration.replace(/ON (DELETE|UPDATE) no action/g, "")).not.toMatch(
        /\b(UPDATE|DELETE|DROP)\b/i,
      );
      await publishFixture(db, fixture);
      // 마이그레이션 전 모양의 기사 버전 행(새 열 없음)은 정정 후보가 아니다.
      await sql`insert into article_versions (id, article_id, body, normalization_version, body_hash, captured_at, body_expires_at)
        values ('av-legacy', 'a-meridian', 'legacy body', 1, 'legacy-hash', now(), now())`;
      const rows = await db.select().from(articleVersions).orderBy(articleVersions.id);
      expect(rows.map((r) => [r.id, r.correction_candidate])).toEqual([
        ["av-harbor", false],
        ["av-legacy", false],
        ["av-meridian", false],
      ]);
    } finally {
      await cleanup();
    }
  });

  it("본문이 지워진 버전은 재수집 대상에서 빠지고 무결성 재검사는 보존 구간만 본다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedLiveStory(db);
      const expiredAt = new Date(fixture.revision.publishedAt.getTime() + 30 * 24 * HOUR);
      const after = new Date(expiredAt.getTime() + HOUR);
      // 기한 뒤에 붙은 새 기사(본문 있음) 하나가 사건을 재처리 대상으로 올린다.
      await db.insert(articles).values({
        id: "a-new",
        source_id: "src-harbor",
        story_id: fixture.story.id,
        url: "https://harbor.invalid/new",
        normalized_url: "https://harbor.invalid/new",
        external_id: null,
        title: "New",
        description: null,
        published_at: after,
        topics: ["국제 정치·외교·안보"],
        embedding: null,
      });
      await db.insert(articleVersions).values({
        id: "av-new",
        article_id: "a-new",
        body: "New body.",
        normalization_version: 1,
        body_hash: "new-hash",
        captured_at: after,
        body_expires_at: new Date(after.getTime() + 30 * 24 * HOUR),
      });
      await db
        .update(stories)
        .set({ last_processed_at: after })
        .where(eq(stories.id, fixture.story.id));
      const evidenceBefore = await db.select().from(evidence).orderBy(asc(evidence.id));

      expect(await applyRetention(db, { now: after, limit: 100 })).toEqual({
        bodiesDeleted: 2,
        embeddingsCleared: 0,
      });

      // 재수집: 본문을 지운 기사는 후보·대상이 아니다.
      expect((await loadRecheckCandidates(db, after)).map((c) => c.articleId)).toEqual(["a-new"]);
      expect(await loadRecheckTargets(db, ["a-meridian", "a-harbor"])).toEqual([]);

      // 무결성 재검사: 근거 행은 그대로이고, 강조 구간 원문은 보존된 발췌에서 다시 확인된다(본문 없이).
      const evidenceAfter = await db.select().from(evidence).orderBy(asc(evidence.id));
      expect(evidenceAfter).toEqual(evidenceBefore);
      expect(evidenceAfter.length).toBeGreaterThan(0);
      for (const row of evidenceAfter) {
        expect([...row.excerpt].slice(row.highlight_start, row.highlight_end).join("")).toBe(
          row.span_text,
        );
      }

      // 배치: 새 기사만 입력이고, 본문을 지운 기사는 출처 구획으로만 온다(좌표 정렬용 이전 본문도 없다).
      const { stories: batch } = await loadBatchStories(db, { now });
      expect(batch[0]?.articles.map((a) => a.id)).toEqual(["a-new"]);
      expect(batch[0]?.linkOnlySources?.map((s) => s.articleId).sort()).toEqual([
        "a-harbor",
        "a-meridian",
      ]);
      expect(batch[0]?.previousVersionBodies).toBeUndefined();
      // 지운 기사에만 근거가 있던 주장(픽스처 주장 전부)은 다음 개정판으로 옮겨 싣는다.
      expect(batch[0]?.carriedClaims?.map((c) => c.id)).toEqual(
        [...fixture.revision.claims].sort((a, b) => a.order - b.order).map((c) => c.id),
      );
    } finally {
      await cleanup();
    }
  });
});
