import type { Revision, RevisionChange } from "@newsplatform/domain";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { type RevisionSourceRow, toDomainChange, toDomainRevision } from "../mappers.ts";
import type { RuntimeDb } from "../runtime.ts";
import {
  articles,
  claimRevisions,
  evidence,
  revisionChanges,
  sources,
  stories,
  storyRevisions,
} from "../schema/index.ts";

/**
 * 사건의 최신 개정판(`revision_number`가 가장 큰 것)을 도메인 `Revision`으로 복원한다. 워커가
 * 재처리 결과를 직전 개정판과 비교할 때 쓴다. 사건이나 개정판이 없으면 `undefined`.
 *
 * 출처 구획은 그 개정판이 발행될 때의 기사(`source_article_ids`, #85)와 출처를 이어 만든다(발행 시각·기사 식별자 순).
 * 다음 개정판의 "출처 추가" 변화와 개정판 생성 조건이 이 목록과 비교한다.
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

  const sourceRows =
    revision.source_article_ids.length === 0
      ? []
      : await db
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
          .where(inArray(articles.id, revision.source_article_ids))
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

/** 개정판 하나에 저장된 변화(#85)를 순서대로 읽는다. 첫 개정판·마이그레이션 전 개정판은 빈 목록이다. */
export async function loadRevisionChanges(
  db: RuntimeDb["db"],
  params: { readonly revisionId: string },
): Promise<RevisionChange[]> {
  const rows = await db
    .select()
    .from(revisionChanges)
    .where(eq(revisionChanges.story_revision_id, params.revisionId))
    .orderBy(asc(revisionChanges.display_order));
  return rows.map(toDomainChange);
}
