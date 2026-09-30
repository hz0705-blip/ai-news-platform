import { createRuntimeDb } from "@newstrail/db";
import { SOURCES_FILE_PATH } from "@newstrail/db/sources-file";
import { createCacheInvalidator } from "../src/revalidate.ts";
import { exitCodeOf, syncSourcesFile } from "../src/source-tier.ts";

/**
 * 출처 표 파일 → DB `sources` upsert(#76) + 옛 `gnews:*` 기사·근거 재지정(#115). 권리 등급이 바뀐 출처가 있거나
 * 근거를 옮긴 사건이 있으면 그 사건의 최신·과거 개정판 캐시를 즉시 만료한다(#78). 출력 JSON의 `repointedEvidence`는
 * 옮긴 근거 수, `expiredStories`는 만료한 사건 수다. 파일 검증에 실패하면 아무것도 쓰지 않는다.
 * 실행: pnpm --filter @newstrail/worker sources:sync (DATABASE_MIGRATION_URL 필요. 마이그레이션이 먼저다.
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
  if (exitCodeOf(result) !== 0) {
    console.error(
      "등급이 바뀐 출처·근거를 옮긴 사건의 캐시를 만료하지 못했다(WEB_REVALIDATE_URL·REVALIDATE_SECRET 없음). 설정한 뒤 tierChanges·repointedEvidenceSources의 출처마다 source:set-tier <출처> <현재 등급>으로 다시 만료한다.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ sync: "sources", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
