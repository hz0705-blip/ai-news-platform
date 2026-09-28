import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertLocalTestUrl, createMigrationDb, readTestDbUrl } from "./test-db.ts";

// 이슈 #42: 실 DB 테스트는 DATABASE_TEST_URL(로컬 컨테이너)만 쓰고 프로덕션 DB(DATABASE_MIGRATION_URL)를 건드리지 않는다.
const PROD_LIKE =
  "postgresql://postgres.ref:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";
const LOCAL = "postgresql://test:test@localhost:54329/newsplatform_test";

describe("readTestDbUrl", () => {
  it("DATABASE_MIGRATION_URL만 있으면 undefined를 돌려준다(실 DB 테스트 skip)", () => {
    expect(readTestDbUrl({ DATABASE_MIGRATION_URL: PROD_LIKE })).toBeUndefined();
  });

  it("DATABASE_TEST_URL이 로컬이면 그대로 돌려준다", () => {
    expect(readTestDbUrl({ DATABASE_TEST_URL: LOCAL, DATABASE_MIGRATION_URL: PROD_LIKE })).toBe(
      LOCAL,
    );
  });
});

describe("assertLocalTestUrl", () => {
  it("로컬 호스트(localhost·127.0.0.1)는 받는다", () => {
    expect(() => assertLocalTestUrl(LOCAL)).not.toThrow();
    expect(() =>
      assertLocalTestUrl("postgresql://ci:ci-1@127.0.0.1:5432/newsplatform_ci"),
    ).not.toThrow();
  });

  it("원격 호스트·supabase를 담은 URL은 거부한다", () => {
    expect(() => assertLocalTestUrl(PROD_LIKE)).toThrow(/DATABASE_TEST_URL/);
    expect(() => assertLocalTestUrl("postgresql://u:p@db.example.com:5432/x")).toThrow();
    expect(() => assertLocalTestUrl("postgresql://supabase:p@localhost:5432/x")).toThrow();
    expect(() => readTestDbUrl({ DATABASE_TEST_URL: PROD_LIKE })).toThrow();
  });

  it("createMigrationDb는 연결·비우기 전에 원격 URL을 거부한다", async () => {
    await expect(createMigrationDb(PROD_LIKE)).rejects.toThrow(/DATABASE_TEST_URL/);
  });
});

describe("실 DB 테스트 파일", () => {
  it("DATABASE_MIGRATION_URL을 참조하지 않는다", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const files = globSync(["packages/db/src/**/*.test.ts", "apps/worker/**/*.test.ts"], {
      cwd: root,
      exclude: (name) => name === "node_modules",
    }).filter((file) => readFileSync(`${root}${file}`, "utf8").includes("createMigrationDb"));
    // 실 DB 테스트 일곱과 헬퍼(test-db.ts)
    files.push("packages/db/src/test-db.ts");
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files.filter((f) => !f.endsWith("test-db.test.ts"))) {
      expect(readFileSync(`${root}${file}`, "utf8"), file).not.toContain("DATABASE_MIGRATION_URL");
    }
  });
});
