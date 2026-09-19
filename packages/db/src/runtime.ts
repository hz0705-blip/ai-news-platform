import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { type EnvSource, parseRuntimeConfig } from "./config.ts";

export interface RuntimeDb {
  readonly db: PostgresJsDatabase;
  readonly sql: Sql;
}

/**
 * 런타임 연결. 트랜잭션 풀러(6543)를 전제로 인스턴스당 풀 1, prepared statement 끔
 * (docs/spec/v1.md "배포와 운영" 연결). DATABASE_URL만 읽는다.
 */
export function createRuntimeDb(env: EnvSource): RuntimeDb {
  const { url } = parseRuntimeConfig(env);
  const sql = postgres(url, { max: 1, prepare: false });
  return { db: drizzle(sql), sql };
}
