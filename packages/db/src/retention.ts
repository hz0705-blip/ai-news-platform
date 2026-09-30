import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { RuntimeDb } from "./runtime.ts";
import { articles, articleVersions, stories } from "./schema/index.ts";

export interface RetentionReport {
  /** 이번 실행에서 본문을 지운 기사 버전 수. */
  readonly bodiesDeleted: number;
  /** 이번 실행에서 임베딩을 지운 종료 사건 기사 수. */
  readonly embeddingsCleared: number;
}

/**
 * 보존 정책(docs/spec/v1.md "데이터 보존", #144)을 한 번 적용한다.
 * - 기사 본문: 보존 기한(`body_expires_at`)이 지난 기사 버전의 `body`를 null로 지운다. 한 번에 `limit`행까지
 *   (기한 오래된 순)이며 나머지는 다음 실행이 지운다. 해시·수집 시각·기한과 행 자체는 남는다 — 근거(`evidence`)가
 *   기사 버전을 FK로 참조하고 구간 원문·해시·URL을 따로 갖는다.
 * - 기사 임베딩: 종료 사건에 붙은 기사의 `embedding`을 지운다(사건·주장 임베딩은 검색용으로 남는다).
 */
export async function applyRetention(
  db: RuntimeDb["db"],
  input: { readonly now: Date; readonly limit: number },
): Promise<RetentionReport> {
  const expired = db
    .select({ id: articleVersions.id })
    .from(articleVersions)
    .where(
      and(
        isNotNull(articleVersions.body),
        sql`${articleVersions.body_expires_at} <= ${input.now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(articleVersions.body_expires_at, articleVersions.id)
    .limit(input.limit);
  const bodies = await db
    .update(articleVersions)
    .set({ body: null })
    .where(inArray(articleVersions.id, expired))
    .returning({ id: articleVersions.id });

  const closed = db.select({ id: stories.id }).from(stories).where(eq(stories.lifecycle, "종료"));
  const embeddings = await db
    .update(articles)
    .set({ embedding: null })
    .where(and(isNotNull(articles.embedding), inArray(articles.story_id, closed)))
    .returning({ id: articles.id });

  return { bodiesDeleted: bodies.length, embeddingsCleared: embeddings.length };
}
