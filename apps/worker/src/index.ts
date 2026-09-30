import { createRuntimeDb } from "@newsplatform/db";
import { createOpenAiEmbeddingClient, createOpenAiModelClient } from "@newsplatform/pipeline";
import { createProviderUnlinker } from "@newsplatform/pipeline/provider-unlink";
import { runAccountUnlinkSweep } from "./account-unlink.ts";
import { pipelineDailyBudget } from "./budget.ts";
import { runRequestCounterPurge } from "./request-counters.ts";
import { runRetention } from "./retention.ts";
import { createCacheInvalidator } from "./revalidate.ts";
import { runBatchSlot } from "./run-batch-slot.ts";
import { startScheduler } from "./schedule.ts";
import { createShutdown } from "./shutdown.ts";

/**
 * 워커 데몬(#55): pg-boss 스케줄(KST 05:00·17:00)로 배치를 돌고, 매분 계정 삭제의 연결 해제를 재시도하고(#106),
 * 매시 익명 요청 카운터를 정리하고(#125), 매시 보존 기한이 지난 기사 본문과 종료 사건의 기사 임베딩을 지운다(#144).
 * 실행: 배포(Railway)는 저장소 루트에서 `node apps/worker/src/index.ts`(pnpm 래퍼는 SIGTERM 종료를 실패로 보고한다, #66),
 * 로컬은 pnpm --filter @newsplatform/worker start(.env 로드).
 * WORKER_DATABASE_URL(세션 풀러)·OPENAI_API_KEY·GNEWS_API_KEY 필수, WEB_REVALIDATE_URL·REVALIDATE_SECRET·
 * PIPELINE_DAILY_BUDGET_USD(일일 예산 덮어쓰기, 잘못된 값이면 시작 실패)·KAKAO_ADMIN_KEY(Kakao 연결 해제, 없으면 그 행은
 * 완료되지 않고 재시도 로그에 `kakao-admin-key-missing`으로 남는다) 선택.
 */
const log = (event: Record<string, unknown>) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), ...event }));

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`${name}이(가) 설정되지 않았다. .env.example을 참고해 설정한다.`);
    process.exit(1);
  }
  return value;
}

const connectionString = required("WORKER_DATABASE_URL");
const openAiKey = required("OPENAI_API_KEY");
const gnewsKey = required("GNEWS_API_KEY");
let dailyBudget: ReturnType<typeof pipelineDailyBudget>;
try {
  dailyBudget = pipelineDailyBudget(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const { db, sql } = createRuntimeDb({ DATABASE_URL: connectionString });
const invalidateCache = createCacheInvalidator(process.env);
const unlink = createProviderUnlinker({ fetch, kakaoAdminKey: process.env.KAKAO_ADMIN_KEY });
const boss = await startScheduler({
  connectionString,
  db,
  clock: () => new Date(),
  log,
  sweepAccounts: () => runAccountUnlinkSweep({ db, unlink, clock: () => new Date(), log }),
  purgeRequestCounters: () => runRequestCounterPurge({ db, clock: () => new Date(), log }),
  applyRetention: () => runRetention({ db, clock: () => new Date(), log }),
  run: (slotKey) =>
    runBatchSlot(
      { slotKey },
      {
        db,
        gnews: { fetch, apiKey: gnewsKey },
        gdelt: { fetch },
        embeddingClient: createOpenAiEmbeddingClient({ apiKey: openAiKey }),
        modelClient: createOpenAiModelClient({ apiKey: openAiKey }),
        clock: () => new Date(),
        dailyBudget,
        ...(invalidateCache === undefined ? {} : { invalidateCache }),
        log,
      },
    ),
});
log({ stage: "worker", result: "started", dailyBudgetUsd: dailyBudget.spend });

const shutdown = createShutdown({ boss, sql, log, exit: (code) => process.exit(code) });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => void shutdown(signal));
