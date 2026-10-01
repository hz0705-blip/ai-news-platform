import type { Topic } from "@newstrail/domain";
import { and, desc, eq, exists, ne, or, sql } from "drizzle-orm";
import { leadImageSql } from "./queries/lead-image.ts";
import type { TodayStoryCard } from "./queries/today.ts";
import type { RuntimeDb } from "./runtime.ts";
import {
  articles,
  claimRevisions,
  lastSeenRevisions,
  stories,
  storyFollows,
  storyRevisions,
  topicFollows,
} from "./schema/index.ts";

/**
 * 팔로우와 마지막으로 본 개정판(#105, 스펙 "계정"·"도메인 모델 규칙"). 모든 함수는 `userId`를 소유자 조건으로 건다 —
 * 호출자(웹 Server Action·서버 컴포넌트)는 검증된 현재 사용자 ID만 넘기고, 다른 사용자의 행은 읽지도 바꾸지도 않는다.
 */
type Db = RuntimeDb["db"];

async function storyIdOf(db: Db, slug: string): Promise<string | undefined> {
  const rows = await db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.slug, slug), eq(stories.is_demo, false)))
    .limit(1);
  return rows[0]?.id;
}

/** 사건을 팔로우한다(이미 팔로우했으면 그대로). 사건이 없으면 false. */
export async function followStory(
  db: Db,
  params: { readonly userId: string; readonly slug: string },
): Promise<boolean> {
  const storyId = await storyIdOf(db, params.slug);
  if (storyId === undefined) return false;
  await db
    .insert(storyFollows)
    .values({ user_id: params.userId, story_id: storyId })
    .onConflictDoNothing();
  return true;
}

/** 사건 팔로우를 해제한다(없으면 그대로). */
export async function unfollowStory(
  db: Db,
  params: { readonly userId: string; readonly slug: string },
): Promise<void> {
  const storyId = await storyIdOf(db, params.slug);
  if (storyId === undefined) return;
  await db
    .delete(storyFollows)
    .where(and(eq(storyFollows.user_id, params.userId), eq(storyFollows.story_id, storyId)));
}

export async function followTopic(
  db: Db,
  params: { readonly userId: string; readonly topic: Topic },
): Promise<void> {
  await db
    .insert(topicFollows)
    .values({ user_id: params.userId, topic: params.topic })
    .onConflictDoNothing();
}

export async function unfollowTopic(
  db: Db,
  params: { readonly userId: string; readonly topic: Topic },
): Promise<void> {
  await db
    .delete(topicFollows)
    .where(and(eq(topicFollows.user_id, params.userId), eq(topicFollows.topic, params.topic)));
}

/** 이 사용자가 팔로우한 토픽. */
export async function loadFollowedTopics(
  db: Db,
  params: { readonly userId: string },
): Promise<Topic[]> {
  const rows = await db
    .select({ topic: topicFollows.topic })
    .from(topicFollows)
    .where(eq(topicFollows.user_id, params.userId));
  return rows.map((row) => row.topic);
}

export interface StoryVisit {
  /** 이 방문 전의 마지막으로 본 개정판. 본 적 없으면 null. */
  readonly previousRevisionId: string | null;
  /** 이 사용자가 이 사건을 팔로우하는지(방문 뒤 상태). */
  readonly following: boolean;
}

/**
 * 사건 페이지 방문(스펙 "마지막으로 본 개정판": 사건 페이지를 열면 갱신). 보이는 개정판(`revisionId`)이 그 사건의 것이면
 * 이전 값을 돌려주고, 마지막으로 본 개정판을 그 개정판으로 올린다 — 이미 본 개정판보다 뒤일 때만 바꾼다(개정판 고정 URL로
 * 옛 개정판을 열어도 읽은 지점이 뒤로 가지 않는다). 사건 URL은 최신 개정판을 보이므로 현재 개정판으로 갱신된다.
 * `follow`가 참이면 같은 트랜잭션에서 팔로우도 한다(로그인 뒤 돌아와 하려던 팔로우를 마친다).
 * 사건이나 개정판이 없거나 서로 맞지 않으면 아무것도 쓰지 않고 `undefined`.
 */
