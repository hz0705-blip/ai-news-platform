import { describe, expect, it } from "vitest";
import type { CollectedArticle } from "./collected-article.ts";
import { dedupeExact, type KnownArticle } from "./exact-dedup.ts";
import { sha256Hex } from "./hash.ts";

const capturedAt = new Date("2026-09-27T05:00:00.000Z");

function collected(overrides: Partial<CollectedArticle>): CollectedArticle {
  return {
    sourceId: "gnews:src-a",
    externalId: "ext-1",
    url: "https://www.example.com/world/story-1/?utm=x",
    title: "Ministers agree on framework",
    description: "desc",
    publishedAt: new Date("2026-09-27T03:00:00.000Z"),
    topics: ["국제 정치·외교·안보"],
    rawBody: "<p>Ministers agreed on the framework.</p>",
    ...overrides,
  };
}

const BODY_HASH = sha256Hex("Ministers agreed on the framework.");

describe("dedupeExact", () => {
  it("merges an article found by several topic queries into one article with topic union", () => {
    const result = dedupeExact({
      known: [],
      collected: [
        collected({ topics: ["국제 정치·외교·안보"] }),
        collected({ url: "http://example.com/world/story-1#top", topics: ["세계 경제·금융"] }),
      ],
      capturedAt,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      isNew: true,
      normalizedUrl: "https://example.com/world/story-1",
      topics: ["국제 정치·외교·안보", "세계 경제·금융"],
    });
    expect(result[0]?.newVersions).toHaveLength(1);
    expect(result[0]?.newVersions[0]).toMatchObject({
      articleId: result[0]?.id,
      bodyHash: BODY_HASH,
      body: "Ministers agreed on the framework.",
    });
  });

  it("merges same-source articles with same normalized title and body hash", () => {
    const known: KnownArticle = {
      id: "a-known",
      sourceId: "gnews:src-a",
      normalizedUrl: "https://example.com/old-path",
      normalizedTitle: "ministers agree on framework",
      topics: ["기술·AI"],
      latestBodyHash: BODY_HASH,
    };
    const result = dedupeExact({
      known: [known],
      collected: [
        collected({ url: "https://example.com/new-path", title: "Ministers  Agree on Framework" }),
      ],
      capturedAt,
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "a-known",
        isNew: false,
        topics: ["국제 정치·외교·안보", "기술·AI"],
        newVersions: [],
      }),
    ]);
  });

  it("creates a new article version when a re-collected body differs", () => {
    const known: KnownArticle = {
      id: "a-known",
      sourceId: "gnews:src-a",
      normalizedUrl: "https://example.com/world/story-1",
      normalizedTitle: "ministers agree on framework",
      topics: ["국제 정치·외교·안보"],
      latestBodyHash: BODY_HASH,
    };
    const result = dedupeExact({
      known: [known],
      collected: [collected({ rawBody: "Ministers agreed on a revised framework." })],
      capturedAt,
    });
    expect(result[0]?.isNew).toBe(false);
    expect(result[0]?.newVersions).toHaveLength(1);
    expect(result[0]?.newVersions[0]?.bodyHash).toBe(
      sha256Hex("Ministers agreed on a revised framework."),
    );
  });

  it("같은 본문의 재수집은 새 기사 버전을 만들지 않는다", () => {
    const known: KnownArticle = {
      id: "a-known",
      sourceId: "gnews:src-a",
      normalizedUrl: "https://example.com/world/story-1",
      normalizedTitle: "ministers agree on framework",
      topics: ["국제 정치·외교·안보"],
      latestBodyHash: BODY_HASH,
    };
    const result = dedupeExact({ known: [known], collected: [collected({})], capturedAt });
    expect(result[0]?.newVersions).toEqual([]);
  });

  it("does not merge identical bodies from different sources", () => {
    const result = dedupeExact({
      known: [],
      collected: [
        collected({ sourceId: "gnews:src-a", url: "https://a.example/story" }),
        collected({ sourceId: "gnews:src-b", url: "https://b.example/story" }),
      ],
      capturedAt,
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.sourceId)).toEqual(["gnews:src-a", "gnews:src-b"]);
  });
});
