import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { createRuntimeDb, exportAccountDeletions } from "@newstrail/db";

/**
 * 복원 전 삭제 기록·삭제 대기 행 내보내기(스펙 "데이터 보존", #106). 백업을 복원하기 **전에** 지금 DB에서 떠 둔다 —
 * 복원된 DB에는 백업 시점 뒤의 삭제 기록·대기 행이 없다. 파일은 Google 해제용 토큰을 담으므로 0600으로 쓰고,
 * 복원 뒤 accounts:replay-deletions에 넘긴 다음 지운다(커밋·업로드하지 않는다).
 * 실행: ACCOUNT_DELETIONS_FILE=<절대경로> pnpm --filter @newstrail/worker accounts:export-deletions
 * (DATABASE_MIGRATION_URL = 복원 전 DB)
 */
const url = process.env.DATABASE_MIGRATION_URL;
const file = process.env.ACCOUNT_DELETIONS_FILE;
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
if (file === undefined || !isAbsolute(file)) {
  console.error("ACCOUNT_DELETIONS_FILE에 내보낼 파일의 절대경로를 준다.");
  process.exit(1);
}
const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const exported = await exportAccountDeletions(db, { now: new Date() });
  writeFileSync(file, JSON.stringify(exported), { mode: 0o600, flag: "wx" });
  console.log(
    JSON.stringify({
      exported: "account-deletions",
      deletions: exported.deletions.length,
      pending: exported.pending.length,
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ exported: "account-deletions", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
