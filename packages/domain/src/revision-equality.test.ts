import { describe, expect, it } from "vitest";
import type { Claim } from "./claim.ts";
import type { Revision } from "./revision.ts";
import { isSameRevisionContent } from "./revision-equality.ts";

const at = new Date("2026-09-17T00:30:00.000Z");
const evidence = (id: string, articleVersionId: string, start: number, differsIn?: string) => ({
  id,
  claimId: "s:c-1",
  articleId: `article-${articleVersionId}`,
  articleVersionId,
  sourceId: `source-${articleVersionId}`,
  span: { start, end: start + 10 },
  offsetUnit: "code-point" as const,
  normalizationVersion: 1,
  spanText: "x",
  spanHash: "h",
  excerpt: "x",
  excerptSpan: { start, end: start + 10 },
  highlightInExcerpt: { start: 0, end: 10 },
  sourceUrl: `https://${articleVersionId}.example/`,
  verifiedAt: at,
  ...(differsIn === undefined ? {} : { differsIn }),
});

/** `span`을 명시적으로 지정하는 근거 — 구분자 충돌 회귀 테스트 전용. */
const evidenceWithSpan = (
  articleVersionId: string,
  start: number,
  end: number,
  differsIn?: string,
) => ({
  ...evidence(`x-${articleVersionId}-${start}`, articleVersionId, start, differsIn),
  span: { start, end },
});

const evidenceA = evidence("s:rev-1/s:c-1:q-a", "av-a", 0);
const evidenceB = evidence("s:rev-1/s:c-1:q-b", "av-b", 5);

const claim0: Claim = {
  id: "s:c-1",
  text: "주장 하나",
  claimType: "보도된 사실",
  modality: "단정",
  order: 0,
  contradictionStatus: "복수 출처 일치",
  evidence: [evidenceA, evidenceB],
};

const base: Revision = {
  id: "s:rev-1",
  storyId: "story-s",
  revisionNumber: 1,
  title: "제목",
  publishedAt: at,
  contradictionStatus: "복수 출처 일치",
  promptVersions: { evidenceExtract: "e@1", claimGenerate: "c@1", contradictionLabel: "l@1" },
  modelId: "recorded",
  claims: [claim0],
  sources: [
    {
      sourceId: "source-av-a",
      articleId: "article-av-a",
      articleTitle: "A",
      articleUrl: "https://a/",
      publishedAt: at,
      rightsTier: "본문 처리 + 발췌 표시",
    },
    {
      sourceId: "source-av-b",
      articleId: "article-av-b",
      articleTitle: "B",
      articleUrl: "https://b/",
      publishedAt: at,
      rightsTier: "본문 처리 + 발췌 표시",
    },
  ],
};

const withClaims = (claims: Revision["claims"]): Revision => ({ ...base, claims });

describe("isSameRevisionContent (스펙 134행: 출처·주장·상태 모두 동일)", () => {
  it("같은 내용이면 true — id·개정판 번호·발행 시각·제목이 달라도", () => {
    const next: Revision = {
      ...base,
      id: "s:rev-2",
      revisionNumber: 2,
      title: "다른 제목",
      publishedAt: new Date("2026-09-18T00:30:00.000Z"),
      claims: [
        {
          ...claim0,
          id: "s:c-1",
          evidence: claim0.evidence.map((e) => ({
            ...e,
            id: e.id.replace("rev-1", "rev-2"),
            verifiedAt: new Date(0),
          })),
        },
      ],
    };
    expect(isSameRevisionContent(base, next)).toBe(true);
  });
  it("출처 순서만 달라도 true", () => {
    expect(isSameRevisionContent(base, { ...base, sources: [...base.sources].reverse() })).toBe(
      true,
    );
  });
  it("근거 순서만 달라도 true", () => {
    expect(
      isSameRevisionContent(
        base,
        withClaims([{ ...claim0, evidence: [...claim0.evidence].reverse() }]),
      ),
    ).toBe(true);
  });
  it("출처가 추가되면 false", () => {
    expect(
      isSameRevisionContent(base, {
        ...base,
        sources: [
          ...base.sources,
          {
            sourceId: "source-c",
            articleId: "article-c",
            articleTitle: "C",
            articleUrl: "https://c/",
            publishedAt: at,
            rightsTier: "링크만",
          },
        ],
      }),
    ).toBe(false);
  });
  it("주장 문장이 바뀌면 false", () => {
    expect(isSameRevisionContent(base, withClaims([{ ...claim0, text: "주장 둘" }]))).toBe(false);
  });
  it("주장 상태가 바뀌면 false", () => {
    expect(
      isSameRevisionContent(base, withClaims([{ ...claim0, contradictionStatus: "보도 상충" }])),
    ).toBe(false);
  });
  it("사건 상태가 바뀌면 false", () => {
    expect(isSameRevisionContent(base, { ...base, contradictionStatus: "단일 출처" })).toBe(false);
  });
  it("근거 구간이 바뀌면 false", () => {
    expect(
      isSameRevisionContent(
        base,
        withClaims([{ ...claim0, evidence: [evidenceA, evidence("x", "av-b", 6)] }]),
      ),
    ).toBe(false);
  });
  it("다른 점 문장이 바뀌면 false", () => {
    const a = withClaims([
      { ...claim0, evidence: [evidence("x", "av-a", 0, "모두 중단"), evidenceB] },
    ]);
    const b = withClaims([
      { ...claim0, evidence: [evidence("x", "av-a", 0, "일부 중단"), evidenceB] },
    ]);
    expect(isSameRevisionContent(a, b)).toBe(false);
  });
  it("주장 수가 다르면 false", () => {
    expect(isSameRevisionContent(base, withClaims([]))).toBe(false);
  });
  it("근거의 differsIn에 구분자 문자가 섞여도 근거 개수가 다르면 false (구분자 충돌 방지)", () => {
    const merged = withClaims([
      { ...claim0, evidence: [evidenceWithSpan("a", 0, 1, "X;b|2|3|Y")] },
    ]);
    const split = withClaims([
      { ...claim0, evidence: [evidenceWithSpan("a", 0, 1, "X"), evidenceWithSpan("b", 2, 3, "Y")] },
    ]);
    expect(isSameRevisionContent(merged, split)).toBe(false);
  });
});
