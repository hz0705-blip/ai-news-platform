import { describe, expect, it } from "vitest";
import { prioritizeStories } from "./priority.ts";

describe("한도 도달 시 사건 우선순위(스펙 '배치와 비용')", () => {
  it("기사가 많이 붙은 사건 → 동률이면 토픽 순서 → 사건 식별자", () => {
    const ordered = prioritizeStories([
      { storyId: "s-tech-2", articleCount: 2, topics: ["기술·AI"] },
      { storyId: "s-econ-2", articleCount: 2, topics: ["세계 경제·금융"] },
      { storyId: "s-korea-1", articleCount: 1, topics: ["한국 관련 해외 보도"] },
      { storyId: "s-world-3", articleCount: 3, topics: ["국제 정치·외교·안보"] },
      { storyId: "s-econ-2-b", articleCount: 2, topics: ["세계 경제·금융", "기술·AI"] },
    ]);
    expect(ordered.map((s) => s.storyId)).toEqual([
      "s-world-3",
      "s-econ-2",
      "s-econ-2-b",
      "s-tech-2",
      "s-korea-1",
    ]);
  });

  it("이전 배치가 미룬 사건은 기사 수와 무관하게 먼저이고, 먼저 미룬 순이다", () => {
    const ordered = prioritizeStories([
      { storyId: "s-big", articleCount: 9, topics: ["한국 관련 해외 보도"] },
      {
        storyId: "s-deferred-later",
        articleCount: 1,
        topics: ["기술·AI"],
        deferredSince: new Date("2026-09-27T08:00:00Z"),
      },
      {
        storyId: "s-deferred-first",
        articleCount: 1,
        topics: ["기술·AI"],
        deferredSince: new Date("2026-09-26T20:00:00Z"),
      },
    ]);
    expect(ordered.map((s) => s.storyId)).toEqual([
      "s-deferred-first",
      "s-deferred-later",
      "s-big",
    ]);
  });
});
