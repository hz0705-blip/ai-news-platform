import {
  CONTRADICTION_STATUSES,
  countReportingOrigins,
  deriveClaimStatus,
  RIGHTS_TIERS,
  UnpublishableClaimError,
} from "@newsplatform/domain";
import { z } from "zod";
import { ContradictionLabelResponseSchema } from "../schemas.ts";
import { type ModelClient, StageFailure } from "../types.ts";

export const STAGE = "contradiction-label";

/** 게이트 1단계를 통과한 주장 하나의 근거들(인용문 식별자와 출처). */
export const InputSchema = z.object({
  claimKey: z.string(),
  evidence: z.array(
    z.object({ quoteId: z.string(), sourceId: z.string(), rightsTier: z.enum(RIGHTS_TIERS) }),
  ),
});

export const OutputSchema = z.object({
  claimKey: z.string(),
  contradictionStatus: z.enum(CONTRADICTION_STATUSES),
});

export type ContradictionInput = z.infer<typeof InputSchema>;
export type ContradictionOutput = z.infer<typeof OutputSchema>;

export function idempotencyKey(input: ContradictionInput): string {
  return input.claimKey;
}

/**
 * 기록된 관계 라벨로 주장의 상충 상태를 정한다(#21 Ruling 13). `판정 불가` 라벨이 하나라도
 * 있으면 판정 불가, `뒷받침 일치` 쌍에 등장하는 근거의 출처로 보도 원점을 센다.
 * 발행할 수 없는 주장이면 `StageFailure`를 던진다.
 */
export async function runContradictionLabel(
  input: ContradictionInput,
  modelClient: ModelClient,
): Promise<ContradictionOutput> {
  const key = idempotencyKey(input);
  const parsed = ContradictionLabelResponseSchema.safeParse(await modelClient.complete(STAGE, key));
  if (!parsed.success) {
    throw new StageFailure(STAGE, key, `응답 스키마 불일치: ${z.prettifyError(parsed.error)}`);
  }

  const { pairs } = parsed.data;
  const undeterminable = pairs.some((pair) => pair.label === "판정 불가");
  const supportingQuoteIds = new Set(
    pairs.filter((pair) => pair.label === "뒷받침 일치").flatMap((pair) => [pair.a, pair.b]),
  );
  const supportingOrigins = countReportingOrigins(
    input.evidence
      .filter((item) => supportingQuoteIds.has(item.quoteId))
      .map((item) => ({ sourceId: item.sourceId, rightsTier: item.rightsTier })),
  );

  try {
    return {
      claimKey: input.claimKey,
      contradictionStatus: deriveClaimStatus({ supportingOrigins, undeterminable }),
    };
  } catch (error) {
    if (error instanceof UnpublishableClaimError) {
      throw new StageFailure(STAGE, key, error.message);
    }
    throw error;
  }
}
