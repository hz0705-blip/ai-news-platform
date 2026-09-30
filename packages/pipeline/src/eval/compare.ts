import { spanText } from "@newsplatform/domain";
import type { Draft, DraftClaim, DraftSide } from "./draft.ts";
import { type LocalPacket, seededRank } from "./packet.ts";

/**
 * 두 초안의 대조(#147, 스펙 "골든셋과 평가"). 항목은 다섯 종류다.
 * - `pair`: 기사 쌍 같은 사건 여부. 개발셋 쌍 60개(`pairs.ts`), 키 `pairs/pair:dev-01/a1|dev-03/a2`.
 * - `claim`: 주장(유형·양상·근거 인용 키 집합). 두 초안의 주장은 근거 문장 집합의 Jaccard ≥ 0.5로 1:1 정렬하고
 *   (높은 것부터, 동률이면 A·B 순서), 한쪽에만 있는 주장은 다른 쪽 값이 없는 불일치 항목이다. 키 `claim:c1`.
 *   주장 문장은 두 모델이 다르게 쓰므로 비교하지 않는다.
 * - `support`: 정렬된 주장에서 두 초안 모두에 있는 인용의 뒷받침 라벨. 키 `support:c1:a1s3`.
 * - `relation`: 정렬된 주장에서 두 초안 모두에 있는 인용 쌍의 상충 관계 라벨. 키 `relation:c1:a1s3|a2s5`.
 * - `status`: 사건 상태 5클래스. 키 `status`.
 * 이 정렬은 대조를 위한 것이며 주장 매칭 라벨이 아니다.
 */

export const ITEM_KINDS = ["pair", "claim", "support", "relation", "status"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** 기권 값. 기사 쌍·뒷받침·상충 관계 라벨의 "판정 불가". */
export const ABSTAIN = "판정 불가";

export interface ClaimValue {
  readonly claimType: string;
  readonly modality: string;
  /** 인용 키, 정렬. */
  readonly quotes: readonly string[];
}

export type ItemValue = string | ClaimValue | null;

export interface CompareItem {
  /** `<packetId>/<키>`. */
  readonly itemId: string;
  readonly packetId: string;
  readonly kind: ItemKind;
  readonly a: ItemValue;
  readonly b: ItemValue;
  readonly agreed: boolean;
  /** 수치·날짜·발언자 주장 항목(운영자가 일치해도 검토한다). 주장 항목에서만 참이다. */
  readonly sensitive: boolean;
  /** 이 항목이 속한 초안 주장의 순번(0부터). 판정 화면이 주장 문장을 보여 주는 데 쓴다. */
  readonly claimIndex?: { readonly a: number | null; readonly b: number | null };
}

export const REVIEW_REASONS = ["불일치", "감사 표본", "수치·날짜·발언자"] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export interface ReviewItem extends CompareItem {
  readonly reasons: readonly ReviewReason[];
}

/** 일치 항목 감사 표본의 비율과 고정 시드. */
export const AUDIT_RATE = 0.2;
export const AUDIT_SEED = "golden-audit@1";
/** 주장 정렬의 근거 문장 Jaccard 하한. */
export const CLAIM_ALIGN_JACCARD = 0.5;

function sentenceSet(claim: DraftClaim): Set<string> {
  return new Set(claim.quotes.flatMap((q) => q.sentenceIds));
}

function jaccard(x: Set<string>, y: Set<string>): number {
  let common = 0;
  for (const id of x) if (y.has(id)) common += 1;
  const union = x.size + y.size - common;
  return union === 0 ? 0 : common / union;
}

/** 두 초안의 주장 정렬: `[A 순번 | null, B 순번 | null]`, A 순번 순서 뒤에 B에만 있는 주장. */
export function alignClaims(
  a: readonly DraftClaim[],
  b: readonly DraftClaim[],
): [number | null, number | null][] {
  const candidates: { i: number; j: number; score: number }[] = [];
  a.forEach((x, i) => {
    b.forEach((y, j) => {
      const score = jaccard(sentenceSet(x), sentenceSet(y));
      if (score >= CLAIM_ALIGN_JACCARD) candidates.push({ i, j, score });
    });
  });
  candidates.sort((p, q) => q.score - p.score || p.i - q.i || p.j - q.j);
  const matchOfA = new Map<number, number>();
  const usedB = new Set<number>();
  for (const { i, j } of candidates) {
    if (matchOfA.has(i) || usedB.has(j)) continue;
    matchOfA.set(i, j);
    usedB.add(j);
  }
  const rows: [number | null, number | null][] = a.map((_, i) => [i, matchOfA.get(i) ?? null]);
  b.forEach((_, j) => {
    if (!usedB.has(j)) rows.push([null, j]);
  });
  return rows;
}

const DATE_WORDS =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.|Feb\.|Mar\.|Apr\.|Aug\.|Sept?\.|Oct\.|Nov\.|Dec\.|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|yesterday|today|tomorrow)\b/;
const SPEAKER_WORDS =
  /\b(said|says|told|according to|stated|announced|spokesperson|spokesman|spokeswoman)\b/i;

