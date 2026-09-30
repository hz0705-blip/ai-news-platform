import { sha256Hex } from "@newstrail/domain";

/**
 * 평가 지표(#149, 스펙 "골든셋과 평가"). 모두 결정론이며 분모가 0이면 null(리포트는 N/A)이다.
 * 신뢰 구간은 사건 패킷 단위 부트스트랩이라, 지표는 패킷 가중치(`Weights`, 재표집에서 뽑힌 횟수)를 받아
 * 가중 관측으로 계산한다. 가중치 1이면 점 추정이다.
 */

/** 패킷 식별자 → 재표집에서 뽑힌 횟수. 없으면 0. */
export type Weights = (packetId: string) => number;
export const UNIT_WEIGHTS: Weights = () => 1;

export interface Ratio {
  readonly value: number | null;
  readonly numerator: number;
  readonly denominator: number;
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { value: denominator === 0 ? null : numerator / denominator, numerator, denominator };
}

// ── 분할 지표(ARI·NMI·B-cubed) ─────────────────────────────────────

/** 기사 하나: 정답 사건과 예측 사건. `weight`는 그 기사가 속한 패킷의 가중치다. */
export interface LabeledPoint {
  readonly gold: string;
  readonly pred: string;
  readonly weight: number;
}

function contingency(points: readonly LabeledPoint[]) {
  const cells = new Map<string, number>();
  const gold = new Map<string, number>();
  const pred = new Map<string, number>();
  let n = 0;
  for (const { gold: g, pred: p, weight } of points) {
    if (weight === 0) continue;
    const key = JSON.stringify([g, p]);
    cells.set(key, (cells.get(key) ?? 0) + weight);
    gold.set(g, (gold.get(g) ?? 0) + weight);
    pred.set(p, (pred.get(p) ?? 0) + weight);
    n += weight;
  }
  const cellList = [...cells].map(([key, count]) => {
    const [g, p] = JSON.parse(key) as [string, string];
    return { gold: g, pred: p, count };
  });
  return { cells: cellList, gold, pred, n };
}

const comb2 = (x: number) => (x * (x - 1)) / 2;

/** 조정 랜드 지수(Hubert–Arabie). 기대 대비 최댓값이 0이면(두 분할 모두 자명) null. */
export function adjustedRandIndex(points: readonly LabeledPoint[]): number | null {
  const { cells, gold, pred, n } = contingency(points);
  if (n < 2) return null;
  const index = cells.reduce((sum, c) => sum + comb2(c.count), 0);
  const a = [...gold.values()].reduce((sum, x) => sum + comb2(x), 0);
  const b = [...pred.values()].reduce((sum, x) => sum + comb2(x), 0);
  const expected = (a * b) / comb2(n);
  const max = (a + b) / 2;
  return max === expected ? null : (index - expected) / (max - expected);
}

/** 정규화 상호 정보량(산술 평균 정규화, 자연로그). 두 엔트로피가 모두 0이면 null. */
export function normalizedMutualInformation(points: readonly LabeledPoint[]): number | null {
  const { cells, gold, pred, n } = contingency(points);
  if (n === 0) return null;
  const entropy = (counts: Iterable<number>) =>
    [...counts].reduce((sum, x) => sum - (x / n) * Math.log(x / n), 0);
  const hGold = entropy(gold.values());
  const hPred = entropy(pred.values());
  if (hGold + hPred === 0) return null;
  const mi = cells.reduce((sum, c) => {
    const g = gold.get(c.gold) ?? 0;
    const p = pred.get(c.pred) ?? 0;
    return sum + (c.count / n) * Math.log((n * c.count) / (g * p));
  }, 0);
  return mi / ((hGold + hPred) / 2);
}

/** B-cubed 정밀도·재현율·F1(기사마다 평균). 기사가 없으면 null. */
export function bCubed(
  points: readonly LabeledPoint[],
): { readonly precision: number; readonly recall: number; readonly f1: number } | null {
  const { cells, gold, pred, n } = contingency(points);
  if (n === 0) return null;
  let precision = 0;
  let recall = 0;
  for (const c of cells) {
    precision += (c.count * c.count) / (pred.get(c.pred) ?? 1);
    recall += (c.count * c.count) / (gold.get(c.gold) ?? 1);
  }
  precision /= n;
  recall /= n;
  return { precision, recall, f1: (2 * precision * recall) / (precision + recall) };
}

