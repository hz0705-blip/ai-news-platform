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
  articleId: `a-${id}`,
  name,
  isFictional: true,
  rightsTier,
  region: "가상",
  ownership: "가상",
  language: "en",
  articleTitle: `${name} article`,
  articleUrl,
  publishedAt: t("2026-09-16T22:00:00.000Z"),
  isLinkOnly: false,
  observedAt: null,
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
  coverageArticles: [
    { publishedAt: t("2026-09-16T22:00:00.000Z"), isLinkOnly: false, observedAt: null },
  ],
  changes: [],
  revisions: [
    {
      id: "rev-state",
      revisionNumber: 1,
      publishedAt: t("2026-09-17T00:30:00.000Z"),
      changeCounts: {
        "주장 추가·삭제·수정": 0,
        "상충 상태 변화": 0,
        "원문 변경": 0,
        "출처 추가": 0,
      },
    },
  ],
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

/**
 * GNews(본문 처리) 기사 하나와 GDELT 링크만 기사 둘(출처 표 등록 이름 하나, 미등록 도메인 하나)이 붙은 사건(#78).
 * 출처 구획이 두 등급을 다르게 보이는지 검사한다.
 */
export const linkOnlyFixture: StoryPageData = {
  ...stateFixture,
  story: { ...stateFixture.story, id: "story-link-only", slug: "link-only-sources" },
  claims: [stateFixture.claims[0] as StoryPageData["claims"][number]],
  sources: [
    source(
      "src-meridian",
      "Meridian Wire",
      "본문 처리 + 발췌 표시",
      "https://meridianwire.example/berth",
    ),
    source("src-tidewater", "Tidewater Gazette", "링크만", LONG_URL),
    {
      ...source(
        "gdelt:harbor-ledger.example",
        "harbor-ledger.example",
        "링크만",
        "https://harbor-ledger.example/berth",
      ),
      isFictional: false,
      region: "미확인",
      ownership: "unknown",
      articleTitle: "Harbor ledger berth report",
      publishedAt: t("2026-09-17T01:15:00.000Z"),
      isLinkOnly: true,
      observedAt: t("2026-09-17T01:15:00.000Z"),
    },
  ],
};

const noChanges = { "주장 추가·삭제·수정": 0, "상충 상태 변화": 0, "원문 변경": 0, "출처 추가": 0 };
const MULTI_SLUG = "multi-revision-changes";
/** 개정판 식별자에는 `:`가 들어간다(고정 URL 인코딩 검사). */
export const MULTI_REV_1 = `${MULTI_SLUG}:rev-1`;
export const MULTI_REV_2 = `${MULTI_SLUG}:rev-2`;
const MULTI_REV_1_AT = t("2026-09-17T00:30:00.000Z");
const MULTI_REV_2_AT = t("2026-09-18T00:30:00.000Z");
const multiEvidence = (sourceId: string, url: string) => ({
  sourceId,
  articleTitle: "Berth review",
  publishedAt: t("2026-09-16T22:00:00.000Z"),
  sourceUrl: url,
  excerpt: "The port authority began a berth review on Tuesday.",
  highlightInExcerpt: { start: 19, end: 39 },
});
export const MULTI_PREVIOUS_TEXT =
  "가상 항만청이 선석 배정을 이번 주까지 중단했다고 한 출처가 보도했다.";
export const MULTI_CURRENT_TEXT =
  "가상 항만청이 선석 배정을 다음 주까지 중단했다고 두 출처가 보도했다.";

const multiSources: StoryPageData["sources"] = [
  source(
    "src-meridian",
    "Meridian Wire",
    "본문 처리 + 발췌 표시",
    "https://meridianwire.example/berth",
  ),
  {
    ...source(
      "src-tidewater",
      "Tidewater Gazette",
      "본문 처리 + 발췌 표시",
      "https://tidewater.example/berth",
    ),
    publishedAt: t("2026-09-16T23:00:00.000Z"),
  },
  {
    ...source(
      "src-harbor",
      "Harbor Ledger",
      "본문 처리 + 발췌 표시",
      "https://harborledger.example/berth",
    ),
    publishedAt: t("2026-09-17T20:00:00.000Z"),
  },
  {
    ...source(
      "gdelt:quay-news.example",
      "quay-news.example",
      "링크만",
      "https://quay-news.example/berth",
    ),
    isFictional: false,
    region: "미확인",
    ownership: "unknown",
    publishedAt: t("2026-09-17T21:15:00.000Z"),
    isLinkOnly: true,
    observedAt: t("2026-09-17T21:15:00.000Z"),
  },
];
/** 출처 행에서 보도량 추이가 세는 기사 시각만 고른다(픽스처는 출처 집합 = 출처 구획). */
const coverageOf = (rows: StoryPageData["sources"]): StoryPageData["coverageArticles"] =>
  rows.map((r) => ({
    publishedAt: r.publishedAt,
    isLinkOnly: r.isLinkOnly,
    observedAt: r.observedAt,
  }));

