import { loadBatchRunsSince, type RuntimeDb } from "@newstrail/db";
import { latestSlotAtOrBefore, missedSlots, slotKeyOf } from "@newstrail/domain/batch-slot";
import { PgBoss } from "pg-boss";
import { ACCOUNT_UNLINK_CRON, ACCOUNT_UNLINK_QUEUE } from "./account-unlink.ts";
import { REQUEST_COUNTER_PURGE_CRON, REQUEST_COUNTER_PURGE_QUEUE } from "./request-counters.ts";
import { scheduleRetention } from "./retention.ts";

/** 배치 잡 큐(스펙 "배포와 운영" 스케줄러: pg-boss가 유일한 스케줄 권한). */
export const BATCH_QUEUE = "batch";
/** 재시도를 소진한 배치 잡이 가는 데드레터 큐. */
export const BATCH_DEAD_LETTER_QUEUE = "batch-dead-letter";
export const BATCH_CRON = "0 5,17 * * *";
export const BATCH_TIMEZONE = "Asia/Seoul";
/** 활성 잡 만료 90분. */
export const BATCH_JOB_EXPIRE_SECONDS = 90 * 60;
/** 재시도 2회, 백오프(5분·10분). */
export const BATCH_RETRY_LIMIT = 2;
export const BATCH_RETRY_DELAY_SECONDS = 5 * 60;
/** 워커 시작 시 되돌아보는 누락 슬롯 기간. */
export const MISSED_SLOT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** pg-boss 스키마. 워커 시작(`boss.start()`)이 만든다 — 요청 핸들러가 아니다. */
export const PGBOSS_SCHEMA = "pgboss";

export interface BatchJobData {
  /** 회복·수동 잡은 슬롯을 지정한다. 크론 잡은 비어 있고 잡 시작 시각의 직전 슬롯으로 정한다. */
  readonly slotKey?: string;
}

/** 되돌아보는 기간 안에서 원장이 완료로 갖지 않은 슬롯 키(오름차순). */
export async function findMissedSlotKeys(
  db: RuntimeDb["db"],
  input: { readonly now: Date; readonly lookbackMs?: number },
): Promise<string[]> {
  const lookbackMs = input.lookbackMs ?? MISSED_SLOT_LOOKBACK_MS;
  const rows = await loadBatchRunsSince(db, new Date(input.now.getTime() - lookbackMs));
  return missedSlots({
    now: input.now,
    lookbackMs,
    completedSlotKeys: new Set(rows.filter((r) => r.status === "completed").map((r) => r.slot_key)),
  });
}

export interface SchedulerOptions {
  readonly connectionString: string;
  readonly db: RuntimeDb["db"];
  readonly run: (slotKey: string) => Promise<unknown>;
  /** 계정 삭제의 연결 해제 재시도(account-unlink.ts). 매분 한 번, 한 번에 하나만 돈다. */
  readonly sweepAccounts: () => Promise<unknown>;
  /** 익명 요청 카운터 정리(request-counters.ts). 매시 한 번, 한 번에 하나만 돈다. */
  readonly purgeRequestCounters: () => Promise<unknown>;
  /** 보존 정책(retention.ts). 매시 한 번, 한 번에 하나만 돈다. */
  readonly applyRetention: () => Promise<unknown>;
  readonly clock: () => Date;
  readonly log: (event: Record<string, unknown>) => void;
}

/**
 * pg-boss를 시작하고 큐·크론·워커를 등록한 뒤 누락 슬롯을 회복한다.
 * 잡 하나 = 슬롯 하나. 같은 슬롯은 `singletonKey`로 한 번만 큐에 들어가고, 원장이 다시 한 번 멱등을 보장한다.
 */
export async function startScheduler(options: SchedulerOptions): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: PGBOSS_SCHEMA,
    max: 2,
    application_name: "newsplatform-worker",
  });
  boss.on("error", (error) =>
    options.log({ stage: "pg-boss", result: "error", error: String(error) }),
  );
  await boss.start();

  if ((await boss.getQueue(BATCH_DEAD_LETTER_QUEUE)) === null) {
    await boss.createQueue(BATCH_DEAD_LETTER_QUEUE);
  }
  if ((await boss.getQueue(BATCH_QUEUE)) === null) {
    await boss.createQueue(BATCH_QUEUE, {
      expireInSeconds: BATCH_JOB_EXPIRE_SECONDS,
      retryLimit: BATCH_RETRY_LIMIT,
      retryDelay: BATCH_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      deadLetter: BATCH_DEAD_LETTER_QUEUE,
    });
  }
  // 누락 슬롯은 아래 원장 기반 회복이 맡으므로 pg-boss의 자체 보충은 끈다.
  await boss.schedule(BATCH_QUEUE, BATCH_CRON, {}, { tz: BATCH_TIMEZONE, missed: "skip" });

  await boss.work<BatchJobData>(BATCH_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const slotKey = job.data.slotKey ?? slotKeyOf(latestSlotAtOrBefore(options.clock()));
      options.log({ stage: "job", jobId: job.id, slotKey });
      await options.run(slotKey);
    }
  });

  // 연결 해제 재시도: 큐에 하나·실행 하나만(exclusive) 두어 앞 잡이 길어져도 겹치지 않는다. 실패는 다음 분에 다시 돈다.
  if ((await boss.getQueue(ACCOUNT_UNLINK_QUEUE)) === null) {
    await boss.createQueue(ACCOUNT_UNLINK_QUEUE, { policy: "exclusive", retryLimit: 0 });
  }
  await boss.schedule(ACCOUNT_UNLINK_QUEUE, ACCOUNT_UNLINK_CRON, {}, { missed: "skip" });
  await boss.work(ACCOUNT_UNLINK_QUEUE, { batchSize: 1 }, async () => {
    await options.sweepAccounts();
  });

  if ((await boss.getQueue(REQUEST_COUNTER_PURGE_QUEUE)) === null) {
    await boss.createQueue(REQUEST_COUNTER_PURGE_QUEUE, { policy: "exclusive", retryLimit: 0 });
  }
  await boss.schedule(
    REQUEST_COUNTER_PURGE_QUEUE,
    REQUEST_COUNTER_PURGE_CRON,
    {},
    { missed: "skip" },
  );
  await boss.work(REQUEST_COUNTER_PURGE_QUEUE, { batchSize: 1 }, async () => {
    await options.purgeRequestCounters();
  });

  await scheduleRetention(boss, options.applyRetention);

  for (const slotKey of await findMissedSlotKeys(options.db, { now: options.clock() })) {
    const jobId = await boss.send(BATCH_QUEUE, { slotKey } satisfies BatchJobData, {
      singletonKey: slotKey,
    });
    options.log({
      stage: "recover",
      slotKey,
      jobId,
      result: jobId === null ? "queued-already" : "queued",
    });
  }
  return boss;
}
