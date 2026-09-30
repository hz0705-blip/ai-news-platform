import OpenAI from "openai";
import type { EmbeddingClient, EmbeddingResult } from "../types.ts";

// 웹(검색, #125)은 픽스처 경로를 읽는 패키지 루트 대신 이 서브패스(`@newstrail/pipeline/embedding`)만 import한다.
export type { EmbeddingClient } from "../types.ts";

/**
 * OpenAI 임베딩 클라이언트(스펙 "개발 중 결정 항목" 임베딩 모델·차원): `text-embedding-3-small`,
 * 1536차원(기본값, 축소 없음). 사용량은 응답 `usage.total_tokens`에 단가를 곱해 USD로 돌려준다.
 * HTTP는 주입받은 `fetch`가 하므로 테스트는 기록된 응답으로 네트워크 없이 돈다.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
/** OpenAI 가격표 실측(2026-09-27): $0.02 / 1M 토큰. */
export const EMBEDDING_USD_PER_TOKEN = 0.02 / 1_000_000;
/** 요청 하나에 넣는 입력 수 상한(API 상한 2,048보다 작게 둔다). */
export const EMBEDDING_BATCH_SIZE = 100;

export interface OpenAiEmbeddingOptions {
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  /** 요청 하나의 제한 시간(ms). 비우면 SDK 기본(600초) — 배치용. 웹 검색은 짧게 준다(#125). */
  readonly timeoutMs?: number;
  /** SDK 재시도 횟수. 비우면 SDK 기본(2). */
  readonly maxRetries?: number;
}

export function createOpenAiEmbeddingClient(options: OpenAiEmbeddingOptions): EmbeddingClient {
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
  });
  return {
    async embed(texts): Promise<EmbeddingResult> {
      const vectors: (readonly number[])[] = [];
      let tokens = 0;
      for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
        const chunk = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
        const response = await client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: [...chunk],
          encoding_format: "float",
        });
        if (response.data.length !== chunk.length) {
          throw new Error(`임베딩 수 불일치: 요청 ${chunk.length}, 응답 ${response.data.length}`);
        }
        // 응답의 `index`가 입력 순서다.
        const ordered = [...response.data].sort((a, b) => a.index - b.index);
        for (const item of ordered) {
          if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
            throw new Error(`임베딩 차원 불일치: ${item.embedding.length}`);
          }
          vectors.push(item.embedding);
        }
        tokens += response.usage.total_tokens;
      }
      return { vectors, usage: { tokens, spend: tokens * EMBEDDING_USD_PER_TOKEN } };
    },
  };
}
