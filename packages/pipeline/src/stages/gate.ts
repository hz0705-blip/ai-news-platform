import {
  CLAIM_TYPES,
  checkEvidenceSpan,
  MODALITIES,
  RIGHTS_TIERS,
  spanText,
} from "@newstrail/domain";
import { z } from "zod";
import * as prompt from "../prompts/gate.ts";
import { buildRequest } from "../prompts/prompt.ts";
import {
  CodePointSpanSchema,
  type GateSupportLabel,
  GateSupportResponseSchema,
} from "../schemas.ts";
import { type ModelClient, StageFailure } from "../types.ts";

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

/** 게이트 1·2단계가 같은 키를 쓴다(2단계 기록 응답의 조회 키). */
export function idempotencyKey(input: {
  readonly storyId: string;
  readonly claimKey: string;
}): string {
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

// ── 게이트 2단계: 한국어 주장이 영어 구간에서 뒷받침되는가(모델 판정) ──────────

/** 게이트 1단계를 통과한 주장 하나와 그 근거 구간 원문. */
export const SupportInputSchema = z.object({
  storyId: z.string(),
  claimKey: z.string(),
  claim: z.object({
    text: z.string(),
    claimType: z.enum(CLAIM_TYPES),
    modality: z.enum(MODALITIES),
  }),
  evidence: z.array(z.object({ quoteId: z.string(), spanText: z.string() })),
});

export type GateSupportInput = z.infer<typeof SupportInputSchema>;

export interface GateSupportOutput {
  readonly claimKey: string;
  /** 주장을 발행하는가: "뒷받침" 인용이 하나 이상일 때만. */
  readonly publish: boolean;
  /**
   * 개정판에 남기는 인용(입력 순서): "뒷받침"과 "상충". "상충" 인용은 주장을 뒷받침하지 않지만
   * 상충 판정의 반대 쪽 근거가 된다. 나머지 세 라벨의 인용은 버린다.
   */
  readonly kept: readonly string[];
  readonly labels: Readonly<Record<string, GateSupportLabel>>;
  /** 발행하지 않을 때의 사유(라벨 요약). */
  readonly reason: string;
}

/**
 * 라벨 하나가 인용에 주는 효과(스펙 "뒷받침 판정 게이트의 통과 임계"):
 * 뒷받침 → 발행 근거, 상충 → 반대 쪽 근거로만 유지, 부분 뒷받침·뒷받침 안 됨·판정 불가 → 버림.
 */
export function gateLabelEffect(label: GateSupportLabel): "support" | "oppose" | "discard" {
  if (label === "뒷받침") return "support";
  if (label === "상충") return "oppose";
  return "discard";
}

/**
 * 주장의 근거 인용마다 모델 라벨을 받아 발행 여부와 남길 인용을 정한다. 응답이 입력 인용을
 * 정확히 한 번씩 라벨하지 않으면 응답 스키마 불일치로 던진다(그 사건만 실패).
 */
export async function runGateSupport(
  input: GateSupportInput,
  modelClient: ModelClient,
): Promise<GateSupportOutput> {
  const key = idempotencyKey(input);
  const { output: response } = await modelClient.complete(
    buildRequest(prompt.PROMPT, STAGE, key, prompt.render(input), (wire) => wire),
  );
  const parsed = GateSupportResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new StageFailure(STAGE, key, `응답 스키마 불일치: ${z.prettifyError(parsed.error)}`);
  }

  const labels: Record<string, GateSupportLabel> = {};
  const expected = new Set(input.evidence.map((e) => e.quoteId));
  for (const { quoteId, label } of parsed.data.judgments) {
    if (!expected.has(quoteId) || Object.hasOwn(labels, quoteId)) {
      throw new StageFailure(
        STAGE,
        key,
        `응답 스키마 불일치: 인용 ${quoteId}가 이 주장의 근거가 아니거나 두 번 라벨됐다`,
      );
    }
    labels[quoteId] = label;
  }
  const missing = [...expected].filter((quoteId) => !Object.hasOwn(labels, quoteId));
  if (missing.length > 0) {
    throw new StageFailure(STAGE, key, `응답 스키마 불일치: 라벨 없는 인용 ${missing.join(",")}`);
  }

  const effect = (quoteId: string) => gateLabelEffect(labels[quoteId] ?? "판정 불가");
  const kept = input.evidence.map((e) => e.quoteId).filter((id) => effect(id) !== "discard");
  const publish = kept.some((id) => effect(id) === "support");
  const reason = publish
    ? ""
    : `게이트 2단계 미통과: ${input.evidence.map((e) => `${e.quoteId}=${labels[e.quoteId]}`).join(", ")}`;
  return { claimKey: input.claimKey, publish, kept, labels, reason };
}
