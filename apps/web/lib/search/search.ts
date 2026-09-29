import { type RuntimeDb, type StorySearchHit, searchStoriesByEmbedding } from "@newsplatform/db";
import { EMBEDDING_USD_PER_TOKEN, type EmbeddingClient } from "@newsplatform/pipeline/embedding";

/** 검색 결과 사건 수 N(스펙 "개발 중 결정 항목" 검색 결과·한도 줄). */
export const SEARCH_RESULT_LIMIT = 20;
/** 질의 길이(코드 포인트, NFC 뒤). */
export const SEARCH_QUERY_MAX_CODE_POINTS = 200;

export interface SearchOutcome {
  readonly stories: readonly StorySearchHit[];
  /** 질의 임베딩의 실제 비용(USD, 응답 `usage`). 예산 정산에 쓴다. */
  readonly spendUsd: number;
}

/**
 * 검색의 좁은 인터페이스(스펙 "화면과 경험" 검색): 질의 하나 → 사건 목록. 지금은 의미 검색(질의 임베딩 → 사건 제목·주장
 * 임베딩과 코사인 비교)이고, 하이브리드(키워드+의미)로 바꿀 때 이 뒤만 바꾼다. 한도·예산은 호출하는 쪽(실행 경로)이 맡는다.
 */
export interface StorySearch {
  search(query: string): Promise<SearchOutcome>;
}

export function createStorySearch(deps: {
  readonly db: RuntimeDb["db"];
  readonly embeddingClient: EmbeddingClient;
  readonly limit?: number;
}): StorySearch {
  return {
    async search(query) {
      const { vectors, usage } = await deps.embeddingClient.embed([query]);
      const embedding = vectors[0];
      if (embedding === undefined) throw new Error("질의 임베딩이 없다");
      const stories = await searchStoriesByEmbedding(deps.db, {
        embedding,
        limit: deps.limit ?? SEARCH_RESULT_LIMIT,
      });
      return { stories, spendUsd: usage.spend };
    },
  };
}

/** 질의 검증: NFC로 정규화하고 앞뒤 공백을 뗀 뒤 1~200 코드 포인트여야 한다. 아니면 null. */
export function normalizeSearchQuery(raw: string): string | null {
  const query = raw.normalize("NFC").trim();
  const length = [...query].length;
  return length >= 1 && length <= SEARCH_QUERY_MAX_CODE_POINTS ? query : null;
}

/**
 * 질의 임베딩의 최대 비용(예약액). 바이트 수준 BPE 토큰은 1바이트 이상이므로 UTF-8 바이트 수가 토큰 수의 상한이다
 * (200 코드 포인트면 최대 800바이트 ≈ $0.000016).
 */
export function searchReservationUsd(query: string): number {
  return new TextEncoder().encode(query).length * EMBEDDING_USD_PER_TOKEN;
}
