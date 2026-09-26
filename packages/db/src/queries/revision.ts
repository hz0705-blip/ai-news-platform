import type { Revision } from "@newsplatform/domain";
import { desc, eq, inArray } from "drizzle-orm";
import { type RevisionSourceRow, toDomainRevision } from "../mappers.ts";
import type { RuntimeDb } from "../runtime.ts";
import {
  articles,
  claimRevisions,
  evidence,
  sources,
  stories,
  storyRevisions,
} from "../schema/index.ts";

/**
 * 사건의 최신 개정판(`revision_number`가 가장 큰 것)을 도메인 `Revision`으로 복원한다. 워커가
 * 재처리 결과를 직전 개정판과 비교할 때 쓴다. 사건이나 개정판이 없으면 `undefined`.
 *
 * 출처 구획은 그 사건에 배정된 기사와 출처를 이어 만든다(발행 시각·기사 식별자 순).
 */
export async function loadLatestRevision(
  db: RuntimeDb["db"],
  params: { readonly slug: string },
): Promise<Revision | undefined> {
  const storyRows = await db
    .select({ id: stories.id })
    .from(stories)
    .where(eq(stories.slug, params.slug))
    .limit(1);
  const story = storyRows[0];
  if (story === undefined) return undefined;

  const revisionRows = await db
    .select()
    .from(storyRevisions)
    .where(eq(storyRevisions.story_id, story.id))
    .orderBy(desc(storyRevisions.revision_number))
    .limit(1);
  const revision = revisionRows[0];
  if (revision === undefined) return undefined;

  const claimRevisionRows = await db
    .select()
    .from(claimRevisions)
    .where(eq(claimRevisions.story_revision_id, revision.id));

  const evidenceRows =
    claimRevisionRows.length === 0
      ? []
      : await db
          .select()
          .from(evidence)
          .where(
            inArray(
              evidence.claim_revision_id,
              claimRevisionRows.map((cr) => cr.id),
            ),
          );

  const sourceRows = await db
    .select({
      sourceId: sources.id,
      rightsTier: sources.rights_tier,
      articleId: articles.id,
      articleTitle: articles.title,
      articleUrl: articles.url,
      publishedAt: articles.published_at,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.source_id))
    .where(eq(articles.story_id, story.id))
    .orderBy(articles.published_at, articles.id);

  const revisionSources: RevisionSourceRow[] = sourceRows.map((r) => ({
    source_id: r.sourceId,
    article_id: r.articleId,
    article_title: r.articleTitle,
    article_url: r.articleUrl,
    published_at: r.publishedAt,
    rights_tier: r.rightsTier,
  }));

  return toDomainRevision({
    revision,
    // toDomainRevision은 claims 행을 읽지 않는다(queries/story.ts와 같은 방식).
    claims: [],
    claimRevisions: claimRevisionRows,
    evidence: evidenceRows,
    sources: revisionSources,
  });
}
