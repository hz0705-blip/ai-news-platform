import type { Revision, RevisionSource } from "./revision.ts";

/**
 * 링크만 기사만 새로 붙은 사건의 다음 개정판(docs/spec/v1.md "개정판 생성 조건": 새 기사가 붙으면 주장이
 * 안 바뀌어도 개정판이 생기고 변화는 "출처 추가"). 모델 단계를 다시 부르지 않고 이전 개정판의 주장·상태·
 * 프롬프트 버전·모델 식별자를 그대로 둔 채 출처 구획만 `sources`로 바꾼다. 근거 식별자는 개정판 식별자를
 * 접두사로 가지므로(`<개정판 id>/<주장 id>:<quoteId>`) 새 접두사로 옮기고, 검증 시각은 다시 검증하지 않았으므로
 * 그대로다. 개정판 식별자는 `<slug>:rev-<번호>` 형식을 따른다.
 */
export function revisionWithSources(
  previous: Revision,
  sources: readonly RevisionSource[],
  next: { readonly revisionNumber: number; readonly publishedAt: Date },
): Revision {
  const id = previous.id.replace(/:rev-\d+$/, `:rev-${next.revisionNumber}`);
  if (id === previous.id) throw new Error(`개정판 식별자 형식이 아니다: ${previous.id}`);
  const prefix = `${previous.id}/`;
  return {
    ...previous,
    id,
    revisionNumber: next.revisionNumber,
    publishedAt: next.publishedAt,
    claims: previous.claims.map((claim) => ({
      ...claim,
      evidence: claim.evidence.map((item) => ({
        ...item,
        id: item.id.startsWith(prefix) ? `${id}/${item.id.slice(prefix.length)}` : item.id,
      })),
    })),
    sources: [...sources],
  };
}
