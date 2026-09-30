import { createRuntimeDb } from "@newsplatform/db";
import { RETENTION_BATCH_LIMIT, runRetention } from "../src/retention.ts";

/**
 * 보존 정책 수동 실행(#144): 워커의 `retention` 잡과 같은 함수를, 기한 지난 본문이 남지 않을 때까지 상한 단위로 되풀이한다.
 * 인자는 없다(pnpm 12가 `--` 뒤 인자를 버린다). 결과 한 줄 JSON(지운 본문·임베딩 수). 다시 돌려도 안전하다.
 *
 * 실행: pnpm --filter @newsplatform/worker retention:run
 * (DATABASE_MIGRATION_URL 필요. 0016 마이그레이션 뒤.)
 */
const url = process.env.DATABASE_MIGRATION_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}

const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  let bodiesDeleted = 0;
  let embeddingsCleared = 0;
  for (;;) {
    const report = await runRetention({ db, clock: () => new Date(), log: () => {} });
    bodiesDeleted += report.bodiesDeleted;
    embeddingsCleared += report.embeddingsCleared;
    if (report.bodiesDeleted < RETENTION_BATCH_LIMIT) break;
  }
  console.log(JSON.stringify({ retention: "ok", bodiesDeleted, embeddingsCleared }));
} catch (error) {
  console.error(JSON.stringify({ retention: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
