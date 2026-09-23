import { describe, expect, it } from "vitest";
import { findSpan, spanText, toUtf16Range } from "./span.ts";

// 보조 평면(이모지)은 UTF-16에서 2단위, 코드 포인트로는 1이다.
const body = "A 🇰🇷 flag. Café opens.";

describe("spanText", () => {
  it("코드 포인트 반개구간으로 자른다", () => {
    expect(spanText("abcde", { start: 1, end: 3 })).toBe("bc");
  });

  it("보조 평면 문자를 쪼개지 않는다", () => {
    const span = findSpan(body, "🇰🇷");
    expect(span).toBeDefined();
    expect(spanText(body, span as { start: number; end: number })).toBe("🇰🇷");
  });
});

describe("toUtf16Range", () => {
  it("보조 평면 앞뒤에서 UTF-16 인덱스로 옮긴다", () => {
    const span = findSpan(body, "flag");
    expect(span).toBeDefined();
    const utf16 = toUtf16Range(body, span as { start: number; end: number });
    expect(body.slice(utf16.start, utf16.end)).toBe("flag");
    expect(utf16.start).toBeGreaterThan((span as { start: number }).start);
  });

  it("결합 문자를 포함한 구간도 같은 문자열을 준다", () => {
    const span = findSpan(body, "Café");
    expect(span).toBeDefined();
    const utf16 = toUtf16Range(body, span as { start: number; end: number });
    expect(body.slice(utf16.start, utf16.end)).toBe("Café");
  });
});
