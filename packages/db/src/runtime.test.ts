import { describe, expect, it } from "vitest";
import { MissingEnvError } from "./config.ts";
import { createRuntimeDb } from "./runtime.ts";

const RUNTIME_URL = "postgresql://user:secret@pooler.example:6543/postgres";
const MIGRATION_URL = "postgresql://user:secret@db.example:5432/postgres";

describe("createRuntimeDb", () => {
  it("DATABASE_URL로 풀 1, prepared statement 끔으로 연다", async () => {
    const { db, sql } = createRuntimeDb({ DATABASE_URL: RUNTIME_URL });
    expect(db).toBeDefined();
    expect(sql.options.max).toBe(1);
    expect(sql.options.prepare).toBe(false);
    expect(sql.options.port).toEqual([6543]);
    await sql.end();
  });

  it("DATABASE_MIGRATION_URL만 있으면 마이그레이션 자격을 쓰지 않고 실패한다", () => {
    expect(() => createRuntimeDb({ DATABASE_MIGRATION_URL: MIGRATION_URL })).toThrow(
      MissingEnvError,
    );
  });

  it("둘 다 있어도 DATABASE_URL의 호스트로 연다", async () => {
    const { sql } = createRuntimeDb({
      DATABASE_URL: RUNTIME_URL,
      DATABASE_MIGRATION_URL: MIGRATION_URL,
    });
    expect(sql.options.host).toEqual(["pooler.example"]);
    await sql.end();
  });
});
