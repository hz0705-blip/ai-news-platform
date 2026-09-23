/**
 * 권리 등급(Rights Tier) 2종 (CONTEXT.md "권리 등급", ADR-0002).
 * 본문을 AI로 처리해 허용 발췌를 공개 표시할 수 있는지, 메타데이터와 링크만
 * 쓸 수 있는지를 가른다. `링크만` 기사는 근거가 되지 않는다(#21 Ruling 15).
 */
export const RIGHTS_TIERS = ["본문 처리 + 발췌 표시", "링크만"] as const;

export type RightsTier = (typeof RIGHTS_TIERS)[number];
