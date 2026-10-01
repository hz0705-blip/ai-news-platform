import type {
  ChangeKind,
  CodePointSpan,
  ContradictionStatus,
  RevisionChange,
  Source,
  Topic,
} from "@newstrail/domain";
import { and, asc, count, eq, inArray, lte } from "drizzle-orm";
import { toDomainSource } from "../mappers.ts";
import type { RuntimeDb } from "../runtime.ts";
import { articles, revisionChanges, sources, stories, storyRevisions } from "../schema/index.ts";
import { type LeadImage, leadImageSql } from "./lead-image.ts";
import { loadRevision, loadRevisionChanges } from "./revision.ts";

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
  /** 대표 이미지: 이 개정판의 출처 집합(`source_article_ids`)에서 고른다. 없으면 null. */
  readonly image: LeadImage | null;
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
    readonly articleId: string;
    readonly articleTitle: string;
    readonly articleUrl: string;
    readonly publishedAt: Date;
    /** GDELT가 만든 링크만 기사(#77)면 참. 발행 시각을 모르므로 화면은 `observedAt`을 "관측 시각"으로 보인다. */
    readonly isLinkOnly: boolean;
    /** GDELT가 기사를 본 시각(GKG `DATE`). GDELT에 나온 적 없는 기사는 null. */
    readonly observedAt: Date | null;
  })[];
  /**
   * 보도량 추이가 세는 기사: 이 개정판의 출처 집합(`source_article_ids`)에 든 기사뿐이다. 발행 뒤 사건에 배정된
   * 기사는 넣지 않는다 — 개정판 화면(차트 포함)은 그 개정판에 고정된다(스펙 "렌더링·캐시").
   */
  readonly coverageArticles: readonly {
    readonly publishedAt: Date;
    readonly isLinkOnly: boolean;
    readonly observedAt: Date | null;
  }[];
  /** 이 개정판과 직전 개정판 사이 변화(#85, 저장 순서). 첫 개정판은 비어 있다. */
  readonly changes: readonly RevisionChange[];
  /**
   * 이 개정판까지의 개정판(개정판 번호 오름차순)과 각 개정판의 변화 종류별 개수. 개정판 띠가 쓴다.
   * 이 개정판보다 뒤의 개정판은 싣지 않는다 — 개정판 화면 캐시는 불변이고 발행은 최신 태그만 만료하기 때문이다.
   */
  readonly revisions: readonly {
    readonly id: string;
    readonly revisionNumber: number;
    readonly publishedAt: Date;
    readonly changeCounts: Readonly<Record<ChangeKind, number>>;
  }[];
}

const emptyChangeCounts = (): Record<ChangeKind, number> => ({
  "주장 추가·삭제·수정": 0,
  "상충 상태 변화": 0,
  "원문 변경": 0,
  "출처 추가": 0,
});

/**
 * 사건 페이지가 쓰는 유일한 질의. 사건은 `slug`로 찾고, `revisionId`가 없으면 최신 발행
 * 개정판(`revision_number`가 가장 큰 것)을 준다. 사건이나 개정판이 없으면 `undefined`.
 *
 * 개정판(주장·근거·출처 구획)은 `loadRevision`이 읽는다 — 워커의 `loadLatestRevision`과 같은 읽기다. 출처 구획은
 * 그 개정판의 출처 집합(`source_article_ids`)에 든 기사와 출처뿐이다(링크만 기사 포함, 발행 시각·기사 식별자 순).
 * 발행 뒤 사건에 배정된 기사는 싣지 않는다(스펙 "렌더링·캐시"). 이 질의는 페이지 전용 부가 정보(기사 제목·URL·
 * 관측 시각·링크만 여부, 개정판 띠, 변화 개수)만 더한다.
 */
