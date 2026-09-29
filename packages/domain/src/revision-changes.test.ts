import { describe, expect, it } from "vitest";
import type { Claim } from "./claim.ts";
import type { Evidence } from "./evidence.ts";
import type { Revision, RevisionSource } from "./revision.ts";
import { computeChanges } from "./revision-changes.ts";

const at = new Date("2026-09-29T00:00:00.000Z");

const evidence = (claimId: string, articleVersionId: string, start: number): Evidence => ({
  id: `${claimId}:${articleVersionId}:${start}`,
  claimId,
  articleId: `a-${articleVersionId.split("@")[0]}`,
  articleVersionId,
  sourceId: "src",
  span: { start, end: start + 30 },
  offsetUnit: "code-point",
  normalizationVersion: 1,
  spanText: "x",
  spanHash: "h",
  excerpt: "x",
  excerptSpan: { start, end: start + 30 },
  highlightInExcerpt: { start: 0, end: 30 },
  sourceUrl: "https://x.invalid/",
  verifiedAt: at,
});

const claim = (id: string, order: number, overrides: Partial<Claim> = {}): Claim => ({
  id,
  text: `${id} 문장`,
  claimType: "보도된 사실",
  modality: "단정",
  order,
  contradictionStatus: "단일 출처",
  evidence: [evidence(id, "1@v1", order * 100)],
  ...overrides,
});

const source = (articleId: string): RevisionSource => ({
  sourceId: "src",
  articleId,
  articleTitle: articleId,
  articleUrl: `https://x.invalid/${articleId}`,
  publishedAt: at,
  rightsTier: "본문 처리 + 발췌 표시",
});

const revision = (claims: readonly Claim[], overrides: Partial<Revision> = {}): Revision => ({
  id: "s:rev-1",
  storyId: "story-s",
  revisionNumber: 1,
  title: "제목",
  publishedAt: at,
  contradictionStatus: "단일 출처",
  promptVersions: {
    evidenceExtract: "e@1",
    claimGenerate: "c@1",
    gate: "g@1",
    contradictionLabel: "l@1",
  },
  modelId: "recorded",
  claims,
  sources: [source("a-1")],
  ...overrides,
});

describe("computeChanges (스펙 변화, #85)", () => {
  it("첫 개정판은 변화가 없다", () => {
    expect(computeChanges(undefined, revision([claim("s:c-1", 0)]))).toEqual([]);
  });

  it("같은 내용과 표현만 변경은 변화가 아니다", () => {
    const previous = revision([claim("s:c-1", 0)]);
    const next = revision([claim("s:c-1", 0, { text: "다르게 쓴 문장" })], { id: "s:rev-2" });
    expect(computeChanges(previous, next)).toEqual([]);
  });

  it("computeChanges emits four kinds", () => {
    const c3evidence = evidence("s:c-3", "1@v1", 200);
    const previous = revision([
      claim("s:c-1", 0),
      claim("s:c-2", 1),
      claim("s:c-3", 2, { contradictionStatus: "보도 상충", evidence: [c3evidence] }),
    ]);
    const next = revision(
      [
        // 근거가 바뀐 실질 변경
        claim("s:c-1", 0, { text: "바뀐 문장", evidence: [evidence("s:c-1", "1@v1", 500)] }),
        // 상태만 바뀜
        claim("s:c-3", 1, { contradictionStatus: "상충 해소", evidence: [c3evidence] }),
        // 새 주장(계보 있음)
        claim("s:c-9@rev-2", 2, { evidence: [evidence("s:c-9@rev-2", "2@v2", 0)] }),
      ],
      {
        id: "s:rev-2",
        contradictionStatus: "상충 해소",
        sources: [source("a-1"), source("a-2")],
      },
    );
    const changes = computeChanges(previous, next, {
      lineage: new Map([["s:c-9@rev-2", "s:c-2"]]),
      articleVersions: [
        { articleId: "a-1", articleVersionId: "1@v2" },
        { articleId: "a-2", articleVersionId: "2@v2" },
      ],
    });
    expect(changes).toEqual([
      {
        kind: "주장 추가·삭제·수정",
        claimChange: "수정",
        claimId: "s:c-1",
        previousText: "s:c-1 문장",
        currentText: "바뀐 문장",
      },
      {
        kind: "주장 추가·삭제·수정",
        claimChange: "추가",
        claimId: "s:c-9@rev-2",
        currentText: "s:c-9@rev-2 문장",
        lineageClaimId: "s:c-2",
      },
      {
        kind: "주장 추가·삭제·수정",
        claimChange: "삭제",
        claimId: "s:c-2",
        previousText: "s:c-2 문장",
      },
      {
        kind: "상충 상태 변화",
        claimId: "s:c-3",
        previousStatus: "보도 상충",
        currentStatus: "상충 해소",
      },
      { kind: "상충 상태 변화", previousStatus: "단일 출처", currentStatus: "상충 해소" },
      { kind: "원문 변경", articleId: "a-1", articleVersionId: "1@v2" },
      { kind: "출처 추가", articleId: "a-2" },
    ]);
  });
});
