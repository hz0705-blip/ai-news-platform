import type { CodePointSpan, ContradictionStatus, Source, Topic } from "@newsplatform/domain";
import { and, desc, eq, inArray } from "drizzle-orm";
import { type RevisionSourceRow, toDomainRevision, toDomainSource } from "../mappers.ts";
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
 * 사건 페이지가 그리는 데이터 전부. 근거는 허용 발췌(`excerpt`)와 그 발췌 안의 코드 포인트
 * 지역 구간(`highlightInExcerpt`)만 담는다(#21 Ruling 11). 기사 본문은 어디에도 담지 않는다 —
 * 이 질의는 `article_versions`를 읽지 않는다.
 */
export interface StoryPageData {
  readonly story: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly topics: readonly Topic[];
    readonly isDemo: boolean;
  };
  readonly revision: {
    readonly id: string;
    readonly revisionNumber: number;
    readonly title: string;
    readonly publishedAt: Date;
    /** 마지막 확인 시각. 발행 시각으로 시작하고 재처리가 개정판을 만들지 않으면 갱신된다. */
    readonly checkedAt: Date;
    readonly contradictionStatus: ContradictionStatus;
  };
  readonly claims: readonly {
    readonly id: string;
    readonly order: number;
    readonly text: string;
    readonly contradictionStatus: ContradictionStatus;
    readonly evidence: readonly {
      readonly sourceId: string;
      readonly articleTitle: string;
      readonly publishedAt: Date;
      readonly sourceUrl: string;
      readonly excerpt: string;
      readonly highlightInExcerpt: CodePointSpan;
      /** 같은 주장의 다른 근거와 다른 점(양립 불가 쌍에만 있다). */
      readonly differsIn?: string;
    }[];
  }[];
  readonly sources: readonly (Source & {
    readonly articleTitle: string;
    readonly articleUrl: string;
    readonly publishedAt: Date;
  })[];
}

/**
 * 사건 페이지가 쓰는 유일한 질의. 사건은 `slug`로 찾고, `revisionId`가 없으면 최신 발행
 * 개정판(`revision_number`가 가장 큰 것)을 준다. 사건이나 개정판이 없으면 `undefined`.
 *
 * 출처 구획은 그 사건에 배정된 기사와 출처를 이어 만든다(링크만 기사 포함, 발행 시각·기사 식별자 순).
 */
export async function loadPublishedStory(
  db: RuntimeDb["db"],
  params: { readonly slug: string; readonly revisionId?: string },
): Promise<StoryPageData | undefined> {
  const storyRows = await db.select().from(stories).where(eq(stories.slug, params.slug)).limit(1);
  const story = storyRows[0];
  if (story === undefined) return undefined;

  const revisionRows = await db
    .select()
    .from(storyRevisions)
    .where(
      params.revisionId === undefined
        ? eq(storyRevisions.story_id, story.id)
        : and(eq(storyRevisions.story_id, story.id), eq(storyRevisions.id, params.revisionId)),
    )
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
          .select({
            evidence,
            articleTitle: articles.title,
            articlePublishedAt: articles.published_at,
          })
          .from(evidence)
          .innerJoin(articles, eq(articles.id, evidence.article_id))
          .where(
            inArray(
              evidence.claim_revision_id,
              claimRevisionRows.map((cr) => cr.id),
            ),
          );

  const sourceRows = await db
    .select({
      source: sources,
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
    source_id: r.source.id,
    article_id: r.articleId,
    article_title: r.articleTitle,
    article_url: r.articleUrl,
    published_at: r.publishedAt,
    rights_tier: r.source.rights_tier,
  }));

  const domain = toDomainRevision({
    revision,
    claims: [],
    claimRevisions: claimRevisionRows,
    evidence: evidenceRows.map((r) => r.evidence),
    sources: revisionSources,
  });

  const articleOf = new Map(
    evidenceRows.map((r) => [
      r.evidence.id,
      { title: r.articleTitle, publishedAt: r.articlePublishedAt },
    ]),
  );

  return {
    story: {
      id: story.id,
      slug: story.slug,
      title: story.title,
      topics: story.topics,
      isDemo: story.is_demo,
    },
    revision: {
      id: domain.id,
      revisionNumber: domain.revisionNumber,
      title: domain.title,
      publishedAt: domain.publishedAt,
      checkedAt: revision.checked_at,
      contradictionStatus: domain.contradictionStatus,
    },
    claims: domain.claims.map((claim) => ({
      id: claim.id,
      order: claim.order,
      text: claim.text,
      contradictionStatus: claim.contradictionStatus,
      evidence: claim.evidence.map((item) => {
        const article = articleOf.get(item.id);
        if (article === undefined) throw new Error(`근거의 기사를 찾지 못했다: ${item.id}`);
        return {
          sourceId: item.sourceId,
          articleTitle: article.title,
          publishedAt: article.publishedAt,
          sourceUrl: item.sourceUrl,
          excerpt: item.excerpt,
          highlightInExcerpt: item.highlightInExcerpt,
          ...(item.differsIn === undefined ? {} : { differsIn: item.differsIn }),
        };
      }),
    })),
    sources: sourceRows.map((r) => ({
      ...toDomainSource(r.source),
      articleTitle: r.articleTitle,
      articleUrl: r.articleUrl,
      publishedAt: r.publishedAt,
    })),
  };
}
