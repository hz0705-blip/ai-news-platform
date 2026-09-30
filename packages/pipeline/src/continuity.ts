import {
  type Claim,
  type CodePointSpan,
  type ContradictionStatus,
  classifyMatch,
  computeChanges,
  createSpanAligner,
  isSameRevisionContent,
  matchClaims,
  openEpisodeClaims,
  type Revision,
  type RevisionChange,
  type RevisionSource,
  revisionWithSources,
  type SpanRealignResult,
} from "@newstrail/domain";
import { type RevisionInput, runRevision } from "./stages/revision.ts";

/**
 * 개정판 연속성 규칙(ADR-0003, 스펙 "개정판 생성 조건"·"주장 매칭", #85·#86·#90·#94). 모델을 부르지 않는다.
 * 재처리는 상충 판정 앞에서 `prepareContinuity`로 주장 식별자·이전 상태·명시 정정 입력을 정하고, 판정 뒤
 * `finalizeRevision`으로 개정판과 변화를 만든다(또는 확인만). 링크만 기사의 출처 추가도 `finalizeRevision`을 거친다.
 */

/** 이번 재처리가 본 기사 버전 하나(본문 있는 기사와 링크만 기사 모두). */
export interface ContinuityArticleVersion {
  readonly articleId: string;
  readonly articleVersionId: string;
  readonly body: string;
  /** 재수집에서 정정 표지가 새로 생긴 정정 후보 버전(#86). 원문 변경으로 세지 않는다. */
  readonly correctionCandidate?: boolean | undefined;
  /** 정정 후보 버전의 첫 재처리(#94). 정정 후보와 함께 참이면 명시 정정 입력을 판별한다. */
  readonly correctionFirstReprocess?: boolean | undefined;
}

/** 게이트를 통과한 주장 초안 하나(근거 포함). */
export interface ContinuityDraft {
  readonly claimKey: string;
  readonly text: string;
  readonly claimType: Claim["claimType"];
  readonly modality: Claim["modality"];
  readonly evidence: readonly {
    readonly articleVersionId: string;
    readonly span: CodePointSpan;
  }[];
}

export interface PrepareContinuityInput {
  readonly story: { readonly slug: string };
  /** 마지막 발행 개정판. */
  readonly latest: Revision | undefined;
  /** 마지막 개정판에 없지만 아직 열린 상충 에피소드의 주장(#90). */
  readonly openEpisodeClaims?: readonly Claim[] | undefined;
  /** 이전 근거가 가리키는, 지금 입력과 다른 기사 버전의 본문(#86). */
  readonly previousVersionBodies?:
    | readonly { readonly articleVersionId: string; readonly body: string }[]
    | undefined;
  readonly articleVersions: readonly ContinuityArticleVersion[];
  /** 표시 순서대로. */
  readonly drafts: readonly ContinuityDraft[];
}

/** 초안 하나의 연속성 결정. 상충 판정이 받는다. */
export interface PreparedClaim {
  /** 이어받은 이전 식별자 또는 새 식별자(`claimId`). */
  readonly claimId: string;
  /** 같은 식별자의 이전 주장 상태(마지막 개정판 또는 열린 에피소드). */
  readonly previousStatus?: ContradictionStatus;
  /** 명시 정정 입력(상태 규칙 ③, #94). */
  readonly explicitCorrection: boolean;
}

/** `prepareContinuity`의 결과. `finalizeRevision`이 그대로 받는다. */
export interface Continuity {
  readonly latest: Revision | undefined;
  readonly revisionNumber: number;
  /** `drafts`와 같은 순서. */
  readonly claims: readonly PreparedClaim[];
  /** 이전 근거 좌표 정렬의 시도·성공 수(#86). */
  readonly spanRealignment: { readonly attempted: number; readonly aligned: number };
  /** 새 식별자를 받은 주장 → 계보 이전 주장. */
  readonly lineage: ReadonlyMap<string, string>;
  /** 새 기사 버전 좌표로 옮긴 마지막 개정판 주장. */
  readonly alignedPrevious: readonly Claim[];
  /** 마지막 개정판 밖의 열린 상충 에피소드 주장(좌표 정렬 뒤). */
  readonly openEpisodeClaims: readonly Claim[];
  /** 원문 변경을 셀 기사 버전(정정 후보 제외). */
  readonly changedArticleVersions: readonly {
    readonly articleId: string;
    readonly articleVersionId: string;
  }[];
}

/**
 * 새 주장 식별자(Ruling 22-2, #85). 첫 개정판은 `<slug>:<claimKey>`, 그 뒤 개정판에서 이전 주장과 매칭되지 않은
 * 주장은 `<slug>:<claimKey>@rev-<번호>` — 매칭된 주장이 이어받은 식별자·삭제된 주장의 식별자와 겹치지 않는다.
 */
