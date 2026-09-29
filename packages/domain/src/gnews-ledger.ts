/**
 * GNews 요청 원장(docs/spec/v1.md "개발 중 결정 항목" GNews 요청 원장, #86). 일 1,000회 한도는 00:00 UTC에
 * 초기화되므로 UTC 날짜로 센다. 배분은 발견(정규 수집) 약 20회, 원문 재수집 600회 이하, 나머지는 재시도·수동 스모크 여유.
 * 발견은 막지 않고 기록만 하며(배치당 8회 이하가 수집 쪽 상한), 재수집은 몫을 다 쓰면 그날 멈춘다.
 */
export const GNEWS_DAILY_LIMIT = 1000;
export const GNEWS_DISCOVERY_SHARE = 20;
export const GNEWS_RECHECK_SHARE = 600;
/** 재수집 조회 한 번이 쓸 수 있는 최대 요청 수(429·5xx 재시도 1회 포함). */
export const GNEWS_MAX_REQUESTS_PER_LOOKUP = 2;

/** 원장 하루치: UTC 날짜 키(`YYYY-MM-DD`)와 용도별 요청 수. */
export interface GnewsLedgerDay {
  readonly utcDate: string;
  readonly discovery: number;
  readonly recheck: number;
}

/** 요청 시각의 원장 날짜 키(UTC). KST 09:00이 날짜 경계다. */
export function gnewsLedgerDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** 그날 한도에서 남은 요청 수(용도 무관). */
export function gnewsLedgerRemaining(day: GnewsLedgerDay): number {
  return Math.max(0, GNEWS_DAILY_LIMIT - day.discovery - day.recheck);
}

/**
 * 재수집 조회 하나를 시작해도 되는가: 재시도까지 해도 재수집 몫(600)과 일 한도를 넘지 않을 때만.
 * 거짓이면 그날 재수집을 멈춘다.
 */
export function canStartRecheck(day: GnewsLedgerDay): boolean {
  const allowance = Math.min(GNEWS_RECHECK_SHARE - day.recheck, gnewsLedgerRemaining(day));
  return allowance >= GNEWS_MAX_REQUESTS_PER_LOOKUP;
}
