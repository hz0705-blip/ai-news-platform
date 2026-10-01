import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { followStory, loadFollowFeed } from "../follows.ts";
import { toStoryRow } from "../mappers.ts";
import { articles, stories } from "../schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "../test-db.ts";
import { fixture, publishFixture, UNPUBLISHED_BODY_SENTENCE } from "../test-fixtures.ts";
import { loadPublishedStory } from "./story.ts";
import { loadPublishedToday } from "./today.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

maybe("loadPublishedToday", () => {
  it("미발행 사건은 제외하고 라이브 0건의 갱신 시각은 없다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await db.insert(stories).values(toStoryRow({ ...fixture.story, isDemo: false }));
      expect(await loadPublishedToday(db, { isDemo: false })).toEqual({
        stories: [],
        lastUpdated: null,
      });
    } finally {
      await cleanup();
    }
  });

  it("최신 개정판의 제목·첫 주장 전문·상태와 중복 없는 출처 수를 담는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      const updatedAt = new Date("2026-09-18T00:00:00Z");
      const summary =
        "후속 협상은 당사자들이 동의할 경우에만 10월에 재개될 가능성이 있다고 보도했다.";
      await publishFixture(db, {
        ...fixture,
        revision: {
          ...fixture.revision,
          id: "revision-2",
          revisionNumber: 2,
          title: "최신 발행 제목",
          publishedAt: updatedAt,
          contradictionStatus: "단일 출처",
          claims: [...fixture.revision.claims].reverse().map((claim) => ({
            ...claim,
            text: claim.order === 1 ? summary : claim.text,
            contradictionStatus: "단일 출처",
            evidence: [],
          })),
        },
      });
      // 같은 출처의 기사 여러 개와 링크만 출처도 출처 수 계약을 바꾸지 않는다.
      await db.insert(articles).values({
        id: "duplicate-source-article",
        source_id: "src-meridian",
        story_id: fixture.story.id,
        url: "https://meridian.invalid/second",
        normalized_url: "https://meridian.invalid/second",
        title: "같은 출처의 후속 기사",
        published_at: updatedAt,
        topics: ["국제 정치·외교·안보"],
      });
      const demo = await loadPublishedToday(db, { isDemo: true });
      expect(demo).toEqual({
        stories: [
          {
            id: fixture.story.id,
            slug: fixture.story.slug,
            title: "최신 발행 제목",
            topics: fixture.story.topics,
            summary,
            status: "단일 출처",
            sourceCount: 3,
            updatedAt,
            isDemo: true,
            image: null,
          },
        ],
        lastUpdated: updatedAt,
      });
      expect(JSON.stringify(demo)).not.toContain(UNPUBLISHED_BODY_SENTENCE);
      expect(await loadPublishedToday(db, { isDemo: false })).toEqual({
        stories: [],
        lastUpdated: null,
      });
      await db.update(stories).set({ is_demo: false }).where(eq(stories.id, fixture.story.id));
      expect((await loadPublishedToday(db, { isDemo: false })).stories[0]?.isDemo).toBe(false);
      expect(await loadPublishedToday(db, { isDemo: true })).toEqual({
        stories: [],
        lastUpdated: null,
      });
    } finally {
      await cleanup();
    }
  });

  it("대표 이미지는 발행 시각이 가장 이른 이미지 있는 기사의 것이다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      const images = async () => {
        await followStory(db, {
          userId: "00000000-0000-4000-8000-00000000000a",
          slug: fixture.story.slug,
        });
        return [
          (await loadPublishedToday(db, { isDemo: true })).stories[0]?.image,
          (await loadPublishedStory(db, { slug: fixture.story.slug }))?.image,
          (await loadFollowFeed(db, { userId: "00000000-0000-4000-8000-00000000000a" }))[0]?.image,
        ];
      };
      // 이미지 URL이 있는 기사가 없으면 null.
      expect(await images()).toEqual([null, null, null]);

      const at = (hours: number) =>
        new Date(Date.parse("2026-09-17T00:30:00Z") + hours * 3_600_000);
      const set = (id: string, values: Partial<typeof articles.$inferInsert>) =>
        db.update(articles).set(values).where(eq(articles.id, id));
      // 가장 이른 기사(harbor)는 이미지가 없어 건너뛰고, 그다음 meridian이 atlas보다 이르다.
      await set("a-harbor", { published_at: at(-2) });
      await set("a-meridian", {
        published_at: at(0),
        image_url: "https://img.meridian.invalid/m.jpg",
      });
      await set("a-atlas", { published_at: at(1), image_url: "https://img.atlas.invalid/a.jpg" });
      // 개정판 출처 집합 밖의 기사(발행 뒤 배정)는 더 일러도 고르지 않는다.
      await db.insert(articles).values({
        id: "a-late",
        source_id: "src-harbor",
        story_id: fixture.story.id,
        url: "https://harbor.invalid/late",
        normalized_url: "https://harbor.invalid/late",
        title: "발행 뒤 배정된 기사",
        published_at: at(-5),
        topics: ["국제 정치·외교·안보"],
        image_url: "https://img.harbor.invalid/late.jpg",
      });
      const meridian = {
        url: "https://img.meridian.invalid/m.jpg",
        sourceName: "Meridian (가상 출처)",
        articleUrl: "https://meridian.invalid/ports",
      };
      expect(await images()).toEqual([meridian, meridian, meridian]);

      // 같은 발행 시각이면 기사 식별자 순(a-atlas < a-meridian).
      await set("a-atlas", { published_at: at(0) });
      expect((await images())[0]).toMatchObject({ url: "https://img.atlas.invalid/a.jpg" });
    } finally {
      await cleanup();
    }
  });

  it("갱신 시각 내림차순과 사건 식별자 오름차순으로 여러 사건을 정렬한다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      for (const [id, timestamp] of [
        ["c", "2026-09-18T00:00:00Z"],
        ["b", "2026-09-19T00:00:00Z"],
        ["a", "2026-09-19T00:00:00Z"],
      ] as const) {
        await publishFixture(db, {
          story: { ...fixture.story, id, slug: id, isDemo: false },
          revision: {
            ...fixture.revision,
            id: `${id}:rev-1`,
            storyId: id,
            publishedAt: new Date(timestamp),
            claims: fixture.revision.claims.map((claim) => ({
              ...claim,
              id: `${id}:${claim.id}`,
              evidence: [],
            })),
          },
          sources: [],
          articles: [],
          articleVersions: [],
        });
      }
      const result = await loadPublishedToday(db, { isDemo: false });
      expect(result.stories.map((story) => story.id)).toEqual(["a", "b", "c"]);
      expect(result.lastUpdated).toEqual(new Date("2026-09-19T00:00:00Z"));
    } finally {
      await cleanup();
    }
  });
});
