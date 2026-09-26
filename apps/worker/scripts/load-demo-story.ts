import { fileURLToPath } from "node:url";
import {
  confirmRevision,
  createRuntimeDb,
  loadLatestRevision,
  loadPublishedStory,
  publishRevision,
} from "@newsplatform/db";
import { createArticleVersion } from "@newsplatform/domain";
import {
  createRecordedModelClient,
  DEMO_REFERENCE_TIME,
  listGoldenSetSlugs,
  loadDemoStoryFixture,
  runBatch,
} from "@newsplatform/pipeline";

/**
 * 데모 사건 적재 명령(#21 Ruling 6, #22 Ruling 22-15): 픽스처 → 배치(기록된 응답, 데모 기준
 * 시각 시계) → 발행. 도메인·DB·파이프라인을 잇는 자리는 워커뿐이다. 멱등은 `publishRevision`이
 * 한 트랜잭션에서 보장한다. 재실행은 개정판을 만들지 않고 `checked_at`만 갱신한다(스펙 134행).
 *
 * 실행: pnpm --filter @newsplatform/worker demo:load [slug] (DATABASE_MIGRATION_URL 필요, 인자
 * 없으면 골든셋 전체)
 */
export async function loadDemoStory(params: {
  readonly url: string;
  readonly slug: string;
  readonly now?: Date;
}): Promise<{
  inserted: boolean;
  confirmed: boolean;
  revisionCount: number;
  checkedAt: Date | undefined;
  storyIsDemo: boolean;
}> {
  const now = params.now ?? DEMO_REFERENCE_TIME;
  const fixture = loadDemoStoryFixture(params.slug);

  // 적재 명령은 마이그레이션 URL(세션 풀러)로 연결한다. 연결 설정(풀 1, prepared statement 끔)은 런타임과 같다.
  const { db, sql } = createRuntimeDb({ DATABASE_URL: params.url });
  try {
    const latestRevision = await loadLatestRevision(db, { slug: params.slug });

    const result = await runBatch(
      {
        articles: fixture.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
        now,
        dailyBudget: { tokens: 1_000_000, spend: 10 },
        sources: fixture.sources,
        existingStories: [{ story: fixture.story, ...(latestRevision ? { latestRevision } : {}) }],
      },
      {
        modelClient: createRecordedModelClient(params.slug),
        embeddingClient: { embed: async () => [] },
        clock: () => now,
      },
    );
    const revision = result.revisions[0];
    const confirmed = result.confirmed[0];
    if (revision === undefined && confirmed === undefined) {
      throw new Error(`데모 사건을 발행하지 못했다: ${JSON.stringify(result.report.failures)}`);
    }

    let inserted = false;
    if (revision !== undefined) {
      // 본문을 처리할 수 있는 출처의 기사만 기사 버전을 저장한다. 링크만 기사는 메타데이터만 남긴다(Ruling 15).
      const rightsOf = new Map(fixture.sources.map((s) => [s.id, s.rightsTier]));
      const articleVersions = fixture.articles
        .filter((a) => rightsOf.get(a.meta.sourceId) === "본문 처리 + 발췌 표시")
        .map((a) =>
          createArticleVersion({
            id: a.meta.articleVersionId,
            articleId: a.meta.id,
            rawBody: a.rawBody,
            capturedAt: now,
          }),
        );
      inserted = (
        await publishRevision(db, {
          story: fixture.story,
          revision,
          articles: fixture.articles.map((a) => a.meta),
          articleVersions,
          sources: fixture.sources,
        })
      ).inserted;
    }
    if (confirmed !== undefined) {
      await confirmRevision(db, {
        revisionId: confirmed.revisionId,
        checkedAt: confirmed.checkedAt,
      });
    }

    // `sql`는 `drizzle(sql)`과 연결을 공유하므로(런타임 시각 열의 파싱을 drizzle이 가져간다) 시각 열은
    // 여기서 직접 읽지 않고 아래 `loadPublishedStory`(drizzle 질의)에서 얻는다.
    const revisionRows = await sql<{ revision_count: number }[]>`
      select count(r.id)::int as revision_count
      from stories s left join story_revisions r on r.story_id = s.id
      where s.slug = ${fixture.story.slug}
      group by s.id
    `;
    const page = await loadPublishedStory(db, { slug: params.slug });
    return {
      inserted,
      confirmed: confirmed !== undefined,
      revisionCount: revisionRows[0]?.revision_count ?? 0,
      checkedAt: page?.revision.checkedAt,
      storyIsDemo: page?.story.isDemo ?? false,
    };
  } finally {
    await sql.end();
  }
}

/** 골든셋 전체(등록 순서)를 적재한다. `demo:load`(인자 없음)가 쓴다. */
export async function loadAllDemoStories(params: {
  readonly url: string;
  readonly now?: Date;
}): Promise<
  readonly { slug: string; inserted: boolean; confirmed: boolean; revisionCount: number }[]
> {
  const results: { slug: string; inserted: boolean; confirmed: boolean; revisionCount: number }[] =
    [];
  for (const slug of listGoldenSetSlugs()) {
    const result = await loadDemoStory({
      url: params.url,
      slug,
      ...(params.now ? { now: params.now } : {}),
    });
    results.push({
      slug,
      inserted: result.inserted,
      confirmed: result.confirmed,
      revisionCount: result.revisionCount,
    });
  }
  return results;
}

// 엔트리: 직접 실행될 때만 돈다(import.meta.main 대신 process.argv[1] 비교).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (url === undefined || url === "") {
    console.error("DATABASE_MIGRATION_URL이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
    process.exitCode = 1;
  } else {
    try {
      const slug = process.argv[2];
      const results = slug
        ? [{ slug, ...(await loadDemoStory({ url, slug })) }]
        : await loadAllDemoStories({ url });
      for (const r of results) {
        console.log(
          JSON.stringify({
            slug: r.slug,
            inserted: r.inserted,
            confirmed: r.confirmed,
            revisionCount: r.revisionCount,
          }),
        );
      }
    } catch (error) {
      console.error(JSON.stringify({ demoLoad: "failed", error: String(error) }));
      process.exitCode = 1;
    }
  }
}
