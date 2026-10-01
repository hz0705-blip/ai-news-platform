import { createMigrationDb, readTestDbUrl } from "@newstrail/db/testing";
import { describe, expect, it } from "vitest";
import { clearArticleImage } from "./article-image.ts";
import type { CacheInvalidator } from "./revalidate.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

/**
 * 사건 셋: s-1은 harbor 기사 a-1(이미지)과 개정판 둘, s-2는 harbor 기사 a-2(이미지)와 개정판 하나,
 * s-3은 다른 출처 기사 a-3(이미지)과 개정판 하나. a-1은 s-2의 옛 개정판 출처 집합에도 들어 있다(사건을 옮긴 기사).
 */
async function seed(sql: Awaited<ReturnType<typeof createMigrationDb>>["sql"]) {
  await sql`insert into sources (id, name, rights_tier, region, ownership, language, is_fictional) values
    ('gdelt:harbor-news.example', 'harbor-news.example', '링크만', '미확인', 'unknown', 'en', false),
    ('other.example', 'Other', '본문 처리 + 발췌 표시', '미확인', 'unknown', 'en', false)`;
  await sql`insert into stories (id, slug, title, topics, is_demo, lifecycle) values
    ('s-1', 's-1', '사건 1', '{}', false, '활성'), ('s-2', 's-2', '사건 2', '{}', false, '활성'),
    ('s-3', 's-3', '사건 3', '{}', false, '활성')`;
  await sql`insert into articles (id, source_id, story_id, url, normalized_url, title, published_at, topics, image_url) values
    ('a-1', 'gdelt:harbor-news.example', 's-1', 'https://harbor-news.example/a', 'https://harbor-news.example/a', 'A', now(), '{}', 'https://img.harbor-news.example/a.jpg'),
    ('a-2', 'gdelt:harbor-news.example', 's-2', 'https://harbor-news.example/b', 'https://harbor-news.example/b', 'B', now(), '{}', 'https://img.harbor-news.example/b.jpg'),
    ('a-3', 'other.example', 's-3', 'https://other.example/c', 'https://other.example/c', 'C', now(), '{}', 'https://img.other.example/c.jpg')`;
  await sql`insert into story_revisions (id, story_id, revision_number, title, published_at, contradiction_status,
      prompt_evidence_extract, prompt_claim_generate, prompt_gate, prompt_contradiction_label, model_id, source_article_ids) values
    ('r-1', 's-1', 1, 't', now(), '단일 출처', 'p', 'p', 'p', 'p', 'm', '{a-1}'),
    ('r-2', 's-1', 2, 't', now(), '단일 출처', 'p', 'p', 'p', 'p', 'm', '{a-1}'),
    ('r-3', 's-2', 1, 't', now(), '단일 출처', 'p', 'p', 'p', 'p', 'm', '{a-1,a-2}'),
    ('r-4', 's-3', 1, 't', now(), '단일 출처', 'p', 'p', 'p', 'p', 'm', '{a-3}')`;
}

function recorder(): { invalidate: CacheInvalidator; calls: [string[], unknown][] } {
  const calls: [string[], unknown][] = [];
  return {
    calls,
    invalidate: async (tags, options) => {
      calls.push([[...tags], options]);
    },
  };
}

const S1_TAGS = ["story:s-1:latest", "story:s-1:rev:r-1:ko:v1", "story:s-1:rev:r-2:ko:v1"];
const S2_TAGS = ["story:s-2:latest", "story:s-2:rev:r-3:ko:v1"];

maybe("article:clear-image", () => {
  it("article:clear-image는 기사 이미지 URL을 지우고 영향받는 사건 캐시를 만료한다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(sql);
      const imageOf = async () =>
        Object.fromEntries(
          (
            await sql<{ id: string; image_url: string | null }[]>`
            select id, image_url from articles order by id`
          ).map((r) => [r.id, r.image_url]),
        );
      const { invalidate, calls } = recorder();

      // 기사 단위: URL은 정규화해 찾는다. 그 기사가 붙은 사건과 출처 집합에 그 기사를 담은 개정판의 사건을 만료한다.
      expect(
        await clearArticleImage(db, "https://www.harbor-news.example/a/?utm_source=x", invalidate),
      ).toEqual({ scope: "article", clearedArticles: 1, expiredStories: 2, expiredTags: 6 });
      expect(calls).toEqual([[[...S1_TAGS, ...S2_TAGS, "today:ko"], { immediate: true }]]);
      expect(await imageOf()).toEqual({
        "a-1": null,
        "a-2": "https://img.harbor-news.example/b.jpg",
        "a-3": "https://img.other.example/c.jpg",
      });

      // 다시 돌려도 안전하다: 지울 것은 없고 같은 사건 캐시를 다시 만료한다(만료 실패 재시도 경로).
      calls.length = 0;
      expect(
        await clearArticleImage(db, "https://harbor-news.example/a", invalidate),
      ).toMatchObject({ clearedArticles: 0, expiredStories: 2 });
      expect(calls).toHaveLength(1);

      // 출처 단위: 그 출처의 모든 기사.
      calls.length = 0;
      expect(await clearArticleImage(db, "gdelt:harbor-news.example", invalidate)).toEqual({
        scope: "source",
        clearedArticles: 1,
        expiredStories: 2,
        expiredTags: 6,
      });
      expect(await imageOf()).toEqual({
        "a-1": null,
        "a-2": null,
        "a-3": "https://img.other.example/c.jpg",
      });

      // 모르는 기사·출처는 거부한다.
      await expect(clearArticleImage(db, "https://nowhere.example/x", invalidate)).rejects.toThrow(
        "알 수 없는",
      );
      await expect(clearArticleImage(db, "gdelt:nowhere.example", invalidate)).rejects.toThrow(
        "알 수 없는",
      );
    } finally {
      await cleanup();
    }
  });

  it("무효화 경로가 없으면 아무것도 쓰지 않고 거부한다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(sql);
      await expect(clearArticleImage(db, "other.example", undefined)).rejects.toThrow(
        "WEB_REVALIDATE_URL",
      );
      expect(
        (
          await sql<{ image_url: string | null }[]>`select image_url from articles where id = 'a-3'`
        )[0]?.image_url,
      ).toBe("https://img.other.example/c.jpg");
    } finally {
      await cleanup();
    }
  });
});
