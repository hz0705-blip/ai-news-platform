import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  assignArticleToStory,
  createStoryForArticle,
  findCandidateStories,
  loadAssignmentArticles,
  touchStory,
} from "./assign.ts";
import {
  articles,
  articleVersions,
  EMBEDDING_DIMENSIONS,
  sources,
  stories,
} from "./schema/index.ts";
import { createMigrationDb } from "./test-db.ts";

const url = process.env.DATABASE_MIGRATION_URL;
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_MIGRATION_URL 없음 — 실 DB 테스트 건너뜀\n");

const now = new Date("2026-09-27T05:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

/** 고정 벡터: 기저 벡터의 가중합(1536차원). 코사인 유사도를 손으로 계산할 수 있다. */
function vec(weights: Readonly<Record<number, number>>): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const [i, w] of Object.entries(weights)) v[Number(i)] = w;
  return v;
}

async function seed(db: Awaited<ReturnType<typeof createMigrationDb>>["db"]) {
  await db.insert(sources).values({
    id: "gnews:src",
    name: "Src",
    rights_tier: "본문 처리 + 발췌 표시",
    region: "us",
    ownership: "불명",
    language: "영어",
    is_fictional: false,
    wire_id: null,
    external_id: "src",
  });
  const rows = [
    { id: "a-1", topics: ["국제 정치·외교·안보"] as const, publishedAt: hoursAgo(10) },
    { id: "a-2", topics: ["세계 경제·금융"] as const, publishedAt: hoursAgo(9) },
    { id: "a-3", topics: ["기술·AI"] as const, publishedAt: hoursAgo(80) },
    { id: "a-4", topics: ["기술·AI"] as const, publishedAt: hoursAgo(1) },
  ];
  await db.insert(articles).values(
    rows.map((r) => ({
      id: r.id,
      source_id: "gnews:src",
      story_id: null,
      url: `https://example.com/${r.id}`,
      normalized_url: `https://example.com/${r.id}`,
      external_id: null,
      title: `Title ${r.id}`,
      description: r.id === "a-4" ? null : `Desc ${r.id}`,
      published_at: r.publishedAt,
      topics: [...r.topics],
      embedding: null,
    })),
  );
  await db.insert(articleVersions).values({
    id: "av-4",
    article_id: "a-4",
    body: "Body of a-4",
    normalization_version: 1,
    body_hash: "h4",
    captured_at: now,
    body_expires_at: now,
  });
}

maybe("사건 배정 저장소", () => {
  it("finds candidate stories through the HNSW cosine index", async () => {
    const { db, sql: raw, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(db);
      await createStoryForArticle(db, {
        story: { id: "story-1", slug: "story-1", title: "S1", topics: ["국제 정치·외교·안보"] },
        articleId: "a-1",
        embedding: vec({ 0: 1 }),
        publishedAt: hoursAgo(10),
        processedAt: now,
      });
      await createStoryForArticle(db, {
        story: { id: "story-2", slug: "story-2", title: "S2", topics: ["세계 경제·금융"] },
        articleId: "a-2",
        embedding: vec({ 1: 1 }),
        publishedAt: hoursAgo(9),
        processedAt: now,
      });
      // 마지막 신규 보도가 72시간을 넘은 사건은 후보에서 빠진다(도메인 판정 전 선별).
      await createStoryForArticle(db, {
        story: { id: "story-3", slug: "story-3", title: "S3", topics: ["기술·AI"] },
        articleId: "a-3",
        embedding: vec({ 0: 1, 2: 0.1 }),
        publishedAt: hoursAgo(80),
        processedAt: now,
      });

      const query = vec({ 0: 0.9, 1: 0.1 });
      // 순차 스캔과 정렬을 끄면 최근접 질의는 HNSW 인덱스만으로 답해야 한다(정렬을 두면 통계에 따라
      // 다른 인덱스 + 정렬을 고를 수 있어 플래너 통계에 흔들린다).
      await raw`set enable_seqscan = off`;
      await raw`set enable_sort = off`;
      const plan = await raw<{ "QUERY PLAN": string }[]>`
        explain select story_id from articles
        where embedding is not null and story_id is not null
        order by embedding <=> ${JSON.stringify(query)}::vector limit 20
      `;
      expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("articles_embedding_hnsw_idx");

      const candidates = await findCandidateStories(db, query, { now, k: 5 });
      expect(candidates.map((c) => c.storyId)).toEqual(["story-1", "story-2"]);
      expect(candidates[0]?.centroidSimilarity).toBeCloseTo(0.9 / Math.hypot(0.9, 0.1), 3);
      expect(candidates[0]?.representativeSimilarity).toBeCloseTo(0.9 / Math.hypot(0.9, 0.1), 3);
      expect(candidates[0]?.lastNewReportAt).toEqual(hoursAgo(10));
    } finally {
      await cleanup();
    }
  });

  it("story topics are the union of its article topics", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(db);
      await createStoryForArticle(db, {
        story: { id: "story-1", slug: "story-1", title: "S1", topics: ["국제 정치·외교·안보"] },
        articleId: "a-1",
        embedding: vec({ 0: 1 }),
        publishedAt: hoursAgo(10),
        processedAt: hoursAgo(5),
      });
      await assignArticleToStory(db, {
        articleId: "a-2",
        storyId: "story-1",
        embedding: vec({ 1: 1 }),
        publishedAt: hoursAgo(9),
        topics: ["세계 경제·금융"],
        processedAt: now,
      });
      const [story] = await db.select().from(stories);
      expect(story).toMatchObject({
        topics: ["국제 정치·외교·안보", "세계 경제·금융"],
        last_new_report_at: hoursAgo(9),
        last_processed_at: now,
        lifecycle: "활성",
      });
      // 중심은 소속 기사 임베딩의 평균이다.
      expect(story?.centroid?.[0]).toBeCloseTo(0.5);
      expect(story?.centroid?.[1]).toBeCloseTo(0.5);
      const [a2] = await db.select().from(articles).where(sql`${articles.id} = 'a-2'`);
      expect(a2?.story_id).toBe("story-1");

      // 갱신 버전은 처리 시각만 움직인다.
      const later = new Date(now.getTime() + 60_000);
      await touchStory(db, { storyId: "story-1", processedAt: later });
      const [touched] = await db.select().from(stories);
      expect(touched).toMatchObject({ last_new_report_at: hoursAgo(9), last_processed_at: later });

      // 배정 대상 읽기: 사건 없는 기사만, 설명이 없으면 본문을 함께 준다.
      const pending = await loadAssignmentArticles(db);
      expect(pending.map((a) => a.id).sort()).toEqual(["a-3", "a-4"]);
      expect(pending.find((a) => a.id === "a-4")).toMatchObject({
        description: undefined,
        body: "Body of a-4",
      });
    } finally {
      await cleanup();
    }
  });
});
