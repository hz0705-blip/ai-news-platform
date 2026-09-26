import type { RightsTier } from "./rights.ts";

/**
 * 표시 정책 버전 (#21 Ruling 7). 사건 캐시 키의 인자 하나이며
 * (사건, 개정판, 언어, 표시 정책 버전)로 캐시한다(docs/spec/v1.md "렌더링·캐시").
 * 권리 등급별 표시 규칙이 바뀔 때만 올린다.
 */
export const DISPLAY_POLICY_VERSION = 1;

/**
 * 권리 등급으로 근거 발췌를 화면에 보일 수 있는지. 거짓이면 화면은 `근거 발췌를 표시할 수 없음`
 * 상태와 출처명·원문 링크만 보인다(스펙 "화면과 경험" 근거 표시, ADR-0002). 상충 상태가 아니다.
 */
export function canDisplayExcerpt(rightsTier: RightsTier): boolean {
  return rightsTier === "본문 처리 + 발췌 표시";
}
