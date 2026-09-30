import type { Budget } from "@newstrail/pipeline";

/** 파이프라인 일일 예산(USD; 스펙 "개발 중 결정 항목" 토큰 계량). 시도가 실제로 도는 KST 날짜의 모든 실행이 나눠 쓴다. */
export const DAILY_PIPELINE_BUDGET_USD = 1.2;
/** 토큰 상한은 USD 상한의 보조다(gpt-5-mini 출력 단가 기준 $1.20 ≈ 60만 출력 토큰). */
export const DAILY_PIPELINE_BUDGET_TOKENS = 2_000_000;
/** 일일 예산을 덮어쓰는 환경변수(출시 전 개발 값, 스펙 "개발 중 결정 항목"). */
export const PIPELINE_DAILY_BUDGET_ENV = "PIPELINE_DAILY_BUDGET_USD";

/**
 * 환경변수에서 일일 예산을 정한다(#64). 없거나 비었으면 스펙 값 $1.20, 있으면 양의 소수여야 하며
 * 아니면 던진다(워커 시작 실패 — 조용히 기본값으로 가지 않는다). 토큰 상한은 USD 상한에 비례해 줄인다.
 */
export function pipelineDailyBudget(env: Readonly<Record<string, string | undefined>>): Budget {
  const raw = env[PIPELINE_DAILY_BUDGET_ENV];
  if (raw === undefined || raw === "") {
    return { spend: DAILY_PIPELINE_BUDGET_USD, tokens: DAILY_PIPELINE_BUDGET_TOKENS };
  }
  const usd = /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : Number.NaN;
  if (!(usd > 0)) {
    throw new Error(
      `${PIPELINE_DAILY_BUDGET_ENV}은(는) 양의 소수여야 한다: ${JSON.stringify(raw)}`,
    );
  }
  return {
    spend: usd,
    tokens: Math.ceil((DAILY_PIPELINE_BUDGET_TOKENS * usd) / DAILY_PIPELINE_BUDGET_USD),
  };
}
