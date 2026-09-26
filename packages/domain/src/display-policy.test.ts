import { describe, expect, it } from "vitest";
import { canDisplayExcerpt } from "./display-policy.ts";
import { RIGHTS_TIERS } from "./rights.ts";

describe("canDisplayExcerpt", () => {
  it("본문 처리 + 발췌 표시 등급만 발췌를 보일 수 있다", () => {
    expect(canDisplayExcerpt("본문 처리 + 발췌 표시")).toBe(true);
    expect(canDisplayExcerpt("링크만")).toBe(false);
  });
  it("모든 권리 등급에 답이 있다", () => {
    for (const tier of RIGHTS_TIERS) expect(typeof canDisplayExcerpt(tier)).toBe("boolean");
  });
});
