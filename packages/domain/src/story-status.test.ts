import { describe, expect, it } from "vitest";
import { deriveStoryStatus } from "./story-status.ts";

describe("deriveStoryStatus (#21 범위: 두 경로)", () => {
  it("표시 중인 모든 주장이 복수 출처 일치면 사건도 복수 출처 일치다", () => {
    expect(
      deriveStoryStatus([
        { contradictionStatus: "복수 출처 일치" },
        { contradictionStatus: "복수 출처 일치" },
      ]),
    ).toBe("복수 출처 일치");
  });

  it("하나라도 단일 출처면 사건은 단일 출처다", () => {
    expect(
      deriveStoryStatus([
        { contradictionStatus: "복수 출처 일치" },
        { contradictionStatus: "단일 출처" },
      ]),
    ).toBe("단일 출처");
  });

  it("주장이 없으면 개정판을 발행할 수 없으므로 던진다", () => {
    expect(() => deriveStoryStatus([])).toThrow(/표시할 주장/);
  });

  it.each(["보도 상충", "상충 해소", "정정됨"] as const)(
    "%s 우선순위는 #22 몫이라 던진다",
    (status) => {
      expect(() => deriveStoryStatus([{ contradictionStatus: status }])).toThrow(/#22/);
    },
  );
});
