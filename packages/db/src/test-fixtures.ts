import {
  type Article,
  type ArticleVersion,
  createArticleVersion,
  type Evidence,
  type Revision,
  type Source,
  type Story,
} from "@newsplatform/domain";

/**
 * DB 테스트가 공유하는 픽스처(#21 Task 6). `mappers.test.ts`의 개정판과
 * `publish.test.ts`의 발행 입력이 같은 값을 쓴다.
 */
const publishedAt = new Date("2026-09-17T00:30:00.000Z");
const revisionId = "demo-1-agreement:rev-1";

// excerpt(허용 발췌 창) 안에서 highlight(강조 구간)를 잡는다. spanText === excerpt의 highlight 부분이어야 한다.
// 근거 id는 `<revisionId>/<claimId>:<quoteId>`(#22 Ruling 22-2).
function evidence(
  quoteId: string,
  claimId: string,
  source: "meridian" | "harbor",
  excerpt: string,
  spanText: string,
  differsIn?: string,
): Evidence {
  const start = [...excerpt].findIndex(
    (_, i) => [...excerpt].slice(i, i + [...spanText].length).join("") === spanText,
  );
  return {
    id: `${revisionId}/${claimId}:${quoteId}`,
    claimId,
    articleId: `a-${source}`,
    articleVersionId: `av-${source}`,
    sourceId: `src-${source}`,
    span: { start: 100 + start, end: 100 + start + [...spanText].length },
    offsetUnit: "code-point" as const,
    normalizationVersion: 1,
    spanText,
    spanHash: "0".repeat(64),
    excerpt,
    excerptSpan: { start: 100, end: 100 + [...excerpt].length },
    highlightInExcerpt: { start, end: start + [...spanText].length },
    sourceUrl: `https://${source}.invalid/ports`,
    verifiedAt: publishedAt,
    ...(differsIn === undefined ? {} : { differsIn }),
  };
}

export const revision: Revision = {
  id: revisionId,
  storyId: "story-1",
  revisionNumber: 1,
  title: "가상 항만 협정에 세 나라가 서명했다",
  publishedAt,
  contradictionStatus: "복수 출처 일치",
  promptVersions: {
    evidenceExtract: "evidence-extract@1",
    claimGenerate: "claim-generate@1",
    contradictionLabel: "contradiction-label@1",
  },
  modelId: "recorded",
  claims: [
    {
      id: "demo-1-agreement:c-1",
      order: 1,
      text: "세 나라 장관들이 가상 항만 협정의 틀에 합의했다고 두 출처가 독립적으로 보도했다.",
      claimType: "보도된 사실",
      modality: "단정",
      contradictionStatus: "복수 출처 일치",
      evidence: [
        evidence(
          "q-m-1",
          "demo-1-agreement:c-1",
          "meridian",
          "Ministers agreed on the framework. The deal covers three ports.",
          "Ministers agreed on the framework.",
          "모두 중단",
        ),
        evidence(
          "q-h-1",
          "demo-1-agreement:c-1",
          "harbor",
          "The three governments signed the framework.",
          "signed the framework",
        ),
      ],
    },
    {
      id: "demo-1-agreement:c-2",
      order: 2,
      text: "후속 협상은 10월에 재개될 것이라고 두 출처가 관계자를 인용해 전망했다.",
      claimType: "전망",
      modality: "예상",
      contradictionStatus: "복수 출처 일치",
      evidence: [
        evidence(
          "q-m-2",
          "demo-1-agreement:c-2",
          "meridian",
          "Talks will resume in October.",
          "resume in October",
        ),
        evidence(
          "q-h-2",
          "demo-1-agreement:c-2",
          "harbor",
          "Officials expect a second round in October.",
          "second round in October",
        ),
      ],
    },
  ],
  // 출처 구획은 DB에서 읽을 때 기사 발행 시각·기사 식별자 순이다. 되읽은 값과 같도록 그 순서로 둔다.
  sources: [
    {
      sourceId: "src-atlas",
      articleId: "a-atlas",
      articleTitle: "Port deal reached",
      articleUrl: "https://atlas.invalid/ports",
      publishedAt,
      rightsTier: "링크만",
    },
    {
      sourceId: "src-harbor",
      articleId: "a-harbor",
      articleTitle: "Port framework signed",
      articleUrl: "https://harbor.invalid/ports",
      publishedAt,
      rightsTier: "본문 처리 + 발췌 표시",
    },
    {
      sourceId: "src-meridian",
      articleId: "a-meridian",
      articleTitle: "Three governments agree on port framework",
      articleUrl: "https://meridian.invalid/ports",
      publishedAt,
      rightsTier: "본문 처리 + 발췌 표시",
    },
  ],
};

const story: Story = {
  id: "story-1",
  slug: "demo-1-agreement",
  title: revision.title,
  topics: ["국제 정치·외교·안보"],
  isDemo: true,
  lifecycle: "종료",
};

function source(key: string, name: string, rightsTier: Source["rightsTier"]): Source {
  return {
    id: `src-${key}`,
    name: `${name} (가상 출처)`,
    rightsTier,
    region: "가상 지역",
    ownership: "민간 소유",
    language: "영어",
    isFictional: true,
  };
}

const sources: readonly Source[] = [
  source("meridian", "Meridian", "본문 처리 + 발췌 표시"),
  source("harbor", "Harbor", "본문 처리 + 발췌 표시"),
  source("atlas", "Atlas", "링크만"),
];

const articles: readonly Article[] = revision.sources.map((s) => ({
  id: s.articleId,
  sourceId: s.sourceId,
  storyId: story.id,
  url: s.articleUrl,
  title: s.articleTitle,
  publishedAt: s.publishedAt,
  topic: "국제 정치·외교·안보",
}));

/** 기사 본문 전체. 사건 페이지 질의 결과에 이 문장이 나오면 본문이 새어 나간 것이다. */
export const UNPUBLISHED_BODY_SENTENCE = "This sentence exists only in the stored article body.";

const articleVersions: readonly ArticleVersion[] = (["meridian", "harbor"] as const).map((key) =>
  createArticleVersion({
    id: `av-${key}`,
    articleId: `a-${key}`,
    rawBody: `${key} body. ${UNPUBLISHED_BODY_SENTENCE}`,
    capturedAt: publishedAt,
  }),
);

export const fixture = { story, revision, articles, articleVersions, sources };
