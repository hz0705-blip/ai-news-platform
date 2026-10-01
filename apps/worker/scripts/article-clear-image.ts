import { createRuntimeDb } from "@newstrail/db";
import { clearArticleImage } from "../src/article-image.ts";
import { createCacheInvalidator } from "../src/revalidate.ts";

/**
 * 기사 이미지 삭제 요청(#180, ADR-0002). 기사 URL이면 그 기사, 출처 식별자면 그 출처의 모든 기사의 이미지 URL을 지우고
 * 영향받는 사건의 최신·과거 개정판 캐시를 즉시 만료한다.
 *
 * 실행: pnpm --filter @newstrail/worker article:clear-image <기사 URL | 출처 식별자>
 * (DATABASE_MIGRATION_URL·WEB_REVALIDATE_URL·REVALIDATE_SECRET 필요. 무효화 경로가 없으면 아무것도 쓰지 않고 거부한다.
 * 만료가 중간에 실패하면 같은 명령을 다시 돌린다 — 이미 지운 기사의 사건 캐시도 다시 만료한다.)
 */
const [target] = process.argv.slice(2);
const url = process.env.DATABASE_MIGRATION_URL;
if (target === undefined || target === "") {
  console.error("사용법: article:clear-image <기사 URL | 출처 식별자>");
  process.exit(1);
}
if (url === undefined || url === "") {
  console.error("DATABASE_MIGRATION_URL이 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const result = await clearArticleImage(db, target, createCacheInvalidator(process.env));
  console.log(JSON.stringify({ target, ...result }));
} catch (error) {
  console.error(JSON.stringify({ articleImage: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
