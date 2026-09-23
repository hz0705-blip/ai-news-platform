import postgres, { type Sql } from "postgres";
import { type EnvSource, parseMigrationConfig } from "../src/config.ts";

/**
 * 마이그레이션·게이트 전용 연결(Supabase 세션 풀러 5432. 직접 연결 호스트는 IPv6 전용이라 쓰지 않는다). DATABASE_MIGRATION_URL만 읽는다.
 * 이 모듈은 packages/db의 exports 밖(scripts/)에 있어 앱 코드에서 import할 수 없다.
 * 유일한 예외는 테스트 전용 서브패스 `@newsplatform/db/testing`(src/test-db.ts)이다: 실 DB 테스트가
 * 여러 패키지(db·worker)에 있고 비울 테이블 목록을 한 곳에 두기 위해서다. 테스트 파일 밖의 import는
 * 루트 biome.json의 noRestrictedImports가 막는다.
 */
export function createMigrationSql(env: EnvSource): Sql {
  const { url } = parseMigrationConfig(env);
  return postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
}
