import type { ContradictionStatus } from "./contradiction-status.ts";

/**
 * 근거와 주장 사이의 관계 라벨. #21은 두 가지만 쓴다 — #22가 상충 라벨을 늘린다.
 */
export const RELATION_LABELS = ["뒷받침 일치", "판정 불가"] as const;

export type RelationLabel = (typeof RELATION_LABELS)[number];

/** 발행할 수 없는 주장. 호출부는 이 주장을 개정판에서 뺀다(ADR-0009 ①). */
export class UnpublishableClaimError extends Error {
  override readonly name = "UnpublishableClaimError";
}

/**
 * 주장의 상충 상태를 파생한다(#21 Ruling 13). 판정 불가가 하나라도 있거나
 * 뒷받침하는 독립 원점이 0이면 발행할 수 없으므로 `UnpublishableClaimError`를
 * 던진다. 원점 둘 이상은 `복수 출처 일치`, 하나는 `단일 출처`.
 *
 * 보도 상충·상충 해소·정정됨 경로는 #22가 채운다.
 */
export function deriveClaimStatus(input: {
  supportingOrigins: number;
  undeterminable: boolean;
}): ContradictionStatus {
  if (input.undeterminable) {
    throw new UnpublishableClaimError("판정 불가 근거가 있는 주장은 발행하지 않는다");
  }
  if (input.supportingOrigins <= 0) {
    throw new UnpublishableClaimError(
      "독립 원점 0 — 뒷받침하는 보도 원점이 없는 주장은 발행하지 않는다",
    );
  }
  return input.supportingOrigins >= 2 ? "복수 출처 일치" : "단일 출처";
}