/**
 * 수치·날짜·발언자 항목: 근거 원문에 숫자·날짜 낱말·발언 동사가 있거나 한쪽 유형이 귀속 입장인 주장.
 * 이 규칙은 주장 항목에만 건다(그 주장의 뒷받침·상충 관계 항목은 불일치·감사 표본으로만 검토한다).
 */
export function isSensitiveClaim(
  packet: LocalPacket,
  claims: readonly (DraftClaim | undefined)[],
): boolean {
  const bodies = new Map(packet.articles.map((a) => [a.key, a.body]));
  return claims.some(
    (claim) =>
      claim !== undefined &&
      (claim.claimType === "귀속 입장" ||
        claim.quotes.some((q) => {
          const text = spanText(bodies.get(q.articleKey) ?? "", q.span);
          return /[0-9]/.test(text) || DATE_WORDS.test(text) || SPEAKER_WORDS.test(text);
        })),
  );
}

function claimValue(claim: DraftClaim | undefined): ClaimValue | null {
  if (claim === undefined) return null;
  return {
    claimType: claim.claimType,
    modality: claim.modality,
    quotes: claim.quotes.map((q) => q.key).sort(),
  };
}

function sameValue(x: ItemValue, y: ItemValue): boolean {
  return x !== null && y !== null && JSON.stringify(x) === JSON.stringify(y);
}

/** 패킷 하나의 두 초안을 항목으로 만든다. */
export function compareDrafts(packet: LocalPacket, a: Draft, b: Draft): CompareItem[] {
  const items: CompareItem[] = [];
  const push = (
    key: string,
    kind: ItemKind,
    x: ItemValue,
    y: ItemValue,
    sensitive = false,
    claimIndex?: CompareItem["claimIndex"],
  ) =>
    items.push({
      itemId: `${packet.packetId}/${key}`,
      packetId: packet.packetId,
      kind,
      a: x,
      b: y,
      agreed: sameValue(x, y),
      sensitive,
      ...(claimIndex === undefined ? {} : { claimIndex }),
    });

  // 패킷 초안의 기사 쌍 라벨(`draft.pairs`)은 대조하지 않는다. "한 사건으로 묶은 기사"라는 틀 안에서 붙인 라벨이라,
  // 기사 쌍은 개발셋 쌍 60개를 틀 없는 `golden-pair` 프롬프트로 따로 라벨링해 대조한다(`pairs.ts`).
  alignClaims(a.claims, b.claims).forEach(([i, j], index) => {
    const claimId = `c${index + 1}`;
    const x = i === null ? undefined : a.claims[i];
    const y = j === null ? undefined : b.claims[j];
    const sensitive = isSensitiveClaim(packet, [x, y]);
    const claimIndex = { a: i, b: j };
    push(`claim:${claimId}`, "claim", claimValue(x), claimValue(y), sensitive, claimIndex);
    if (x === undefined || y === undefined) return;
    for (const quote of x.quotes) {
      const other = y.quotes.find((q) => q.key === quote.key);
      if (other === undefined) continue;
      push(
        `support:${claimId}:${quote.key}`,
        "support",
        quote.support,
        other.support,
        false,
        claimIndex,
      );
    }
    const shared = x.quotes.filter((q) => y.quotes.some((o) => o.key === q.key));
    shared.forEach((p, n) => {
      for (const q of shared.slice(n + 1)) {
        if (p.articleKey === q.articleKey) continue;
        const [s, t] = p.key < q.key ? [p.key, q.key] : [q.key, p.key];
        const label = (claim: DraftClaim) =>
          claim.relations.find((r) => r.a === s && r.b === t)?.label ?? null;
        const la = label(x);
        const lb = label(y);
        if (la === null && lb === null) continue;
        push(`relation:${claimId}:${s}|${t}`, "relation", la, lb, false, claimIndex);
      }
    });
  });

  push("status", "status", a.storyStatus, b.storyStatus);
  return items;
}

