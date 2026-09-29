import type { Claim, ClaimType } from "./claim.ts";
import type { CodePointSpan } from "./span.ts";

/**
 * 주장 매칭 수치(docs/spec/v1.md "개발 중 결정 항목", 초기값·개발셋 전, #85):
 * 겹침 임계 Jaccard ≥ 0.5, 최소 앵커 길이 20 코드 포인트, 차순위와의 마진 ≥ 0.1.
 */
export const CLAIM_MATCH_THRESHOLDS = {
  overlap: 0.5,
  minAnchorLength: 20,
  margin: 0.1,
} as const;

export interface ClaimMatchThresholds {
  readonly overlap: number;
  readonly minAnchorLength: number;
  readonly margin: number;
}

/** 매칭에 쓰는 주장의 모양: 유형과 근거 구간(기사 버전 기준)만 본다. */
export interface MatchableClaim {
  readonly claimType: ClaimType;
  readonly evidence: readonly {
    readonly articleVersionId: string;
    readonly span: CodePointSpan;
  }[];
}

/**
 * 새 주장 하나의 매칭 결과. `previousId`가 있으면 그 이전 주장의 식별자를 잇고(연속),
 * 없으면 새 식별자를 받는다. `lineageOf`는 연속으로 보지 못했지만(마진 부족·짧은 앵커 복수 후보)
 * 겹침 임계를 넘은 이전 주장 — 계보로 기록한다.
 */
export type ClaimMatch =
  | { readonly previousId: string }
  | { readonly previousId?: undefined; readonly lineageOf?: string };

/** 매칭된 이전·새 주장의 분류. 불변과 표현만 변경은 변화가 아니다(스펙 "주장 매칭"). */
export type MatchKind = "불변" | "표현만 변경" | "실질 변경";

interface Interval {
  readonly start: number;
  readonly end: number;
}

/** 구간들의 합집합을 겹치지 않는 정렬된 구간으로 만든다(빈 구간은 버린다). */
function unionOf(spans: readonly CodePointSpan[]): Interval[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    } else {
      merged.push({ start: span.start, end: span.end });
    }
  }
  return merged;
}

function sizeOf(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
}

function intersectionSize(a: readonly Interval[], b: readonly Interval[]): number {
  let total = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i] as Interval;
    const y = b[j] as Interval;
    total += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
    if (x.end < y.end) i++;
    else j++;
  }
  return total;
}

function spansByVersion(claim: MatchableClaim): Map<string, Interval[]> {
  const grouped = new Map<string, CodePointSpan[]>();
  for (const item of claim.evidence) {
    const list = grouped.get(item.articleVersionId);
    if (list === undefined) grouped.set(item.articleVersionId, [item.span]);
    else list.push(item.span);
  }
  return new Map([...grouped].map(([version, spans]) => [version, unionOf(spans)]));
}

/**
 * 연속성 점수(스펙 "주장 매칭"): 두 주장이 공유하는 기사 버전마다 근거 구간 합집합의 Jaccard를 구해
 * 그 최댓값. 공유하지 않는 기사 버전은 보지 않으므로 출처가 추가되어도 점수가 희석되지 않는다.
 * 버전이 다른 근거 사이의 겹침은 0이다(좌표 정렬은 #86). `anchor`는 최댓값을 낸 버전의 교집합 길이
 * (코드 포인트, 같은 점수면 긴 쪽).
 */
export function continuityScore(
  previous: MatchableClaim,
  next: MatchableClaim,
): { readonly score: number; readonly anchor: number } {
  const a = spansByVersion(previous);
  const b = spansByVersion(next);
  let score = 0;
  let anchor = 0;
  for (const [version, left] of a) {
    const right = b.get(version);
    if (right === undefined) continue;
    const common = intersectionSize(left, right);
    if (common === 0) continue;
    const jaccard = common / (sizeOf(left) + sizeOf(right) - common);
    if (jaccard > score || (jaccard === score && common > anchor)) {
      score = jaccard;
      anchor = common;
    }
  }
  return { score, anchor };
}

interface Pair {
  readonly p: number;
  readonly n: number;
  readonly score: number;
  readonly anchor: number;
}