export async function recordStoryVisit(
  db: Db,
  params: {
    readonly userId: string;
    readonly slug: string;
    readonly revisionId: string;
    readonly follow?: boolean;
  },
): Promise<StoryVisit | undefined> {
  return db.transaction(async (tx) => {
    const targetRows = await tx
      .select({ storyId: storyRevisions.story_id })
      .from(storyRevisions)
      .innerJoin(stories, eq(stories.id, storyRevisions.story_id))
      .where(
        and(
          eq(stories.slug, params.slug),
          eq(stories.is_demo, false),
          eq(storyRevisions.id, params.revisionId),
        ),
      )
      .limit(1);
    const storyId = targetRows[0]?.storyId;
    if (storyId === undefined) return undefined;

    const owner = and(
      eq(lastSeenRevisions.user_id, params.userId),
      eq(lastSeenRevisions.story_id, storyId),
    );
    const previousRows = await tx
      .select({ revisionId: lastSeenRevisions.revision_id })
      .from(lastSeenRevisions)
      .where(owner)
      .for("update");
    const previousRevisionId = previousRows[0]?.revisionId ?? null;

    const numberOf = (revisionId: unknown) =>
      sql`(select ${storyRevisions.revision_number} from ${storyRevisions} where ${storyRevisions.id} = ${revisionId})`;
    await tx
      .insert(lastSeenRevisions)
      .values({ user_id: params.userId, story_id: storyId, revision_id: params.revisionId })
      .onConflictDoUpdate({
        target: [lastSeenRevisions.user_id, lastSeenRevisions.story_id],
        set: { revision_id: params.revisionId },
        setWhere: sql`${numberOf(lastSeenRevisions.revision_id)} < ${numberOf(params.revisionId)}`,
      });

    if (params.follow === true) {
      await tx
        .insert(storyFollows)
        .values({ user_id: params.userId, story_id: storyId })
        .onConflictDoNothing();
    }
    const followRows = await tx
      .select({ storyId: storyFollows.story_id })
      .from(storyFollows)
      .where(and(eq(storyFollows.user_id, params.userId), eq(storyFollows.story_id, storyId)));
    return { previousRevisionId, following: followRows.length > 0 };
  });
}

/** 팔로우 화면의 카드 하나. 오늘 카드에 팔로우 화면이 쓰는 값을 더한다. */
export interface FollowFeedStory extends TodayStoryCard {
  /** 최신 발행 개정판의 번호. */
  readonly latestRevisionNumber: number;
  /** 마지막으로 본 개정판의 번호. 본 적 없으면 null. */
  readonly lastSeenRevisionNumber: number | null;
  /** 사건을 직접 팔로우했으면 참(거짓이면 팔로우한 토픽으로 들어온 사건). */
  readonly followsStory: boolean;
}

/**
 * 팔로우 화면이 읽는 사건: 직접 팔로우한 라이브 사건과 팔로우한 토픽의 라이브 사건(종료 사건 제외). 발행된 개정판이
 * 있는 사건만. 정렬은 화면이 한다(읽은 이후 변화 있음 먼저). 카드 값은 오늘 화면 질의와 같은 규칙으로 읽는다.
 */
export async function loadFollowFeed(
  db: Db,
  params: { readonly userId: string },
): Promise<FollowFeedStory[]> {
  const latest = db
    .selectDistinctOn([storyRevisions.story_id])
    .from(storyRevisions)
    .orderBy(storyRevisions.story_id, desc(storyRevisions.revision_number))
    .as("latest");
  const followedTopics = db
    .select({ topic: topicFollows.topic })
    .from(topicFollows)
    .where(eq(topicFollows.user_id, params.userId));
  const directlyFollowed = exists(
    db
      .select({ one: sql`1` })
      .from(storyFollows)
      .where(and(eq(storyFollows.user_id, params.userId), eq(storyFollows.story_id, stories.id))),
  );

  const rows = await db
    .select({
      id: stories.id,
      slug: stories.slug,
      title: latest.title,
      topics: stories.topics,
      summary: sql<string | null>`(
        select ${claimRevisions.text} from ${claimRevisions}
        where ${claimRevisions.story_revision_id} = ${latest.id}
        order by ${claimRevisions.display_order}, ${claimRevisions.id} limit 1
      )`,
      status: latest.contradiction_status,
      sourceCount: sql<number>`(
        select count(distinct ${articles.source_id})::int from ${articles}
        where ${articles.story_id} = ${stories.id}
      )`,
      updatedAt: latest.published_at,
      isDemo: stories.is_demo,
      image: leadImageSql(latest.source_article_ids),
      latestRevisionNumber: latest.revision_number,
      lastSeenRevisionNumber: sql<number | null>`(
        select ${storyRevisions.revision_number} from ${lastSeenRevisions}
        join ${storyRevisions} on ${storyRevisions.id} = ${lastSeenRevisions.revision_id}
        where ${lastSeenRevisions.user_id} = ${params.userId}
          and ${lastSeenRevisions.story_id} = ${stories.id}
      )`,
      followsStory: sql<boolean>`${directlyFollowed}`,
    })
    .from(stories)
    .innerJoin(latest, eq(latest.story_id, stories.id))
    .where(
      and(
        eq(stories.is_demo, false),
        or(
          directlyFollowed,
          and(
            ne(stories.lifecycle, "종료"),
            sql`${stories.topics} && array(${followedTopics})::text[]`,
          ),
        ),
      ),
    );
  return rows.map((row) => ({ ...row, summary: row.summary ?? "" }));
}
