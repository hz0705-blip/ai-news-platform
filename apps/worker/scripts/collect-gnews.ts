import { createRuntimeDb } from "@newsplatform/db";
import { collectFromGnews } from "../src/collect.ts";

/**
 * 수동 수집 명령(#52 수동 스모크): 실제 GNews 키로 토픽 넷을 수집해 dev DB에 저장한다.
 * 요청은 최대 8회(재시도 제외). 직전 `to`의 보관·스케줄은 #55이므로 인자로 받는다.
 *
 * 실행: pnpm --filter @newsplatform/worker collect:gnews [previousTo ISO] [slotAt ISO]
 * (DATABASE_MIGRATION_URL·GNEWS_API_KEY 필요. 인자 없으면 slotAt = 지금, previousTo = 12시간 전)
 */
const url = process.env.DATABASE_MIGRATION_URL;
const apiKey = process.env.GNEWS_API_KEY;
if (url === undefined || url === "" || apiKey === undefined || apiKey === "") {
  console.error(
    "DATABASE_MIGRATION_URL·GNEWS_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.",
  );
  process.exit(1);
}

const slotAt = process.argv[3] ? new Date(process.argv[3]) : new Date();
const previousTo = process.argv[2]
  ? new Date(process.argv[2])
  : new Date(slotAt.getTime() - 12 * 60 * 60 * 1000);

const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const result = await collectFromGnews({ slotAt, previousTo }, { db, gnews: { fetch, apiKey } });
  console.log(
    JSON.stringify({
      slotAt: slotAt.toISOString(),
      previousTo: previousTo.toISOString(),
      requestCount: result.requestCount,
      excludedArticles: result.excludedArticles,
      newArticles: result.newArticles,
      mergedArticles: result.mergedArticles,
      savedVersions: result.savedVersions.length,
      failures: result.failures,
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ collect: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
