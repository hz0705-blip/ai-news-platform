import { sha256Hex } from "@newsplatform/domain";
import { z } from "zod";
import * as prompt from "../prompts/claim-generate.ts";
import { buildRequest } from "../prompts/prompt.ts";
import { ClaimGenerateResponseSchema } from "../schemas.ts";
import { type ModelClient, StageFailure } from "../types.ts";

export const STAGE = "claim-generate";

/**
 * `articleVersionIds`는 근거 추출 대상(본문 처리) 기사 버전들, `quoteIds`는 근거 추출이
 * 돌려준 인용문 식별자 전부다(본문에서 찾지 못해 버린 것도 포함 — 그 인용문을 쓰는 주장은
 * 게이트 1단계가 `구간 없음`으로 거부한다). `articles`는 모델에 보여 줄 기사별 출처명·제목과
 * 본문에서 찾은 인용문이다.
 */
export const InputSchema = z.object({
  storyId: z.string(),
  articleVersionIds: z.array(z.string()),
  quoteIds: z.array(z.string()),
  articles: z.array(
    z.object({
      sourceName: z.string(),
      title: z.string(),
      quotes: z.array(z.object({ quoteId: z.string(), quote: z.string() })),
    }),
  ),
});

/** 응답과 출력은 같은 모양이다. */
export const OutputSchema = ClaimGenerateResponseSchema;

export type ClaimGenerateInput = z.infer<typeof InputSchema>;
export type ClaimGenerateOutput = z.infer<typeof OutputSchema>;

/** `<storyId>:<정렬된 articleVersionId 목록을 ","로 이은 문자열의 sha256Hex 앞 12자>`. */
export function idempotencyKey(input: ClaimGenerateInput): string {
  const ids = [...input.articleVersionIds].sort().join(",");
  return `${input.storyId}:${sha256Hex(ids).slice(0, 12)}`;
}

/** 주장 문장을 받는다. 근거 추출이 모르는 인용문을 가리키거나 인용문이 없는 주장은 버린다. */
export async function runClaimGenerate(
  input: ClaimGenerateInput,
  modelClient: ModelClient,
): Promise<ClaimGenerateOutput> {
  const key = idempotencyKey(input);
  const { output: response } = await modelClient.complete(
    buildRequest(prompt.PROMPT, STAGE, key, prompt.render(input), prompt.toRecord),
  );
  const parsed = OutputSchema.safeParse(response);
  if (!parsed.success) {
    throw new StageFailure(STAGE, key, `응답 스키마 불일치: ${z.prettifyError(parsed.error)}`);
  }

  const known = new Set(input.quoteIds);
  return {
    title: parsed.data.title,
    claims: parsed.data.claims.filter(
      (claim) => claim.quoteIds.length > 0 && claim.quoteIds.every((id) => known.has(id)),
    ),
  };
}
