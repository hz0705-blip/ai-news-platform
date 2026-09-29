import type { Claim, ContradictionStatus, Revision, RevisionSource } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import {
  type ContinuityArticleVersion,
  type ContinuityDraft,
  finalizeRevision,
  prepareContinuity,
} from "./continuity.ts";
import { type RevisionInput, runRevision } from "./stages/revision.ts";

const at = new Date("2026-09-29T00:00:00.000Z");
const story = { id: "story-s", slug: "s" };
const promptVersions = {
  evidenceExtract: "e@1",
  claimGenerate: "c@1",
  gate: "g@1",
  contradictionLabel: "l@1",
};

// 두 문장 본문. 두 번째 판은 앞에 머리말이 붙어 구간이 그대로 뒤로 밀린다.
const SENTENCE_A = "첫째 문장은 해협 봉쇄 제안이 나왔다는 보도다.";
const SENTENCE_B = "둘째 문장은 선박 운항이 줄었다는 해운사 발표다.";
const BODY_V1 = `${SENTENCE_A} ${SENTENCE_B}`;
const BODY_V2 = `머리말이 새로 붙었다. ${BODY_V1}`;
const SHIFT = [..."머리말이 새로 붙었다. "].length;
const A = { start: 0, end: [...SENTENCE_A].length };
const B = { start: A.end + 1, end: A.end + 1 + [...SENTENCE_B].length };
const shifted = (span: { start: number; end: number }) => ({
  start: span.start + SHIFT,
  end: span.end + SHIFT,
});

const source = (articleId: string): RevisionSource => ({
  sourceId: "src",
  articleId,
  articleTitle: articleId,
  articleUrl: `https://x.invalid/${articleId}`,
  publishedAt: at,
  rightsTier: "본문 처리 + 발췌 표시",
});

type Span = { start: number; end: number };

/** 상충 판정을 통과한 주장 하나(`runRevision` 입력). 근거는 모두 기사 `a-1`. */
const labeled = (
  id: string,
  status: ContradictionStatus,
  evidence: readonly { articleVersionId: string; span: Span }[],
  text = `${id} 문장`,
): RevisionInput["claims"][number] => ({
  id,
  claimKey: id.split(":")[1]?.split("@")[0] ?? id,
  text,
  claimType: "보도된 사실",
  modality: "단정",
  contradictionStatus: status,
  evidence: evidence.map((e, i) => ({
    quoteId: `q${i}`,
    articleId: "a-1",
    articleVersionId: e.articleVersionId,
    sourceId: "src",
    sourceUrl: "https://x.invalid/a-1",
    span: e.span,
    normalizationVersion: 1,
    spanText: "x",
    excerpt: "x",
    excerptSpan: e.span,
    highlightInExcerpt: { start: 0, end: e.span.end - e.span.start },
  })),
});

const revisionOf = (
  claims: RevisionInput["claims"],
  revisionNumber = 1,
  sources = [source("a-1")],
): Revision =>
  runRevision({
    story,
    revisionNumber,
    openEpisodes: 0,
    title: "제목",
    publishedAt: at,
    promptVersions,
    modelId: "recorded",
    claims,
    sources,
  });

const draft = (
  claimKey: string,
  evidence: readonly { articleVersionId: string; span: Span }[],
  text = `s:${claimKey} 문장`,
): ContinuityDraft => ({ claimKey, text, claimType: "보도된 사실", modality: "단정", evidence });

const version = (
  articleVersionId: string,
  body: string,
  extra: Partial<ContinuityArticleVersion> = {},
): ContinuityArticleVersion => ({ articleId: "a-1", articleVersionId, body, ...extra });

const finalize = (
  continuity: ReturnType<typeof prepareContinuity>,
  claims: RevisionInput["claims"],
) =>
  finalizeRevision({
    kind: "reprocessed",
    continuity,
    story,
    title: "제목",
    publishedAt: at,
    promptVersions,
    modelId: "recorded",
    claims,
    sources: [source("a-1")],
  });

