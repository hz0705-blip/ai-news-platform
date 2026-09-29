import { createRuntimeDb, replayAccountDeletions } from "@newsplatform/db";

/**
 * 백업 복원 뒤 삭제 재적용(스펙 "데이터 보존", #106): 삭제 기록의 사용자마다 계정 데이터(팔로우·마지막으로 본 개정판)를 지우고,
 * `auth.users`가 있는 DB(Supabase 전체 복원)면 그 인증 사용자도 지운다. 끝에 보관 기간(90일)이 지난 삭제 기록을 지운다.
 * 복원한 DB에서 서비스를 열기 전에 돌린다. 다시 돌려도 안전하다.
 * 실행: pnpm --filter @newsplatform/worker accounts:replay-deletions (DATABASE_MIGRATION_URL = 복원한 DB)
 */
const url = process.env.DATABASE_MIGRATION_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  console.log(JSON.stringify(await replayAccountDeletions(db, { now: new Date() })));
} catch (error) {
  console.error(JSON.stringify({ replay: "account-deletions", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
