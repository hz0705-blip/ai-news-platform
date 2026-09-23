import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { toStoryRow } from "../mappers.ts";
import { publishRevision } from "../publish.ts";
import { articles, stories } from "../schema/index.ts";
import { createMigrationDb } from "../test-db.ts";
import { fixture, UNPUBLISHED_BODY_SENTENCE } from "../test-fixtures.ts";
import { loadPublishedToday } from "./today.ts";

const url = process.env.DATABASE_MIGRATION_URL;
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_MIGRATION_URL 없음 — 실 DB 테스트 건너뜀\n");

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
      await publishRevision(db, fixture);
      const updatedAt = new Date("2026-09-18T00:00:00Z");
      const summary =
        "후속 협상은 당사자들이 동의할 경우에만 10월에 재개될 가능성이 있다고 보도했다.";
      await publishRevision(db, {
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
        title: "같은 출처의 후속 기사",
        published_at: updatedAt,
        topic: "국제 정치·외교·안보",
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

  it("갱신 시각 내림차순과 사건 식별자 오름차순으로 여러 사건을 정렬한다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      for (const [id, timestamp] of [
        ["c", "2026-09-18T00:00:00Z"],
        ["b", "2026-09-19T00:00:00Z"],
        ["a", "2026-09-19T00:00:00Z"],
      ] as const) {
        await publishRevision(db, {
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
