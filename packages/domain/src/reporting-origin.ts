import type { RightsTier } from "./rights.ts";

export interface OriginEvidence {
  readonly sourceId: string;
  readonly wireId?: string;
  readonly rightsTier: RightsTier;
}

/**
 * 보도 원점 집합(CONTEXT.md "보도 원점", 스펙 131행). `링크만` 등급은 원점이 되지 않고,
 * 같은 통신 기사(`wireId`)를 전재한 출처들은 원점 하나다. 통신 기사가 없으면 출처(`sourceId`)가 곧 원점이다.
 */
export function reportingOrigins(evidence: readonly OriginEvidence[]): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const item of evidence) {
    if (item.rightsTier === "링크만") continue;
    origins.add(item.wireId ?? item.sourceId);
  }
  return origins;
}

export function countReportingOrigins(evidence: readonly OriginEvidence[]): number {
  return reportingOrigins(evidence).size;
}
