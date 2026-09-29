import { describe, expect, it } from "vitest";
import type { Claim } from "./claim.ts";
import { openEpisodeClaims } from "./contradiction-episode.ts";
import type { ContradictionStatus } from "./contradiction-status.ts";

const claim = (id: string, contradictionStatus: ContradictionStatus): Claim => ({
  id,
  text: `${id} 문장`,
  claimType: "보도된 사실",
  modality: "단정",
  order: 0,
  contradictionStatus,
  evidence: [],
});

describe("openEpisodeClaims (ADR-0009, #90)", () => {
  it("보도 상충 주장은 명시 정정·해소 전까지 요약에서 빠져도 열린 에피소드다", () => {
    const disputed = claim("s:c-1", "보도 상충");
    const other = claim("s:c-2", "단일 출처");
    // 개정판 1에서 보도 상충, 2·3에서 요약 제외 — 침묵·요약 제외로는 닫히지 않는다.
    const history = [[disputed, other], [other], [other]];
    expect(openEpisodeClaims(history, [other.id])).toEqual([disputed]);
    expect(openEpisodeClaims(history, [other.id])).toHaveLength(1);

    // 현재 주장에 있으면 현재 상태가 정하므로 현재 주장 밖의 에피소드가 아니다.
    expect(openEpisodeClaims(history, [other.id, disputed.id])).toEqual([]);

    // 마지막 기록이 명시 정정(정정됨)·해소(상충 해소)면 닫혔다.
    for (const closed of ["정정됨", "상충 해소"] as const) {
      expect(
        openEpisodeClaims([...history, [claim(disputed.id, closed), other]], [other.id]),
      ).toEqual([]);
    }
  });

  it("주장마다 마지막 기록만 보고 주장 식별자 순으로 돌려준다", () => {
    const history = [
      [claim("s:c-3", "보도 상충"), claim("s:c-1", "단일 출처")],
      [claim("s:c-1", "보도 상충")],
      [claim("s:c-2", "복수 출처 일치")],
    ];
    expect(openEpisodeClaims(history, ["s:c-2"]).map((c) => c.id)).toEqual(["s:c-1", "s:c-3"]);
    expect(openEpisodeClaims([], [])).toEqual([]);
  });
});
