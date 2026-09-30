import { createRuntimeDb } from "@newstrail/db";
import { createOpenAiEmbeddingClient } from "@newstrail/pipeline";
import { assignStories } from "../src/assign.ts";

/**
 * 수동 배정 명령(#53 수동 스모크): 실제 OpenAI 키로 dev DB의 사건 없는 기사를 임베딩해 사건에 배정한다.
 * 결과 줄에 사건 수·기사 수·임베딩 비용을 남긴다. 키 값은 출력하지 않는다.
 *
 * 실행: pnpm --filter @newstrail/worker assign:stories [now ISO]
 * (DATABASE_MIGRATION_URL·OPENAI_API_KEY 필요. 인자 없으면 now = 지금)
 */
const url = process.env.DATABASE_MIGRATION_URL;
const apiKey = process.env.OPENAI_API_KEY;
if (url === undefined || url === "" || apiKey === undefined || apiKey === "") {
  console.error(
    "DATABASE_MIGRATION_URL·OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.",
  );
  process.exit(1);
}

const now = process.argv[2] ? new Date(process.argv[2]) : new Date();

const { db, sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  const result = await assignStories(
    { now },
    { db, embeddingClient: createOpenAiEmbeddingClient({ apiKey }) },
  );
  const counts = { assigned: 0, "new-story": 0, kept: 0 };
  for (const outcome of result.outcomes) counts[outcome.kind]++;
  const reasons: Record<string, number> = {};
  for (const outcome of result.outcomes) {
    if (outcome.kind === "new-story") reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
  }
  const totals = await sql<{ stories: number; articles: number }[]>`
    select count(distinct s.id)::int as stories, count(a.id)::int as articles
    from stories s join articles a on a.story_id = s.id
    where s.is_demo = false
  `;
  console.log(
    JSON.stringify({
      now: now.toISOString(),
      processed: result.outcomes.length,
      outcomes: counts,
      newStoryReasons: reasons,
      liveStories: totals[0]?.stories ?? 0,
      liveArticles: totals[0]?.articles ?? 0,
      embeddingUsage: result.usage,
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ assign: "failed", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