/**
 * 운영자 검토 대상: 불일치 전부 + 일치 항목의 무작위 20%(고정 시드 순위, 올림) + 수치·날짜·발언자 항목.
 * 한 항목이 여러 사유를 가질 수 있다.
 */
export function selectReview(items: readonly CompareItem[]): ReviewItem[] {
  const agreed = items.filter((item) => item.agreed);
  const auditCount = Math.ceil(agreed.length * AUDIT_RATE);
  const audit = new Set(
    [...agreed]
      .sort((x, y) =>
        seededRank(AUDIT_SEED, x.itemId) < seededRank(AUDIT_SEED, y.itemId) ? -1 : 1,
      )
      .slice(0, auditCount)
      .map((item) => item.itemId),
  );
  const review: ReviewItem[] = [];
  for (const item of items) {
    const reasons: ReviewReason[] = [];
    if (!item.agreed) reasons.push("불일치");
    if (audit.has(item.itemId)) reasons.push("감사 표본");
    if (item.sensitive) reasons.push("수치·날짜·발언자");
    if (reasons.length > 0) review.push({ ...item, reasons });
  }
  return review;
}

/** 범주 값 쌍의 Cohen 카파. 기대 일치가 1이면(두 쪽 모두 한 범주만) 정의되지 않아 null. */
export function cohenKappa(pairs: readonly (readonly [string, string])[]): number | null {
  if (pairs.length === 0) return null;
  const n = pairs.length;
  const observed = pairs.filter(([x, y]) => x === y).length / n;
  const countA = new Map<string, number>();
  const countB = new Map<string, number>();
  for (const [x, y] of pairs) {
    countA.set(x, (countA.get(x) ?? 0) + 1);
    countB.set(y, (countB.get(y) ?? 0) + 1);
  }
  let expected = 0;
  for (const [category, count] of countA)
    expected += (count / n) * ((countB.get(category) ?? 0) / n);
  if (expected === 1) return null;
  return (observed - expected) / (1 - expected);
}

export interface KindStats {
  readonly items: number;
  readonly agreed: number;
  readonly disagreed: number;
  readonly agreementRate: number | null;
  readonly disagreementRate: number | null;
  /** 모델별 기권율(값이 "판정 불가"인 항목 ÷ 항목). */
  readonly abstentionRate: Readonly<Record<DraftSide, number | null>>;
  /** 두 값이 모두 있는 항목의 카파. 주장은 유형 범주로 센다. */
  readonly kappa: number | null;
  readonly kappaItems: number;
}

const round = (value: number | null) =>
  value === null ? null : Math.round(value * 10_000) / 10_000;

export function kindStats(items: readonly CompareItem[]): KindStats {
  const n = items.length;
  const agreed = items.filter((item) => item.agreed).length;
  const rate = (count: number) => (n === 0 ? null : round(count / n));
  const category = (value: ItemValue) =>
    value === null ? null : typeof value === "string" ? value : value.claimType;
  const pairs = items.flatMap((item): [string, string][] => {
    const x = category(item.a);
    const y = category(item.b);
    return x === null || y === null ? [] : [[x, y]];
  });
  return {
    items: n,
    agreed,
    disagreed: n - agreed,
    agreementRate: rate(agreed),
    disagreementRate: rate(n - agreed),
    abstentionRate: {
      A: rate(items.filter((item) => item.a === ABSTAIN).length),
      B: rate(items.filter((item) => item.b === ABSTAIN).length),
    },
    kappa: round(cohenKappa(pairs)),
    kappaItems: pairs.length,
  };
}
