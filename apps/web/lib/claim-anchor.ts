/** 주장 딥링크 형식(Ruling 23-1): `#claim-N`, N은 화면 번호(1부터). 주장 식별자에는 `:`가 들어갈 수 있어 DOM id는 번호로 만든다. */
export const claimAnchorId = (order: number): string => `claim-${order}`;
export const claimEvidenceId = (order: number): string => `claim-${order}-evidence`;
export const claimHref = (order: number): string => `#${claimAnchorId(order)}`;

const CLAIM_HASH = /^#claim-([1-9]\d*)$/;

/** `#claim-12` → 12. 형식이 다르면 undefined(아무것도 펼치지 않는다). */
export function parseClaimHash(hash: string): number | undefined {
  const match = CLAIM_HASH.exec(hash);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
