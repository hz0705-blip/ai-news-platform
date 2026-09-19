import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createMigrationSql } from "./migration-connection.ts";

// 실행: pnpm db:migrate (루트) → node --env-file-if-exists=../../.env scripts/migrate.ts
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const sql = createMigrationSql(process.env);

try {
  await migrate(drizzle(sql), { migrationsFolder });
  // drizzle.__drizzle_migrations에 적용된 마이그레이션 행 수
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count from drizzle.__drizzle_migrations
  `;
  console.log(JSON.stringify({ appliedMigrations: Number(rows[0]?.count ?? "0") }));
} catch (error) {
  console.error(JSON.stringify({ migrate: "drizzle", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
