import type { Claim } from "./claim.ts";
import { classifyMatch } from "./claim-matching.ts";
import type { ContradictionStatus } from "./contradiction-status.ts";
import type { Revision } from "./revision.ts";

/** 변화 종류 넷(docs/spec/v1.md "변화", 사용자 이야기 19, CONTEXT.md "변화"). */
export const CHANGE_KINDS = [
  "주장 추가·삭제·수정",
  "상충 상태 변화",
  "원문 변경",
  "출처 추가",
] as const;

export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** 주장 변화의 하위 종류. */
export const CLAIM_CHANGES = ["추가", "삭제", "수정"] as const;

export type ClaimChange = (typeof CLAIM_CHANGES)[number];

/**
 * 두 개정판 사이의 변화 하나(CONTEXT.md "변화"). 새 개정판에 붙어 저장된다.
 * - 주장 추가: 현재 문장. 연속으로 잇지 못한 이전 주장이 있으면 `lineageClaimId`(계보).
 * - 주장 삭제: 이전 문장. 주장 수정(실질 변경): 이전·현재 문장.
 * - 상충 상태 변화: `claimId`가 있으면 그 주장, 없으면 사건 상태의 이전→현재.
 * - 원문 변경: 새 기사 버전이 붙은 기사와 그 버전. 출처 추가: 새로 붙은 기사.
 */
export type RevisionChange =
  | {
      readonly kind: "주장 추가·삭제·수정";
      readonly claimChange: "추가";
      readonly claimId: string;
      readonly currentText: string;
      readonly lineageClaimId?: string;
    }
  | {
      readonly kind: "주장 추가·삭제·수정";
      readonly claimChange: "삭제";
      readonly claimId: string;
      readonly previousText: string;
    }
  | {
      readonly kind: "주장 추가·삭제·수정";
      readonly claimChange: "수정";
      readonly claimId: string;
      readonly previousText: string;
      readonly currentText: string;
    }
  | {
      readonly kind: "상충 상태 변화";
      readonly claimId?: string;
      readonly previousStatus: ContradictionStatus;
      readonly currentStatus: ContradictionStatus;
    }
  | { readonly kind: "원문 변경"; readonly articleId: string; readonly articleVersionId: string }
  | { readonly kind: "출처 추가"; readonly articleId: string };

export interface ComputeChangesOptions {
  /** 새 식별자를 받은 주장 → 계보 이전 주장(`matchClaims`의 `lineageOf`). */
  readonly lineage?: ReadonlyMap<string, string>;
  /**
   * 이번 재처리가 본 기사별 최신 기사 버전. 이전 개정판의 근거가 쓴 버전과 다르면 원문 변경이다.
   * 없으면 새 개정판 근거의 버전만 본다.
   */
  readonly articleVersions?: readonly {
    readonly articleId: string;
    readonly articleVersionId: string;
  }[];
  /**
   * 근거 구간을 새 기사 버전 좌표로 옮긴 이전 주장들(#86, `createSpanAligner`). 있으면 불변·표현만 변경·실질 변경
   * 분류를 이것과 비교한다 — 기사 버전만 바뀐 같은 근거를 실질 변경으로 세지 않기 위해서다.
   */
  readonly alignedClaims?: readonly Claim[];
}

/**
 * 두 개정판 사이의 변화(스펙 "변화", #85). 주장은 매칭된 식별자로 짝짓는다(식별자가 같으면 같은 주장).
 * 순서: 주장 변화(새 개정판 순서의 추가·수정, 이전 개정판 순서의 삭제) → 주장 상태 변화 → 사건 상태 변화
 * → 원문 변경 → 출처 추가. 불변·표현만 변경은 변화가 아니다. 첫 개정판(`previous` 없음)은 변화가 없다.
 */
export function computeChanges(
  previous: Revision | undefined,
  next: Revision,
  options: ComputeChangesOptions = {},
): RevisionChange[] {
  if (previous === undefined) return [];
  const changes: RevisionChange[] = [];
  const previousById = new Map(previous.claims.map((c) => [c.id, c]));
  const alignedById = new Map((options.alignedClaims ?? []).map((c) => [c.id, c]));
  const nextIds = new Set(next.claims.map((c) => c.id));
  const nextClaims = [...next.claims].sort((a, b) => a.order - b.order);
  const previousClaims = [...previous.claims].sort((a, b) => a.order - b.order);

  for (const claim of nextClaims) {
    const before = previousById.get(claim.id);
    if (before === undefined) {
      const lineage = options.lineage?.get(claim.id);
      changes.push({
        kind: "주장 추가·삭제·수정",
        claimChange: "추가",
        claimId: claim.id,
        currentText: claim.text,
        ...(lineage === undefined ? {} : { lineageClaimId: lineage }),
      });
    } else if (classifyMatch(alignedById.get(claim.id) ?? before, claim) === "실질 변경") {
      changes.push({
        kind: "주장 추가·삭제·수정",
        claimChange: "수정",
        claimId: claim.id,
        previousText: before.text,
        currentText: claim.text,
      });
    }
  }
  for (const claim of previousClaims) {
    if (!nextIds.has(claim.id)) {
      changes.push({
        kind: "주장 추가·삭제·수정",
        claimChange: "삭제",
        claimId: claim.id,
        previousText: claim.text,
      });
    }
  }

  for (const claim of nextClaims) {
    const before = previousById.get(claim.id);
    if (before !== undefined && before.contradictionStatus !== claim.contradictionStatus) {
      changes.push({
        kind: "상충 상태 변화",
        claimId: claim.id,
        previousStatus: before.contradictionStatus,
        currentStatus: claim.contradictionStatus,
      });
    }
  }
  if (previous.contradictionStatus !== next.contradictionStatus) {
    changes.push({
      kind: "상충 상태 변화",
      previousStatus: previous.contradictionStatus,
      currentStatus: next.contradictionStatus,
    });
  }

  const previousVersion = new Map<string, Set<string>>();
  for (const item of previous.claims.flatMap((c) => c.evidence)) {
    const set = previousVersion.get(item.articleId) ?? new Set<string>();
    set.add(item.articleVersionId);
    previousVersion.set(item.articleId, set);
  }
  const current =
    options.articleVersions ??
    next.claims.flatMap((c) =>
      c.evidence.map((e) => ({ articleId: e.articleId, articleVersionId: e.articleVersionId })),
    );
  const reported = new Set<string>();
  for (const { articleId, articleVersionId } of current) {
    const seen = previousVersion.get(articleId);
    if (seen === undefined || seen.has(articleVersionId) || reported.has(articleId)) continue;
    reported.add(articleId);
    changes.push({ kind: "원문 변경", articleId, articleVersionId });
  }

  const previousArticles = new Set(previous.sources.map((s) => s.articleId));
  for (const source of next.sources) {
    if (!previousArticles.has(source.articleId)) {
      previousArticles.add(source.articleId);
      changes.push({ kind: "출처 추가", articleId: source.articleId });
    }
  }
  return changes;
}
