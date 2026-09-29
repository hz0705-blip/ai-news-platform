import { desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { RuntimeDb } from "./runtime.ts";
import {
  claimEmbeddings,
  claimRevisions,
  storyEmbeddings,
  storyRevisions,
} from "./schema/index.ts";

/** 검색 임베딩 대상 하나(#124): 사건 제목 또는 주장 문장. `text`는 최신 발행 개정판의 문장이다. */
export interface SearchEmbeddingTarget {
  readonly kind: "story" | "claim";
  /** 사건 식별자 또는 주장 식별자. */
  readonly id: string;
  readonly text: string;
}

export interface SearchEmbeddingRow extends SearchEmbeddingTarget {
  readonly embedding: readonly number[];
}

/**
 * 임베딩이 빈 대상(#124): 발행된 사건(데모 포함)마다 최신 개정판의 제목과 그 개정판의 주장 문장 가운데,
 * 검색 임베딩 행이 없거나 행의 `text`가 지금 문장과 다른 것. 사건·주장 식별자 순.
 */
export async function loadSearchEmbeddingTargets(
  db: RuntimeDb["db"],
): Promise<SearchEmbeddingTarget[]> {
  const latest = db
    .selectDistinctOn([storyRevisions.story_id], {
      id: storyRevisions.id,
      story_id: storyRevisions.story_id,
      title: storyRevisions.title,
    })
    .from(storyRevisions)
    .orderBy(storyRevisions.story_id, desc(storyRevisions.revision_number))
    .as("latest");
  const storyRows = await db
    .select({ id: latest.story_id, text: latest.title })
    .from(latest)
    .leftJoin(storyEmbeddings, eq(storyEmbeddings.story_id, latest.story_id))
    .where(or(isNull(storyEmbeddings.story_id), ne(storyEmbeddings.text, latest.title)))
    .orderBy(latest.story_id);
  const claimRows = await db
    .select({ id: claimRevisions.claim_id, text: claimRevisions.text })
    .from(latest)
    .innerJoin(claimRevisions, eq(claimRevisions.story_revision_id, latest.id))
    .leftJoin(claimEmbeddings, eq(claimEmbeddings.claim_id, claimRevisions.claim_id))
    .where(or(isNull(claimEmbeddings.claim_id), ne(claimEmbeddings.text, claimRevisions.text)))
    .orderBy(claimRevisions.claim_id);
  return [
    ...storyRows.map((r) => ({ kind: "story" as const, ...r })),
    ...claimRows.map((r) => ({ kind: "claim" as const, ...r })),
  ];
}

/** 이미 임베딩한 같은 문장(사건 제목·주장 문장 어느 쪽이든)의 벡터. 같은 문장은 다시 임베딩하지 않는다. */
export async function loadSearchEmbeddingsByText(
  db: RuntimeDb["db"],
  texts: readonly string[],
): Promise<Map<string, readonly number[]>> {
  const found = new Map<string, readonly number[]>();
  if (texts.length === 0) return found;
  const wanted = [...new Set(texts)];
  for (const table of [storyEmbeddings, claimEmbeddings]) {
    const rows = await db
      .select({ text: table.text, embedding: table.embedding })
      .from(table)
      .where(inArray(table.text, wanted));
    for (const row of rows) found.set(row.text, row.embedding);
  }
  return found;
}

/** 검색 임베딩 행을 쓴다(있으면 문장·벡터를 바꾼다). 한 트랜잭션. */
export async function saveSearchEmbeddings(
  db: RuntimeDb["db"],
  rows: readonly SearchEmbeddingRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const values = { text: row.text, embedding: [...row.embedding] };
      if (row.kind === "story") {
        await tx
          .insert(storyEmbeddings)
          .values({ story_id: row.id, ...values })
          .onConflictDoUpdate({ target: storyEmbeddings.story_id, set: values });
      } else {
        await tx
          .insert(claimEmbeddings)
          .values({ claim_id: row.id, ...values })
          .onConflictDoUpdate({ target: claimEmbeddings.claim_id, set: values });
      }
    }
  });
}
