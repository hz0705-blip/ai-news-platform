import { describe, expect, it } from "vitest";
import { toStoryRow } from "../mappers.ts";
import { stories } from "../schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "../test-db.ts";
import { fixture, publishFixture } from "../test-fixtures.ts";
import { publishedStoryExists } from "./story.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

maybe("publishedStoryExists", () => {
  it("발행 개정판이 있는 비데모 사건과 그 사건의 개정판만 있다고 답한다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      // 실제 사건(개정판 있음)
      await publishFixture(db, { ...fixture, story: { ...fixture.story, isDemo: false } });
      const live = fixture.story.slug;
      // 다른 실제 사건(자기 개정판 있음)
      const otherRevisionId = "story-other:rev-1";
      await publishFixture(db, {
        story: { ...fixture.story, id: "story-other", slug: "story-other", isDemo: false },
        revision: {
          ...fixture.revision,
          id: otherRevisionId,
          storyId: "story-other",
          claims: [],
          sources: [],
        },
      });
      // 데모 사건(개정판 있음)
      await publishFixture(db, {
        story: { ...fixture.story, id: "story-demo", slug: "story-demo", isDemo: true },
        revision: {
          ...fixture.revision,
          id: "story-demo:rev-1",
          storyId: "story-demo",
          claims: [],
          sources: [],
        },
      });
      // 개정판이 하나도 없는 실제 사건
      await db
        .insert(stories)
        .values(
          toStoryRow({ ...fixture.story, id: "story-empty", slug: "story-empty", isDemo: false }),
        );

      expect(await publishedStoryExists(db, { slug: live })).toBe(true);
      expect(await publishedStoryExists(db, { slug: live, revisionId: fixture.revision.id })).toBe(
        true,
      );
      expect(await publishedStoryExists(db, { slug: "no-such-story" })).toBe(false);
      expect(await publishedStoryExists(db, { slug: "story-demo" })).toBe(false);
      expect(
        await publishedStoryExists(db, { slug: "story-demo", revisionId: "story-demo:rev-1" }),
      ).toBe(false);
      expect(await publishedStoryExists(db, { slug: live, revisionId: otherRevisionId })).toBe(
        false,
      );
      expect(await publishedStoryExists(db, { slug: "story-empty" })).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
