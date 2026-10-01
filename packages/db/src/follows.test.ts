import { readFileSync } from "node:fs";
import type { StoryLifecycle, Topic } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import {
  followStory,
  followTopic,
  loadFollowedTopics,
  loadFollowFeed,
  recordStoryVisit,
  unfollowStory,
  unfollowTopic,
} from "./follows.ts";
import type { RuntimeDb } from "./runtime.ts";
import { lastSeenRevisions, stories, storyFollows, storyRevisions } from "./schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

/** 사건 하나와 개정판 `revisions`개(1..n, 한 시간 간격)를 심는다. 개정판 식별자는 `<slug>:rev-<n>`. */
async function seedStory(
  db: RuntimeDb["db"],
  slug: string,
  options: {
    readonly revisions?: number;
    readonly isDemo?: boolean;
    readonly lifecycle?: StoryLifecycle;
    readonly topics?: Topic[];
    readonly publishedAt?: Date;
  } = {},
): Promise<void> {
  await db.insert(stories).values({
    id: `story-${slug}`,
    slug,
    title: slug,
    topics: options.topics ?? ["국제 정치·외교·안보"],
    is_demo: options.isDemo ?? false,
    lifecycle: options.lifecycle ?? "활성",
  });
  const base = (options.publishedAt ?? new Date("2026-09-20T00:00:00Z")).getTime();
  const count = options.revisions ?? 1;
  for (let n = 1; n <= count; n += 1) {
    await db.insert(storyRevisions).values({
      id: `${slug}:rev-${n}`,
      story_id: `story-${slug}`,
      revision_number: n,
      title: `${slug} 개정판 ${n}`,
      published_at: new Date(base + (n - 1) * 3_600_000),
      contradiction_status: "단일 출처",
      prompt_evidence_extract: "evidence-extract@1",
      prompt_claim_generate: "claim-generate@1",
      prompt_gate: "gate@1",
      prompt_contradiction_label: "contradiction-label@1",
      model_id: "test-model",
    });
  }
}

async function withDb(run: (db: RuntimeDb["db"], sql: RuntimeDb["sql"]) => Promise<void>) {
  const { db, sql, cleanup } = await createMigrationDb(url as string);
  try {
    await run(db, sql);
  } finally {
    await cleanup();
  }
}

