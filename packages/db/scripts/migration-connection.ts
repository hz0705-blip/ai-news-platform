import postgres, { type Sql } from "postgres";
import { type EnvSource, parseMigrationConfig } from "../src/config.ts";

/**
 * 마이그레이션·게이트 전용 직접 연결(5432). DATABASE_MIGRATION_URL만 읽는다.
 * 이 모듈은 packages/db의 exports 밖(scripts/)에 있어 앱 코드에서 import할 수 없다.
 */
export function createMigrationSql(env: EnvSource): Sql {
  const { url } = parseMigrationConfig(env);
  return postgres(url, { max: 1, onnotice: () => undefined });
}
