import { readFileSync } from "node:fs";
import { revisionWithSources, type Source } from "@newstrail/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  findArticleIdsByNormalizedUrl,
  loadGdeltStories,
  loadRevisionToExtend,
  recordArticleObservations,
  saveLinkOnlyArticle,
} from "./gdelt.ts";
import { commitRevision } from "./publish.ts";
import { loadPublishedStory } from "./queries/story.ts";
import { articles, articleVersions, stories } from "./schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";
import { fixture, publishFixture } from "./test-fixtures.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const gdeltSource: Source = {
  id: "gdelt:example.com",
  name: "example.com",
  rightsTier: "링크만",
  region: "미확인",
  ownership: "unknown",
  language: "en",
  isFictional: false,
};
// 사건 첫 기사보다 이른 관측(창은 첫 기사 24시간 전부터다) — 대표 기사가 바뀌면 안 된다.
const observedAt = new Date("2026-09-16T12:00:00.000Z");
const link = {
  articleId: "a-gdelt-1",
  storyId: fixture.story.id,
  source: gdeltSource,
  url: "https://www.example.com/news/ports?utm_source=x",
  normalizedUrl: "https://example.com/news/ports",
  title: "Ports pact signed",
  observedAt,
  imageUrl: "https://images.example.com/ports.jpg",
};

maybe("GDELT 링크만 기사 저장", () => {
  it("link-only article without body version persists and loads", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      await saveLinkOnlyArticle(db, link);
      await saveLinkOnlyArticle(db, link); // 같은 URL은 한 번만

      const [row] = await db.select().from(articles).where(eq(articles.id, link.articleId));
      expect(row).toMatchObject({
        story_id: fixture.story.id,
        is_link_only: true,
        observed_at: observedAt,
        published_at: observedAt,
        embedding: null,
        image_url: "https://images.example.com/ports.jpg",
      });
      expect(
        await db
          .select()
          .from(articleVersions)
          .where(eq(articleVersions.article_id, link.articleId)),
      ).toEqual([]);
      expect(await findArticleIdsByNormalizedUrl(db, [link.normalizedUrl, "https://none"])).toEqual(
        new Map([[link.normalizedUrl, link.articleId]]),
      );

      // 관측은 처음 본 시각만 남긴다.
      await recordArticleObservations(db, [
        { articleId: "a-meridian", observedAt: new Date("2026-09-17T02:00:00.000Z") },
        { articleId: "a-meridian", observedAt: new Date("2026-09-17T01:00:00.000Z") },
        { articleId: "a-meridian", observedAt: new Date("2026-09-17T03:00:00.000Z") },
      ]);
      const [meridian] = await db.select().from(articles).where(eq(articles.id, "a-meridian"));
      expect(meridian).toMatchObject({
        observed_at: new Date("2026-09-17T01:00:00.000Z"),
        is_link_only: false,
      });

      // 대표 기사는 링크만이 아닌 첫 기사다.
      const [query] = await loadGdeltStories(db, [fixture.story.id]);
      expect(query?.title).not.toBe(link.title);

      // 확장할 개정판의 출처 구획은 발행 때의 것이다(링크 없음, #85). 링크를 더한 출처 추가 개정판이 발행된다.
      const found = await loadRevisionToExtend(db, fixture.story.id);
      if (found === undefined) throw new Error("확장할 개정판 없음");
      expect(found.sources.map((s) => s.articleId)).not.toContain(link.articleId);
      const linkSource = {
        sourceId: gdeltSource.id,
        articleId: link.articleId,
        articleTitle: link.title,
        articleUrl: link.url,
        publishedAt: link.observedAt,
        rightsTier: gdeltSource.rightsTier,
      };
      const next = revisionWithSources(found, [...found.sources, linkSource], {
        revisionNumber: 2,
        publishedAt: new Date("2026-09-17T06:00:00.000Z"),
      });
      await commitRevision(db, { revision: next });
      const page = await loadPublishedStory(db, { slug: fixture.story.slug });
      expect(page?.revision.revisionNumber).toBe(2);
      expect(page?.claims.map((c) => c.text)).toEqual(fixture.revision.claims.map((c) => c.text));
      expect(page?.sources.find((s) => s.articleUrl === link.url)).toMatchObject({
        rightsTier: "링크만",
        isLinkOnly: true,
        observedAt: link.observedAt,
      });
      expect(page?.sources.find((s) => s.id === "src-meridian")?.isLinkOnly).toBe(false);

      // 모델 재처리를 기다리는 사건(입력 변경)은 출처 추가 개정판을 내지 않는다.
      await db
        .update(stories)
        .set({ last_processed_at: new Date("2026-09-18T00:00:00.000Z") })
        .where(eq(stories.id, fixture.story.id));
      expect(await loadRevisionToExtend(db, fixture.story.id)).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("migration preserves existing rows", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      const migration = readFileSync(
        new URL("../drizzle/0007_gdelt_link_only.sql", import.meta.url),
        "utf8",
      );
      // 열 추가만 하고 기존 행을 고치지 않는다.
      expect(migration).not.toMatch(/\b(UPDATE|DELETE|DROP)\b/i);
      await publishFixture(db, fixture);
      // 마이그레이션 전 모양의 행(새 열 없음)은 보통 기사 기본값을 받는다.
      await sql`insert into articles (id, source_id, url, normalized_url, title, published_at, topics)
        values ('a-legacy', 'src-meridian', 'https://legacy.invalid/1', 'https://legacy.invalid/1', 'Legacy', now(), '{}')`;
      const rows = await db.select().from(articles);
      expect(rows.map((r) => [r.id, r.is_link_only, r.observed_at]).sort()).toEqual(
        [
          ["a-atlas", false, null],
          ["a-harbor", false, null],
          ["a-legacy", false, null],
          ["a-meridian", false, null],
        ].sort(),
      );
    } finally {
      await cleanup();
    }
  });
});