export function claimId(slug: string, claimKey: string, revisionNumber = 1): string {
  return revisionNumber === 1 ? `${slug}:${claimKey}` : `${slug}:${claimKey}@rev-${revisionNumber}`;
}

/**
 * 상충 판정 앞의 연속성 규칙.
 * 1. 좌표 정렬(#86): 이전 근거 중 기사 버전이 바뀐 것을 새 버전 좌표로 옮긴다. 실패한 근거는 옛 버전에 남아 겹침 0이다.
 * 2. 열린 상충 에피소드(#90): 마지막 개정판의 보도 상충 주장 + 그 앞 개정판에서 보도 상충인 채 빠진 주장.
 *    빠진 주장도 매칭 후보라 다시 나오면 식별자와 이전 상태를 잇는다.
 * 3. 주장 매칭(#85): 근거 구간 겹침으로 식별자를 잇고, 잇지 못하면 새 식별자와 계보.
 * 4. 명시 정정(#94): 정정 후보 버전의 첫 재처리에서 그 버전의 근거가 바뀐 이어진 주장.
 */
export function prepareContinuity(input: PrepareContinuityInput): Continuity {
  const { latest } = input;
  const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
  const counter = { attempted: 0, aligned: 0 };
  const alignedPrevious = realignClaims(latest?.claims ?? [], input, counter);
  const latestIds = new Set((latest?.claims ?? []).map((c) => c.id));
  const absentEpisodes = realignClaims(
    (input.openEpisodeClaims ?? []).filter((c) => !latestIds.has(c.id)),
    input,
    counter,
  );
  const matches = matchClaims(
    [...alignedPrevious, ...absentEpisodes],
    input.drafts.map(({ claimType, evidence }) => ({ claimType, evidence })),
  );
  const correctedArticles = new Set(
    input.articleVersions
      .filter((v) => v.correctionCandidate && v.correctionFirstReprocess)
      .map((v) => v.articleId),
  );
  const currentVersionOf = new Map(
    input.articleVersions.map((v) => [v.articleId, v.articleVersionId]),
  );
  const previousById = new Map([...alignedPrevious, ...absentEpisodes].map((c) => [c.id, c]));
  const statusSources = [...(latest?.claims ?? []), ...absentEpisodes];

  const lineage = new Map<string, string>();
  const claims = input.drafts.map((draft, index): PreparedClaim => {
    const match = matches[index] ?? {};
    const id = match.previousId ?? claimId(input.story.slug, draft.claimKey, revisionNumber);
    if (match.previousId === undefined && match.lineageOf !== undefined) {
      lineage.set(id, match.lineageOf);
    }
    const previousStatus = statusSources.find((c) => c.id === id)?.contradictionStatus;
    return {
      claimId: id,
      ...(previousStatus === undefined ? {} : { previousStatus }),
      explicitCorrection:
        match.previousId !== undefined &&
        isCorrected(previousById.get(match.previousId), draft, {
          correctedArticles,
          currentVersionOf,
        }),
    };
  });

  return {
    latest,
    revisionNumber,
    claims,
    spanRealignment: counter,
    lineage,
    alignedPrevious,
    openEpisodeClaims: absentEpisodes,
    // 정정 후보 버전은 원문 변경으로 세지 않는다(스펙 "정정 vs 원문 변경": 정정은 상충 상태 변화로 드러난다).
    changedArticleVersions: input.articleVersions
      .filter((v) => v.correctionCandidate !== true)
      .map(({ articleId, articleVersionId }) => ({ articleId, articleVersionId })),
  };
}

export type FinalizeRevisionInput =
  /** 모델 재처리: 상충 판정을 통과한 주장(`id`는 `prepareContinuity`의 `claimId`)으로 개정판을 만든다. */
  | {
      readonly kind: "reprocessed";
      readonly continuity: Continuity;
      readonly story: { readonly id: string; readonly slug: string };
      readonly title: string;
      readonly publishedAt: Date;
      readonly promptVersions: RevisionInput["promptVersions"];
      readonly modelId: string;
      readonly claims: RevisionInput["claims"];
      readonly sources: readonly RevisionSource[];
    }
  /** 링크만 기사만 붙음(#77): 이전 개정판의 주장·상태를 그대로 두고 출처 구획만 바꾼다. */
  | {
      readonly kind: "sources-added";
      readonly latest: Revision;
      readonly sources: readonly RevisionSource[];
      readonly publishedAt: Date;
    };

/** 새 개정판과 그 변화, 또는 이전 개정판과 같아 확인만 함(Ruling 22-11). */
export type FinalizeRevisionResult =
  | {
      readonly kind: "revision";
      readonly revision: Revision;
      readonly changes: readonly RevisionChange[];
    }
  | { readonly kind: "confirmed"; readonly revisionId: string };

