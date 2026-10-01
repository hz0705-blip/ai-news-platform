import type { TodayData, TodayStoryCard } from "@newstrail/db";
import { TOPICS } from "@newstrail/domain/topic";

export const FIXED_NOW = new Date("2026-09-23T03:00:00.000Z");
export const LONG_SUMMARY = `첫 주장 전문을 축약하지 않습니다. https://example.test/${"longURL한글Mixed123".repeat(30)} 마지막 문장도 DOM에 남습니다.`;
export const liveStories: TodayStoryCard[] = Array.from({ length: 18 }, (_, index) => ({
  id: `live-${index}`,
  slug: `fixture-live-${index}`,
  title: `사건 ${String(index + 1).padStart(2, "0")} ${index === 0 ? "긴제목Mixed123".repeat(12) : "대표 제목"}`,
  topics: index === 0 ? [TOPICS[0], TOPICS[1]] : [TOPICS[index % 3] ?? TOPICS[0]],
  summary: LONG_SUMMARY,
  claims: [LONG_SUMMARY],
  status: "복수 출처 일치",
  sourceCount: 3,
  updatedAt: new Date(FIXED_NOW.getTime() - (index + 1) * 60_000),
  isDemo: false,
  image: null,
}));
/**
 * 레이아웃 실측용: 짧은 제목·요약과 주장 3개. 토픽 0에서는 짧은 보조 사건 둘, 토픽 1 필터에서는 긴 요약의 보조 사건 둘이
 * 오른쪽 열을 만든다. 이미지는 검사에서 넣는다.
 */
const LEAD_CLAIMS = [
  "세 나라 장관들이 가상 항만 협정의 틀에 합의했다고 두 출처가 독립적으로 보도했으며, 서명식은 세 번째 항만 도시에서 세 나라 대표단과 항만 운영사 관계자가 참석한 가운데 열렸다.",
  "협정은 세 항만의 통관 서식을 하나로 묶고 환적 수수료를 3년에 걸쳐 단계적으로 낮추며, 공동 검역 창구와 선적 정보 교환 체계를 내년 상반기에 차례로 여는 일정을 담았다.",
  "후속 협상은 10월에 재개될 것이라고 두 출처가 관계자를 인용해 전망했지만, 세부 일정과 참여 기관, 분쟁 조정 절차의 형태는 아직 공개되지 않았다고 덧붙였다.",
];
const LONG_CLAIM =
  "세 나라 장관들이 가상 항만 협정의 틀에 합의했다고 두 출처가 독립적으로 보도했으며, 협정은 세 항만의 통관 서식을 하나로 묶고 환적 수수료를 단계적으로 낮추는 내용을 담았고, 후속 협상은 10월에 재개될 것이라고 관계자를 인용해 전망했다. 세부 일정과 참여 기관은 아직 공개되지 않았으며, 분쟁 조정 절차의 형태와 발효 시점도 다음 회의에서 다시 논의하기로 했다고 두 출처는 덧붙였다.";
export const layoutStories: TodayStoryCard[] = [
  { title: "항만 협정 서명", topics: [TOPICS[0], TOPICS[1]], claims: LEAD_CLAIMS },
  {
    title: "보조 사건 하나",
    topics: [TOPICS[0]],
    claims: ["짧은 요약 한 줄.", "둘째 주장.", "셋째 주장."],
  },
  {
    title: "보조 사건 둘",
    topics: [TOPICS[0]],
    claims: ["짧은 요약 한 줄.", "둘째 주장.", "셋째 주장."],
  },
  { title: "긴 요약의 보조 사건 하나", topics: [TOPICS[1]], claims: [LONG_CLAIM] },
  { title: "긴 요약의 보조 사건 둘", topics: [TOPICS[1]], claims: [LONG_CLAIM] },
].map((story, index) => ({
  id: `layout-${index}`,
  slug: `fixture-layout-${index}`,
  title: story.title,
  topics: story.topics,
  summary: story.claims[0] ?? "",
  claims: story.claims,
  status: "복수 출처 일치",
  sourceCount: 3,
  updatedAt: new Date(FIXED_NOW.getTime() - (index + 1) * 60_000),
  isDemo: false,
  image: null,
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
