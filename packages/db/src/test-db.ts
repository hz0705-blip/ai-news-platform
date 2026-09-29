import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

/**
 * 실 DB 테스트용 연결(DATABASE_TEST_URL, 이슈 #42). 테스트 전용이며 `@newsplatform/db/testing`으로만 나간다.
 * 마이그레이션 자격(프로덕션 Supabase)은 읽지 않는다. 테스트 URL은 로컬 컨테이너(localhost)만 받는다.
 *
 * 여러 테스트 파일(packages/db·apps/worker)이 같은 DB의 같은 테이블을 비우므로, 연결마다
 * 세션 advisory lock을 잡아 한 번에 하나만 돌게 한다. 잡은 뒤 테이블(#21의 여덟 + 슬롯 원장)을 비우고 시작하며,
 * `cleanup()`이 다시 비우고 잠금을 풀고 연결을 닫는다. 비우는 대상은 #21의 테이블 여덟과 `batch_runs`·`revision_changes`다.
 */
const LOCK_KEY = 2106;

const TABLES = [
  "batch_runs",
  "revision_changes",
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

// 워커의 실 DB 테스트가 행을 직접 심을 수 있게 테이블과 행 매퍼를 같이 내보낸다.
export { toSourceRow, toStoryRow } from "./mappers.ts";
export * from "./schema/index.ts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** 로컬 컨테이너(localhost·127.0.0.1, CI 서비스 컨테이너 포함)가 아니거나 supabase를 담은 URL은 비우기 전에 거부한다. */
export function assertLocalTestUrl(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_TEST_URL이 URL이 아니다");
  }
  if (!LOCAL_HOSTS.has(host) || url.toLowerCase().includes("supabase")) {
    throw new Error(`DATABASE_TEST_URL은 로컬 컨테이너만 가리킬 수 있다(호스트 ${host})`);
  }
}

/** 실 DB 테스트의 URL. DATABASE_TEST_URL만 읽고, 없으면 undefined(테스트 skip). */
export function readTestDbUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const url = env.DATABASE_TEST_URL;
  if (url === undefined || url === "") return undefined;
  assertLocalTestUrl(url);
  return url;
}

export interface MigrationDb {
  readonly db: PostgresJsDatabase;
  readonly sql: Sql;
  cleanup(): Promise<void>;
}

export async function createMigrationDb(url: string): Promise<MigrationDb> {
  assertLocalTestUrl(url);
  // 연결 하나(max 1)라 잠금·트랜잭션이 같은 세션에서 돈다.
  const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
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
