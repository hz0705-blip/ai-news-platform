import type { Revision } from "./revision.ts";

/**
 * 개정판 생성 조건(스펙 134행): 출처·주장·상태가 이전 개정판과 모두 같으면 개정판을 만들지 않는다.
 * 비교 범위는 Ruling 22-11 — 식별자·개정판 번호·발행 시각·제목은 비교하지 않는다.
 */
export function isSameRevisionContent(previous: Revision, next: Revision): boolean {
  return contentKey(previous) === contentKey(next);
}

/**
 * 구조를 값으로 정렬한 배열로 만든다(안정적인 순서 비교용). 요소 각각을 JSON 문자열로
 * 비교하므로, 자유 텍스트 필드에 구분자로 쓸 만한 문자가 섞여도 JSON.stringify의
 * 이스케이프가 그대로 보존되어 경계가 흐려지지 않는다.
 */
function sortByJson<T>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const ka = JSON.stringify(a);
    const kb = JSON.stringify(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function contentKey(revision: Revision): string {
  const sources = sortByJson(revision.sources.map((s) => [s.sourceId, s.articleId] as const));
  const claims = [...revision.claims]
    .sort((a, b) => a.order - b.order)
    .map((claim) => {
      const evidence = sortByJson(
        claim.evidence.map(
          (e) => [e.articleVersionId, e.span.start, e.span.end, e.differsIn ?? null] as const,
        ),
      );
      return [
        claim.order,
        claim.text,
        claim.claimType,
        claim.modality,
        claim.contradictionStatus,
        evidence,
      ] as const;
    });
  return JSON.stringify({ status: revision.contradictionStatus, sources, claims });
}
