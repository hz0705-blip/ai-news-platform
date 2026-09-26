import type { StoryPageData } from "@newsplatform/db";

/** 링크만 등급으로 하향된 출처의 근거에 남아 있는 구간 텍스트. 화면·페이로드 어디에도 나오면 안 된다. */
export const HIDDEN_SPAN = "The berth allocation was suspended pending review.";
export const LONG_URL = `https://tidewater-gazette.example/${"section/subsection-".repeat(6)}article-2026-09-16-berth-allocation-review?utm=verylongquerystring${"x".repeat(60)}`;
export const LONG_MIXED = `가상항만청Tidewater관계자에따르면berthallocation검토절차는${"한글English혼합".repeat(8)}2026-09-16T23:00:00Z기준으로계속된다`;

const t = (iso: string) => new Date(iso);
const source = (
  id: string,
  name: string,
  rightsTier: StoryPageData["sources"][number]["rightsTier"],
  articleUrl: string,
) => ({
  id,
  name,
  isFictional: true,
  rightsTier,
  region: "가상",
  ownership: "가상",
  language: "en",
  articleTitle: `${name} article`,
  articleUrl,
  publishedAt: t("2026-09-16T22:00:00.000Z"),
});

// highlightInExcerpt는 excerpt 안의 코드 포인트 반개구간이다([...excerpt]로 확인한 값).
export const stateFixture: StoryPageData = {
  story: {
    id: "story-state",
    slug: "state-excerpt-unavailable",
    title: "근거 발췌 불가 상태 검사용 데모 사건",
    topics: ["국제 정치·외교·안보"],
    isDemo: true,
  },
  revision: {
    id: "rev-state",
    revisionNumber: 1,
    title: "근거 발췌 불가 상태 검사용 데모 사건",
    publishedAt: t("2026-09-17T00:30:00.000Z"),
    checkedAt: t("2026-09-17T00:30:00.000Z"),
    contradictionStatus: "보도 상충",
  },
  claims: [
    {
      id: "claim-state-1",
      order: 0,
      text: "가상 항만청이 선석 배정을 검토 중이라고 두 출처가 보도했다.",
      contradictionStatus: "복수 출처 일치",
      evidence: [
        {
          sourceId: "src-meridian",
          articleTitle: "Berth review begins",
          publishedAt: t("2026-09-16T22:00:00.000Z"),
          sourceUrl: "https://meridianwire.example/berth",
          excerpt: "The port authority began a berth review on Tuesday.",
          // "began a berth review"
          highlightInExcerpt: { start: 19, end: 39 },
        },
        {
          sourceId: "src-tidewater",
          articleTitle: "Berth allocation suspended",
          publishedAt: t("2026-09-16T23:00:00.000Z"),
          sourceUrl: LONG_URL,
          excerpt: HIDDEN_SPAN,
          // "berth allocation"
          highlightInExcerpt: { start: 4, end: 20 },
        },
      ],
    },
    {
      id: "claim-state-2",
      order: 1,
      // 긴 URL을 보이는 텍스트에 넣어 overflow-wrap을 시험한다(href만으로는 시험되지 않는다).
      text: `${LONG_MIXED} ${LONG_URL}`,
      contradictionStatus: "보도 상충",
      evidence: [
        {
          sourceId: "src-meridian",
          articleTitle: "Review continues",
          publishedAt: t("2026-09-16T22:30:00.000Z"),
          sourceUrl: "https://meridianwire.example/review",
          excerpt: "The review continues this week.",
          // "review continues"
          highlightInExcerpt: { start: 4, end: 20 },
          differsIn: "검토가 계속된다고 보도",
        },
        {
          sourceId: "src-tidewater",
          articleTitle: "Review halted",
          publishedAt: t("2026-09-16T23:30:00.000Z"),
          sourceUrl: LONG_URL,
          excerpt: HIDDEN_SPAN,
          // "berth allocation"
          highlightInExcerpt: { start: 4, end: 20 },
          differsIn: "검토가 중단됐다고 보도",
        },
      ],
    },
  ],
  sources: [
    source(
      "src-meridian",
      "Meridian Wire",
      "본문 처리 + 발췌 표시",
      "https://meridianwire.example/berth",
    ),
    source("src-tidewater", "Tidewater Gazette", "링크만", LONG_URL),
  ],
};
