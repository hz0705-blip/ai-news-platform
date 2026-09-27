import { describe, expect, it } from "vitest";
import { estimateInputTokens, reservationUsd, usageToUsd } from "./pricing.ts";

describe("토큰 계량", () => {
  it("사용량을 USD로 바꾸며 캐시 입력은 캐시 단가로 센다", () => {
    // gpt-5-mini: 입력 $0.25, 캐시 $0.025, 출력 $2.00 /1M
    const usd = usageToUsd("gpt-5-mini-2025-08-07", {
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
      outputTokens: 100_000,
    });
    expect(usd).toBeCloseTo(0.6 * 0.25 + 0.4 * 0.025 + 0.1 * 2.0, 10);
    expect(
      usageToUsd("gpt-5-nano-2025-08-07", {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.45, 10);
  });

  it("호출 전 예약액은 입력 추정 + 최대 출력 토큰이다", () => {
    const text = "a".repeat(3000);
    expect(estimateInputTokens(text)).toBe(1000);
    expect(reservationUsd("gpt-5-mini-2025-08-07", text, 6000)).toBeCloseTo(
      (1000 * 0.25 + 6000 * 2.0) / 1_000_000,
      12,
    );
  });
});
