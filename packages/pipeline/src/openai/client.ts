import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  type ModelClient,
  type ModelRequest,
  ModelResponseError,
  ModelTransportError,
} from "../types.ts";
import { type PricedModel, reservationUsd, usageToUsd } from "./pricing.ts";

/**
 * 근거 추출·주장 생성·게이트 2단계·상충 관계 라벨의 모델(스펙 "개발 중 결정 항목" 단계별 모델).
 * 날짜 스냅샷 ID이며 개정판의 `modelId`로 기록된다.
 */
export const MODEL_ID = "gpt-5-mini-2025-08-07" satisfies PricedModel;

/**
 * 전송 오류·429·5xx 재시도 횟수. 재시도는 SDK가 아니라 배치(`runBatch`)가 하며 시도마다 예약한다(#55).
 * 제한 시간 초과는 재시도하지 않고 그 사건을 실패로 둔다(다음 배치에서 다시 처리).
 */
export const MODEL_MAX_RETRIES = 2;
/** 재시도 전 대기(지수 백오프의 첫 값). */
export const MODEL_RETRY_DELAY_MS = 2_000;
/** 요청 하나의 제한 시간(단계별 기한). */
export const MODEL_TIMEOUT_MS = 180_000;

export interface OpenAiModelOptions {
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
}

/** 이 요청의 호출 전 예약액(USD): 지시문 + 입력의 토큰 추정 + 최대 출력 토큰. */
export function requestReservationUsd(request: ModelRequest): number {
  return reservationUsd(
    MODEL_ID,
    `${request.instructions}\n${request.input}`,
    request.maxOutputTokens,
  );
}

/** SDK 오류를 배치가 재시도 여부와 과금 여부를 알 수 있는 `ModelTransportError`로 바꾼다. */
function toTransportError(request: ModelRequest, error: unknown): unknown {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new ModelTransportError(
      request.stage,
      request.key,
      `제한 시간 초과 (${MODEL_TIMEOUT_MS / 1000}초)`,
      { retryable: false, billable: true },
    );
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new ModelTransportError(request.stage, request.key, `전송 오류: ${error.message}`, {
      retryable: true,
      billable: false,
    });
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;
    const retryable = status === 429 || status >= 500;
    return new ModelTransportError(request.stage, request.key, `HTTP ${status}: ${error.message}`, {
      retryable,
      billable: false,
    });
  }
  return error;
}

/**
 * Responses API 구조화 출력(JSON 스키마 strict, 요청의 zod 스키마에서 생성)으로 `ModelClient`를 구현한다.
 * 응답 `usage`(입력·캐시 입력·출력)를 단가표로 USD로 바꿔 돌려준다. 응답이 미완료이거나
 * 스키마·기록 형식을 어기면 사용량을 담은 `ModelResponseError`를 던진다(배치는 그 사건만 실패로 둔다).
 * 응답을 받지 못하면 `ModelTransportError`를 던진다 — SDK 재시도는 끄고(`maxRetries: 0`) 배치가
 * 시도마다 예약하며 재시도한다. HTTP는 주입받은 `fetch`가 하므로 테스트는 기록된 응답으로 네트워크 없이 돈다.
 */
export function createOpenAiModelClient(options: OpenAiModelOptions): ModelClient {
  const client = new OpenAI({
    apiKey: options.apiKey,
    maxRetries: 0,
    timeout: MODEL_TIMEOUT_MS,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  return {
    modelId: MODEL_ID,
    async complete(request) {
      let response: Awaited<ReturnType<typeof client.responses.create>>;
      try {
        response = await client.responses.create({
          model: MODEL_ID,
          instructions: request.instructions,
          input: request.input,
          reasoning: { effort: request.reasoningEffort },
          max_output_tokens: request.maxOutputTokens,
          text: { format: zodTextFormat(request.schema, request.schemaName) },
          store: false,
        });
      } catch (error) {
        throw toTransportError(request, error);
      }
      const used = {
        inputTokens: response.usage?.input_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details.cached_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      };
      const usage = {
        tokens: used.inputTokens + used.outputTokens,
        spend: usageToUsd(MODEL_ID, used),
      };
      const fail = (detail: string) =>
        new ModelResponseError(request.stage, request.key, detail, usage);

      if (response.status !== "completed") {
        const reason = response.incomplete_details?.reason ?? response.status ?? "unknown";
        throw fail(`응답 미완료: ${reason}`);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(response.output_text);
      } catch {
        throw fail("응답 스키마 불일치: JSON이 아니다");
      }
      try {
        return { output: request.decode(raw), usage };
      } catch (error) {
        throw fail(`응답 스키마 불일치: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}
