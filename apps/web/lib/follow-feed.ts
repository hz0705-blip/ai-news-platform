import type { FollowFeedStory } from "@newsplatform/db";

/** 마지막으로 본 개정판 뒤에 발행된 개정판이 있으면 참. 본 적 없는 사건은 기준이 없어 거짓이다(Ruling, lib/last-seen.ts). */
export const hasChangesSinceSeen = (story: FollowFeedStory): boolean =>
  story.lastSeenRevisionNumber !== null &&
  story.lastSeenRevisionNumber < story.latestRevisionNumber;

/**
 * 팔로우 화면 순서(스펙 사용자 스토리 26): 읽은 이후 변화 있음 먼저, 그다음 사건 갱신 시각 최신순, 같으면 사건 식별자.
 * 데모 사건은 라이브와 섞지 않고 따로 모은다(스펙 "화면 구성").
 */
export function arrangeFollowFeed(stories: readonly FollowFeedStory[]): {
  live: FollowFeedStory[];
  demo: FollowFeedStory[];
} {
  const sorted = [...stories].sort(
    (a, b) =>
      Number(hasChangesSinceSeen(b)) - Number(hasChangesSinceSeen(a)) ||
      b.updatedAt.getTime() - a.updatedAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  return {
    live: sorted.filter((story) => !story.isDemo),
    demo: sorted.filter((story) => story.isDemo),
  };
}
