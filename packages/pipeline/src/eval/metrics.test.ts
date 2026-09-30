import { describe, expect, it } from "vitest";
import { cohenKappa } from "./compare.ts";
import {
  adjustedRandIndex,
  bCubed,
  bootstrapInterval,
  type LabeledPoint,
  normalizedMutualInformation,
  perClassScores,
  percentile,
  ratio,
  seededRandom,
  UNIT_WEIGHTS,
} from "./metrics.ts";

const points = (gold: readonly string[], pred: readonly string[]): LabeledPoint[] =>
  gold.map((g, i) => ({ gold: g, pred: pred[i] ?? "", weight: 1 }));

describe("평가 지표", () => {
  it("ARI는 동일 분할에서 1, 무작위 대비 0 근처", () => {
    expect(adjustedRandIndex(points(["x", "x", "y", "y", "z"], ["p", "p", "q", "q", "r"]))).toBe(1);
    // 손계산: 색인 2, 기대 36/15, 최대 6 → (2 − 2.4) / (6 − 2.4) = −1/9.
    expect(
      adjustedRandIndex(points(["x", "x", "x", "y", "y", "y"], ["p", "q", "p", "q", "p", "q"])),
    ).toBeCloseTo(-1 / 9, 10);
    const random = seededRandom("ari-test");
    const n = 400;
    const gold = Array.from({ length: n }, () => String(Math.floor(random() * 5)));
    const pred = Array.from({ length: n }, () => String(Math.floor(random() * 5)));
    expect(Math.abs(adjustedRandIndex(points(gold, pred)) ?? 1)).toBeLessThan(0.02);
  });

  it("NMI·B-cubed 손계산 예시", () => {
    const sample = points(["x", "x", "y", "y"], ["p", "p", "p", "q"]);
    const mi = 0.5 * Math.log(4 / 3) + 0.25 * Math.log(2 / 3) + 0.25 * Math.log(2);
    const hGold = Math.log(2);
    const hPred = -(0.75 * Math.log(0.75) + 0.25 * Math.log(0.25));
    expect(normalizedMutualInformation(sample)).toBeCloseTo(mi / ((hGold + hPred) / 2), 10);
    const b = bCubed(sample);
    expect(b?.precision).toBeCloseTo(2 / 3, 10);
    expect(b?.recall).toBeCloseTo(3 / 4, 10);
    expect(b?.f1).toBeCloseTo(12 / 17, 10);
    // 가중치 2는 같은 점 두 개와 같다.
    const doubled = sample.map((p) => ({ ...p, weight: 2 }));
    expect(bCubed(doubled)?.f1).toBeCloseTo(12 / 17, 10);
  });

  it("카파·클래스별 F1 손계산 예시", () => {
    // 관찰 일치 3/4, 기대 일치 1/2 → 0.5.
    expect(
      cohenKappa([
        ["예", "예"],
        ["예", "아니오"],
        ["아니오", "아니오"],
        ["아니오", "아니오"],
      ]),
    ).toBeCloseTo(0.5, 10);
    const scores = perClassScores(
      [
        { gold: "A", pred: "A", weight: 1 },
        { gold: "A", pred: "B", weight: 1 },
        { gold: "B", pred: "A", weight: 1 },
        { gold: "A", pred: "A", weight: 1 },
      ],
      ["A", "B", "C"],
    );
    expect(scores.A?.precision.value).toBeCloseTo(2 / 3, 10);
    expect(scores.A?.recall.value).toBeCloseTo(2 / 3, 10);
    expect(scores.A?.f1).toBeCloseTo(2 / 3, 10);
    expect(scores.B?.f1).toBe(0);
  });

  it("분모 0 지표는 N/A", () => {
    expect(ratio(0, 0)).toEqual({ value: null, numerator: 0, denominator: 0 });
    const scores = perClassScores([{ gold: "A", pred: "A", weight: 1 }], ["A", "C"]);
    expect(scores.C?.precision.value).toBeNull();
    expect(scores.C?.recall.value).toBeNull();
    expect(scores.C?.f1).toBeNull();
    expect(adjustedRandIndex([])).toBeNull();
    expect(adjustedRandIndex(points(["x", "y"], ["p", "q"]))).toBeNull();
    expect(normalizedMutualInformation(points(["x", "x"], ["p", "p"]))).toBeNull();
    expect(bCubed([])).toBeNull();
    expect(percentile([], 50)).toBeNull();
    expect(bootstrapInterval(["dev-01"], () => null)).toBeNull();
  });

  it("부트스트랩은 같은 시드에서 같은 구간", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `dev-${String(i + 1).padStart(2, "0")}`);
    const value = new Map(ids.map((id, i) => [id, i % 3 === 0 ? 1 : 0]));
    const mean = (w: typeof UNIT_WEIGHTS) => {
      let hit = 0;
      let total = 0;
      for (const id of ids) {
        hit += w(id) * (value.get(id) ?? 0);
        total += w(id);
      }
      return ratio(hit, total).value;
    };
    const first = bootstrapInterval(ids, mean);
    expect(bootstrapInterval(ids, mean)).toEqual(first);
    expect(first?.resamples).toBe(1000);
    const point = mean(UNIT_WEIGHTS) ?? 0;
    expect(first?.low).toBeLessThanOrEqual(point);
    expect(first?.high).toBeGreaterThanOrEqual(point);
    expect(seededRandom("eval-bootstrap@1")()).not.toBe(seededRandom("다른 시드")());
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
  });
});
