import { createRuntimeDb } from "@newsplatform/db";
import { createOpenAiEmbeddingClient, createOpenAiModelClient } from "@newsplatform/pipeline";
import { pipelineDailyBudget } from "../src/budget.ts";
import { createCacheInvalidator } from "../src/revalidate.ts";
import { runBatchSlot } from "../src/run-batch-slot.ts";

/**
 * 수동 배치 명령(#55 수동 스모크): 스케줄러 없이 슬롯 하나의 배치를 그대로 돈다(원장·리스·예산 포함).
 * 결과 줄에 소요·비용·처리 수를 남긴다. 키 값은 출력하지 않는다.
 *
 * 실행: pnpm --filter @newsplatform/worker batch:run <슬롯 키> [--skip-collect]
 * (예 2026-09-27T17:00+09:00. DATABASE_MIGRATION_URL·OPENAI_API_KEY 필수, 수집하면 GNEWS_API_KEY도.
 * WEB_REVALIDATE_URL·REVALIDATE_SECRET이 있으면 발행 뒤 캐시를 무효화한다. 일일 예산은 워커와 같이
 * PIPELINE_DAILY_BUDGET_USD로 덮어쓴다.)
 */
const url = process.env.DATABASE_MIGRATION_URL;
const openAiKey = process.env.OPENAI_API_KEY;
const gnewsKey = process.env.GNEWS_API_KEY;
const slotKey = process.argv[2];
const skipCollect = process.argv.includes("--skip-collect");
if (!url || !openAiKey || (!skipCollect && !gnewsKey) || !slotKey) {
  console.error(
    "사용법: batch:run <슬롯 키> [--skip-collect]. DATABASE_MIGRATION_URL·OPENAI_API_KEY(수집 시 GNEWS_API_KEY)이(가) 필요하다. .env.example을 참고해 설정한다.",
  );
  process.exit(1);
}

// 잘못된 예산 값이면 DB에 붙기 전에 던진다.
const dailyBudget = pipelineDailyBudget(process.env);
const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const invalidateCache = createCacheInvalidator(process.env);
  const result = await runBatchSlot(
    { slotKey },
    {
      db,
      ...(skipCollect || !gnewsKey ? {} : { gnews: { fetch, apiKey: gnewsKey } }),
      embeddingClient: createOpenAiEmbeddingClient({ apiKey: openAiKey }),
      modelClient: createOpenAiModelClient({ apiKey: openAiKey }),
      clock: () => new Date(),
      dailyBudget,
      ...(invalidateCache === undefined ? {} : { invalidateCache }),
    },
  );
  if (result.kind === "skipped") {
    console.log(JSON.stringify({ slotKey, skipped: result.reason }));
  } else {
    const { report } = result;
    console.log(
      JSON.stringify({
        slotKey,
        durationMs: report.durationMs,
        published: report.published,
        confirmed: report.confirmed,
        deferred: report.deferred,
        failed: report.failed,
        spend: report.spend,
        pipelineUsage: report.pipeline.usage,
        failures: report.pipeline.failures,
        publishFailures: report.publishFailures,
      }),
    );
  }
} catch (error) {
  console.error(JSON.stringify({ batch: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
