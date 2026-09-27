import {
  ACTIVE_WINDOW_MS,
  type AssignmentCandidate,
  TOPICS,
  type Topic,
} from "@newsplatform/domain";
import {
  and,
  cosineDistance,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import type { RuntimeDb } from "./runtime.ts";
import { articles, articleVersions, stories } from "./schema/index.ts";

/** 배정 단계에 넘기는 기사 한 건: 임베딩 입력(제목·설명·본문)과 순서 키, 이미 붙은 사건. */
export interface AssignmentArticle {
  readonly id: string;
  readonly storyId: string | null;
  readonly title: string;
  readonly description: string | undefined;
  /** 마지막 기사 버전의 정규화 본문. 설명이 없을 때 임베딩 입력이 된다. */
  readonly body: string;
  readonly publishedAt: Date;
  readonly topics: readonly Topic[];
}

/**
 * 배정할 기사를 읽는다. `articleIds`를 주면 그 기사들(갱신 버전 포함), 없으면 사건이 없는 기사 전부.
 * 본문은 `captured_at` 내림차순 첫 버전이다. 순서는 배정 단계가 정한다(`orderForAssignment`).
 */
export async function loadAssignmentArticles(
  db: RuntimeDb["db"],
  filter: { readonly articleIds?: readonly string[] } = {},
): Promise<AssignmentArticle[]> {
  if (filter.articleIds !== undefined && filter.articleIds.length === 0) return [];
  const rows = await db
    .select({
      id: articles.id,
      story_id: articles.story_id,
      title: articles.title,
      description: articles.description,
      published_at: articles.published_at,
      topics: articles.topics,
    })
    .from(articles)
    .where(
      filter.articleIds === undefined
        ? isNull(articles.story_id)
        : inArray(articles.id, [...filter.articleIds]),
    );
  if (rows.length === 0) return [];
  const latest = await db
    .selectDistinctOn([articleVersions.article_id], {
      article_id: articleVersions.article_id,
      body: articleVersions.body,
    })
    .from(articleVersions)
    .where(
      inArray(
        articleVersions.article_id,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(articleVersions.article_id, desc(articleVersions.captured_at));
  const bodyById = new Map(latest.map((v) => [v.article_id, v.body]));
  return rows.map((row) => ({
    id: row.id,
    storyId: row.story_id,
    title: row.title,
    description: row.description ?? undefined,
    body: bodyById.get(row.id) ?? "",
    publishedAt: row.published_at,
    topics: row.topics,
  }));
}

/**
 * 후보 사건 검색(스펙 "파이프라인": pgvector 코사인, 활성 창 72시간). 쿼리 모양(#53 Ruling):
 * 1. `articles.embedding`의 HNSW 코사인 인덱스로 새 기사 임베딩에 가장 가까운 기사 `K×4`건을 찾고
 *    그 기사들의 사건을 후보로 모은다(사건 하나가 여러 기사로 잡혀도 한 후보).
 * 2. 후보 중 라이브·미종료·마지막 신규 보도가 72시간 안인 사건에 대해 중심 유사도(`stories.centroid`)와
 *    대표 기사 유사도(사건의 첫 기사 = 발행 시각·식별자 순 첫 기사)를 계산해 중심 유사도 내림차순 `K`건을 돌려준다.
 * 활성 판정의 권위는 도메인(`decideAssignment`)에 있고 여기의 72시간 조건은 후보 슬롯을 휴면 사건에
 * 낭비하지 않기 위한 선별이다.
 */
export async function findCandidateStories(
  db: RuntimeDb["db"],
  embedding: readonly number[],
  options: { readonly now: Date; readonly k: number },
): Promise<AssignmentCandidate[]> {
  const vec = [...embedding];
  const nearest = await db
    .select({ story_id: articles.story_id })
    .from(articles)
    .where(and(isNotNull(articles.embedding), isNotNull(articles.story_id)))
    .orderBy(cosineDistance(articles.embedding, vec))
    .limit(options.k * 4);
  const storyIds = [...new Set(nearest.map((r) => r.story_id).filter((id) => id !== null))];
  if (storyIds.length === 0) return [];

  const centroidSimilarity = sql<number>`1 - (${cosineDistance(stories.centroid, vec)})`;
  const representative = sql`(select ${articles.embedding} from ${articles} where ${articles.story_id} = ${stories.id} order by ${articles.published_at}, ${articles.id} limit 1)`;
  const representativeSimilarity = sql<number>`1 - (${cosineDistance(representative, vec)})`;
  const cutoff = new Date(options.now.getTime() - ACTIVE_WINDOW_MS);
  const rows = await db
    .select({
      id: stories.id,
      last_new_report_at: stories.last_new_report_at,
      centroid_similarity: centroidSimilarity.mapWith(Number),
      representative_similarity: representativeSimilarity.mapWith(Number),
    })
    .from(stories)
    .where(
      and(
        inArray(stories.id, storyIds),
        eq(stories.is_demo, false),
        ne(stories.lifecycle, "종료"),
        isNotNull(stories.centroid),
        gte(stories.last_new_report_at, cutoff),
      ),
    )
    .orderBy(desc(centroidSimilarity), stories.id)
    .limit(options.k);
  return rows.map((row) => ({
    storyId: row.id,
    centroidSimilarity: row.centroid_similarity,
    representativeSimilarity: row.representative_similarity,
    lastNewReportAt: row.last_new_report_at ?? undefined,
  }));
}

export interface AssignToStoryInput {
  readonly articleId: string;
  readonly storyId: string;
  readonly embedding: readonly number[];
  readonly publishedAt: Date;
  readonly topics: readonly Topic[];
  readonly processedAt: Date;
}

function unionTopics(a: readonly Topic[], b: readonly Topic[]): Topic[] {
  const set = new Set<Topic>([...a, ...b]);
  return TOPICS.filter((topic) => set.has(topic));
}

/**
 * 기사를 기존 사건에 붙인다(한 트랜잭션). 기사의 사건·임베딩을 쓰고, 사건의 토픽 합집합·중심(소속 기사
 * 임베딩 평균)·마지막 신규 보도 시각(더 늦은 발행 시각)·마지막 처리 시각을 갱신하며 활성으로 둔다.
 */
export async function assignArticleToStory(
  db: RuntimeDb["db"],
  input: AssignToStoryInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const found = await tx
      .select({ topics: stories.topics, last_new_report_at: stories.last_new_report_at })
      .from(stories)
      .where(eq(stories.id, input.storyId));
    const story = found[0];
    if (story === undefined) throw new Error(`사건 없음: ${input.storyId}`);
    await tx
      .update(articles)
      .set({ story_id: input.storyId, embedding: [...input.embedding] })
      .where(eq(articles.id, input.articleId));
    const lastNewReportAt =
      story.last_new_report_at === null || story.last_new_report_at < input.publishedAt
        ? input.publishedAt
        : story.last_new_report_at;
    await tx
      .update(stories)
      .set({
        topics: unionTopics(story.topics, input.topics),
        centroid: sql`(select avg(${articles.embedding}) from ${articles} where ${articles.story_id} = ${input.storyId})`,
        last_new_report_at: lastNewReportAt,
        last_processed_at: input.processedAt,
        lifecycle: "활성",
      })
      .where(eq(stories.id, input.storyId));
  });
}

export interface CreateStoryInput {
  readonly story: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly topics: readonly Topic[];
  };
  readonly articleId: string;
  readonly embedding: readonly number[];
  readonly publishedAt: Date;
  readonly processedAt: Date;
}

/** 기사 하나로 새 라이브 사건을 만든다(한 트랜잭션). 중심은 그 기사 임베딩, 마지막 신규 보도는 그 발행 시각이다. */
export async function createStoryForArticle(
  db: RuntimeDb["db"],
  input: CreateStoryInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(stories).values({
      id: input.story.id,
      slug: input.story.slug,
      title: input.story.title,
      topics: [...input.story.topics],
      is_demo: false,
      lifecycle: "활성",
      centroid: [...input.embedding],
      last_new_report_at: input.publishedAt,
      last_processed_at: input.processedAt,
    });
    await tx
      .update(articles)
      .set({ story_id: input.story.id, embedding: [...input.embedding] })
      .where(eq(articles.id, input.articleId));
  });
}

/** 기존 기사의 갱신 버전: 사건은 그대로이고 마지막 처리 시각만 갱신한다(신규 보도 시계는 리셋하지 않는다). */
export async function touchStory(
  db: RuntimeDb["db"],
  input: { readonly storyId: string; readonly processedAt: Date },
): Promise<void> {
  await db
    .update(stories)
    .set({ last_processed_at: input.processedAt })
    .where(eq(stories.id, input.storyId));
}
