import { describe, expect, it } from "vitest";
import { countClaimStatuses, deriveStoryStatus } from "./story-status.ts";

const c = (
  contradictionStatus: Parameters<typeof deriveStoryStatus>[0][number]["contradictionStatus"],
) => ({
  contradictionStatus,
});

describe("deriveStoryStatus 사건 파생 5단계(스펙 133행)", () => {
  it("1. 보도 상충 주장이 있으면 보도 상충 — 정정됨·상충 해소가 함께 있어도", () => {
    expect(deriveStoryStatus([c("정정됨"), c("보도 상충"), c("복수 출처 일치")])).toBe("보도 상충");
    expect(deriveStoryStatus([c("상충 해소"), c("보도 상충")])).toBe("보도 상충");
  });
  it("1'. 현재 주장에 없어도 열린 에피소드가 있으면 보도 상충", () => {
    expect(deriveStoryStatus([c("복수 출처 일치"), c("복수 출처 일치")], 1)).toBe("보도 상충");
  });
  it("2. 열린 에피소드 없이 정정됨이 있으면 정정됨", () => {
    expect(deriveStoryStatus([c("복수 출처 일치"), c("정정됨"), c("상충 해소")])).toBe("정정됨");
  });
  it("3. 정정됨 없이 상충 해소가 있으면 상충 해소", () => {
    expect(deriveStoryStatus([c("단일 출처"), c("상충 해소")])).toBe("상충 해소");
  });
  it("4. 표시 주장이 모두 원점 둘 이상이면 복수 출처 일치", () => {
    expect(deriveStoryStatus([c("복수 출처 일치"), c("복수 출처 일치")])).toBe("복수 출처 일치");
  });
  it("5. 하나라도 단일 출처면 단일 출처", () => {
    expect(deriveStoryStatus([c("복수 출처 일치"), c("단일 출처")])).toBe("단일 출처");
    expect(deriveStoryStatus([c("단일 출처")])).toBe("단일 출처");
  });
  it("표시할 주장이 없으면 던진다(새 개정판을 발행하지 않는다)", () => {
    expect(() => deriveStoryStatus([])).toThrow(/표시할 주장이 없는/);
  });
  it("에피소드 수가 음수면 던진다", () => {
    expect(() => deriveStoryStatus([c("단일 출처")], -1)).toThrow(RangeError);
  });
});

describe("countClaimStatuses", () => {
  it("다섯 상태 모두 키를 갖고 0을 포함한다", () => {
    expect(countClaimStatuses([c("보도 상충"), c("복수 출처 일치"), c("복수 출처 일치")])).toEqual({
      "단일 출처": 0,
      "복수 출처 일치": 2,
      "보도 상충": 1,
      "상충 해소": 0,
      정정됨: 0,
    });
  });
  it("빈 입력은 전부 0", () => {
    expect(Object.values(countClaimStatuses([])).every((n) => n === 0)).toBe(true);
  });
});
