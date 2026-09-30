import { purgeRequestCounters, type RuntimeDb } from "@newstrail/db";

/**
 * 익명 요청 남용 방지 카운터 정리 잡(#125, 스펙 "배치와 비용"·"데이터 보존": 카운터는 48시간 안에 지운다).
 * pg-boss 큐 `request-counter-purge`가 매시 돌며 창이 끝난 카운터와 만료된 동시 행을 지운다. 창은 24시간 이하라
 * 모든 카운터 행은 만든 뒤 25시간 안에 지워진다. 지운 것이 있을 때만 개수를 남긴다(키는 남기지 않는다).
 */
export const REQUEST_COUNTER_PURGE_QUEUE = "request-counter-purge";
export const REQUEST_COUNTER_PURGE_CRON = "7 * * * *";

export async function runRequestCounterPurge(deps: {
  readonly db: RuntimeDb["db"];
  readonly clock: () => Date;
  readonly log: (event: Record<string, unknown>) => void;
}): Promise<void> {
  const report = await purgeRequestCounters(deps.db, deps.clock());
  if (report.counters > 0 || report.leases > 0) {
    deps.log({ stage: "request-counter-purge", result: "ok", ...report });
  }
}
