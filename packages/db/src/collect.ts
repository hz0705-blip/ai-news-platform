import {
  type ArticleVersion,
  type CollectedArticle,
  type DedupedArticle,
  dedupeExact,
  type KnownArticle,
  normalizeArticleUrl,
  normalizeTitle,
  type Source,
} from "@newsplatform/domain";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { toArticleVersionRow, toSourceRow } from "./mappers.ts";
import type { RuntimeDb } from "./runtime.ts";
import { articles, articleVersions, sources } from "./schema/index.ts";

export interface SaveCollectedInput {
  readonly sources: readonly Source[];
  readonly articles: readonly CollectedArticle[];
  readonly capturedAt: Date;
}

export interface SaveCollectedResult {
  /** 이번 수집으로 새로 저장된 기사 버전. 같은 본문의 재수집은 여기 없다. */
  readonly savedVersions: readonly ArticleVersion[];
  readonly newArticles: number;
  readonly mergedArticles: number;
}

/**
 * 수집한 기사를 정확 중복 제거(`dedupeExact`, 순수)로 걸러 한 트랜잭션에 저장한다(#52).
 * 저장소가 아는 기사 중 후보(정규화 URL이 같거나, 같은 출처의 마지막 버전 본문 해시가 같은 기사)만 읽어
 * 도메인 함수에 넘기고, 결과대로 출처·기사(신규 또는 토픽 합집합 갱신)·새 기사 버전을 쓴다.
 * 사건 배정은 하지 않는다(#53) — 새 기사의 `story_id`는 null이다.
 */
export async function saveCollectedArticles(
  db: RuntimeDb["db"],
  input: SaveCollectedInput,
): Promise<SaveCollectedResult> {
  if (input.articles.length === 0) {
    return { savedVersions: [], newArticles: 0, mergedArticles: 0 };
  }
  return db.transaction(async (tx) => {
    const known = await loadKnown(tx, input);
    const deduped = dedupeExact({ known, collected: input.articles, capturedAt: input.capturedAt });

    if (input.sources.length > 0) {
      await tx.insert(sources).values(input.sources.map(toSourceRow)).onConflictDoNothing();
    }

    const savedVersions: ArticleVersion[] = [];
    let newArticles = 0;
    let mergedArticles = 0;
    for (const item of deduped) {
      if (item.isNew) {
        newArticles++;
        await tx.insert(articles).values(toNewArticleRow(item));
      } else {
        mergedArticles++;
        await tx
          .update(articles)
          .set({ topics: [...item.topics] })
          .where(eq(articles.id, item.id));
      }
      for (const version of item.newVersions) {
        // 마지막 버전과만 비교하므로 이전에 있던 본문이 다시 오면(A→B→A) 같은 (article_id, body_hash)가
        // 이미 있다. 그때는 아무것도 쓰지 않고 실제로 들어간 행만 센다 — 배치 전체를 잃지 않는다.
        const inserted = await tx
          .insert(articleVersions)
          .values(
            toArticleVersionRow(version, {
              id: item.id,
              sourceId: item.sourceId,
              storyId: "",
              url: item.url,
              title: item.title,
              publishedAt: item.publishedAt,
              topics: item.topics,
            }),
          )
          .onConflictDoNothing()
          .returning({ id: articleVersions.id });
        if (inserted.length === 0) continue;
        savedVersions.push(version);
      }
    }
    return { savedVersions, newArticles, mergedArticles };
  });
}

function toNewArticleRow(item: DedupedArticle): typeof articles.$inferInsert {
  return {
    id: item.id,
    source_id: item.sourceId,
    story_id: null,
    url: item.url,
    normalized_url: item.normalizedUrl,
    external_id: item.externalId,
    title: item.title,
    description: item.description,
    published_at: item.publishedAt,
    topics: [...item.topics],
  };
}

/** 후보 기사와 그 마지막 버전의 본문 해시를 읽는다. 마지막 버전은 `captured_at` 내림차순 첫 행이다. */
async function loadKnown(
  tx: Parameters<Parameters<RuntimeDb["db"]["transaction"]>[0]>[0],
  input: SaveCollectedInput,
): Promise<KnownArticle[]> {
  const urls = [...new Set(input.articles.map((a) => normalizeArticleUrl(a.url)))];
  const sourceIds = [...new Set(input.articles.map((a) => a.sourceId))];
  const rows = await tx
    .select({
      id: articles.id,
      source_id: articles.source_id,
      normalized_url: articles.normalized_url,
      title: articles.title,
      topics: articles.topics,
    })
    .from(articles)
    .where(or(inArray(articles.normalized_url, urls), inArray(articles.source_id, sourceIds)));
  if (rows.length === 0) return [];

  const latest = await tx
    .selectDistinctOn([articleVersions.article_id], {
      article_id: articleVersions.article_id,
      body_hash: articleVersions.body_hash,
    })
    .from(articleVersions)
    .where(
      and(
        inArray(
          articleVersions.article_id,
          rows.map((r) => r.id),
        ),
      ),
    )
    .orderBy(articleVersions.article_id, desc(articleVersions.captured_at));
  const hashById = new Map(latest.map((v) => [v.article_id, v.body_hash]));

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    normalizedUrl: row.normalized_url,
    normalizedTitle: normalizeTitle(row.title),
    topics: row.topics,
    latestBodyHash: hashById.get(row.id),
  }));
}
