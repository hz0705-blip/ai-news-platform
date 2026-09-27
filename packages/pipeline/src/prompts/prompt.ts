import { z } from "zod";
import type { ModelRequest, ReasoningEffort } from "../types.ts";

/**
 * 버전을 가진 프롬프트 하나(스펙 "파이프라인": 프롬프트는 코드로 관리하고 버전을 가진다).
 * 문안이나 출력 스키마를 바꾸면 `version`의 정수를 올린다(`<단계>@<정수>`).
 */
export interface Prompt<Wire> {
  readonly version: string;
  readonly instructions: string;
  readonly reasoningEffort: ReasoningEffort;
  readonly maxOutputTokens: number;
  readonly schemaName: string;
  /** 모델 출력 스키마. strict 구조화 출력이라 모든 필드가 필수이고 선택 필드가 없다. */
  readonly schema: z.ZodType<Wire>;
}

/**
 * 프롬프트·렌더된 입력·기록 형식 변환으로 모델 요청을 만든다. `decode`는 모델 출력을 스키마로
 * 검증하고 `toRecord`로 기록 형식으로 바꾼다. 둘 중 하나라도 실패하면 던진다.
 */
export function buildRequest<Wire>(
  prompt: Prompt<Wire>,
  stage: string,
  key: string,
  input: string,
  toRecord: (wire: Wire) => unknown,
): ModelRequest {
  return {
    stage,
    key,
    promptVersion: prompt.version,
    instructions: prompt.instructions,
    input,
    reasoningEffort: prompt.reasoningEffort,
    maxOutputTokens: prompt.maxOutputTokens,
    schemaName: prompt.schemaName,
    schema: prompt.schema,
    decode(raw) {
      const parsed = prompt.schema.safeParse(raw);
      if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
      return toRecord(parsed.data);
    },
  };
}