maybe("팔로우와 마지막으로 본 개정판", () => {
  it("사건 팔로우는 추가·해제되고 중복 추가는 무시된다", async () => {
    await withDb(async (db) => {
      await seedStory(db, "s1");
      expect(await followStory(db, { userId: A, slug: "s1" })).toBe(true);
      expect(await followStory(db, { userId: A, slug: "s1" })).toBe(true);
      expect(await db.select().from(storyFollows)).toEqual([{ user_id: A, story_id: "story-s1" }]);
      expect(await followStory(db, { userId: A, slug: "없는-사건" })).toBe(false);
      await unfollowStory(db, { userId: A, slug: "s1" });
      await unfollowStory(db, { userId: A, slug: "s1" });
      expect(await db.select().from(storyFollows)).toEqual([]);
    });
  });

  it("토픽 팔로우는 추가·해제되고 중복 추가는 무시된다", async () => {
    await withDb(async (db) => {
      await followTopic(db, { userId: A, topic: "기술·AI" });
      await followTopic(db, { userId: A, topic: "기술·AI" });
      expect(await loadFollowedTopics(db, { userId: A })).toEqual(["기술·AI"]);
      await unfollowTopic(db, { userId: A, topic: "기술·AI" });
      expect(await loadFollowedTopics(db, { userId: A })).toEqual([]);
    });
  });

  it("사건 방문은 마지막으로 본 개정판을 보이는 개정판으로 올리고 이전 값을 돌려준다", async () => {
    await withDb(async (db) => {
      await seedStory(db, "s1", { revisions: 3 });
      const visit = (revisionId: string) =>
        recordStoryVisit(db, { userId: A, slug: "s1", revisionId });
      // 본 적 없으면 이전 값은 null이고 보이는 개정판이 기록된다.
      expect(await visit("s1:rev-1")).toEqual({ previousRevisionId: null, following: false });
      expect(await visit("s1:rev-3")).toEqual({
        previousRevisionId: "s1:rev-1",
        following: false,
      });
      // 옛 개정판 고정 URL을 열어도 읽은 지점은 뒤로 가지 않는다.
      expect(await visit("s1:rev-2")).toEqual({
        previousRevisionId: "s1:rev-3",
        following: false,
      });
      expect(await db.select().from(lastSeenRevisions)).toEqual([
        { user_id: A, story_id: "story-s1", revision_id: "s1:rev-3" },
      ]);
    });
  });

  it("사건 방문은 하려던 팔로우를 함께 마치고, 사건과 맞지 않는 개정판이면 아무것도 쓰지 않는다", async () => {
    await withDb(async (db) => {
      await seedStory(db, "s1");
      await seedStory(db, "s2");
      expect(
        await recordStoryVisit(db, { userId: A, slug: "s1", revisionId: "s2:rev-1" }),
      ).toBeUndefined();
      expect(await db.select().from(lastSeenRevisions)).toEqual([]);
      expect(
        await recordStoryVisit(db, { userId: A, slug: "s1", revisionId: "s1:rev-1", follow: true }),
      ).toEqual({ previousRevisionId: null, following: true });
    });
  });

  it("사용자 A의 팔로우·마지막으로 본 개정판을 사용자 B가 읽거나 바꿀 수 없다", async () => {
    await withDb(async (db) => {
      await seedStory(db, "s1", { revisions: 2 });
      await followStory(db, { userId: A, slug: "s1" });
      await followTopic(db, { userId: A, topic: "기술·AI" });
      await recordStoryVisit(db, { userId: A, slug: "s1", revisionId: "s1:rev-2" });

      // B의 읽기에는 A의 행이 없다.
      expect(await loadFollowFeed(db, { userId: B })).toEqual([]);
      expect(await loadFollowedTopics(db, { userId: B })).toEqual([]);
      expect(await recordStoryVisit(db, { userId: B, slug: "s1", revisionId: "s1:rev-1" })).toEqual(
        { previousRevisionId: null, following: false },
      );

      // B의 쓰기는 A의 행을 바꾸지 않는다.
      await unfollowStory(db, { userId: B, slug: "s1" });
      await unfollowTopic(db, { userId: B, topic: "기술·AI" });
      expect(await loadFollowedTopics(db, { userId: A })).toEqual(["기술·AI"]);
      const [card] = await loadFollowFeed(db, { userId: A });
      expect(card).toMatchObject({ slug: "s1", followsStory: true, lastSeenRevisionNumber: 2 });
    });
  });

  it("팔로우 화면 질의는 직접 팔로우한 사건과 팔로우한 토픽의 라이브 사건(종료 제외)을 읽는다", async () => {
    await withDb(async (db) => {
      await seedStory(db, "followed-demo", { isDemo: true, revisions: 2, topics: ["기술·AI"] });
      await seedStory(db, "topic-live", { topics: ["기술·AI", "세계 경제·금융"] });
      await seedStory(db, "topic-demo", { isDemo: true, topics: ["기술·AI"] });
      await seedStory(db, "topic-closed", { lifecycle: "종료", topics: ["기술·AI"] });
      await seedStory(db, "other-topic", { topics: ["한국 관련 해외 보도"] });
      // 기존에 저장된 데모 팔로우도 공개 피드에 노출하지 않는다.
      await db.insert(storyFollows).values({ user_id: A, story_id: "story-followed-demo" });
      expect(await followStory(db, { userId: B, slug: "followed-demo" })).toBe(false);
      await followTopic(db, { userId: A, topic: "기술·AI" });
      expect(
        await recordStoryVisit(db, {
          userId: A,
          slug: "followed-demo",
          revisionId: "followed-demo:rev-1",
        }),
      ).toBeUndefined();

      const feed = await loadFollowFeed(db, { userId: A });
      expect(feed.map((card) => card.slug).sort()).toEqual(["topic-live"]);
      expect(feed.find((card) => card.slug === "topic-live")).toMatchObject({
        isDemo: false,
        followsStory: false,
        latestRevisionNumber: 1,
        lastSeenRevisionNumber: null,
        summary: "",
        sourceCount: 0,
      });
    });
  });

  it("테스트 DB(auth 스키마 없음)에는 auth.users FK가 없고, auth.users가 있으면 0011이 연쇄 삭제 FK를 건다", async () => {
    await withDb(async (db, sql) => {
      const fks = await sql`
        select conname from pg_constraint where conname like '%_user_id_auth_users_fk'`;
      expect(fks).toEqual([]);

      // 프로덕션(Supabase)과 같은 모양의 auth.users를 트랜잭션 안에서만 만들고 마이그레이션 0011을 그대로 돌린다.
      const migration = readFileSync(
        new URL("../drizzle/0011_auth_users_cascade.sql", import.meta.url),
        "utf8",
      );
      await seedStory(db, "s1");
      const rollback = new Error("rollback");
      await expect(
        sql.begin(async (tx) => {
          await tx`create schema auth`;
          await tx`create table auth.users (id uuid primary key)`;
          await tx.unsafe(migration);
          await tx.unsafe(migration); // 다시 돌려도 안전하다
          await tx`insert into auth.users (id) values (${A}), (${B})`;
          await tx`insert into story_follows (user_id, story_id) values (${A}, 'story-s1'), (${B}, 'story-s1')`;
          await tx`insert into topic_follows (user_id, topic) values (${A}, '기술·AI')`;
          await tx`insert into last_seen_revisions (user_id, story_id, revision_id) values (${A}, 'story-s1', 's1:rev-1')`;
          const unknown = "00000000-0000-4000-8000-0000000000ff";
          await expect(
            tx.savepoint((sp) => sp`insert into story_follows values (${unknown}, 'story-s1')`),
          ).rejects.toThrow(/foreign key/);

          await tx`delete from auth.users where id = ${A}`;
          const left = await tx`
            select 'story' as t, user_id from story_follows
            union all select 'topic', user_id from topic_follows
            union all select 'seen', user_id from last_seen_revisions`;
          expect(left.map((row) => ({ ...row }))).toEqual([{ t: "story", user_id: B }]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);

      expect(await sql`select to_regclass('auth.users') as t`).toEqual([{ t: null }]);
    });
  });
});