/**
 * 주장 매칭(스펙 "주장 매칭", #85). 후보는 유형이 같은 이전·새 주장 쌍 중 겹침이 있는 것.
 * 배정은 탐욕 일대일이다: 점수 내림차순(같으면 이전·새 순서)으로 쌍을 보며, 둘 다 아직 남아 있고
 * 점수가 겹침 임계 이상이면 차순위(남은 후보 중 같은 이전 주장 또는 같은 새 주장이 걸린 다음 점수)와의
 * 마진을 본다. 마진이 부족하면 보류해 둘 다 소비한다(이전 주장은 삭제, 새 주장은 새 식별자).
 * 교집합이 최소 앵커 길이보다 짧은 쌍은 양쪽 모두 후보가 그 하나뿐일 때만 연속이다.
 * 연속으로 잇지 못한 새 주장은, 겹침 임계를 넘은 이전 주장이 있으면 가장 높은 것을 계보로 둔다.
 * 결과는 `next`와 같은 순서다.
 */
export function matchClaims(
  previous: readonly (MatchableClaim & { readonly id: string })[],
  next: readonly MatchableClaim[],
  thresholds: ClaimMatchThresholds = CLAIM_MATCH_THRESHOLDS,
): ClaimMatch[] {
  const pairs: Pair[] = [];
  for (const [p, prev] of previous.entries()) {
    for (const [n, claim] of next.entries()) {
      if (prev.claimType !== claim.claimType) continue;
      const { score, anchor } = continuityScore(prev, claim);
      if (score > 0) pairs.push({ p, n, score, anchor });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.p - y.p || x.n - y.n);

  const candidatesOfPrev = (p: number) => pairs.filter((x) => x.p === p).length;
  const candidatesOfNext = (n: number) => pairs.filter((x) => x.n === n).length;
  const usedPrev = new Set<number>();
  const usedNext = new Set<number>();
  const continued = new Map<number, number>();

  for (const pair of pairs) {
    if (pair.score < thresholds.overlap) break;
    if (usedPrev.has(pair.p) || usedNext.has(pair.n)) continue;
    const shortAnchor = pair.anchor < thresholds.minAnchorLength;
    if (shortAnchor && (candidatesOfPrev(pair.p) > 1 || candidatesOfNext(pair.n) > 1)) continue;
    const runnerUp = pairs.find(
      (x) =>
        x !== pair &&
        (x.p === pair.p || x.n === pair.n) &&
        !usedPrev.has(x.p) &&
        !usedNext.has(x.n),
    );
    usedPrev.add(pair.p);
    usedNext.add(pair.n);
    if (runnerUp !== undefined && pair.score - runnerUp.score < thresholds.margin) continue;
    continued.set(pair.n, pair.p);
  }

  return next.map((_, n) => {
    const p = continued.get(n);
    if (p !== undefined) return { previousId: (previous[p] as { id: string }).id };
    const lineage = pairs.find((x) => x.n === n && x.score >= thresholds.overlap);
    return lineage === undefined ? {} : { lineageOf: (previous[lineage.p] as { id: string }).id };
  });
}

type ClassifiableClaim = MatchableClaim & Pick<Claim, "text" | "modality">;

function evidenceKey(claim: MatchableClaim): string {
  return claim.evidence
    .map((e) => `${e.articleVersionId}:${e.span.start}-${e.span.end}`)
    .sort()
    .join("|");
}

/**
 * 매칭된 이전·새 주장을 분류한다(#85): 문장·유형·양상·근거 구간 집합이 모두 같으면 불변,
 * 근거 구간 집합·유형·양상이 같고 문장만 다르면 표현만 변경(결정론 규칙, 모델 판정은 M6 평가 뒤 재검토),
 * 근거·유형·양상 중 하나라도 다르면 실질 변경. 주장 상태의 차이는 이 분류가 아니라 상충 상태 변화로
 * 따로 센다(`computeChanges`).
 */
export function classifyMatch(previous: ClassifiableClaim, next: ClassifiableClaim): MatchKind {
  if (
    previous.claimType !== next.claimType ||
    previous.modality !== next.modality ||
    evidenceKey(previous) !== evidenceKey(next)
  ) {
    return "실질 변경";
  }
  return previous.text === next.text ? "불변" : "표현만 변경";
}
