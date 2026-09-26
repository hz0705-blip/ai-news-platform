import { describe, expect, it } from "vitest";
import { claimAnchorId, claimEvidenceId, claimHref, parseClaimHash } from "./claim-anchor.ts";

describe("claim-anchor", () => {
  it("id·href는 화면 번호로 만든다", () => {
    expect(claimAnchorId(2)).toBe("claim-2");
    expect(claimEvidenceId(2)).toBe("claim-2-evidence");
    expect(claimHref(2)).toBe("#claim-2");
  });
  it("해시를 주장 번호로 읽는다", () => {
    expect(parseClaimHash("#claim-1")).toBe(1);
    expect(parseClaimHash("#claim-12")).toBe(12);
    expect(parseClaimHash("")).toBeUndefined();
    expect(parseClaimHash("#claims")).toBeUndefined();
    expect(parseClaimHash("#claim-2-evidence")).toBeUndefined();
    expect(parseClaimHash("#claim-0")).toBeUndefined();
    expect(parseClaimHash("#claim-01")).toBeUndefined();
  });
});
