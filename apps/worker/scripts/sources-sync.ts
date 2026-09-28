import { createRuntimeDb } from "@newsplatform/db";
import { SOURCES_FILE_PATH } from "@newsplatform/db/sources-file";
import { createCacheInvalidator } from "../src/revalidate.ts";
import { syncSourcesFile } from "../src/source-tier.ts";

/**
 * 출처 표 파일 → DB `sources` upsert(#76) + 옛 `gnews:*` 기사 재지정. 권리 등급이 바뀐 출처가 있으면 영향받는
 * 사건의 최신·과거 개정판 캐시를 즉시 만료한다(#78). 파일 검증에 실패하면 아무것도 쓰지 않는다.
 * 실행: pnpm --filter @newsplatform/worker sources:sync (DATABASE_MIGRATION_URL 필요. 마이그레이션이 먼저다.
 * 캐시 만료는 WEB_REVALIDATE_URL·REVALIDATE_SECRET이 있을 때만 한다.)
 */
const url = process.env.DATABASE_MIGRATION_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const result = await syncSourcesFile(db, SOURCES_FILE_PATH, createCacheInvalidator(process.env));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ sync: "sources", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
