import { describe, expect, it } from "vitest";
import { deriveClaimStatus } from "./claim-status.ts";
import { countReportingOrigins } from "./reporting-origin.ts";

describe("보도 원점", () => {
  it("서로 다른 출처 둘은 원점 둘이다", () => {
    expect(
      countReportingOrigins([
        { sourceId: "s-1", rightsTier: "본문 처리 + 발췌 표시" },
        { sourceId: "s-2", rightsTier: "본문 처리 + 발췌 표시" },
      ]),
    ).toBe(2);
  });

  it("같은 통신 기사를 전재한 출처들은 원점 하나다", () => {
    expect(
      countReportingOrigins([
        { sourceId: "s-1", wireId: "w-1", rightsTier: "본문 처리 + 발췌 표시" },
        { sourceId: "s-2", wireId: "w-1", rightsTier: "본문 처리 + 발췌 표시" },
      ]),
    ).toBe(1);
  });

  it("링크만 등급은 원점으로 세지 않는다", () => {
    expect(countReportingOrigins([{ sourceId: "s-3", rightsTier: "링크만" }])).toBe(0);
  });
});

describe("deriveClaimStatus", () => {
  it("뒷받침 일치인 원점 둘 이상이면 복수 출처 일치다", () => {
    expect(deriveClaimStatus({ supportingOrigins: 2, undeterminable: false })).toBe(
      "복수 출처 일치",
    );
  });

  it("원점 하나면 단일 출처다", () => {
    expect(deriveClaimStatus({ supportingOrigins: 1, undeterminable: false })).toBe("단일 출처");
  });

  it("원점 0은 발행할 수 없으므로 던진다", () => {
    expect(() => deriveClaimStatus({ supportingOrigins: 0, undeterminable: false })).toThrow(
      /독립 원점/,
    );
  });

  it("판정 불가가 있으면 원점이 충분해도 던진다", () => {
    expect(() => deriveClaimStatus({ supportingOrigins: 2, undeterminable: true })).toThrow(
      /판정 불가/,
    );
  });
});
