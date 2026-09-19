import { describe, expect, it } from "vitest";
import { CONTRADICTION_STATUSES } from "./contradiction-status.ts";

describe("CONTRADICTION_STATUSES", () => {
  it("상충 상태 5종을 CONTEXT.md 순서와 문자열 그대로 담는다", () => {
    expect(CONTRADICTION_STATUSES).toEqual([
      "단일 출처",
      "복수 출처 일치",
      "보도 상충",
      "상충 해소",
      "정정됨",
    ]);
  });

  it("중복 없이 정확히 5개다", () => {
    expect(new Set(CONTRADICTION_STATUSES).size).toBe(5);
  });
});
