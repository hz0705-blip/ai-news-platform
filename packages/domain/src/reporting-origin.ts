import type { RightsTier } from "./rights.ts";

/**
 * 한 주장을 뒷받침하는 근거들의 보도 원점 수를 센다 (CONTEXT.md "보도 원점").
 * `링크만` 등급은 원점이 되지 않고, 같은 통신 기사(`wireId`)를 전재한 출처들은
 * 원점 하나로 센다. 통신 기사가 없으면 출처(`sourceId`)가 곧 원점이다.
 */
export function countReportingOrigins(
  evidence: readonly { sourceId: string; wireId?: string; rightsTier: RightsTier }[],
): number {
  const origins = new Set<string>();
  for (const item of evidence) {
    if (item.rightsTier === "링크만") continue;
    origins.add(item.wireId ?? item.sourceId);
  }
  return origins.size;
}
