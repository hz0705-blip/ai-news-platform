import { applyRetention, type RetentionReport, type RuntimeDb } from "@newstrail/db";
import type { PgBoss } from "pg-boss";

/**
 * 보존 정책 잡(#144, 스펙 "데이터 보존"): pg-boss 큐 `retention`이 매시 23분에 돌며 보존 기한이 지난 기사 본문을
 * 한 번에 `RETENTION_BATCH_LIMIT`행까지 지우고(나머지는 다음 실행), 종료 사건 기사의 임베딩을 지운다.
 * 지운 것이 있을 때만 개수를 남긴다(본문·식별자는 남기지 않는다).
 */
export const RETENTION_QUEUE = "retention";
export const RETENTION_CRON = "23 * * * *";
export const RETENTION_BATCH_LIMIT = 1000;

export async function runRetention(deps: {
  readonly db: RuntimeDb["db"];
  readonly clock: () => Date;
  readonly log: (event: Record<string, unknown>) => void;
  readonly limit?: number;
}): Promise<RetentionReport> {
  const report = await applyRetention(deps.db, {
    now: deps.clock(),
    limit: deps.limit ?? RETENTION_BATCH_LIMIT,
  });
  if (report.bodiesDeleted > 0 || report.embeddingsCleared > 0) {
    deps.log({ stage: "retention", result: "ok", ...report });
  }
  return report;
}

/** 큐(하나만 대기·실행, 재시도 없음 — 다음 시각에 다시 돈다)·크론·워커를 등록한다. */
export async function scheduleRetention(
  boss: Pick<PgBoss, "getQueue" | "createQueue" | "schedule" | "work">,
  run: () => Promise<unknown>,
): Promise<void> {
  if ((await boss.getQueue(RETENTION_QUEUE)) === null) {
    await boss.createQueue(RETENTION_QUEUE, { policy: "exclusive", retryLimit: 0 });
  }
  await boss.schedule(RETENTION_QUEUE, RETENTION_CRON, {}, { missed: "skip" });
  await boss.work(RETENTION_QUEUE, { batchSize: 1 }, async () => {
    await run();
  });
}
