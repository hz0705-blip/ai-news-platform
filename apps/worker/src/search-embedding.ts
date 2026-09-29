import {
  loadSearchEmbeddingsByText,
  loadSearchEmbeddingTargets,
  type RuntimeDb,
  type SearchEmbeddingRow,
  saveSearchEmbeddings,
} from "@newsplatform/db";
import type { EmbeddingClient } from "@newsplatform/pipeline";

/** 임베딩 요청 하나이자 DB 쓰기 한 번에 넣는 문장 수(#124 Ruling). 중간에 실패해도 앞 묶음은 남는다. */
export const SEARCH_EMBEDDING_CHUNK = 100;

export interface SearchEmbeddingReport {
  /** 임베딩이 빈 사건 제목·주장 문장 수. */
  readonly targets: number;
  /** 같은 문장의 기존 벡터를 복사한 수(임베딩 호출 없음). */
  readonly reused: number;
  /** 새로 임베딩해 쓴 수. */
  readonly embedded: number;
  readonly usage: { readonly tokens: number; readonly spend: number };
  /** 임베딩 호출이 실패해 멈췄으면 그 이유. 남은 대상은 비어 있고 다음 배치·백필이 채운다. */
  readonly failure?: string;
}

/**
 * 검색 임베딩 채우기(#124): 임베딩이 빈 발행 사건 제목·주장 문장(`loadSearchEmbeddingTargets`)을 채운다.
 * 같은 문장이 이미 임베딩돼 있으면 그 벡터를 쓰고, 나머지 서로 다른 문장만 `SEARCH_EMBEDDING_CHUNK`개씩 임베딩한다.
 * 입력 문자열은 문장 그대로다. 배치(발행 뒤)와 백필 명령이 같은 함수를 쓴다. 임베딩 실패는 던지지 않고 `failure`로 돌려준다.
 */
export async function fillSearchEmbeddings(deps: {
  readonly db: RuntimeDb["db"];
  readonly embeddingClient: EmbeddingClient;
}): Promise<SearchEmbeddingReport> {
  const { db } = deps;
  const targets = await loadSearchEmbeddingTargets(db);
  const known = await loadSearchEmbeddingsByText(
    db,
    targets.map((t) => t.text),
  );
  const reused: SearchEmbeddingRow[] = [];
  for (const target of targets) {
    const embedding = known.get(target.text);
    if (embedding !== undefined) reused.push({ ...target, embedding });
  }
  await saveSearchEmbeddings(db, reused);

  const pending = targets.filter((t) => !known.has(t.text));
  const texts = [...new Set(pending.map((t) => t.text))];
  let embedded = 0;
  let tokens = 0;
  let spend = 0;
  for (let start = 0; start < texts.length; start += SEARCH_EMBEDDING_CHUNK) {
    const chunk = texts.slice(start, start + SEARCH_EMBEDDING_CHUNK);
    let vectors: readonly (readonly number[])[];
    try {
      const result = await deps.embeddingClient.embed(chunk);
      tokens += result.usage.tokens;
      spend += result.usage.spend;
      if (result.vectors.length !== chunk.length) {
        throw new Error(`임베딩 수 불일치: 요청 ${chunk.length}, 응답 ${result.vectors.length}`);
      }
      vectors = result.vectors;
    } catch (error) {
      return {
        targets: targets.length,
        reused: reused.length,
        embedded,
        usage: { tokens, spend },
        failure: error instanceof Error ? error.message : String(error),
      };
    }
    const byText = new Map(chunk.map((text, i) => [text, vectors[i] as readonly number[]]));
    const rows = pending.flatMap((t) => {
      const embedding = byText.get(t.text);
      return embedding === undefined ? [] : [{ ...t, embedding }];
    });
    await saveSearchEmbeddings(db, rows);
    embedded += rows.length;
  }
  return { targets: targets.length, reused: reused.length, embedded, usage: { tokens, spend } };
}
