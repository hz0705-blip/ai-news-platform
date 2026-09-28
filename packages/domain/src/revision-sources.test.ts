import { describe, expect, it } from "vitest";
import type { Revision, RevisionSource } from "./revision.ts";
import { isSameRevisionContent } from "./revision-equality.ts";
import { revisionWithSources } from "./revision-sources.ts";

const publishedAt = new Date("2026-09-27T08:00:00.000Z");
const bbc: RevisionSource = {
  sourceId: "bbc.com",
  articleId: "a-1",
  articleTitle: "Iran waits",
  articleUrl: "https://bbc.com/1",
  publishedAt,
  rightsTier: "본문 처리 + 발췌 표시",
};
const previous: Revision = {
  id: "hormuz:rev-1",
  storyId: "story-hormuz",
  revisionNumber: 1,
  title: "제목",
  publishedAt,
  contradictionStatus: "단일 출처",
  promptVersions: {
    evidenceExtract: "evidence-extract@1",
    claimGenerate: "claim-generate@1",
    gate: "gate@1",
    contradictionLabel: "contradiction-label@1",
  },
  modelId: "recorded",
  claims: [
    {
      id: "hormuz:c-1",
      text: "주장",
      claimType: "보도된 사실",
      modality: "단정",
      order: 0,
      contradictionStatus: "단일 출처",
      evidence: [
        {
          id: "hormuz:rev-1/hormuz:c-1:q-1",
          claimId: "hormuz:c-1",
          articleId: "a-1",
          articleVersionId: "av-1",
          sourceId: "bbc.com",
          span: { start: 0, end: 5 },
          offsetUnit: "code-point",
          normalizationVersion: 1,
          spanText: "Iran waits",
          spanHash: "0".repeat(64),
          excerpt: "Iran waits.",
          excerptSpan: { start: 0, end: 11 },
          highlightInExcerpt: { start: 0, end: 5 },
          sourceUrl: "https://bbc.com/1",
          verifiedAt: publishedAt,
        },
      ],
    },
  ],
  sources: [bbc],
};

describe("revisionWithSources", () => {
  it("keeps claims and status, re-prefixes evidence ids, and swaps only the sources", () => {
    const linkOnly: RevisionSource = {
      sourceId: "gdelt:example.com",
      articleId: "a-2",
      articleTitle: "Iran waits (link)",
      articleUrl: "https://example.com/2",
      publishedAt: new Date("2026-09-27T09:00:00.000Z"),
      rightsTier: "링크만",
    };
    const later = new Date("2026-09-27T10:00:00.000Z");
    const next = revisionWithSources(previous, [bbc, linkOnly], {
      revisionNumber: 2,
      publishedAt: later,
    });
    expect(next).toMatchObject({
      id: "hormuz:rev-2",
      revisionNumber: 2,
      publishedAt: later,
      contradictionStatus: previous.contradictionStatus,
      promptVersions: previous.promptVersions,
      modelId: previous.modelId,
    });
    expect(next.sources).toEqual([bbc, linkOnly]);
    expect(next.claims[0]?.evidence[0]).toMatchObject({
      id: "hormuz:rev-2/hormuz:c-1:q-1",
      verifiedAt: publishedAt,
    });
    // 주장·근거 내용은 같고 출처 구획만 달라 "같은 개정판"이 아니다(개정판 생성 조건).
    expect(isSameRevisionContent(previous, next)).toBe(false);
    expect(isSameRevisionContent(previous, { ...next, sources: previous.sources })).toBe(true);
    expect(previous.claims[0]?.evidence[0]?.id).toBe("hormuz:rev-1/hormuz:c-1:q-1");
  });

  it("rejects a previous revision id that is not `<slug>:rev-<n>`", () => {
    expect(() =>
      revisionWithSources({ ...previous, id: "weird" }, [], { revisionNumber: 2, publishedAt }),
    ).toThrow("개정판 식별자 형식이 아니다");
  });
});
