/**
 * 계정 삭제의 연결 해제 재시도 규칙(스펙 "계정" 계정 삭제, #106). 연결 해제가 실패하면 삭제 대기 행으로
 * 1분·5분·30분 뒤, 그 뒤로는 매시 다시 시도하고 72시간 안에 끝낸다. 72시간이 지나도 남은 행은 경고 대상이다.
 * 삭제 기록은 백업 보관 기간 중 긴 쪽(GitHub Actions 아티팩트 90일, Supabase 일일 백업은 7일)이 지나면 지운다.
 */

/** 연결 해제가 필요한 로그인 제공자(스펙 "계정": Kakao·Google). */
export const UNLINK_PROVIDERS = ["kakao", "google"] as const;
export type UnlinkProvider = (typeof UNLINK_PROVIDERS)[number];

export const isUnlinkProvider = (value: string): value is UnlinkProvider =>
  (UNLINK_PROVIDERS as readonly string[]).includes(value);

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** 처음 세 번의 실패 뒤 간격. 그다음부터는 `UNLINK_RETRY_HOURLY_MS`. */
export const UNLINK_RETRY_DELAYS_MS: readonly number[] = [MINUTE_MS, 5 * MINUTE_MS, 30 * MINUTE_MS];
export const UNLINK_RETRY_HOURLY_MS = HOUR_MS;
/** 연결 해제를 끝내야 하는 기한(요청 시각 기준). */
export const UNLINK_DEADLINE_MS = 72 * HOUR_MS;
/** 삭제 기록 보관 기간 = 백업 보관 기간 중 긴 쪽(Actions 아티팩트 90일). */
export const DELETION_RECORD_RETENTION_MS = 90 * 24 * HOUR_MS;

/** `failedAttempts`번째 실패(1부터) 뒤 다음 시도 시각. */
export function nextUnlinkAttemptAt(failedAttempts: number, failedAt: Date): Date {
  const delay = UNLINK_RETRY_DELAYS_MS[failedAttempts - 1] ?? UNLINK_RETRY_HOURLY_MS;
  return new Date(failedAt.getTime() + delay);
}

/** 요청 뒤 72시간이 지났는데 아직 연결 해제가 끝나지 않았는가. */
export function isUnlinkOverdue(requestedAt: Date, now: Date): boolean {
  return now.getTime() - requestedAt.getTime() > UNLINK_DEADLINE_MS;
}

/**
 * 연결 해제 한 번의 결과. `unlinked`·`already-unlinked`만 완료이고 대기 행을 지운다.
 * `retry`(429·5xx·시간 초과·네트워크)와 `rejected`(관리자 키 오류 같은 설정·요청 오류)는 완료가 아니며 행을 남겨 일정대로 다시 한다.
 */
export type UnlinkResult =
  | { readonly outcome: "unlinked" }
  | { readonly outcome: "already-unlinked" }
  | { readonly outcome: "retry"; readonly reason: string }
  | { readonly outcome: "rejected"; readonly reason: string };

export const isUnlinkDone = (result: UnlinkResult): boolean =>
  result.outcome === "unlinked" || result.outcome === "already-unlinked";
