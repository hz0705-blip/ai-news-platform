import type { ContradictionStatus } from "./contradiction-status.ts";
import type { Evidence } from "./evidence.ts";

/**
 * 주장 유형(Claim Type) 3종 (CONTEXT.md "주장 유형").
 * 상충은 같은 유형 안에서만 판정한다.
 */
export const CLAIM_TYPES = ["보도된 사실", "귀속 입장", "전망"] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

/**
 * 양상(Modality) 5종 (CONTEXT.md "양상").
 * 영어 원문의 양상이 한국어 주장에서 강해지면 그 주장은 발행하지 않는다.
 */
export const MODALITIES = ["단정", "의혹", "가능", "예상", "조건부"] as const;

export type Modality = (typeof MODALITIES)[number];

/**
 * 주장(Claim): 사건 요약을 이루는 문장 하나 (CONTEXT.md "주장").
 * 반드시 하나 이상의 근거를 가지며, `id`는 개정판을 넘어 유지되는 식별자다.
 * `order`는 개정판 안의 표시 순서, `contradictionStatus`는 이 주장에 대한
 * 보도 원점들의 갈림이다(ADR-0009: 상태의 권위는 주장에 있다).
 */
export interface Claim {
  readonly id: string;
  readonly text: string;
  readonly claimType: ClaimType;
  readonly modality: Modality;
  readonly order: number;
  readonly contradictionStatus: ContradictionStatus;
  readonly evidence: readonly Evidence[];
}
