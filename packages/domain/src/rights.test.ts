import { describe, expect, it } from "vitest";
import { canDisplayExcerpt } from "./display-policy.ts";
import { canProcessBody, isLinkOnly, RIGHTS_TIERS, type RightsTier } from "./rights.ts";

describe("권리 등급 술어", () => {
  const table: Record<
    RightsTier,
    { canProcessBody: boolean; canDisplayExcerpt: boolean; isLinkOnly: boolean }
  > = {
    "본문 처리 + 발췌 표시": { canProcessBody: true, canDisplayExcerpt: true, isLinkOnly: false },
    링크만: { canProcessBody: false, canDisplayExcerpt: false, isLinkOnly: true },
  };

  it.each(RIGHTS_TIERS)("%s 등급의 술어 결과가 표와 같다", (tier) => {
    expect({
      canProcessBody: canProcessBody(tier),
      canDisplayExcerpt: canDisplayExcerpt(tier),
      isLinkOnly: isLinkOnly(tier),
    }).toEqual(table[tier]);
  });
});
