import { checkEvidenceSpan, RIGHTS_TIERS, spanText } from "@newsplatform/domain";
import { z } from "zod";
import { CodePointSpanSchema } from "../schemas.ts";
import { StageFailure } from "../types.ts";

export const STAGE = "gate";

/**
 * 주장 하나의 인용문들을 게이트 1단계에 건다(모델 없음).
 * `located`는 근거 추출이 본문에서 찾은 인용문, `articleVersions`는 그 본문과 권리 등급이다.
 */
export const InputSchema = z.object({
  storyId: z.string(),
  claimKey: z.string(),
  quoteIds: z.array(z.string()),
  located: z.array(
    z.object({ quoteId: z.string(), articleVersionId: z.string(), span: CodePointSpanSchema }),
  ),
  articleVersions: z.array(
    z.object({
      articleVersionId: z.string(),
      body: z.string(),
      normalizationVersion: z.number().int(),
      rightsTier: z.enum(RIGHTS_TIERS),
    }),
  ),
});

export const OutputSchema = z.object({
  claimKey: z.string(),
  evidence: z.array(
    z.object({
      quoteId: z.string(),
      articleVersionId: z.string(),
      span: CodePointSpanSchema,
      normalizationVersion: z.number().int(),
      spanText: z.string(),
      excerpt: z.string(),
      excerptSpan: CodePointSpanSchema,
      highlightInExcerpt: CodePointSpanSchema,
    }),
  ),
});

export type GateInput = z.infer<typeof InputSchema>;
export type GateOutput = z.infer<typeof OutputSchema>;

export function idempotencyKey(input: GateInput): string {
  return `${input.storyId}:gate:${input.claimKey}`;
}

/**
 * 주장의 모든 인용문에 `checkEvidenceSpan`을 돌린다. 하나라도 실패하면 사유 열거형
 * (`GATE_FAILURES`)을 담은 `StageFailure`를 던진다 — 그 사건은 발행하지 않는다.
 * 본문에서 찾지 못한 인용문은 구간이 없으므로 `구간 없음`이다.
 */
export function runGate(input: GateInput): GateOutput {
  const key = idempotencyKey(input);
  const evidence: GateOutput["evidence"] = [];

  for (const quoteId of input.quoteIds) {
    const quote = input.located.find((q) => q.quoteId === quoteId);
    const version = input.articleVersions.find(
      (v) => v.articleVersionId === quote?.articleVersionId,
    );
    if (quote === undefined || version === undefined) {
      throw new StageFailure(STAGE, key, `구간 없음 (${quoteId})`);
    }

    const result = checkEvidenceSpan({
      body: version.body,
      span: quote.span,
      rightsTier: version.rightsTier,
      normalizationVersion: version.normalizationVersion,
    });
    if (!result.ok) {
      throw new StageFailure(STAGE, key, `${result.reason} (${quoteId})`);
    }

    evidence.push({
      quoteId,
      articleVersionId: quote.articleVersionId,
      span: quote.span,
      normalizationVersion: version.normalizationVersion,
      spanText: spanText(version.body, quote.span),
      excerpt: result.excerpt,
      excerptSpan: result.excerptSpan,
      highlightInExcerpt: result.highlightInExcerpt,
    });
  }

  return { claimKey: input.claimKey, evidence };
}
