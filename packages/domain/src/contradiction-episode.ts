import type { Claim } from "./claim.ts";

/**
 * 열린 상충 에피소드(ADR-0009, 스펙 "상충 상태" 전이·사건 파생, #90). 별도 기록 없이 주장 개정판 이력에서 파생한다:
 * 주장마다 가장 늦은 기록의 상태가 보도 상충이면 그 에피소드는 열려 있다 — 보도 상충은 명시 정정·해소 입력으로만
 * 벗어나고(전이 가드 ②) 요약 제외(주장이 개정판에서 빠짐)로는 닫히지 않는다.
 *
 * `history`는 개정판 순서(오래된 것 먼저)의 개정판별 주장 목록, `currentClaimIds`는 현재 주장이다. 현재 주장에 있는
 * 주장은 현재 상태가 정하므로 돌려주지 않는다. 돌려주는 것은 현재 주장 밖의 열린 에피소드 주장(그 마지막 기록)이고
 * 주장 식별자 순이다. 그 개수가 사건 파생의 `openEpisodes`다(`deriveStoryStatus`).
 */
export function openEpisodeClaims(
  history: readonly (readonly Claim[])[],
  currentClaimIds: Iterable<string>,
): Claim[] {
  const last = new Map<string, Claim>();
  for (const claims of history) {
    for (const claim of claims) last.set(claim.id, claim);
  }
  const current = new Set(currentClaimIds);
  return [...last.values()]
    .filter((claim) => claim.contradictionStatus === "보도 상충" && !current.has(claim.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
