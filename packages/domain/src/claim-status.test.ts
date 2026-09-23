import { describe, expect, it } from "vitest";
import { type ClaimStatusInput, deriveClaimStatus, RELATION_LABELS } from "./claim-status.ts";
import { CONTRADICTION_STATUSES, type ContradictionStatus } from "./contradiction-status.ts";
import { countReportingOrigins, reportingOrigins } from "./reporting-origin.ts";

const base: ClaimStatusInput = {
  previous: undefined,
  verified: true,
  undeterminable: false,
  supportingOrigins: 1,
  conflictingOrigins: 0,
  openEpisode: false,
  explicitCorrection: false,
  explicitResolution: false,
};

describe("관계 라벨", () => {
  it("세 라벨이며 순서가 고정된다", () => {
    expect(RELATION_LABELS).toEqual(["뒷받침 일치", "양립 불가", "판정 불가"]);
  });
});

describe("보도 원점", () => {
  const tier = "본문 처리 + 발췌 표시" as const;
  it("출처별로 세고 링크만 등급은 제외한다", () => {
    expect(
      countReportingOrigins([
        { sourceId: "a", rightsTier: tier },
        { sourceId: "a", rightsTier: tier },
        { sourceId: "b", rightsTier: tier },
        { sourceId: "c", rightsTier: "링크만" },
      ]),
    ).toBe(2);
  });
  it("통신 전재는 wireId 하나로 센다", () => {
    expect(
      reportingOrigins([
        { sourceId: "a", wireId: "wire-1", rightsTier: tier },
        { sourceId: "b", wireId: "wire-1", rightsTier: tier },
      ]),
    ).toEqual(new Set(["wire-1"]));
  });
  it("빈 입력은 빈 집합", () => {
    expect(reportingOrigins([]).size).toBe(0);
  });
});

describe("deriveClaimStatus 가드 ① — 이전 상태 유지·미발행", () => {
  const previousStates = [undefined, ...CONTRADICTION_STATUSES] as const;
  it.each(previousStates)(
    "판정 불가가 있으면 이전 상태(%s)를 유지하고 발행하지 않는다",
    (previous) => {
      const result = deriveClaimStatus({
        ...base,
        previous,
        undeterminable: true,
        supportingOrigins: 2,
      });
      expect(result).toEqual({
        publish: false,
        previous,
        reason: expect.stringMatching(/판정 불가/),
        guard: 1,
      });
    },
  );
  it.each(previousStates)(
    "검증이 누락되면 이전 상태(%s)를 유지하고 발행하지 않는다",
    (previous) => {
      const result = deriveClaimStatus({
        ...base,
        previous,
        verified: false,
        supportingOrigins: 2,
      });
      expect(result).toEqual({
        publish: false,
        previous,
        reason: expect.stringMatching(/검증 누락/),
        guard: 1,
      });
    },
  );
  it.each(previousStates)(
    "독립 원점이 0이면 이전 상태(%s)를 유지하고 발행하지 않는다",
    (previous) => {
      const result = deriveClaimStatus({ ...base, previous, supportingOrigins: 0 });
      expect(result).toEqual({
        publish: false,
        previous,
        reason: expect.stringMatching(/독립 원점 0/),
        guard: 1,
      });
    },
  );
  it("가드 ①은 ②보다 앞선다 — 상충 중이라도 판정 불가가 있으면 미발행", () => {
    const result = deriveClaimStatus({
      ...base,
      previous: "보도 상충",
      undeterminable: true,
      conflictingOrigins: 1,
    });
    expect(result.publish).toBe(false);
  });
});

