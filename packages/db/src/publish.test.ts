import { describe, expect, it } from "vitest";
import { publishRevision } from "./publish.ts";
import { loadPublishedStory } from "./queries/story.ts";
import { createMigrationDb } from "./test-db.ts"; // DATABASE_MIGRATION_URL로 연결하고 테스트 끝에 truncate
// revision·story·articles·articleVersions·sources 픽스처는 mappers.test.ts와 같은 값을 공유한다.
import { fixture, UNPUBLISHED_BODY_SENTENCE } from "./test-fixtures.ts";

const url = process.env.DATABASE_MIGRATION_URL;
const maybe = url === undefined ? describe.skip : describe;
// Vitest는 테스트가 전부 건너뛰어진 파일의 console 출력을 보고하지 않으므로 stderr에 직접 쓴다.
if (url === undefined) process.stderr.write("DATABASE_MIGRATION_URL 없음 — 실 DB 테스트 건너뜀\n");

maybe("publishRevision", () => {
  it("같은 개정판을 두 번 발행하면 두 번째는 아무것도 쓰지 않는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const first = await publishRevision(db, fixture);
      const second = await publishRevision(db, fixture);
      expect(first.inserted).toBe(true);
      expect(second).toEqual({ inserted: false, revisionId: first.revisionId });
    } finally {
      await cleanup();
    }
  });

  it("근거 삽입이 실패하면 개정판·주장도 남지 않는다(원자성)", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      const broken = {
        ...fixture,
        revision: {
          ...fixture.revision,
          claims: fixture.revision.claims.map((c) => ({
            ...c,
            evidence: c.evidence.map((e) => ({ ...e, articleVersionId: "없는-버전" })),
          })),
        },
      };
      await expect(publishRevision(db, broken)).rejects.toThrow();
      const rows = await sql<
        { count: number }[]
      >`select count(*)::int as count from story_revisions`;
      expect(rows[0]?.count).toBe(0);
    } finally {
      await cleanup();
    }
  });
});

maybe("loadPublishedStory", () => {
  it("사건 slug로 최신 개정판을 읽고, 근거는 허용 발췌와 발췌 안 강조 구간만 담는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const { revisionId } = await publishRevision(db, fixture);
      const page = await loadPublishedStory(db, { slug: fixture.story.slug });

      expect(page?.story).toEqual({
        id: fixture.story.id,
        slug: fixture.story.slug,
        title: fixture.story.title,
        topics: fixture.story.topics,
        isDemo: true,
      });
      expect(page?.revision).toEqual({
        id: revisionId,
        revisionNumber: 1,
        publishedAt: fixture.revision.publishedAt,
        contradictionStatus: "복수 출처 일치",
      });
      expect(page?.claims.map((c) => c.id)).toEqual(fixture.revision.claims.map((c) => c.id));
      expect(page?.claims[0]?.evidence[0]).toEqual({
        sourceId: "src-meridian",
        articleTitle: "Three governments agree on port framework",
        publishedAt: fixture.revision.publishedAt,
        sourceUrl: "https://meridian.invalid/ports",
        excerpt: "Ministers agreed on the framework. The deal covers three ports.",
        highlightInExcerpt: { start: 0, end: 34 },
      });
      // 링크만 기사는 근거가 없어도 출처 구획에 남는다. 순서는 기사 발행 시각, 같으면 기사 식별자 순.
      expect(page?.sources.map((s) => s.id)).toEqual(["src-atlas", "src-harbor", "src-meridian"]);
      expect(page?.sources[0]).toMatchObject({
        rightsTier: "링크만",
        isFictional: true,
        articleTitle: "Port deal reached",
        articleUrl: "https://atlas.invalid/ports",
      });
      // 기사 본문은 어떤 필드에도 담기지 않는다.
      expect(JSON.stringify(page)).not.toContain(UNPUBLISHED_BODY_SENTENCE);
    } finally {
      await cleanup();
    }
  });

  it("revisionId를 주면 그 개정판을, 모르는 slug면 undefined를 준다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const { revisionId } = await publishRevision(db, fixture);
      const page = await loadPublishedStory(db, { slug: fixture.story.slug, revisionId });
      expect(page?.revision.id).toBe(revisionId);
      expect(
        await loadPublishedStory(db, { slug: fixture.story.slug, revisionId: "없는-개정판" }),
      ).toBeUndefined();
      expect(await loadPublishedStory(db, { slug: "없는-사건" })).toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});
