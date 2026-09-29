import { describe, expect, it } from "vitest";
import { findSpan, spanText } from "./span.ts";
import { createSpanAligner } from "./span-realign.ts";

const before =
  "Seoul summoned the ambassador on Monday. The ministry demanded an apology. Officials declined to comment.";

function spanOf(body: string, quote: string) {
  const span = findSpan(body, quote);
  if (span === undefined) throw new Error(`본문에 없다: ${quote}`);
  return span;
}

describe("근거 구간 좌표 정렬", () => {
  it("앞 삽입", () => {
    const after = `Updated: Tuesday.\n${before}`;
    const span = spanOf(before, "The ministry demanded an apology.");
    const result = createSpanAligner(before, after)(span);
    expect(result).toEqual({ ok: true, span: spanOf(after, "The ministry demanded an apology.") });
  });

  it("중간 수정", () => {
    const after = before.replace("on Monday", "late on Monday night");
    const align = createSpanAligner(before, after);
    // 수정 뒤의 구간은 길이 차이만큼 밀리고, 수정 앞의 구간 원문은 그대로다.
    const later = align(spanOf(before, "Officials declined to comment."));
    expect(later.ok && spanText(after, later.span)).toBe("Officials declined to comment.");
    const earlier = align(spanOf(before, "Seoul summoned"));
    expect(earlier).toEqual({ ok: true, span: spanOf(before, "Seoul summoned") });
    // 수정이 구간 안에 있으면 앵커가 남지 않은 것으로 본다.
    expect(align(spanOf(before, "Seoul summoned the ambassador on Monday."))).toEqual({
      ok: false,
      reason: "근거 구간 변경",
    });
  });

  it("근거 삭제는 정렬 실패", () => {
    const after = before.replace(" The ministry demanded an apology.", "");
    const align = createSpanAligner(before, after);
    expect(align(spanOf(before, "The ministry demanded an apology."))).toEqual({
      ok: false,
      reason: "근거 구간 변경",
    });
    const kept = align(spanOf(before, "Officials declined to comment."));
    expect(kept.ok && spanText(after, kept.span)).toBe("Officials declined to comment.");
  });

  it("비BMP 문자 좌표", () => {
    const withEmoji = `🇰🇷 ${before}`;
    const after = `📰 추가 문단 𝒳.\n${withEmoji}`;
    const span = spanOf(withEmoji, "The ministry demanded an apology.");
    const result = createSpanAligner(withEmoji, after)(span);
    // 오프셋은 코드 포인트다: 삽입된 보조 평면 문자 하나가 1칸이다.
    expect(result).toEqual({ ok: true, span: spanOf(after, "The ministry demanded an apology.") });
    expect(result.ok && result.span.start - span.start).toBe([..."📰 추가 문단 𝒳.\n"].length);
  });

  it("편집 거리가 상한을 넘으면 접두·접미 밖의 구간은 정렬 실패", () => {
    const after = before.replace("Seoul", "The capital").replace("comment", "say more");
    const middle = spanOf(before, "The ministry demanded an apology.");
    expect(createSpanAligner(before, after)(middle).ok).toBe(true);
    expect(createSpanAligner(before, after, 5)(middle)).toEqual({
      ok: false,
      reason: "근거 구간 변경",
    });
  });
  it("정렬된 구간의 원문은 항상 이전 구간의 원문과 같다(결정론 편집 표본)", () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    const words = before.split(" ");
    for (let round = 0; round < 50; round++) {
      const edited = [...words];
      for (let e = 0; e < 3; e++) {
        const at = next() % edited.length;
        if (next() % 2 === 0) edited.splice(at, 1);
        else edited.splice(at, 0, `w${next() % 100}`);
      }
      const after = edited.join(" ");
      const align = createSpanAligner(before, after);
      for (const word of words) {
        const span = spanOf(before, word);
        const result = align(span);
        if (result.ok) expect(spanText(after, result.span)).toBe(spanText(before, span));
      }
    }
  });
});
