import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import {
  AccountDeletionExportSchema,
  createRuntimeDb,
  replayAccountDeletions,
} from "@newsplatform/db";

/**
 * 백업 복원 뒤 삭제 재적용(스펙 "데이터 보존", #106). 복원 **전에** accounts:export-deletions로 뜬 파일을 복원된 DB에 적용한다:
 * 삭제 기록을 되살리고, 삭제 대기 행을 복원 직전 상태로 바꾸고, 삭제 기록의 사용자마다 계정 데이터를 지운다(`auth.users`가
 * 있는 DB면 그 인증 사용자도). 끝에 보관 기간(90일)이 지난 삭제 기록을 지운다. 서비스를 열기 전에 돌린다. 다시 돌려도 안전하다.
 * 실행: ACCOUNT_DELETIONS_FILE=<절대경로> pnpm --filter @newsplatform/worker accounts:replay-deletions
 * (DATABASE_MIGRATION_URL = 복원한 DB)
 */
const url = process.env.DATABASE_MIGRATION_URL;
const file = process.env.ACCOUNT_DELETIONS_FILE;
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
if (file === undefined || !isAbsolute(file)) {
  console.error(
    "ACCOUNT_DELETIONS_FILE에 복원 전에 뜬 내보내기(accounts:export-deletions)의 절대경로를 준다.",
  );
  process.exit(1);
}
const exported = AccountDeletionExportSchema.parse(JSON.parse(readFileSync(file, "utf8")));
const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  console.log(JSON.stringify(await replayAccountDeletions(db, { now: new Date(), exported })));
} catch (error) {
  console.error(JSON.stringify({ replay: "account-deletions", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
