import type { ContradictionStatus } from "./contradiction-status.ts";

/** 근거 사이의 관계 라벨(#22 Ruling 22-6). `양립 불가`에서 a는 주장을 뒷받침, b는 양립 불가한 명제. */
export const RELATION_LABELS = ["뒷받침 일치", "양립 불가", "판정 불가"] as const;
export type RelationLabel = (typeof RELATION_LABELS)[number];

export interface ClaimStatusInput {
  /** 이전 개정판의 주장 상태. 첫 개정판이면 undefined. */
  readonly previous: ContradictionStatus | undefined;
  /** 정합성 게이트 1단계를 통과한 근거만 있으면 true. */
  readonly verified: boolean;
  /** 현재 상충 에피소드의 관계 라벨에 `판정 불가`가 하나라도 있으면 true. */
  readonly undeterminable: boolean;
  /** 주장 문장을 뒷받침하는 독립 보도 원점 수. */
  readonly supportingOrigins: number;
  /** 같은 범위에서 양립 불가한 명제를 보도한 독립 원점 수(뒷받침 원점과 겹치지 않음). */
  readonly conflictingOrigins: number;
  /** 기록된 상충 에피소드가 아직 닫히지 않았으면 true. */
  readonly openEpisode: boolean;
  /** 발행사가 실질 내용을 명시 정정했으면 true. */
  readonly explicitCorrection: boolean;
  /** 기록된 상충이 해명·철회·범위 설명으로 명시적으로 정리되었으면 true. */
  readonly explicitResolution: boolean;
}

export type ClaimStatusGuard = 1 | 2 | 3 | 4 | 5 | 6;

export type ClaimStatusResult =
  | {
      readonly publish: true;
      readonly status: ContradictionStatus;
      readonly guard: 2 | 3 | 4 | 5 | 6;
    }
  | {
      readonly publish: false;
      readonly previous: ContradictionStatus | undefined;
      readonly reason: string;
      readonly guard: 1;
    };

/**
 * 스펙 132행 전이 가드 ①~⑥. 순서 있는 워크플로가 아니라 재평가마다 위에서부터 적용하는 우선순위 가드다.
 * ① 미발행(이전 상태 유지) ② 보도 상충 ③ 정정됨 ④ 상충 해소 ⑤ 복수 출처 일치 ⑥ 단일 출처.
 */
export function deriveClaimStatus(input: ClaimStatusInput): ClaimStatusResult {
  const keep = (reason: string): ClaimStatusResult => ({
    publish: false,
    previous: input.previous,
    reason,
    guard: 1,
  });
  if (input.undeterminable) return keep("판정 불가 근거가 있는 주장은 발행하지 않는다");
  if (!input.verified) return keep("검증 누락 — 게이트를 통과하지 않은 근거가 있다");
  if (input.supportingOrigins <= 0) return keep("독립 원점 0 — 뒷받침하는 보도 원점이 없다");

  const settledExplicitly = input.explicitCorrection || input.explicitResolution;
  const incompatibleNow = input.conflictingOrigins >= 1;
  const episodeStillOpen =
    (input.openEpisode || input.previous === "보도 상충") && !settledExplicitly;
  if (incompatibleNow || episodeStillOpen) return { publish: true, status: "보도 상충", guard: 2 };

  if (input.explicitCorrection) return { publish: true, status: "정정됨", guard: 3 };

  const hadEpisode = input.openEpisode || input.previous === "보도 상충";
  if (input.explicitResolution && hadEpisode)
    return { publish: true, status: "상충 해소", guard: 4 };

  if (input.supportingOrigins >= 2) return { publish: true, status: "복수 출처 일치", guard: 5 };
  return { publish: true, status: "단일 출처", guard: 6 };
}
