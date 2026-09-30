import { fileURLToPath } from "node:url";
import {
  createRuntimeDb,
  loadLatestRevision,
  loadPublishedStory,
  saveDemoStoryRecords,
} from "@newstrail/db";
import { canProcessBody, createArticleVersion } from "@newstrail/domain";
import {
  createDemoStepModelClient,
  demoStepBatchInput,
  listGoldenSetSlugs,
  loadDemoStorySteps,
  runBatch,
} from "@newstrail/pipeline";
import { applyBatchResult } from "../src/apply-batch-result.ts";

/**
 * 데모 사건 적재 명령(#21 Ruling 6, #22 Ruling 22-15, #88): 픽스처 단계마다 배치(기록된 응답, 단계 시각
 * 시계) → 데모 사건·출처·기사·기사 버전 저장 → 배치 결과 반영(워커 슬롯과 같은 `applyBatchResult`). 도메인·DB·
 * 파이프라인을 잇는 자리는 워커뿐이다. 멱등은 개정판 커밋이 한 트랜잭션에서 보장한다. 재실행은 개정판을 만들지 않고 `checked_at`만 갱신한다(스펙 134행).
 *
 * 실행: pnpm --filter @newstrail/worker demo:load [slug] (DATABASE_MIGRATION_URL 필요, 인자
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
  const demo = loadDemoStorySteps(params.slug);
  const { story, sources, steps } = demo;

  // 적재 명령은 마이그레이션 URL(세션 풀러)로 연결한다. 연결 설정(풀 1, prepared statement 끔)은 런타임과 같다.
  const { db, sql } = createRuntimeDb({ DATABASE_URL: params.url });
  try {
    // 단계는 순서대로 적용한다(#88). 이미 적재된 개정판 수만큼 앞 단계를 건너뛰고, 모두 적재됐으면 마지막 단계를
    // 다시 돌려 같은 내용이면 확인 시각만 갱신한다. `now`는 마지막 단계의 시각을 덮어쓴다(기본은 단계 시각).
    let latestRevision = await loadLatestRevision(db, { slug: params.slug });
    const start = Math.min(latestRevision?.revisionNumber ?? 0, steps.length - 1);
    let inserted = false;
    let confirmed = false;
    for (let index = start; index < steps.length; index++) {
      const step = steps[index] as (typeof steps)[number];
      const last = index === steps.length - 1;
      const now = last && params.now !== undefined ? params.now : step.at;
      const result = await runBatch(
        demoStepBatchInput(demo, index, { ...(latestRevision ? { latestRevision } : {}), now }),
        {
          modelClient: createDemoStepModelClient(step),
          embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
          clock: () => now,
        },
      );
      const revision = result.revisions[0];
      const confirmedRevision = result.confirmed[0];
      if (revision === undefined && confirmedRevision === undefined) {
        throw new Error(`데모 사건을 발행하지 못했다: ${JSON.stringify(result.report.failures)}`);
      }

      if (revision !== undefined) {
        // 본문을 처리할 수 있는 출처의 기사만 기사 버전을 저장한다. 링크만 기사는 메타데이터만 남긴다(Ruling 15).
        const rightsOf = new Map(sources.map((s) => [s.id, s.rightsTier]));
        const articleVersions = step.articles
          .filter((a) => {
            const tier = rightsOf.get(a.meta.sourceId);
            return tier !== undefined && canProcessBody(tier);
          })
          .map((a) =>
            createArticleVersion({
              id: a.meta.articleVersionId,
              articleId: a.meta.id,
              rawBody: a.rawBody,
              capturedAt: now,
            }),
          );
        await saveDemoStoryRecords(db, {
          story,
          sources,
          articles: step.articles.map((a) => a.meta),
          articleVersions,
        });
      }
      const applied = await applyBatchResult(db, result, { deferredAt: now });
      const failure = applied.publishFailures[0];
      if (failure !== undefined) throw new Error(`데모 사건을 발행하지 못했다: ${failure.reason}`);
      inserted ||= applied.published.some((p) => p.inserted);
      if (revision !== undefined) latestRevision = revision;
      if (confirmedRevision !== undefined) confirmed = true;
    }

    // `sql`는 `drizzle(sql)`과 연결을 공유하므로(런타임 시각 열의 파싱을 drizzle이 가져간다) 시각 열은
    // 여기서 직접 읽지 않고 아래 `loadPublishedStory`(drizzle 질의)에서 얻는다.
    const revisionRows = await sql<{ revision_count: number }[]>`
      select count(r.id)::int as revision_count
      from stories s left join story_revisions r on r.story_id = s.id
      where s.slug = ${story.slug}
      group by s.id
    `;
    const page = await loadPublishedStory(db, { slug: params.slug });
    return {
      inserted,
      confirmed,
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
