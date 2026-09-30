import { cosineSimilarity } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import { createOpenAiEmbeddingClient, EMBEDDING_DIMENSIONS } from "./embedding.ts";
import { createRecordedEmbeddingFetch, readRecordedEmbedding } from "./embedding-recorded.ts";

describe("OpenAI 임베딩 클라이언트", () => {
  it("returns 1536-d vectors in input order with token usage priced at $0.02 per 1M", async () => {
    const recorded = readRecordedEmbedding();
    if (recorded === undefined) throw new Error("기록된 임베딩 응답이 없다");
    const client = createOpenAiEmbeddingClient({
      apiKey: "test-key",
      fetch: createRecordedEmbeddingFetch(),
    });
    const result = await client.embed(recorded.request.input);
    expect(result.vectors).toHaveLength(2);
    expect(result.vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    // 서로 다른 사건의 제목+설명은 같은 방향이 아니다.
    const [a, b] = result.vectors;
    if (a === undefined || b === undefined) throw new Error("벡터 없음");
    expect(cosineSimilarity(a, b)).toBeLessThan(0.5);
    expect(result.usage.tokens).toBe(43);
    expect(result.usage.spend).toBeCloseTo((43 * 0.02) / 1_000_000, 12);
  });

  it("does not touch the network for inputs without a recorded response", async () => {
    const client = createOpenAiEmbeddingClient({
      apiKey: "test-key",
      fetch: createRecordedEmbeddingFetch(),
    });
    await expect(client.embed(["unrecorded"])).rejects.toThrow("기록된 임베딩 응답 없음");
  });

  it("gives up after the request timeout without retrying when configured", async () => {
    let calls = 0;
    // 응답하지 않는 서버: 중단 신호가 올 때만 끝난다.
    const hang: typeof fetch = (_input, init) => {
      calls += 1;
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    };
    const client = createOpenAiEmbeddingClient({
      apiKey: "test-key",
      fetch: hang,
      timeoutMs: 50,
      maxRetries: 0,
    });
    const started = Date.now();
    await expect(client.embed(["질의"])).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(calls).toBe(1);
  });
});
