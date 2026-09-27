import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 기록된 OpenAI 임베딩 응답 하나(`fixtures/openai/embeddings.json`). 실제 응답에서 만들며
 * (`scripts/record-embeddings.ts`) 요청에는 키가 없다 — `request.input`이 곧 조회 키다.
 */
export interface RecordedEmbeddingResponse {
  readonly request: { readonly model: string; readonly input: readonly string[] };
  readonly status: number;
  readonly body: unknown;
}

export function recordedEmbeddingPath(): string {
  return fileURLToPath(new URL("../../fixtures/openai/embeddings.json", import.meta.url));
}

export function readRecordedEmbedding(): RecordedEmbeddingResponse | undefined {
  const path = recordedEmbeddingPath();
  if (!existsSync(path)) return undefined;
  const recorded: RecordedEmbeddingResponse = JSON.parse(readFileSync(path, "utf8"));
  return recorded;
}

/** 요청 본문의 `input`이 기록과 같을 때만 기록된 응답을 돌려주는 `fetch`. 테스트 전용, 네트워크 없음. */
export function createRecordedEmbeddingFetch(): typeof fetch {
  const recorded = readRecordedEmbedding();
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = typeof init?.body === "string" ? init.body : "";
    const request: { input?: unknown } = body === "" ? {} : JSON.parse(body);
    if (
      recorded === undefined ||
      !url.pathname.endsWith("/embeddings") ||
      JSON.stringify(request.input) !== JSON.stringify(recorded.request.input)
    ) {
      // SDK는 던져진 fetch 오류를 "Connection error."로 감싸 재시도하므로, 재시도하지 않는 400으로 답한다.
      const message = `기록된 임베딩 응답 없음: ${url.pathname} ${JSON.stringify(request.input)}`;
      return new Response(JSON.stringify({ error: { message } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
      headers: { "content-type": "application/json" },
    });
  };
}
