import { defineConfig } from "drizzle-kit";
import { parseMigrationConfig } from "./src/config.ts";

// Drizzle 설정은 DATABASE_MIGRATION_URL만 읽는다(이슈 #16). generate처럼 DB가 필요 없는
// 명령은 변수 없이도 돌아가야 하므로 설정돼 있을 때만 자격을 넘긴다.
const migrationUrl =
  process.env.DATABASE_MIGRATION_URL === undefined
    ? undefined
    : parseMigrationConfig(process.env).url;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  strict: true,
  ...(migrationUrl === undefined ? {} : { dbCredentials: { url: migrationUrl } }),
});
