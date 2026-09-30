import { createRuntimeDb, loadRecentlyPublishedStoryIds } from "@newstrail/db";
import { createOpenAiEmbeddingClient } from "@newstrail/pipeline";
import { runGdeltStage } from "../src/gdelt.ts";

/**
 * 수동 GDELT 명령(#77·#112 수동 스모크): 최근 발행 사건 `N`개(기본 5)에 배치와 같은 GDELT 단계를 돈다 —
 * 실제 GKG 15분 파일 읽기, 링크 제목 임베딩(OpenAI), 링크만 기사 저장, 출처 추가 개정판 발행. 모델 호출은 없다.
 * 결과 줄에 파일 수·바이트·소요·관측·붙음·버림·출처 추가 개정판을 남긴다. 키 값은 출력하지 않는다.
 *
 * 실행: pnpm --filter @newstrail/worker gdelt:run [N]
 * (DATABASE_MIGRATION_URL·OPENAI_API_KEY 필요. DB에 쓰므로 프로덕션이 아닌 DB를 가리킬 때는 그 URL로 덮어쓴다.)
 */
const url = process.env.DATABASE_MIGRATION_URL;
const apiKey = process.env.OPENAI_API_KEY;
if (url === undefined || url === "" || apiKey === undefined || apiKey === "") {
  console.error(
    "DATABASE_MIGRATION_URL·OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.",
  );
  process.exit(1);
}
const limit = Number(process.argv[2] ?? "5");

const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const now = new Date();
  const storyIds = await loadRecentlyPublishedStoryIds(db, limit);
  const report = await runGdeltStage(
    { storyIds, batchStartedAt: now, now },
    { db, gdelt: { fetch }, embeddingClient: createOpenAiEmbeddingClient({ apiKey }) },
  );
  console.log(JSON.stringify({ now: now.toISOString(), storyIds, ...report }));
} catch (error) {
  console.error(JSON.stringify({ gdelt: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
