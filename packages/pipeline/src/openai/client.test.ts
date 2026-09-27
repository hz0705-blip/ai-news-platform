import { readFileSync } from "node:fs";
import { normalizeBody } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { loadDemoStoryInputs } from "../fixtures.ts";
import * as evidencePrompt from "../prompts/evidence-extract.ts";
import { buildRequest } from "../prompts/prompt.ts";
import { ModelResponseError } from "../types.ts";
import { createOpenAiModelClient, MODEL_ID } from "./client.ts";
import { usageToUsd } from "./pricing.ts";

/** 기록 실행의 첫 Responses API 응답 원문(근거 추출, 기사 av-hormuz-1). */
interface RecordedBody {
  readonly usage: {
    readonly input_tokens: number;
    readonly input_tokens_details: { readonly cached_tokens: number };
    readonly output_tokens: number;
  };
  readonly output: readonly {
    readonly type: string;
    readonly content?: readonly { readonly type: string; readonly text?: string }[];
  }[];
}
const recorded: { status: number; body: RecordedBody } = JSON.parse(
  readFileSync(new URL("../../fixtures/openai/response.json", import.meta.url), "utf8"),
);

const fixture = loadDemoStoryInputs("live-hormuz-proposal");
const article = fixture.articles.find((a) => a.meta.articleVersionId === "av-hormuz-1");
if (article === undefined) throw new Error("기사 av-hormuz-1이 없다");
const body = normalizeBody(article.rawBody);
const request = buildRequest(
  evidencePrompt.PROMPT,
  "evidence-extract",
  "av-hormuz-1",
  evidencePrompt.render(body),
  evidencePrompt.toRecord("av-hormuz-1", body),
);

/** 네트워크 없이 기록된 응답(또는 출력 문장만 바꾼 것)을 돌려주는 fetch. */
function fetchReturning(outputText?: string): typeof fetch {
  const responseBody =
    outputText === undefined
      ? recorded.body
      : {
          ...recorded.body,
          output: recorded.body.output.map((item) =>
            item.type === "message"
              ? { ...item, content: [{ type: "output_text", text: outputText, annotations: [] }] }
              : item,
          ),
        };
  return async () =>
    new Response(JSON.stringify(responseBody), {
      status: recorded.status,
      headers: { "content-type": "application/json" },
    });
}

const expectedSpend = usageToUsd(MODEL_ID, {
  inputTokens: recorded.body.usage.input_tokens,
  cachedInputTokens: recorded.body.usage.input_tokens_details.cached_tokens,
  outputTokens: recorded.body.usage.output_tokens,
});

describe("OpenAI 모델 클라이언트", () => {
  it("구조화 출력을 기록 형식으로 바꾸고 usage를 USD로 돌려준다", async () => {
    const client = createOpenAiModelClient({ apiKey: "test", fetch: fetchReturning() });
    const response = await client.complete(request);
    const recordedEvidence: Record<string, unknown> = JSON.parse(
      readFileSync(
        new URL(
          "../../fixtures/live-hormuz-proposal/recorded/evidence-extract.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(response.output).toEqual(recordedEvidence["av-hormuz-1"]);
    expect(response.usage.spend).toBeCloseTo(expectedSpend, 12);
    expect(client.modelId).toBe("gpt-5-mini-2025-08-07");
  });

  it("스키마를 어긴 응답은 사용량을 담은 응답 스키마 불일치로 던진다", async () => {
    for (const text of ['{"quotes":[{"sentenceIds":["s999"]}]}', '{"quotes":"x"}', "not json"]) {
      const client = createOpenAiModelClient({ apiKey: "test", fetch: fetchReturning(text) });
      const error = await client.complete(request).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ModelResponseError);
      expect(String(error)).toMatch(/응답 스키마 불일치/);
      if (error instanceof ModelResponseError)
        expect(error.usage.spend).toBeCloseTo(expectedSpend, 12);
    }
  });
});
