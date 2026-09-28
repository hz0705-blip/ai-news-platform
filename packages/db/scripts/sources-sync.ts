import { drizzle } from "drizzle-orm/postgres-js";
import { readSourceRegistryFile, SOURCES_FILE_PATH, toSource } from "../src/sources-file.ts";
import { syncSourceRegistry } from "../src/sources-registry.ts";
import { createMigrationSql } from "./migration-connection.ts";

/**
 * 출처 표 파일 → DB `sources` upsert(#76). 파일 검증에 실패하면 아무것도 쓰지 않는다.
 * 실행: pnpm --filter @newsplatform/db sources:sync (DATABASE_MIGRATION_URL 필요. 마이그레이션이 먼저다.)
 */
const registry = readSourceRegistryFile(SOURCES_FILE_PATH).map(toSource);
const sql = createMigrationSql(process.env);
try {
  const result = await syncSourceRegistry(drizzle(sql), registry);
  console.log(JSON.stringify({ ...result, excluded: registry.filter((s) => s.isExcluded).length }));
} catch (error) {
  console.error(JSON.stringify({ sync: "sources", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
