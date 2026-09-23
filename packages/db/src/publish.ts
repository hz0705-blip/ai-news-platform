import type { Article, ArticleVersion, Revision, Source, Story } from "@newsplatform/domain";
import { and, eq } from "drizzle-orm";
import { toArticleRow, toArticleVersionRow, toRows, toSourceRow, toStoryRow } from "./mappers.ts";
import type { RuntimeDb } from "./runtime.ts";
import {
  articles,
  articleVersions,
  claimRevisions,
  claims,
  evidence,
  sources,
  stories,
  storyRevisions,
} from "./schema/index.ts";

export interface PublishRevisionInput {
  readonly story: Story;
  readonly revision: Revision;
  readonly articles: readonly Article[];
  readonly articleVersions: readonly ArticleVersion[];
  readonly sources: readonly Source[];
}

/**
 * 개정판 하나를 한 트랜잭션으로 발행한다(docs/spec/v1.md "사건 단위 원자성", ADR-0009 "같은 트랜잭션").
 *
 * - 사건은 `stories.slug`로 찾거나 만든다.
 * - 그 사건에 같은 `revision_number`가 이미 있으면 아무것도 쓰지 않고 `inserted: false`(멱등).
 * - 없으면 출처·기사·기사 버전(이미 있으면 기존 식별자를 그대로 쓴다)·개정판·주장·주장 개정판·근거를
 *   전부 넣는다. 어느 삽입이든 실패하면 트랜잭션 전체가 롤백된다.
 */
export async function publishRevision(
  db: RuntimeDb["db"],
  input: PublishRevisionInput,
): Promise<{ inserted: boolean; revisionId: string }> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: storyRevisions.id })
      .from(storyRevisions)
      .innerJoin(stories, eq(stories.id, storyRevisions.story_id))
      .where(
        and(
          eq(stories.slug, input.story.slug),
          eq(storyRevisions.revision_number, input.revision.revisionNumber),
        ),
      )
      .limit(1);
    const found = existing[0];
    if (found !== undefined) return { inserted: false, revisionId: found.id };

    await tx.insert(stories).values(toStoryRow(input.story)).onConflictDoNothing();
    const storyRows = await tx
      .select({ id: stories.id })
      .from(stories)
      .where(eq(stories.slug, input.story.slug));
    const storyId = storyRows[0]?.id;
    if (storyId === undefined) {
      throw new Error(`사건을 만들지 못했다: slug ${input.story.slug}`);
    }

    if (input.sources.length > 0) {
      await tx.insert(sources).values(input.sources.map(toSourceRow)).onConflictDoNothing();
    }
    if (input.articles.length > 0) {
      await tx
        .insert(articles)
        .values(input.articles.map((a) => toArticleRow(a, storyId)))
        .onConflictDoNothing();
    }
    if (input.articleVersions.length > 0) {
      const articleById = new Map(input.articles.map((a) => [a.id, a]));
      await tx
        .insert(articleVersions)
        .values(
          input.articleVersions.map((v) => toArticleVersionRow(v, articleById.get(v.articleId))),
        )
        .onConflictDoNothing();
    }

    const rows = toRows({ ...input.revision, storyId });
    await tx.insert(storyRevisions).values(rows.revision);
    if (rows.claims.length > 0) {
      // 주장 식별자는 개정판을 넘어 유지되므로 이미 있으면 그대로 쓴다.
      await tx
        .insert(claims)
        .values([...rows.claims])
        .onConflictDoNothing();
      await tx.insert(claimRevisions).values([...rows.claimRevisions]);
    }
    if (rows.evidence.length > 0) {
      await tx.insert(evidence).values([...rows.evidence]);
    }

    return { inserted: true, revisionId: rows.revision.id };
  });
}
