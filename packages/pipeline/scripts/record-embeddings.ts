import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createOpenAiEmbeddingClient, EMBEDDING_MODEL } from "../src/openai/embedding.ts";
import { recordedEmbeddingPath } from "../src/openai/embedding-recorded.ts";

/**
 * 실제 OpenAI 임베딩 응답을 픽스처로 기록한다(#53 인수 조건 "기록된 임베딩 응답(실제 응답에서 생성)").
 * 입력 둘(제목+설명 모양)로 요청 한 번. 키는 요청 헤더에만 있고 기록에는 남지 않는다.
 *
 * 실행: OPENAI_API_KEY 필요. node --env-file=../../.env scripts/record-embeddings.ts
 */
const INPUTS = [
  "Ministers agree on fisheries framework\nCaldera and the Vantage Federation signed a framework agreement in Thornholt.",
  "Central bank holds rates steady\nPolicymakers kept the benchmark rate unchanged, citing slowing inflation.",
] as const;

const apiKey = process.env.OPENAI_API_KEY;
if (apiKey === undefined || apiKey === "") {
  console.error("OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}

const recordingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const text = await response.text();
  if (response.ok) {
    const path = recordedEmbeddingPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          request: { model: EMBEDDING_MODEL, input: INPUTS },
          status: response.status,
          body: JSON.parse(text),
        },
        null,
        2,
      )}\n`,
    );
    console.log(JSON.stringify({ recorded: path }));
  }
  return new Response(text, { status: response.status, headers: response.headers });
};

const result = await createOpenAiEmbeddingClient({ apiKey, fetch: recordingFetch }).embed(INPUTS);
console.log(JSON.stringify({ vectors: result.vectors.length, usage: result.usage }));
