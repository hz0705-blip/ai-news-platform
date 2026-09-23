import { CONTRADICTION_STATUSES, type ContradictionStatus } from "./contradiction-status.ts";

export interface StoryStatusInput {
  readonly contradictionStatus: ContradictionStatus;
}

export type StatusCounts = Readonly<Record<ContradictionStatus, number>>;

export function countClaimStatuses(claims: readonly StoryStatusInput[]): StatusCounts {
  const counts = Object.fromEntries(CONTRADICTION_STATUSES.map((s) => [s, 0])) as Record<
    ContradictionStatus,
    number
  >;
  for (const { contradictionStatus } of claims) counts[contradictionStatus] += 1;
  return counts;
}

/**
 * 사건 개정판 상태 파생(스펙 133행, ADR-0009). 열린 에피소드(현재 주장에서 빠진 것 포함) → 보도 상충
 * → 정정됨 → 상충 해소 → 모든 표시 주장이 원점 둘 이상 → 복수 출처 일치 → 아니면 단일 출처.
 * `openEpisodes`는 현재 주장 밖의 열린 상충 에피소드 수(#22는 0, M3가 채운다 — Ruling 22-8).
 */
export function deriveStoryStatus(
  claims: readonly StoryStatusInput[],
  openEpisodes = 0,
): ContradictionStatus {
  if (!Number.isInteger(openEpisodes) || openEpisodes < 0) {
    throw new RangeError(`열린 에피소드 수가 올바르지 않다: ${openEpisodes}`);
  }
  if (claims.length === 0) {
    throw new Error("표시할 주장이 없는 개정판은 발행하지 않는다");
  }
  const counts = countClaimStatuses(claims);
  if (openEpisodes > 0 || counts["보도 상충"] > 0) return "보도 상충";
  if (counts.정정됨 > 0) return "정정됨";
  if (counts["상충 해소"] > 0) return "상충 해소";
  if (counts["단일 출처"] === 0) return "복수 출처 일치";
  return "단일 출처";
}
