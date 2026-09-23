import type { TodayData, TodayStoryCard } from "@newsplatform/db";
import { TOPICS } from "@newsplatform/domain/topic";

export const FIXED_NOW = new Date("2026-09-23T03:00:00.000Z");
export const LONG_SUMMARY = `첫 주장 전문을 축약하지 않습니다. https://example.test/${"longURL한글Mixed123".repeat(30)} 마지막 문장도 DOM에 남습니다.`;
export const liveStories: TodayStoryCard[] = Array.from({ length: 18 }, (_, index) => ({
  id: `live-${index}`,
  slug: `fixture-live-${index}`,
  title: `사건 ${String(index + 1).padStart(2, "0")} ${index === 0 ? "긴제목Mixed123".repeat(12) : "대표 제목"}`,
  topics: index === 0 ? [TOPICS[0], TOPICS[1]] : [TOPICS[index % 3] ?? TOPICS[0]],
  summary: LONG_SUMMARY,
  status: "복수 출처 일치",
  sourceCount: 3,
  updatedAt: new Date(FIXED_NOW.getTime() - (index + 1) * 60_000),
  isDemo: false,
}));
function requireFirstStory(): TodayStoryCard {
  const story = liveStories[0];
  if (!story) throw new Error("Missing fixture story");
  return story;
}
export const firstStory = requireFirstStory();
export const live: TodayData = { stories: liveStories, lastUpdated: firstStory.updatedAt };
export const demo: TodayData = {
  stories: [0, 1].map((index) => ({
    ...firstStory,
    id: `demo-${index}`,
    slug: `fixture-demo-${index}`,
    title: `테스트 입력 데모 ${index + 1}`,
    updatedAt: new Date("2026-09-17T00:30:00.000Z"),
    isDemo: true,
  })),
  lastUpdated: new Date("2026-09-17T00:30:00.000Z"),
};
