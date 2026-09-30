import { createRuntimeDb } from "@newstrail/db";
import { SOURCES_FILE_PATH } from "@newstrail/db/sources-file";
import { createCacheInvalidator } from "../src/revalidate.ts";
import { setSourceTier } from "../src/source-tier.ts";

/**
 * 운영자 권리 등급 변경(#78). 출처 표에 있는 출처는 `packages/db/sources/sources.json`의 등급을 고치고 동기화한다
 * (고친 파일은 커밋한다). 표에 없는 출처(`gnews:*`·`gdelt:*`)는 DB 행만 고친다. 등급이 바뀌면 영향받는 사건의
 * 최신·과거 개정판 캐시를 즉시 만료한다.
 *
 * 실행: pnpm --filter @newstrail/worker source:set-tier <출처 식별자> <"본문 처리 + 발췌 표시" | 링크만>
 * (DATABASE_MIGRATION_URL·WEB_REVALIDATE_URL·REVALIDATE_SECRET 필요. 무효화 경로가 없으면 아무것도 쓰지 않고 거부한다.
 * 만료가 중간에 실패하면 같은 명령을 다시 돌린다 — 등급이 같아도 영향받는 사건 캐시를 다시 만료한다.)
 */
const [sourceId, tier] = process.argv.slice(2);
const url = process.env.DATABASE_MIGRATION_URL;
if (sourceId === undefined || tier === undefined) {
  console.error('사용법: source:set-tier <출처 식별자> <"본문 처리 + 발췌 표시" | 링크만>');
  process.exit(1);
}
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const result = await setSourceTier(
    db,
    { sourceId, tier, registryPath: SOURCES_FILE_PATH },
    createCacheInvalidator(process.env),
  );
  console.log(JSON.stringify({ sourceId, tier, ...result }));
} catch (error) {
  console.error(JSON.stringify({ sourceTier: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
