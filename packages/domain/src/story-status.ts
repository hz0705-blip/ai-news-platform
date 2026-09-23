import type { ContradictionStatus } from "./contradiction-status.ts";

/**
 * 개정판의 사건 상충 상태를 표시 중인 주장들에서 파생한다(#21 Ruling 14, ADR-0009).
 * #21 범위는 두 경로뿐이다: 모든 주장이 `복수 출처 일치`면 `복수 출처 일치`,
 * 하나라도 `단일 출처`면 `단일 출처`. 주장이 없으면 발행할 수 없으므로 던진다.
 *
 * 보도 상충·상충 해소·정정됨의 우선순위는 #22가 채운다. 그전까지 조용히
 * 오판정하지 않도록 던진다.
 */
export function deriveStoryStatus(
  claims: readonly { contradictionStatus: ContradictionStatus }[],
): ContradictionStatus {
  if (claims.length === 0) {
    throw new Error("표시할 주장이 없는 개정판은 발행하지 않는다");
  }

  let status: ContradictionStatus = "복수 출처 일치";
  for (const { contradictionStatus } of claims) {
    if (contradictionStatus === "단일 출처") {
      status = "단일 출처";
    } else if (contradictionStatus !== "복수 출처 일치") {
      throw new Error(`${contradictionStatus} 상태의 사건 우선순위는 아직 없다(#22에서 구현)`);
    }
  }
  return status;
}
