import { describe, expect, it } from "vitest";
import { NORMALIZATION_VERSION, normalizeBody } from "./text.ts";

describe("normalizeBody", () => {
  it("HTML 마크업을 제거하고 텍스트만 남긴다", () => {
    expect(normalizeBody("<p>Ministers <em>agreed</em> today.</p>")).toBe(
      "Ministers agreed today.",
    );
  });

  it("CRLF와 CR을 LF로 바꾼다", () => {
    expect(normalizeBody("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("NFC로 정규화한다 — 결합 문자는 한 코드 포인트가 된다", () => {
    const decomposed = "é"; // e + combining acute
    expect([...normalizeBody(decomposed)]).toHaveLength(1);
    expect(normalizeBody(decomposed)).toBe("é");
  });

  it("앞뒤 공백을 다듬고 세 줄 이상의 빈 줄을 두 줄로 줄인다", () => {
    expect(normalizeBody("  a\n\n\n\nb  ")).toBe("a\n\nb");
  });

  it("정규화 버전은 1이다", () => {
    expect(NORMALIZATION_VERSION).toBe(1);
  });
});