describe("개정판 연속성 규칙(#85·#86·#90·#94)", () => {
  it("근거가 겹치는 새 주장은 식별자를 잇고, 마진이 부족하면 새 식별자와 계보를 받는다", () => {
    const latest = revisionOf([
      labeled("s:c-1", "단일 출처", [{ articleVersionId: "v1", span: A }]),
    ]);
    const input = { story, latest, articleVersions: [version("v1", BODY_V1)] };

    const continued = prepareContinuity({
      ...input,
      drafts: [draft("new", [{ articleVersionId: "v1", span: A }])],
    });
    expect(continued.claims).toEqual([
      { claimId: "s:c-1", previousStatus: "단일 출처", explicitCorrection: false },
    ]);

    // 같은 근거의 새 주장이 둘이면 누구도 잇지 못하고(마진 0) 둘 다 이전 주장을 계보로 둔다.
    const split = prepareContinuity({
      ...input,
      drafts: [
        draft("x", [{ articleVersionId: "v1", span: A }]),
        draft("y", [{ articleVersionId: "v1", span: A }]),
      ],
    });
    expect(split.claims.map((c) => c.claimId)).toEqual(["s:x@rev-2", "s:y@rev-2"]);
    const result = finalize(split, [
      labeled("s:x@rev-2", "단일 출처", [{ articleVersionId: "v1", span: A }]),
      labeled("s:y@rev-2", "단일 출처", [{ articleVersionId: "v1", span: A }]),
    ]);
    expect(result.kind === "revision" ? result.changes : []).toEqual([
      {
        kind: "주장 추가·삭제·수정",
        claimChange: "추가",
        claimId: "s:x@rev-2",
        currentText: "s:x@rev-2 문장",
        lineageClaimId: "s:c-1",
      },
      {
        kind: "주장 추가·삭제·수정",
        claimChange: "추가",
        claimId: "s:y@rev-2",
        currentText: "s:y@rev-2 문장",
        lineageClaimId: "s:c-1",
      },
      {
        kind: "주장 추가·삭제·수정",
        claimChange: "삭제",
        claimId: "s:c-1",
        previousText: "s:c-1 문장",
      },
    ]);
  });

  it("마지막 개정판에 없는 열린 에피소드의 주장은 다시 나오면 식별자와 보도 상충을 잇고, 빠지면 사건을 보도 상충으로 둔다", () => {
    const latest = revisionOf([
      labeled("s:c-1", "단일 출처", [{ articleVersionId: "v1", span: A }]),
    ]);
    const episode = revisionOf([
      labeled("s:c-2", "보도 상충", [{ articleVersionId: "v1", span: B }]),
    ]).claims[0] as Claim;
    const input = {
      story,
      latest,
      openEpisodeClaims: [episode],
      articleVersions: [version("v1", BODY_V1)],
    };

    const back = prepareContinuity({
      ...input,
      drafts: [
        draft("c-1", [{ articleVersionId: "v1", span: A }]),
        draft("z", [{ articleVersionId: "v1", span: B }]),
      ],
    });
    expect(back.claims[1]).toEqual({
      claimId: "s:c-2",
      previousStatus: "보도 상충",
      explicitCorrection: false,
    });

    const absent = prepareContinuity({
      ...input,
      drafts: [draft("c-1", [{ articleVersionId: "v1", span: A }])],
    });
    const result = finalize(absent, [
      labeled("s:c-1", "단일 출처", [{ articleVersionId: "v1", span: A }]),
    ]);
    expect(result.kind === "revision" ? result.revision.contradictionStatus : undefined).toBe(
      "보도 상충",
    );
  });

  it("정정 후보 버전의 첫 재처리에서 그 버전의 근거가 바뀐 이어진 주장만 명시 정정 입력을 받는다", () => {
    const latest = revisionOf([
      labeled("s:c-1", "보도 상충", [{ articleVersionId: "v1", span: B }]),
    ]);
    // 정정 후보 둘째 판에서 첫 문장이 고쳐졌다. 둘째 문장 근거는 그대로 옮겨지고, 이어진 주장의 양상이 바뀌었다(실질 변경).
    const corrected = `${SENTENCE_A.replace("나왔다는", "없었다는")} ${SENTENCE_B}`;
    const prepare = (extra: Partial<ContinuityArticleVersion>) =>
      prepareContinuity({
        story,
        latest,
        previousVersionBodies: [{ articleVersionId: "v1", body: BODY_V1 }],
        articleVersions: [version("v2", corrected, extra)],
        drafts: [{ ...draft("c-1", [{ articleVersionId: "v2", span: B }]), modality: "의혹" }],
      });

    const first = prepare({ correctionCandidate: true, correctionFirstReprocess: true });
    expect(first.spanRealignment).toEqual({ attempted: 1, aligned: 1 });
    expect(first.claims[0]).toEqual({
      claimId: "s:c-1",
      previousStatus: "보도 상충",
      explicitCorrection: true,
    });
    expect(prepare({ correctionCandidate: true }).claims[0]?.explicitCorrection).toBe(false);
    // 정정 후보 버전은 원문 변경으로 세지 않는다.
    expect(first.changedArticleVersions).toEqual([]);
  });

  it("새 기사 버전으로 근거가 그대로 옮겨진 주장은 식별자와 상태를 유지하고 변화는 원문 변경뿐이다", () => {
    const latest = revisionOf([
      labeled("s:c-1", "보도 상충", [{ articleVersionId: "v1", span: B }]),
    ]);
    const continuity = prepareContinuity({
      story,
      latest,
      previousVersionBodies: [{ articleVersionId: "v1", body: BODY_V1 }],
      articleVersions: [version("v2", BODY_V2)],
      drafts: [draft("c-1", [{ articleVersionId: "v2", span: shifted(B) }])],
    });
    expect(continuity.spanRealignment).toEqual({ attempted: 1, aligned: 1 });
    expect(continuity.claims[0]).toEqual({
      claimId: "s:c-1",
      previousStatus: "보도 상충",
      explicitCorrection: false,
    });
    const result = finalize(continuity, [
      labeled("s:c-1", "보도 상충", [{ articleVersionId: "v2", span: shifted(B) }]),
    ]);
    expect(result.kind === "revision" ? result.changes : []).toEqual([
      { kind: "원문 변경", articleId: "a-1", articleVersionId: "v2" },
    ]);
  });

  it("주장 순서만 다른 재처리는 변화 0건이라 개정판 대신 확인만 한다", () => {
    const one = labeled("s:c-1", "단일 출처", [{ articleVersionId: "v1", span: A }]);
    const two = labeled("s:c-2", "단일 출처", [{ articleVersionId: "v1", span: B }]);
    const latest = revisionOf([one, two]);
    const continuity = prepareContinuity({
      story,
      latest,
      articleVersions: [version("v1", BODY_V1)],
      drafts: [
        draft("c-2", [{ articleVersionId: "v1", span: B }]),
        draft("c-1", [{ articleVersionId: "v1", span: A }]),
      ],
    });
    expect(finalize(continuity, [two, one])).toEqual({ kind: "confirmed", revisionId: "s:rev-1" });
  });

  it("링크만 기사만 붙으면 주장을 그대로 둔 출처 추가 개정판, 이미 있는 기사면 확인이다", () => {
    const latest = revisionOf([
      labeled("s:c-1", "단일 출처", [{ articleVersionId: "v1", span: A }]),
    ]);
    const added = finalizeRevision({
      kind: "sources-added",
      latest,
      sources: [source("a-1"), source("a-link")],
      publishedAt: at,
    });
    expect(added.kind).toBe("revision");
    if (added.kind !== "revision") return;
    expect(added.changes).toEqual([{ kind: "출처 추가", articleId: "a-link" }]);
    expect(added.revision.id).toBe("s:rev-2");
    expect(added.revision.claims.map((c) => [c.id, c.contradictionStatus])).toEqual([
      ["s:c-1", "단일 출처"],
    ]);

    expect(
      finalizeRevision({
        kind: "sources-added",
        latest,
        sources: [source("a-1")],
        publishedAt: at,
      }),
    ).toEqual({ kind: "confirmed", revisionId: "s:rev-1" });
  });
});