/**
 * 개정판 생성 조건(스펙 134행, #90). 이전 개정판과 내용이 같거나 변화가 0건(주장 순서·근거 differsIn처럼 변화로
 * 세지 않는 차이만)이면 개정판 대신 확인만 한다. 재처리의 사건 상태는 열린 에피소드 수를 반영한다(Ruling 22-8·#90):
 * 열린 에피소드의 주장이 이번 개정판에 없으면 그 에피소드는 아직 열려 있다.
 */
export function finalizeRevision(input: FinalizeRevisionInput): FinalizeRevisionResult {
  if (input.kind === "sources-added") {
    const { latest } = input;
    const next = revisionWithSources(latest, input.sources, {
      revisionNumber: latest.revisionNumber + 1,
      publishedAt: input.publishedAt,
    });
    return decide(latest, next, computeChanges(latest, next));
  }
  const { continuity } = input;
  const draft = runRevision({
    story: input.story,
    revisionNumber: continuity.revisionNumber,
    openEpisodes: openEpisodeClaims(
      [continuity.openEpisodeClaims, continuity.latest?.claims ?? []],
      input.claims.map((c) => c.id),
    ).length,
    title: input.title,
    publishedAt: input.publishedAt,
    promptVersions: input.promptVersions,
    modelId: input.modelId,
    claims: input.claims,
    sources: [...input.sources],
  });
  const { latest } = continuity;
  if (latest !== undefined && isSameRevisionContent(latest, draft)) {
    return { kind: "confirmed", revisionId: latest.id };
  }
  return decide(
    latest,
    draft,
    computeChanges(latest, draft, {
      lineage: continuity.lineage,
      alignedClaims: continuity.alignedPrevious,
      articleVersions: continuity.changedArticleVersions,
    }),
  );
}

function decide(
  latest: Revision | undefined,
  next: Revision,
  changes: readonly RevisionChange[],
): FinalizeRevisionResult {
  if (latest !== undefined && changes.length === 0) {
    return { kind: "confirmed", revisionId: latest.id };
  }
  return { kind: "revision", revision: next, changes };
}

/**
 * 이어진 주장이 정정 후보 버전에서 바뀌었는가(#94). 이전 주장(좌표 정렬 뒤)이 정정 후보 기사(첫 재처리)의 근거를
 * 가졌고, 그 근거의 좌표 정렬이 실패했거나(옛 버전에 남음) 매칭 분류가 실질 변경(주장 수정)이면 참이다.
 * 구간이 그대로 옮겨졌고 문장만 다르거나(표현만 변경) 같으면(불변) 거짓이다.
 */
function isCorrected(
  previous: Claim | undefined,
  next: ContinuityDraft,
  context: {
    readonly correctedArticles: ReadonlySet<string>;
    readonly currentVersionOf: ReadonlyMap<string, string>;
  },
): boolean {
  if (previous === undefined) return false;
  const touched = previous.evidence.filter((e) => context.correctedArticles.has(e.articleId));
  if (touched.length === 0) return false;
  if (touched.some((e) => e.articleVersionId !== context.currentVersionOf.get(e.articleId))) {
    return true;
  }
  return classifyMatch(previous, next) === "실질 변경";
}

/**
 * 이전 개정판 주장의 근거를 이번 입력의 기사 버전 좌표로 옮긴다(#86). 근거의 기사 버전이 입력 버전과 같거나 그 기사가
 * 입력에 없으면 그대로 둔다. 다르면 이전 본문(`previousVersionBodies`)과 새 본문의 차이로 구간을 옮기고, 실패하면
 * 그대로 둔다(옛 버전이라 겹침 0). 시도·성공 수를 `counter`에 더한다.
 */
function realignClaims(
  claims: readonly Claim[],
  input: Pick<PrepareContinuityInput, "articleVersions" | "previousVersionBodies">,
  counter: { attempted: number; aligned: number },
): Claim[] {
  const currentByArticle = new Map(input.articleVersions.map((v) => [v.articleId, v]));
  const bodies = new Map(
    (input.previousVersionBodies ?? []).map((v) => [v.articleVersionId, v.body]),
  );
  const aligners = new Map<string, (span: CodePointSpan) => SpanRealignResult>();
  return claims.map((claim) => ({
    ...claim,
    evidence: claim.evidence.map((item) => {
      const current = currentByArticle.get(item.articleId);
      if (current === undefined || current.articleVersionId === item.articleVersionId) return item;
      counter.attempted++;
      const previousBody = bodies.get(item.articleVersionId);
      if (previousBody === undefined) return item;
      const key = `${item.articleVersionId}\n${current.articleVersionId}`;
      let align = aligners.get(key);
      if (align === undefined) {
        align = createSpanAligner(previousBody, current.body);
        aligners.set(key, align);
      }
      const result = align(item.span);
      if (!result.ok) return item;
      counter.aligned++;
      return { ...item, articleVersionId: current.articleVersionId, span: result.span };
    }),
  }));
}
