/**
 * 상충 상태 5종 (CONTEXT.md "상충 상태").
 * 한 주장에 대해 보도 원점들이 어떻게 갈리는지 나타내며, 사건의 상충 상태는
 * 현재 주장들의 상태와 열린 상충 에피소드에서 파생된다(ADR-0009).
 */
export const CONTRADICTION_STATUSES = [
  "단일 출처",
  "복수 출처 일치",
  "보도 상충",
  "상충 해소",
  "정정됨",
] as const;

export type ContradictionStatus = (typeof CONTRADICTION_STATUSES)[number];
