import {
  type DeletionIdentity,
  purgeDeletionRecords,
  type RuntimeDb,
  retryPendingUnlinks,
  type UnlinkRetryReport,
} from "@newsplatform/db";
import type { UnlinkResult } from "@newsplatform/domain";

/**
 * 계정 삭제의 연결 해제 재시도 잡(스펙 "계정", #106). pg-boss 큐 `account-unlink`가 매분 돌며 다음 시도 시각이 된
 * 삭제 대기 행만 시도한다(간격 1분·5분·30분, 이후 매시는 행의 `next_attempt_at`이 정한다). 같은 잡에서 백업 보관 기간(90일)이
 * 지난 삭제 기록을 지운다. 시도하거나 지운 것이 있으면 결과를 구조화 로그(리포트)로 남기고, 요청 뒤 72시간이 지나도
 * 남은 행이 있으면 `result: "warning"`이다.
 */
export const ACCOUNT_UNLINK_QUEUE = "account-unlink";
export const ACCOUNT_UNLINK_CRON = "* * * * *";

export interface AccountUnlinkDeps {
  readonly db: RuntimeDb["db"];
  readonly unlink: (target: DeletionIdentity) => Promise<UnlinkResult>;
  readonly clock: () => Date;
  readonly log: (event: Record<string, unknown>) => void;
}

export type AccountUnlinkReport = UnlinkRetryReport & { readonly purgedRecords: number };

export async function runAccountUnlinkSweep(deps: AccountUnlinkDeps): Promise<AccountUnlinkReport> {
  const now = deps.clock();
  const retry = await retryPendingUnlinks(deps.db, { now, unlink: deps.unlink, clock: deps.clock });
  const purgedRecords = await purgeDeletionRecords(deps.db, now);
  const report = { ...retry, purgedRecords };
  // 매분 도는 잡이라 한 일이 없으면 남기지 않는다. 72시간이 지난 행도 매시 시도되므로 경고는 매시 남는다.
  if (report.attempted > 0 || report.purgedRecords > 0) {
    deps.log({
      stage: "account-unlink",
      result: report.overdue > 0 ? "warning" : "ok",
      ...(report.overdue > 0 ? { warning: "연결 해제가 72시간 안에 끝나지 않았다" } : {}),
      ...report,
    });
  }
  return report;
}