// ── 분류 지표 ─────────────────────────────────────────────────────

export interface LabeledPair {
  readonly gold: string;
  readonly pred: string;
  readonly weight: number;
}

export interface ClassScore {
  readonly precision: Ratio;
  readonly recall: Ratio;
  /** 정밀도·재현율 중 하나라도 N/A면 null. 둘 다 0이면 0. */
  readonly f1: number | null;
}

/** 클래스별 정밀도(예측 그 클래스 중 정답)·재현율(정답 그 클래스 중 예측)·F1. */
export function perClassScores(
  pairs: readonly LabeledPair[],
  classes: readonly string[],
): Record<string, ClassScore> {
  return Object.fromEntries(
    classes.map((label) => {
      let tp = 0;
      let predicted = 0;
      let actual = 0;
      for (const pair of pairs) {
        if (pair.pred === label) predicted += pair.weight;
        if (pair.gold === label) actual += pair.weight;
        if (pair.pred === label && pair.gold === label) tp += pair.weight;
      }
      const precision = ratio(tp, predicted);
      const recall = ratio(tp, actual);
      const f1 =
        precision.value === null || recall.value === null
          ? null
          : precision.value + recall.value === 0
            ? 0
            : (2 * precision.value * recall.value) / (precision.value + recall.value);
      return [label, { precision, recall, f1 }];
    }),
  );
}

/** 혼동행렬: `matrix[정답][예측]` = 수. */
export function confusionMatrix(
  pairs: readonly LabeledPair[],
  goldClasses: readonly string[],
  predClasses: readonly string[],
): Record<string, Record<string, number>> {
  const matrix = Object.fromEntries(
    goldClasses.map((g) => [g, Object.fromEntries(predClasses.map((p) => [p, 0]))]),
  ) as Record<string, Record<string, number>>;
  for (const pair of pairs) {
    const row = matrix[pair.gold];
    if (row !== undefined && pair.pred in row) row[pair.pred] = (row[pair.pred] ?? 0) + pair.weight;
  }
  return matrix;
}

/** 최근접 순위(nearest-rank) 백분위수(p50·p95). 값이 없으면 null. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

// ── 부트스트랩 ───────────────────────────────────────────────────

export const BOOTSTRAP_SEED = "eval-bootstrap@1";
export const BOOTSTRAP_RESAMPLES = 1000;

/** 시드 문자열에서 시작하는 결정론 난수(mulberry32). [0, 1). */
export function seededRandom(seed: string): () => number {
  let state = Number.parseInt(sha256Hex(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const x = sorted[low] ?? 0;
  const y = sorted[high] ?? x;
  return x + (y - x) * (position - low);
}

export interface Interval {
  readonly low: number;
  readonly high: number;
  /** 값이 정의된(분모가 0이 아닌) 재표집 수. */
  readonly resamples: number;
}

/**
 * 사건 패킷 단위 부트스트랩 95% 백분위 구간. 패킷을 복원 추출로 `resamples`번 다시 뽑아 지표를 다시 계산한다.
 * 지표가 null인 재표집은 빼고, 모두 null이면 null.
 */
export function bootstrapInterval(
  packetIds: readonly string[],
  statistic: (weights: Weights) => number | null,
  options: { readonly seed?: string; readonly resamples?: number } = {},
): Interval | null {
  if (packetIds.length === 0) return null;
  const random = seededRandom(options.seed ?? BOOTSTRAP_SEED);
  const values: number[] = [];
  for (let r = 0; r < (options.resamples ?? BOOTSTRAP_RESAMPLES); r++) {
    const counts = new Map<string, number>();
    for (let i = 0; i < packetIds.length; i++) {
      const id = packetIds[Math.floor(random() * packetIds.length)] as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const value = statistic((id) => counts.get(id) ?? 0);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return { low: quantile(values, 0.025), high: quantile(values, 0.975), resamples: values.length };
}
