import { sha256Hex } from "@newstrail/domain";
import type { EmbeddingClient, ModelClient } from "../types.ts";

/**
 * 유료 호출 전 전체 경로 점검용(`eval:run --offline`, `eval:score --offline`, 테스트). 요청 입력만 보고 모든 단계에
 * 스키마를 지키는 가짜 응답을 준다. 사용량은 0이다. 수치는 의미가 없다.
 */
export function createOfflineModelClient(modelId: string): ModelClient {
  return {
    modelId,
    async complete(request) {
      const quoteIds = [...request.input.matchAll(/\[(q-[0-9a-f]{6}-[0-9]+)\]/g)].map(
        (m) => m[1] as string,
      );
      let wire: unknown;
      if (request.stage === "evidence-extract") {
        wire = {
          quotes: request.input.includes("[s2]")
            ? [{ sentenceIds: ["s1"] }, { sentenceIds: ["s2"] }]
            : [{ sentenceIds: ["s1"] }],
        };
      } else if (request.stage === "claim-generate") {
        wire = {
          title: "오프라인 점검 제목",
          claims: [
            { text: "오프라인 점검 주장", claimType: "보도된 사실", modality: "단정", quoteIds },
          ],
        };
      } else if (request.stage === "gate") {
        wire = {
          judgments: quoteIds.map((quoteId) => ({ quoteId, label: "뒷받침", reason: "점검" })),
        };
      } else if (request.stage === "contradiction-label") {
        wire = {
          pairs: quoteIds.flatMap((a, i) =>
            quoteIds.slice(i + 1).map((b) => ({ a, b, label: "뒷받침 일치", differsIn: [] })),
          ),
        };
      } else if (request.stage === "eval-judge") {
        wire = { matches: [{ a: "A1", b: "B1" }] };
      } else {
        throw new Error(`오프라인 응답이 없는 단계: ${request.stage}`);
      }
      return { output: request.decode(wire), usage: { tokens: 0, spend: 0 } };
    },
  };
}

/** 제목 낱말 해시 주머니 벡터(64차원). 같은 낱말이 많은 기사끼리 가깝다. */
export function createOfflineEmbeddingClient(): EmbeddingClient {
  return {
    async embed(texts) {
      const vectors = texts.map((text) => {
        const vector = new Array<number>(64).fill(0);
        for (const word of (text.split("\n")[0] ?? "").toLowerCase().match(/[a-z0-9]{4,}/g) ?? []) {
          const index = Number.parseInt(sha256Hex(word).slice(0, 4), 16) % 64;
          vector[index] = (vector[index] ?? 0) + 1;
        }
        return vector;
      });
      return { vectors, usage: { tokens: 0, spend: 0 } };
    },
  };
}
