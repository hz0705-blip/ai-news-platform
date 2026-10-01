import { normalizeArticleUrl } from "@newstrail/domain";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { RuntimeDb } from "./runtime.ts";
import { articles, sources, storyRevisions } from "./schema/index.ts";

export interface ClearedArticleImages {
  /** 대상이 기사 URL이었으면 `article`, 출처 식별자였으면 `source`. */
  readonly scope: "article" | "source";
  /** 이번에 이미지 URL이 지워진 기사 수(이미 비어 있던 기사는 세지 않는다). */
  readonly clearedArticles: number;
  /**
   * 대상 기사가 붙은 사건과 출처 집합에 대상 기사를 담은 개정판의 사건(사건 식별자 순). 이미 지운 기사도 포함하므로
   * 다시 돌리면 같은 사건을 돌려준다 — 만료가 중간에 실패해도 같은 명령으로 끝까지 만료할 수 있다.
   */
  readonly storyIds: readonly string[];
}

/**
 * 기사 이미지 삭제 요청(#180, ADR-0002): 기사 URL(정규화 URL로 찾는다) 또는 출처 식별자의 모든 기사의 `image_url`을
 * null로 지운다. 대상 기사가 없으면(출처는 행이 있으면 기사 0개도 된다) undefined. 다시 돌려도 안전하다.
 */
export async function clearArticleImages(
  db: RuntimeDb["db"],
  target: string,
): Promise<ClearedArticleImages | undefined> {
  return db.transaction(async (tx) => {
    let kind: ClearedArticleImages["scope"];
    let match: ReturnType<typeof eq>;
    if (/^https?:\/\//i.test(target.trim())) {
      kind = "article";
      match = eq(articles.normalized_url, normalizeArticleUrl(target));
    } else {
      const [source] = await tx
        .select({ id: sources.id })
        .from(sources)
        .where(eq(sources.id, target))
        .limit(1);
      if (source === undefined) return undefined;
      kind = "source";
      match = eq(articles.source_id, target);
    }
    const matched = await tx
      .select({ id: articles.id, storyId: articles.story_id })
      .from(articles)
      .where(match);
    if (kind === "article" && matched.length === 0) return undefined;

    const cleared = await tx
      .update(articles)
      .set({ image_url: null })
      .where(and(match, isNotNull(articles.image_url)))
      .returning({ id: articles.id });

    const ids = matched.map((a) => a.id);
    const inRevisions =
      ids.length === 0
        ? []
        : await tx
            .selectDistinct({ storyId: storyRevisions.story_id })
            .from(storyRevisions)
            .where(sql`${storyRevisions.source_article_ids} && ${sql.param(ids)}::text[]`);
    const storyIds = [
      ...new Set([
        ...matched.flatMap((a) => (a.storyId === null ? [] : [a.storyId])),
        ...inRevisions.map((r) => r.storyId),
      ]),
    ].sort();
    return { scope: kind, clearedArticles: cleared.length, storyIds };
  });
}
