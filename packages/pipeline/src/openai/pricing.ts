/**
 * 모델별 단가표와 토큰 계량(스펙 "개발 중 결정 항목" 단계별 모델·Batch API·토큰 계량).
 * 단가는 OpenAI 가격표 실측(2026-09-27, `gpt-5`는 2026-09-30 골든셋 초안 상위 모델 #147), USD / 1M 토큰.
 */
export const MODEL_PRICES = {
  "gpt-5-2025-08-07": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5-mini-2025-08-07": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano-2025-08-07": { input: 0.05, cachedInput: 0.005, output: 0.4 },
} as const;

export type PricedModel = keyof typeof MODEL_PRICES;

/** 응답 `usage`에서 계량에 쓰는 세 값. 캐시 입력은 입력 토큰에 포함된 수다. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
}

const PER_TOKEN = 1 / 1_000_000;

/** 사용량 → USD. 캐시 입력은 캐시 단가, 나머지 입력은 입력 단가, 출력(추론 포함)은 출력 단가. */
export function usageToUsd(model: PricedModel, usage: TokenUsage): number {
  const price = MODEL_PRICES[model];
  const uncached = usage.inputTokens - usage.cachedInputTokens;
  return (
    (uncached * price.input +
      usage.cachedInputTokens * price.cachedInput +
      usage.outputTokens * price.output) *
    PER_TOKEN
  );
}

/**
 * 입력 토큰 추정: UTF-16 길이 ÷ 3 올림. 영어는 약 4자/토큰이므로 넉넉하게 잡는 쪽이다
 * (예약은 실제보다 작으면 안 된다).
 */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * 호출 전 예약액: 입력 추정 × 입력 단가 + 최대 출력 토큰 × 출력 단가(캐시 할인 없음).
 * 일일 예산을 넘는 호출을 막는 것은 호출하는 쪽(#55)이다.
 */
export function reservationUsd(
  model: PricedModel,
  inputText: string,
  maxOutputTokens: number,
): number {
  const price = MODEL_PRICES[model];
  return (
    (estimateInputTokens(inputText) * price.input + maxOutputTokens * price.output) * PER_TOKEN
  );
}
