import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import { createMigrationSql } from "../scripts/migration-connection.ts";

/**
 * 실 DB 테스트용 연결(DATABASE_MIGRATION_URL). 테스트 전용이며 `@newsplatform/db/testing`으로만 나간다.
 *
 * 여러 테스트 파일(packages/db·apps/worker)이 같은 DB의 같은 테이블을 비우므로, 연결마다
 * 세션 advisory lock을 잡아 한 번에 하나만 돌게 한다. 잡은 뒤 테이블 여덟을 비우고 시작하며,
 * `cleanup()`이 다시 비우고 잠금을 풀고 연결을 닫는다. 비우는 대상은 #21의 테이블 여덟뿐이다.
 */
const LOCK_KEY = 2106;

const TABLES = [
  "evidence",
  "claim_revisions",
  "claims",
  "story_revisions",
  "article_versions",
  "articles",
  "stories",
  "sources",
] as const;

async function truncate(sql: Sql): Promise<void> {
  await sql.unsafe(`truncate table ${TABLES.map((t) => `"${t}"`).join(", ")}`);
}

export interface MigrationDb {
  readonly db: PostgresJsDatabase;
  readonly sql: Sql;
  cleanup(): Promise<void>;
}

export async function createMigrationDb(url: string): Promise<MigrationDb> {
  // 연결 하나(max 1)라 잠금·트랜잭션이 같은 세션에서 돈다.
  const sql = createMigrationSql({ DATABASE_MIGRATION_URL: url });
  await sql`select pg_advisory_lock(${LOCK_KEY})`;
  await truncate(sql);
  return {
    db: drizzle(sql),
    sql,
    async cleanup() {
      try {
        await truncate(sql);
        await sql`select pg_advisory_unlock(${LOCK_KEY})`;
      } finally {
        await sql.end();
      }
    },
  };
}