describe("deriveClaimStatus 가드 ②~⑥ — 이전 상태 5개 × 가드 표", () => {
  type Row = readonly [
    label: string,
    patch: Partial<ClaimStatusInput>,
    expected: ContradictionStatus,
    guard: 2 | 3 | 4 | 5 | 6,
  ];
  // 이전 상태 보도 상충은 열린 에피소드와 같으므로(스펙 132행 "상충 에피소드는 명시 철회·정정·해소로만 닫힌다") ⑤·⑥ 행에서 제외하고 아래 별도 테스트로 다룬다.
  const rows: readonly Row[] = [
    [
      "② 양립 불가 원점이 있으면 보도 상충",
      { supportingOrigins: 1, conflictingOrigins: 1 },
      "보도 상충",
      2,
    ],
    [
      "② 열린 에피소드가 정리되지 않았으면 보도 상충",
      { supportingOrigins: 2, openEpisode: true },
      "보도 상충",
      2,
    ],
    [
      "③ 활성 상충 없이 명시 정정이면 정정됨",
      { supportingOrigins: 1, explicitCorrection: true },
      "정정됨",
      3,
    ],
    [
      "④ 열린 에피소드가 명시 해소되면 상충 해소",
      { supportingOrigins: 2, openEpisode: true, explicitResolution: true },
      "상충 해소",
      4,
    ],
  ];
  const settledRows: readonly Row[] = [
    [
      "⑤ 원점 둘 이상이 같은 명제를 뒷받침하면 복수 출처 일치",
      { supportingOrigins: 2 },
      "복수 출처 일치",
      5,
    ],
    ["⑥ 원점 하나면 단일 출처", { supportingOrigins: 1 }, "단일 출처", 6],
  ];
  const previousStates = CONTRADICTION_STATUSES;
  const previousWithoutOpenEpisode = CONTRADICTION_STATUSES.filter((s) => s !== "보도 상충");
  for (const [label, patch, expected, guard] of rows) {
    it.each(previousStates)(`${label} (이전 상태 %s)`, (previous) => {
      expect(deriveClaimStatus({ ...base, ...patch, previous })).toEqual({
        publish: true,
        status: expected,
        guard,
      });
    });
  }
  for (const [label, patch, expected, guard] of settledRows) {
    it.each(previousWithoutOpenEpisode)(`${label} (이전 상태 %s)`, (previous) => {
      expect(deriveClaimStatus({ ...base, ...patch, previous })).toEqual({
        publish: true,
        status: expected,
        guard,
      });
    });
  }
  it("이전 상태 보도 상충은 명시 정리 없이는 ⑤·⑥으로 내려가지 않는다(에피소드 보존)", () => {
    expect(deriveClaimStatus({ ...base, previous: "보도 상충", supportingOrigins: 2 })).toEqual({
      publish: true,
      status: "보도 상충",
      guard: 2,
    });
    expect(deriveClaimStatus({ ...base, previous: "보도 상충", supportingOrigins: 1 })).toEqual({
      publish: true,
      status: "보도 상충",
      guard: 2,
    });
  });
  it("첫 개정판(이전 상태 없음)에서도 같은 표가 성립한다", () => {
    expect(deriveClaimStatus({ ...base, supportingOrigins: 1, conflictingOrigins: 1 })).toEqual({
      publish: true,
      status: "보도 상충",
      guard: 2,
    });
    expect(deriveClaimStatus({ ...base, supportingOrigins: 2 })).toEqual({
      publish: true,
      status: "복수 출처 일치",
      guard: 5,
    });
  });
});

describe("deriveClaimStatus 재개·우선순위", () => {
  it("정정됨 → 보도 상충: 새 양립 불가 원점이 나타나면 재개된다", () => {
    expect(
      deriveClaimStatus({
        ...base,
        previous: "정정됨",
        supportingOrigins: 1,
        conflictingOrigins: 1,
      }),
    ).toMatchObject({ status: "보도 상충" });
  });
  it("상충 해소 → 보도 상충: 새 양립 불가 원점이 나타나면 재개된다", () => {
    expect(
      deriveClaimStatus({
        ...base,
        previous: "상충 해소",
        supportingOrigins: 2,
        conflictingOrigins: 1,
      }),
    ).toMatchObject({ status: "보도 상충" });
  });
  it("②가 ③④보다 앞선다 — 정정·해소가 있어도 현재 양립 불가면 보도 상충", () => {
    expect(
      deriveClaimStatus({
        ...base,
        conflictingOrigins: 1,
        explicitCorrection: true,
        explicitResolution: true,
      }),
    ).toMatchObject({ status: "보도 상충", guard: 2 });
  });
  it("③이 ④보다 앞선다 — 정정과 해소가 함께 오면 정정됨", () => {
    expect(
      deriveClaimStatus({
        ...base,
        openEpisode: true,
        explicitCorrection: true,
        explicitResolution: true,
      }),
    ).toMatchObject({ status: "정정됨", guard: 3 });
  });
  it("④는 정리할 에피소드가 있을 때만 — 에피소드 없이 해소 라벨만 오면 ⑤⑥", () => {
    expect(
      deriveClaimStatus({ ...base, supportingOrigins: 2, explicitResolution: true }),
    ).toMatchObject({ status: "복수 출처 일치", guard: 5 });
  });
  it("④는 이전 상태가 보도 상충이면 열린 에피소드로 본다", () => {
    expect(
      deriveClaimStatus({
        ...base,
        previous: "보도 상충",
        supportingOrigins: 2,
        explicitResolution: true,
      }),
    ).toMatchObject({ status: "상충 해소", guard: 4 });
  });
  it("침묵은 에피소드를 닫지 않는다 — 반대편 근거가 사라져도 에피소드가 열려 있으면 보도 상충", () => {
    expect(
      deriveClaimStatus({
        ...base,
        previous: "보도 상충",
        supportingOrigins: 1,
        conflictingOrigins: 0,
        openEpisode: true,
      }),
    ).toMatchObject({ status: "보도 상충", guard: 2 });
  });
});
