import type { FollowFeedStory } from "@newstrail/db";
import { describe, expect, it } from "vitest";
import { arrangeFollowFeed, hasChangesSinceSeen } from "./follow-feed.ts";

function story(
  id: string,
  updatedHour: number,
  seen: { latest: number; lastSeen: number | null },
  isDemo = false,
): FollowFeedStory {
  return {
    id,
    slug: id,
    title: id,
    topics: ["기술·AI"],
    summary: "",
    status: "단일 출처",
    sourceCount: 1,
    updatedAt: new Date(Date.UTC(2026, 8, 20, updatedHour)),
    isDemo,
    latestRevisionNumber: seen.latest,
    lastSeenRevisionNumber: seen.lastSeen,
    followsStory: true,
  };
}

describe("arrangeFollowFeed — 팔로우 화면 순서", () => {
  it("읽은 이후 변화 있음 먼저, 그다음 사건 갱신 시각 최신순이고 데모는 따로 모은다", () => {
    const feed = [
      story("seen-new", 9, { latest: 2, lastSeen: 2 }),
      story("changed-old", 1, { latest: 3, lastSeen: 1 }),
      story("never-seen", 8, { latest: 2, lastSeen: null }),
      story("changed-new", 5, { latest: 2, lastSeen: 1 }),
      story("demo-changed", 2, { latest: 2, lastSeen: 1 }, true),
      story("demo-seen", 7, { latest: 2, lastSeen: 2 }, true),
    ];
    const { live, demo } = arrangeFollowFeed(feed);
    expect(live.map((s) => s.id)).toEqual(["changed-new", "changed-old", "seen-new", "never-seen"]);
    expect(demo.map((s) => s.id)).toEqual(["demo-changed", "demo-seen"]);
  });

  it("본 적 없는 사건은 변화 있음으로 세지 않는다", () => {
    expect(hasChangesSinceSeen(story("a", 1, { latest: 3, lastSeen: null }))).toBe(false);
    expect(hasChangesSinceSeen(story("a", 1, { latest: 3, lastSeen: 2 }))).toBe(true);
    expect(hasChangesSinceSeen(story("a", 1, { latest: 3, lastSeen: 3 }))).toBe(false);
  });
});
