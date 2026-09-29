import { createRuntimeDb } from "@newsplatform/db";
import { createOpenAiEmbeddingClient } from "@newsplatform/pipeline";
import { fillSearchEmbeddings } from "../src/search-embedding.ts";

/**
 * 검색 임베딩 백필(#124): 임베딩이 빈 발행 사건(데모 포함)의 제목과 주장 문장을 채운다. 배치의 검색 임베딩 단계와 같은 함수이며,
 * 이미 채운 것은 건너뛰므로 다시 돌려도 임베딩 호출이 없다. 인자는 없다(pnpm 12가 `--` 뒤 인자를 버린다).
 * 결과 한 줄 JSON(대상·재사용·임베딩 수·토큰·USD). 실패하면 종료 코드 1이고, 다시 돌리면 남은 것만 채운다.
 *
 * 실행: pnpm --filter @newsplatform/worker search:backfill-embeddings
 * (DATABASE_MIGRATION_URL·OPENAI_API_KEY 필요. 0014 마이그레이션 뒤.)
 */
const url = process.env.DATABASE_MIGRATION_URL;
const apiKey = process.env.OPENAI_API_KEY;
if (url === undefined || url === "" || apiKey === undefined || apiKey === "") {
  console.error(
    "DATABASE_MIGRATION_URL·OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.",
  );
  process.exit(1);
}

const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const report = await fillSearchEmbeddings({
    db,
    embeddingClient: createOpenAiEmbeddingClient({ apiKey }),
  });
  console.log(JSON.stringify(report));
  if (report.failure !== undefined) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ backfill: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