export async function loadPublishedStory(
  db: RuntimeDb["db"],
  params: { readonly slug: string; readonly revisionId?: string },
): Promise<StoryPageData | undefined> {
  const storyRows = await db.select().from(stories).where(eq(stories.slug, params.slug)).limit(1);
  const story = storyRows[0];
  if (story === undefined) return undefined;

  const loaded = await loadRevision(db, {
    storyId: story.id,
    ...(params.revisionId === undefined ? {} : { revisionId: params.revisionId }),
  });
  if (loaded === undefined) return undefined;
  const domain = loaded.revision;

  // 출처 구획과 근거가 가리키는 기사의 페이지 전용 정보(출처 전체 행, 링크만 여부, 관측 시각, 근거 기사 제목).
  const articleIds = [
    ...new Set([
      ...domain.sources.map((s) => s.articleId),
      ...domain.claims.flatMap((c) => c.evidence.map((e) => e.articleId)),
    ]),
  ];
  const articleRows =
    articleIds.length === 0
      ? []
      : await db
          .select({
            source: sources,
            articleId: articles.id,
            articleTitle: articles.title,
            publishedAt: articles.published_at,
            isLinkOnly: articles.is_link_only,
            observedAt: articles.observed_at,
          })
          .from(articles)
          .innerJoin(sources, eq(sources.id, articles.source_id))
          .where(inArray(articles.id, articleIds));
  const articleOf = new Map(articleRows.map((r) => [r.articleId, r]));
  const pageArticle = (articleId: string) => {
    const article = articleOf.get(articleId);
    if (article === undefined) throw new Error(`기사를 찾지 못했다: ${articleId}`);
    return article;
  };

  const changes = await loadRevisionChanges(db, { revisionId: domain.id });
  const [imageRow] = await db
    .select({ image: leadImageSql(storyRevisions.source_article_ids) })
    .from(storyRevisions)
    .where(eq(storyRevisions.id, domain.id));

  const revisionListRows = await db
    .select({
      id: storyRevisions.id,
      revisionNumber: storyRevisions.revision_number,
      publishedAt: storyRevisions.published_at,
    })
    .from(storyRevisions)
    .where(
      and(
        eq(storyRevisions.story_id, story.id),
        lte(storyRevisions.revision_number, domain.revisionNumber),
      ),
    )
    .orderBy(asc(storyRevisions.revision_number));
  const countRows = await db
    .select({
      revisionId: revisionChanges.story_revision_id,
      kind: revisionChanges.kind,
      count: count(),
    })
    .from(revisionChanges)
    .where(
      inArray(
        revisionChanges.story_revision_id,
        revisionListRows.map((r) => r.id),
      ),
    )
    .groupBy(revisionChanges.story_revision_id, revisionChanges.kind);
  const countsOf = new Map<string, Record<ChangeKind, number>>();
  for (const row of countRows) {
    const counts = countsOf.get(row.revisionId) ?? emptyChangeCounts();
    counts[row.kind] = row.count;
    countsOf.set(row.revisionId, counts);
  }

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
      checkedAt: loaded.checkedAt,
      contradictionStatus: domain.contradictionStatus,
    },
    image: imageRow?.image ?? null,
    claims: domain.claims.map((claim) => ({
      id: claim.id,
      order: claim.order,
      text: claim.text,
      contradictionStatus: claim.contradictionStatus,
      evidence: claim.evidence.map((item) => {
        const article = pageArticle(item.articleId);
        return {
          sourceId: item.sourceId,
          articleTitle: article.articleTitle,
          publishedAt: article.publishedAt,
          sourceUrl: item.sourceUrl,
          excerpt: item.excerpt,
          highlightInExcerpt: item.highlightInExcerpt,
          ...(item.differsIn === undefined ? {} : { differsIn: item.differsIn }),
        };
      }),
    })),
    sources: domain.sources.map((s) => {
      const article = pageArticle(s.articleId);
      return {
        ...toDomainSource(article.source),
        articleId: s.articleId,
        articleTitle: s.articleTitle,
        articleUrl: s.articleUrl,
        publishedAt: s.publishedAt,
        isLinkOnly: article.isLinkOnly,
        observedAt: article.observedAt,
      };
    }),
    coverageArticles: domain.sources.map((s) => {
      const article = pageArticle(s.articleId);
      return {
        publishedAt: s.publishedAt,
        isLinkOnly: article.isLinkOnly,
        observedAt: article.observedAt,
      };
    }),
    changes,
    revisions: revisionListRows.map((r) => ({
      ...r,
      changeCounts: countsOf.get(r.id) ?? emptyChangeCounts(),
    })),
  };
}

/**
 * 사건 URL·개정판 고정 URL의 존재 확인. `apps/web/proxy.ts`가 응답이 흐르기 전에 404 상태를 정하려고 부른다.
 * 페이지 조회(`loadPublishedStory` + 데모 제외)와 같은 조건 — slug의 사건이 데모가 아니고 개정판이 있다
 * (`revisionId`를 주면 그 사건의 그 개정판). 행 하나만 읽는다.
 */
export async function publishedStoryExists(
  db: RuntimeDb["db"],
  params: { readonly slug: string; readonly revisionId?: string },
): Promise<boolean> {
  const rows = await db
    .select({ id: storyRevisions.id })
    .from(stories)
    .innerJoin(storyRevisions, eq(storyRevisions.story_id, stories.id))
    .where(
      and(
        eq(stories.slug, params.slug),
        eq(stories.is_demo, false),
        params.revisionId === undefined ? undefined : eq(storyRevisions.id, params.revisionId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