/**
 * 개정판 2개인 사건의 두 번째 개정판(#87). 변화 종류 넷이 모두 있고, 출처 넷 중 하나는 링크만 기사(관측 시각)다.
 * 보도량: 첫 기사 2026-09-17 07:00 KST ~ 개정판 발행 09-18 09:30 KST(72시간 이하 → 6시간 구간 5개, 가운데 둘은 0).
 */
export const multiRevisionFixture: StoryPageData = {
  story: {
    id: "story-multi",
    slug: MULTI_SLUG,
    title: "선석 배정 중단 기간이 바뀐 데모 사건",
    topics: ["국제 정치·외교·안보"],
    isDemo: true,
  },
  revision: {
    id: MULTI_REV_2,
    revisionNumber: 2,
    title: "선석 배정 중단 기간이 바뀐 데모 사건",
    publishedAt: MULTI_REV_2_AT,
    checkedAt: MULTI_REV_2_AT,
    contradictionStatus: "상충 해소",
  },
  claims: [
    {
      id: "multi:c-1",
      order: 0,
      text: MULTI_CURRENT_TEXT,
      contradictionStatus: "상충 해소",
      evidence: [multiEvidence("src-meridian", "https://meridianwire.example/berth")],
    },
    {
      id: "multi:c-3",
      order: 1,
      text: "가상 항만청은 재개 일정을 따로 알리겠다고 밝혔다.",
      contradictionStatus: "단일 출처",
      evidence: [multiEvidence("src-meridian", "https://meridianwire.example/berth")],
    },
  ],
  sources: multiSources,
  coverageArticles: coverageOf(multiSources),
  changes: [
    {
      kind: "주장 추가·삭제·수정",
      claimChange: "수정",
      claimId: "multi:c-1",
      previousText: MULTI_PREVIOUS_TEXT,
      currentText: MULTI_CURRENT_TEXT,
    },
    {
      kind: "주장 추가·삭제·수정",
      claimChange: "추가",
      claimId: "multi:c-3",
      currentText: "가상 항만청은 재개 일정을 따로 알리겠다고 밝혔다.",
    },
    {
      kind: "주장 추가·삭제·수정",
      claimChange: "삭제",
      claimId: "multi:c-2",
      previousText: "선석 배정 중단 이유는 알려지지 않았다.",
    },
    {
      kind: "상충 상태 변화",
      claimId: "multi:c-1",
      previousStatus: "보도 상충",
      currentStatus: "상충 해소",
    },
    { kind: "상충 상태 변화", previousStatus: "보도 상충", currentStatus: "상충 해소" },
    { kind: "원문 변경", articleId: "a-src-tidewater", articleVersionId: "av-tidewater-2" },
    { kind: "출처 추가", articleId: "a-src-harbor" },
    { kind: "출처 추가", articleId: "a-gdelt:quay-news.example" },
  ],
  revisions: [
    { id: MULTI_REV_1, revisionNumber: 1, publishedAt: MULTI_REV_1_AT, changeCounts: noChanges },
    {
      id: MULTI_REV_2,
      revisionNumber: 2,
      publishedAt: MULTI_REV_2_AT,
      changeCounts: {
        "주장 추가·삭제·수정": 3,
        "상충 상태 변화": 2,
        "원문 변경": 1,
        "출처 추가": 2,
      },
    },
  ],
};

/** 같은 사건의 첫 개정판(개정판 고정 URL로 이동한 뒤의 화면). 변화가 없고 띠에는 자기 자신만 있다. */
export const multiRevisionFirstFixture: StoryPageData = {
  ...multiRevisionFixture,
  revision: {
    ...multiRevisionFixture.revision,
    id: MULTI_REV_1,
    revisionNumber: 1,
    publishedAt: MULTI_REV_1_AT,
    checkedAt: MULTI_REV_1_AT,
    contradictionStatus: "보도 상충",
  },
  claims: [
    {
      id: "multi:c-1",
      order: 0,
      text: MULTI_PREVIOUS_TEXT,
      contradictionStatus: "보도 상충",
      evidence: [multiEvidence("src-meridian", "https://meridianwire.example/berth")],
    },
    {
      id: "multi:c-2",
      order: 1,
      text: "선석 배정 중단 이유는 알려지지 않았다.",
      contradictionStatus: "단일 출처",
      evidence: [multiEvidence("src-meridian", "https://meridianwire.example/berth")],
    },
  ],
  sources: multiSources.slice(0, 2),
  coverageArticles: coverageOf(multiSources.slice(0, 2)),
  changes: [],
  revisions: [multiRevisionFixture.revisions[0] as StoryPageData["revisions"][number]],
};
