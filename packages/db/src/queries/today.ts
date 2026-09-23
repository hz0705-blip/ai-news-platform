import type { ContradictionStatus, Topic } from "@newsplatform/domain";
import { desc, eq, sql } from "drizzle-orm";
import type { RuntimeDb } from "../runtime.ts";
import { articles, claimRevisions, stories, storyRevisions } from "../schema/index.ts";

export interface TodayStoryCard {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly topics: readonly Topic[];
  readonly summary: string;
  readonly status: ContradictionStatus;
  readonly sourceCount: number;
  readonly updatedAt: Date;
  readonly isDemo: boolean;
}

export interface TodayData {
  readonly stories: readonly TodayStoryCard[];
  readonly lastUpdated: Date | null;
}

/**
 * 라이브와 데모를 별도로 읽는다. 최신 개정판은 revision_number로 해소하고 목록은 발행
 * 시각으로 정렬한다. 한 SQL 스냅샷에서 카드 전체를 읽어 제목·주장·상태가 섞이지 않는다.
 * 출처 수는 사건의 기사에 연결된 distinct 출처(링크만 포함)이며 근거 수가 아니다.
 */
export async function loadPublishedToday(
  db: RuntimeDb["db"],
  params: { readonly isDemo: boolean },
): Promise<TodayData> {
  const latest = db
    .selectDistinctOn([storyRevisions.story_id])
    .from(storyRevisions)
    .orderBy(storyRevisions.story_id, desc(storyRevisions.revision_number))
    .as("latest");

  const cards = await db
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
    })
    .from(stories)
    .innerJoin(latest, eq(latest.story_id, stories.id))
    .where(eq(stories.is_demo, params.isDemo))
    .orderBy(desc(latest.published_at), stories.id);

  return {
    stories: cards.map((card) => ({ ...card, summary: card.summary ?? "" })),
    lastUpdated: cards[0]?.updatedAt ?? null,
  };
}
