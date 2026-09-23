import { fileURLToPath } from "node:url";
import { createRuntimeDb, publishRevision } from "@newsplatform/db";
import { createArticleVersion } from "@newsplatform/domain";
import {
  createRecordedModelClient,
  DEMO_REFERENCE_TIME,
  loadDemoStoryFixture,
  runBatch,
} from "@newsplatform/pipeline";

/**
 * 데모 사건 적재 명령(#21 Ruling 6): 픽스처 → 배치(기록된 응답, 데모 기준 시각 시계) → 발행.
 * 도메인·DB·파이프라인을 잇는 자리는 워커뿐이다. 멱등은 `publishRevision`이 한 트랜잭션에서 보장한다.
 *
 * 실행: pnpm --filter @newsplatform/worker demo:load [slug] (DATABASE_MIGRATION_URL 필요)
 */
export async function loadDemoStory(params: {
  readonly url: string;
  readonly slug: string;
}): Promise<{ inserted: boolean; revisionCount: number; storyIsDemo: boolean }> {
  const fixture = loadDemoStoryFixture(params.slug);

  const result = await runBatch(
    {
      articles: fixture.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
      now: DEMO_REFERENCE_TIME,
      dailyBudget: { tokens: 1_000_000, spend: 10 },
      sources: fixture.sources,
      existingStories: [{ story: fixture.story }],
    },
    {
      modelClient: createRecordedModelClient(params.slug),
      embeddingClient: { embed: async () => [] },
      clock: () => DEMO_REFERENCE_TIME,
    },
  );
  const revision = result.revisions[0];
  if (revision === undefined) {
    throw new Error(`데모 사건을 발행하지 못했다: ${JSON.stringify(result.report.failures)}`);
  }

  // 본문을 처리할 수 있는 출처의 기사만 기사 버전을 저장한다. 링크만 기사는 메타데이터만 남긴다(Ruling 15).
  const rightsOf = new Map(fixture.sources.map((s) => [s.id, s.rightsTier]));
  const articleVersions = fixture.articles
    .filter((a) => rightsOf.get(a.meta.sourceId) === "본문 처리 + 발췌 표시")
    .map((a) =>
      createArticleVersion({
        id: a.meta.articleVersionId,
        articleId: a.meta.id,
        rawBody: a.rawBody,
        capturedAt: DEMO_REFERENCE_TIME,
      }),
    );

  // 적재 명령은 마이그레이션 URL(세션 풀러)로 연결한다. 연결 설정(풀 1, prepared statement 끔)은 런타임과 같다.
  const { db, sql } = createRuntimeDb({ DATABASE_URL: params.url });
  try {
    const { inserted } = await publishRevision(db, {
      story: fixture.story,
      revision,
      articles: fixture.articles.map((a) => a.meta),
      articleVersions,
      sources: fixture.sources,
    });
    const rows = await sql<{ revision_count: number; is_demo: boolean }[]>`
      select count(r.id)::int as revision_count, s.is_demo
      from stories s left join story_revisions r on r.story_id = s.id
      where s.slug = ${fixture.story.slug}
      group by s.is_demo
    `;
    return {
      inserted,
      revisionCount: rows[0]?.revision_count ?? 0,
      storyIsDemo: rows[0]?.is_demo ?? false,
    };
  } finally {
    await sql.end();
  }
}

// 엔트리: 직접 실행될 때만 돈다(import.meta.main 대신 process.argv[1] 비교).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (url === undefined || url === "") {
    console.error("DATABASE_MIGRATION_URL이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
    process.exitCode = 1;
  } else {
    try {
      const slug = process.argv[2] ?? "demo-1-agreement";
      console.log(JSON.stringify({ slug, ...(await loadDemoStory({ url, slug })) }));
    } catch (error) {
      console.error(JSON.stringify({ demoLoad: "failed", error: String(error) }));
      process.exitCode = 1;
    }
  }
}
