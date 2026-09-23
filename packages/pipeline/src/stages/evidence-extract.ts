import { findSpan } from "@newsplatform/domain";
import { z } from "zod";
import { CodePointSpanSchema, EvidenceExtractResponseSchema } from "../schemas.ts";
import { type ModelClient, StageFailure } from "../types.ts";

export const STAGE = "evidence-extract";

/** 대상은 `본문 처리 + 발췌 표시` 기사 버전만이다. `body`는 정규화된 기사 버전 본문. */
export const InputSchema = z.object({
  articleVersionId: z.string(),
  body: z.string(),
});

export const OutputSchema = z.object({
  articleVersionId: z.string(),
  quotes: z.array(z.object({ quoteId: z.string(), quote: z.string(), span: CodePointSpanSchema })),
});

export type EvidenceExtractInput = z.infer<typeof InputSchema>;
export type EvidenceExtractOutput = z.infer<typeof OutputSchema>;

/** 본문에서 찾지 못해 버린 인용문. 게이트 1단계가 이 인용문을 `구간 없음`으로 거부한다. */
export interface DroppedQuote {
  readonly quoteId: string;
  readonly reason: "구간 없음";
}

export function idempotencyKey(input: EvidenceExtractInput): string {
  return input.articleVersionId;
}

/**
 * 기록된 인용문 원문을 `findSpan`으로 본문 기준 코드 포인트 구간으로 바꾼다.
 * 본문에 없는 인용문은 출력에서 빼고 `dropped`로 돌려준다.
 */
export async function runEvidenceExtract(
  input: EvidenceExtractInput,
  modelClient: ModelClient,
): Promise<{ output: EvidenceExtractOutput; dropped: readonly DroppedQuote[] }> {
  const key = idempotencyKey(input);
  const parsed = EvidenceExtractResponseSchema.safeParse(await modelClient.complete(STAGE, key));
  if (!parsed.success) {
    throw new StageFailure(STAGE, key, `응답 스키마 불일치: ${z.prettifyError(parsed.error)}`);
  }

  const quotes: EvidenceExtractOutput["quotes"] = [];
  const dropped: DroppedQuote[] = [];
  for (const { quoteId, quote } of parsed.data.quotes) {
    const span = findSpan(input.body, quote);
    if (span === undefined) {
      dropped.push({ quoteId, reason: "구간 없음" });
    } else {
      quotes.push({ quoteId, quote, span });
    }
  }

  return { output: { articleVersionId: input.articleVersionId, quotes }, dropped };
}
