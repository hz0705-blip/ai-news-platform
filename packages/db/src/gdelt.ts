import type { Revision, Source, Story } from "@newsplatform/domain";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { toSourceRow } from "./mappers.ts";
import { loadLatestRevision } from "./queries/revision.ts";
import type { RuntimeDb } from "./runtime.ts";
import { articles, sources, stories, storyRevisions } from "./schema/index.ts";

/**
 * GDELT 단계(#77)의 저장소 함수. 링크만 기사는 기사 행만 있고 기사 버전(본문)이 없다(`is_link_only`).
 * 발행 시각을 모르므로 `published_at`은 관측 시각(`observed_at` = GDELT GKG `DATE`)의 복사본이다.
 */

/** 조회할 사건: 대표 기사(링크만이 아닌 기사 중 발행 시각·식별자 순 첫 기사)의 제목과 발행 시각. 입력 순서를 지킨다. */
export async function loadGdeltStories(
  db: RuntimeDb["db"],
  storyIds: readonly string[],
): Promise<{ storyId: string; title: string; firstPublishedAt: Date }[]> {
  if (storyIds.length === 0) return [];
  const rows = await db
    .selectDistinctOn([articles.story_id], {
      story_id: articles.story_id,
      title: articles.title,
      published_at: articles.published_at,
    })
    .from(articles)
    .where(and(inArray(articles.story_id, [...storyIds]), eq(articles.is_link_only, false)))
    .orderBy(articles.story_id, articles.published_at, articles.id);
  const byStory = new Map(rows.map((r) => [r.story_id, r]));
  return storyIds.flatMap((storyId) => {
    const row = byStory.get(storyId);
    return row === undefined
      ? []
      : [{ storyId, title: row.title, firstPublishedAt: row.published_at }];
  });
}

/** 최근 발행 사건(데모 제외, 최신 개정판 발행 시각 내림차순) `limit`개의 식별자. 수동 GDELT 실행(`gdelt:run`)용. */
export async function loadRecentlyPublishedStoryIds(
  db: RuntimeDb["db"],
  limit: number,
): Promise<string[]> {
  const latest = sql<Date>`max(${storyRevisions.published_at})`;
  const rows = await db
    .select({ id: stories.id })
    .from(stories)
    .innerJoin(storyRevisions, eq(storyRevisions.story_id, stories.id))
    .where(eq(stories.is_demo, false))
    .groupBy(stories.id)
    .orderBy(desc(latest), stories.id)
    .limit(limit);
  return rows.map((r) => r.id);
}

/** 정규화 URL → 기존 기사 식별자. */
export async function findArticleIdsByNormalizedUrl(
  db: RuntimeDb["db"],
  normalizedUrls: readonly string[],
): Promise<Map<string, string>> {
  if (normalizedUrls.length === 0) return new Map();
  const rows = await db
    .select({ id: articles.id, normalized_url: articles.normalized_url })
    .from(articles)
    .where(inArray(articles.normalized_url, [...normalizedUrls]));
  return new Map(rows.map((r) => [r.normalized_url, r.id]));
}

/** 기존 기사의 관측: `observed_at`은 GDELT가 처음 본 시각이므로 더 이른 값만 남긴다(`least`는 null을 무시한다). */
export async function recordArticleObservations(
  db: RuntimeDb["db"],
  items: readonly { readonly articleId: string; readonly observedAt: Date }[],
): Promise<void> {
  for (const item of items) {
    await db
      .update(articles)
      .set({
        observed_at: sql`least(${articles.observed_at}, ${item.observedAt.toISOString()}::timestamptz)`,
      })
      .where(eq(articles.id, item.articleId));
  }
}

/**
 * 링크만 기사 하나를 사건에 붙여 저장한다(출처가 없으면 함께). 임베딩은 두지 않는다 — 제목만의 임베딩이
 * 사건 중심과 후보 검색(제목+설명 임베딩)을 흐리지 않게. 사건의 신규 보도·처리 시각도 건드리지 않는다
 * (링크만 기사는 원점이 아니고, 모델 재처리 대상이 되지 않는다). 같은 URL이 이미 있으면 아무것도 하지 않는다.
 */
export async function saveLinkOnlyArticle(
  db: RuntimeDb["db"],
  input: {
    readonly articleId: string;
    readonly storyId: string;
    readonly source: Source;
    readonly url: string;
    readonly normalizedUrl: string;
    readonly title: string;
    readonly observedAt: Date;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(sources).values(toSourceRow(input.source)).onConflictDoNothing();
    await tx
      .insert(articles)
      .values({
        id: input.articleId,
        source_id: input.source.id,
        story_id: input.storyId,
        url: input.url,
        normalized_url: input.normalizedUrl,
        external_id: null,
        title: input.title,
        description: null,
        published_at: input.observedAt,
        observed_at: input.observedAt,
        is_link_only: true,
        topics: [],
        embedding: null,
      })
      .onConflictDoNothing();
  });
}

/**
 * 출처 추가 개정판의 바탕: 사건과 최신 개정판(출처 구획은 현재 기사들). 개정판이 없거나, 미뤄졌거나,
 * 마지막 처리 시각이 최신 확인 시각보다 늦어(입력이 바뀌어) 모델 재처리를 기다리는 사건이면 undefined다 —
 * 그때 출처 추가 개정판을 내면 확인 시각이 앞서 재처리가 빠진다.
 */
export async function loadRevisionToExtend(
  db: RuntimeDb["db"],
  storyId: string,
): Promise<{ story: Story; revision: Revision } | undefined> {
  const latestChecked = sql`(select max(${storyRevisions.checked_at}) from ${storyRevisions} where ${storyRevisions.story_id} = ${stories.id})`;
  const [row] = await db
    .select()
    .from(stories)
    .where(
      and(
        eq(stories.id, storyId),
        sql`${stories.deferred_at} is null`,
        sql`${latestChecked} is not null`,
        sql`(${stories.last_processed_at} is null or ${stories.last_processed_at} <= ${latestChecked})`,
      ),
    )
    .limit(1);
  if (row === undefined) return undefined;
  const revision = await loadLatestRevision(db, { slug: row.slug });
  if (revision === undefined) return undefined;
  return {
    story: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      topics: row.topics,
      isDemo: row.is_demo,
      lifecycle: row.lifecycle,
    },
    revision,
  };
}
