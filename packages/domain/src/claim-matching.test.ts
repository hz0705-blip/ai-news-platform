import { describe, expect, it } from "vitest";
import type { ClaimType } from "./claim.ts";
import { classifyMatch, continuityScore, matchClaims } from "./claim-matching.ts";

type Span = readonly [version: string, start: number, end: number];

const claim = (id: string, spans: readonly Span[], claimType: ClaimType = "보도된 사실") => ({
  id,
  claimType,
  evidence: spans.map(([articleVersionId, start, end]) => ({
    articleVersionId,
    span: { start, end },
  })),
});

const full = (id: string, spans: readonly Span[], text = "문장") => ({
  ...claim(id, spans),
  text,
  modality: "단정" as const,
});

describe("matchClaims (스펙 주장 매칭, #85)", () => {
  it("matchClaims keeps id for identical evidence", () => {
    const previous = [claim("s:c-1", [["av-a", 0, 60]]), claim("s:c-2", [["av-a", 100, 160]])];
    const next = [claim("new-2", [["av-a", 100, 160]]), claim("new-1", [["av-a", 0, 60]])];
    expect(matchClaims(previous, next)).toEqual([{ previousId: "s:c-2" }, { previousId: "s:c-1" }]);
  });

  it("겹침이 임계(0.5) 미만이면 연속이 아니고 계보도 없다", () => {
    // 교집합 30, 합집합 90 → 1/3
    const result = matchClaims(
      [claim("s:c-1", [["av-a", 0, 60]])],
      [claim("n", [["av-a", 30, 90]])],
    );
    expect(result).toEqual([{}]);
  });

  it("insufficient margin holds and assigns new id with lineage", () => {
    // 이전 주장 하나에 새 주장 둘이 같은 점수로 걸린다(마진 0 < 0.1).
    const previous = [claim("s:c-1", [["av-a", 0, 60]])];
    const next = [claim("n-1", [["av-a", 0, 60]]), claim("n-2", [["av-a", 0, 60]])];
    expect(matchClaims(previous, next)).toEqual([{ lineageOf: "s:c-1" }, { lineageOf: "s:c-1" }]);
  });

  it("마진이 충분하면 높은 쪽을 잇는다", () => {
    const previous = [claim("s:c-1", [["av-a", 0, 100]])];
    // 1.0 대 0.6 → 마진 0.4
    const next = [claim("n-1", [["av-a", 0, 100]]), claim("n-2", [["av-a", 0, 60]])];
    expect(matchClaims(previous, next)).toEqual([{ previousId: "s:c-1" }, { lineageOf: "s:c-1" }]);
  });

  it("short anchor continues only with a single candidate", () => {
    const previous = [claim("s:c-1", [["av-a", 0, 15]])];
    expect(matchClaims(previous, [claim("n-1", [["av-a", 0, 15]])])).toEqual([
      { previousId: "s:c-1" },
    ]);
    // 같은 짧은 구간에 새 주장이 둘이면 어느 쪽도 잇지 않는다.
    expect(
      matchClaims(previous, [claim("n-1", [["av-a", 0, 15]]), claim("n-2", [["av-a", 0, 12]])]),
    ).toEqual([{ lineageOf: "s:c-1" }, { lineageOf: "s:c-1" }]);
  });

  it("different claim type is not a candidate", () => {
    const result = matchClaims(
      [claim("s:c-1", [["av-a", 0, 60]], "귀속 입장")],
      [claim("n", [["av-a", 0, 60]], "보도된 사실")],
    );
    expect(result).toEqual([{}]);
  });

  it("added source does not dilute continuity", () => {
    const previous = claim("s:c-1", [["av-a", 0, 60]]);
    const next = claim("n", [
      ["av-a", 0, 60],
      ["av-b", 0, 200],
    ]);
    expect(continuityScore(previous, next)).toEqual({ score: 1, anchor: 60 });
    expect(matchClaims([previous], [next])).toEqual([{ previousId: "s:c-1" }]);
  });

  it("기사 버전이 다르면 겹침은 0이다(좌표 정렬은 #86)", () => {
    expect(continuityScore(claim("p", [["av-a1", 0, 60]]), claim("n", [["av-a2", 0, 60]]))).toEqual(
      { score: 0, anchor: 0 },
    );
  });
});

describe("classifyMatch", () => {
  it("같은 근거·같은 문장은 불변", () => {
    expect(classifyMatch(full("a", [["v", 0, 10]]), full("a", [["v", 0, 10]]))).toBe("불변");
  });
  it("wording-only change is not a change", () => {
    expect(classifyMatch(full("a", [["v", 0, 10]], "가"), full("a", [["v", 0, 10]], "나"))).toBe(
      "표현만 변경",
    );
  });
  it("evidence swap is a substantive change", () => {
    expect(
      classifyMatch(
        full("a", [
          ["v", 0, 10],
          ["w", 0, 10],
        ]),
        full("a", [
          ["v", 0, 10],
          ["w", 20, 30],
        ]),
      ),
    ).toBe("실질 변경");
  });
  it("양상이 다르면 실질 변경", () => {
    expect(
      classifyMatch(full("a", [["v", 0, 10]]), { ...full("a", [["v", 0, 10]]), modality: "의혹" }),
    ).toBe("실질 변경");
  });
});
