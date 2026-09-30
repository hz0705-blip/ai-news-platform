import type {
  Article,
  ArticleVersion,
  Revision,
  RevisionChange,
  Source,
  Story,
} from "@newstrail/domain";
import { and, eq } from "drizzle-orm";
import {
  toArticleRow,
  toArticleVersionRow,
  toChangeRows,
  toRows,
  toSourceRow,
  toStoryRow,
} from "./mappers.ts";
import type { RuntimeDb } from "./runtime.ts";
import {
  articles,
  articleVersions,
  claimRevisions,
  claims,
  evidence,
  revisionChanges,
  sources,
  stories,
  storyRevisions,
} from "./schema/index.ts";

export interface CommitRevisionInput {
  readonly revision: Revision;
  /** 직전 개정판과의 변화(#85, `computeChanges`). 첫 개정판·데모 시드는 없다. */
  readonly changes?: readonly RevisionChange[];
}

/**
 * 개정판 하나를 한 트랜잭션으로 커밋한다(docs/spec/v1.md "사건 단위 원자성", ADR-0009 "같은 트랜잭션").
 *
 * - 사건은 `revision.storyId`다. 사건 행은 이미 있어야 한다(수집·배정 또는 `saveDemoStoryRecords`).
 * - 그 사건에 같은 `revision_number`가 이미 있으면 아무것도 쓰지 않고 `inserted: false`(멱등).
 * - 없으면 개정판·주장·주장 개정판·근거·변화를 전부 넣는다. 어느 삽입이든 실패하면 트랜잭션 전체가 롤백된다.
 */
export async function commitRevision(
  db: RuntimeDb["db"],
  input: CommitRevisionInput,
): Promise<{ inserted: boolean; revisionId: string }> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: storyRevisions.id })
      .from(storyRevisions)
      .where(
        and(
          eq(storyRevisions.story_id, input.revision.storyId),
          eq(storyRevisions.revision_number, input.revision.revisionNumber),
        ),
      )
      .limit(1);
    const found = existing[0];
    if (found !== undefined) return { inserted: false, revisionId: found.id };

    const rows = toRows(input.revision);
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
    const changeRows = toChangeRows(rows.revision.id, input.changes ?? []);
    if (changeRows.length > 0) {
      await tx.insert(revisionChanges).values(changeRows);
    }

    return { inserted: true, revisionId: rows.revision.id };
  });
}

export interface DemoStoryRecords {
  readonly story: Story;
  readonly sources: readonly Source[];
  readonly articles: readonly Article[];
  readonly articleVersions: readonly ArticleVersion[];
}

/**
 * 데모 적재가 개정판 커밋 전에 쓰는 사건·출처·기사·기사 버전(#21 Ruling 6)을 한 트랜잭션으로 넣는다.
 * 라이브 경로에서는 수집·배정이 이 행들을 쓴다. 이미 있는 행은 그대로 둔다(멱등).
 */
export async function saveDemoStoryRecords(
  db: RuntimeDb["db"],
  input: DemoStoryRecords,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(stories).values(toStoryRow(input.story)).onConflictDoNothing();
    if (input.sources.length > 0) {
      await tx.insert(sources).values(input.sources.map(toSourceRow)).onConflictDoNothing();
    }
    if (input.articles.length > 0) {
      await tx
        .insert(articles)
        .values(input.articles.map((a) => toArticleRow(a, input.story.id)))
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
  });
}

/**
 * 재처리 결과가 직전 개정판과 같을 때(개정판을 만들지 않을 때) 그 개정판의 확인 시각만 갱신한다.
 * 개정판 수와 발행 시각은 바뀌지 않는다. 그런 개정판이 없으면 `updated: false`.
 */
export async function confirmRevision(
  db: RuntimeDb["db"],
  input: { readonly revisionId: string; readonly checkedAt: Date },
): Promise<{ updated: boolean }> {
  const rows = await db
    .update(storyRevisions)
    .set({ checked_at: input.checkedAt })
    .where(eq(storyRevisions.id, input.revisionId))
    .returning({ id: storyRevisions.id });
  return { updated: rows.length === 1 };
}
