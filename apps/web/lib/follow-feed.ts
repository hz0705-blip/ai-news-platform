import type { FollowFeedStory } from "@newstrail/db";

/** 마지막으로 본 개정판 뒤에 발행된 개정판이 있으면 참. 본 적 없는 사건은 기준이 없어 거짓이다(Ruling, lib/last-seen.ts). */
export const hasChangesSinceSeen = (story: FollowFeedStory): boolean =>
  story.lastSeenRevisionNumber !== null &&
  story.lastSeenRevisionNumber < story.latestRevisionNumber;

/**
 * 팔로우 화면 순서(스펙 사용자 스토리 26): 읽은 이후 변화 있음 먼저, 그다음 사건 갱신 시각 최신순, 같으면 사건 식별자.
 * 데모 사건은 공개 피드에서 제외한다(스펙 "화면 구성").
 */
export function arrangeFollowFeed(stories: readonly FollowFeedStory[]): {
  live: FollowFeedStory[];
} {
  const sorted = [...stories].sort(
    (a, b) =>
      Number(hasChangesSinceSeen(b)) - Number(hasChangesSinceSeen(a)) ||
      b.updatedAt.getTime() - a.updatedAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  return {
    live: sorted.filter((story) => !story.isDemo),
  };
}

/** 오늘 머리의 안내(#208)가 세는 수: 팔로우 화면의 라이브 사건 중 읽은 이후 변화가 있는 것. */
export const countFollowChanges = (stories: readonly FollowFeedStory[]): number =>
  arrangeFollowFeed(stories).live.filter(hasChangesSinceSeen).length;
