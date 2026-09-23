import type { Revision } from "./revision.ts";

/**
 * 개정판 생성 조건(스펙 134행): 출처·주장·상태가 이전 개정판과 모두 같으면 개정판을 만들지 않는다.
 * 비교 범위는 Ruling 22-11 — 식별자·개정판 번호·발행 시각·제목은 비교하지 않는다.
 */
export function isSameRevisionContent(previous: Revision, next: Revision): boolean {
  return contentKey(previous) === contentKey(next);
}

function contentKey(revision: Revision): string {
  const sources = revision.sources
    .map((s) => `${s.sourceId}|${s.articleId}`)
    .sort()
    .join(",");
  const claims = [...revision.claims]
    .sort((a, b) => a.order - b.order)
    .map((claim) => {
      const evidence = claim.evidence
        .map((e) => `${e.articleVersionId}|${e.span.start}|${e.span.end}|${e.differsIn ?? ""}`)
        .sort()
        .join(";");
      return [
        claim.order,
        claim.text,
        claim.claimType,
        claim.modality,
        claim.contradictionStatus,
        evidence,
      ].join("|");
    })
    .join("\n");
  return JSON.stringify({ status: revision.contradictionStatus, sources, claims });
}
