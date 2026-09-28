import type { CollectedArticle, Source } from "@newsplatform/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { saveCollectedArticles } from "./collect.ts";
import { articles, articleVersions } from "./schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const capturedAt = new Date("2026-09-27T05:00:00.000Z");
const publishedAt = new Date("2026-09-27T03:00:00.000Z");

const source: Source = {
  id: "gnews:src-a",
  name: "Source A",
  rightsTier: "본문 처리 + 발췌 표시",
  region: "us",
  ownership: "불명",
  language: "영어",
  isFictional: false,
  externalId: "src-a",
};

function collected(overrides: Partial<CollectedArticle>): CollectedArticle {
  return {
    sourceId: source.id,
    externalId: "ext-1",
    url: "https://www.example.com/world/story-1/?utm=x",
    title: "Ministers agree on framework",
    description: "desc",
    publishedAt,
    topics: ["국제 정치·외교·안보"],
    rawBody: "<p>Ministers agreed on the framework.</p>",
    ...overrides,
  };
}

maybe("saveCollectedArticles", () => {
  it("정규화 URL이 같은 기사는 하나로 저장하고 토픽은 합집합, 같은 본문 재수집은 버전을 늘리지 않는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const first = await saveCollectedArticles(db, {
        sources: [source],
        articles: [collected({})],
        capturedAt,
      });
      expect(first).toMatchObject({ newArticles: 1, mergedArticles: 0 });
      expect(first.savedVersions).toHaveLength(1);

      const second = await saveCollectedArticles(db, {
        sources: [source],
        articles: [collected({ url: "http://example.com/world/story-1#top", topics: ["기술·AI"] })],
        capturedAt: new Date(capturedAt.getTime() + 1000),
      });
      expect(second).toMatchObject({ newArticles: 0, mergedArticles: 1, savedVersions: [] });

      const rows = await db.select().from(articles);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        normalized_url: "https://example.com/world/story-1",
        story_id: null,
        external_id: "ext-1",
        description: "desc",
        topics: ["국제 정치·외교·안보", "기술·AI"],
      });
      const versions = await db.select().from(articleVersions);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.body_expires_at).toEqual(
        new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      );
    } finally {
      await cleanup();
    }
  });

  it("creates a new article version when a re-collected body differs", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const first = await saveCollectedArticles(db, {
        sources: [source],
        articles: [collected({})],
        capturedAt,
      });
      const later = new Date(capturedAt.getTime() + 60_000);
      const second = await saveCollectedArticles(db, {
        sources: [source],
        articles: [collected({ rawBody: "Ministers agreed on a revised framework." })],
        capturedAt: later,
      });
      expect(second.savedVersions).toHaveLength(1);
      expect(second.savedVersions[0]?.articleId).toBe(first.savedVersions[0]?.articleId);
      expect(second.savedVersions[0]?.capturedAt).toEqual(later);
      const versions = await db
        .select({ hash: articleVersions.body_hash })
        .from(articleVersions)
        .where(eq(articleVersions.article_id, first.savedVersions[0]?.articleId ?? ""));
      expect(versions).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("이전 본문이 다시 오는 재수집(A→B→A)은 던지지 않고 중복 버전을 만들지 않는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const bodyA = collected({});
      const bodyB = collected({ rawBody: "Ministers agreed on a revised framework." });
      const at = (offset: number) => new Date(capturedAt.getTime() + offset);
      await saveCollectedArticles(db, { sources: [source], articles: [bodyA], capturedAt: at(0) });
      await saveCollectedArticles(db, { sources: [source], articles: [bodyB], capturedAt: at(1) });
      const third = await saveCollectedArticles(db, {
        sources: [source],
        articles: [bodyA],
        capturedAt: at(2),
      });
      expect(third).toMatchObject({ newArticles: 0, mergedArticles: 1, savedVersions: [] });
      const versions = await db.select({ hash: articleVersions.body_hash }).from(articleVersions);
      expect(versions).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("같은 출처·같은 정규화 제목·같은 본문 해시는 URL이 달라도 합치고, 다른 출처의 같은 본문은 합치지 않는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await saveCollectedArticles(db, { sources: [source], articles: [collected({})], capturedAt });
      const other: Source = { ...source, id: "gnews:src-b", name: "Source B", externalId: "src-b" };
      const result = await saveCollectedArticles(db, {
        sources: [other],
        articles: [
          collected({
            url: "https://example.com/amp/story-1",
            title: " ministers  agree on framework",
          }),
          collected({ sourceId: other.id, url: "https://b.example/story-1" }),
        ],
        capturedAt: new Date(capturedAt.getTime() + 1000),
      });
      expect(result).toMatchObject({ newArticles: 1, mergedArticles: 1 });
      const rows = await db.select({ source_id: articles.source_id }).from(articles);
      expect(rows.map((r) => r.source_id).sort()).toEqual(["gnews:src-a", "gnews:src-b"]);
    } finally {
      await cleanup();
    }
  });
});
