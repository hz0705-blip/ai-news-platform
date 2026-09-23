import { describe, expect, it } from "vitest";
import { checkEvidenceSpan } from "./gate-stage1.ts";
import { findSpan, spanText } from "./span.ts";

const body =
  "Ministers agreed on the framework. The deal covers three ports. Talks will resume in October.";

function spanOf(quote: string) {
  const span = findSpan(body, quote);
  if (span === undefined) throw new Error(`픽스처 오류: ${quote}`);
  return span;
}

describe("정합성 게이트 1단계", () => {
  it("한 문장 구간은 통과하고 허용 발췌 창을 함께 준다", () => {
    const result = checkEvidenceSpan({
      body,
      span: spanOf("The deal covers three ports"),
      rightsTier: "본문 처리 + 발췌 표시",
      normalizationVersion: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.excerpt).toBe("The deal covers three ports.");
  });

  it("본문 범위를 벗어난 구간은 '구간 없음'이다", () => {
    const result = checkEvidenceSpan({
      body,
      span: { start: 900, end: 950 },
      rightsTier: "본문 처리 + 발췌 표시",
      normalizationVersion: 1,
    });
    expect(result).toEqual({ ok: false, reason: "구간 없음" });
  });

  it("시작이 끝보다 뒤인 구간도 '구간 없음'이다", () => {
    const result = checkEvidenceSpan({
      body,
      span: { start: 10, end: 5 },
      rightsTier: "본문 처리 + 발췌 표시",
      normalizationVersion: 1,
    });
    expect(result).toEqual({ ok: false, reason: "구간 없음" });
  });

  it("두 문장을 넘는 구간은 '허용 발췌 창 초과'다", () => {
    const span = spanOf(
      "Ministers agreed on the framework. The deal covers three ports. Talks will resume in October.",
    );
    const result = checkEvidenceSpan({
      body,
      span,
      rightsTier: "본문 처리 + 발췌 표시",
      normalizationVersion: 1,
    });
    expect(result).toEqual({ ok: false, reason: "허용 발췌 창 초과" });
  });

  it("링크만 등급은 근거가 될 수 없다", () => {
    const result = checkEvidenceSpan({
      body,
      span: spanOf("The deal covers three ports"),
      rightsTier: "링크만",
      normalizationVersion: 1,
    });
    expect(result).toEqual({ ok: false, reason: "링크만 등급" });
  });

  it("정규화 버전이 다르면 통과시키지 않는다", () => {
    const result = checkEvidenceSpan({
      body,
      span: spanOf("The deal covers three ports"),
      rightsTier: "본문 처리 + 발췌 표시",
      normalizationVersion: 0,
    });
    expect(result).toEqual({ ok: false, reason: "정규화 버전 불일치" });
  });

  it("두 문장에 걸친 구간은 그 둘만 담은 가장 짧은 창을 준다", () => {
    const result = checkEvidenceSpan({
      body,
      span: spanOf("framework. The deal"),
      rightsTier: "본문 처리 + 발췌 표시",
      normalizationVersion: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.excerpt).toBe("Ministers agreed on the framework. The deal covers three ports.");
    expect(result.excerpt).not.toContain("Talks will resume in October.");
  });

  it("발췌 안 강조 구간을 잘라내면 본문 구간의 원문과 같다", () => {
    for (const quote of ["The deal covers three ports", "framework. The deal", "October"]) {
      const span = spanOf(quote);
      const result = checkEvidenceSpan({
        body,
        span,
        rightsTier: "본문 처리 + 발췌 표시",
        normalizationVersion: 1,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(spanText(result.excerpt, result.highlightInExcerpt)).toBe(spanText(body, span));
      expect(spanText(body, result.excerptSpan)).toBe(result.excerpt);
    }
  });
});
