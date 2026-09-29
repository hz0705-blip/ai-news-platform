import { sha256Hex } from "./hash.ts";
import { normalizeBody } from "./text.ts";

/**
 * 정정 표지(docs/spec/v1.md "개발 중 결정 항목" 원문 재수집과 변경 판별). 출처가 명시적으로 밝힌 수정만 정정이다
 * ("정정 vs 원문 변경"). `Updated:`는 표지가 아니다. `CORRECTED-`(통신사 머리표)만 대소문자를 가리고,
 * 나머지는 대소문자를 가리지 않는다(#86 Ruling).
 */
export const CORRECTION_MARKERS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "Correction:", pattern: /correction:/gi },
  { label: "Corrected:", pattern: /corrected:/gi },
  { label: "CORRECTED-", pattern: /CORRECTED-/g },
  { label: "This article has been corrected", pattern: /this article has been corrected/gi },
  {
    label: "An earlier version of this article",
    pattern: /an earlier version of this article/gi,
  },
];

function countOf(body: string, pattern: RegExp): number {
  return body.match(pattern)?.length ?? 0;
}

/** 이전 버전보다 새 버전에 더 많이 나오는 정정 표지(= 새로 생긴 표지)의 이름. 없으면 빈 목록. */
export function newCorrectionMarkers(previousBody: string, nextBody: string): string[] {
  return CORRECTION_MARKERS.filter(
    ({ pattern }) => countOf(nextBody, pattern) > countOf(previousBody, pattern),
  ).map(({ label }) => label);
}

/**
 * 재수집으로 받은 본문의 판정(#86). 정규화 본문 해시가 마지막 버전과 같으면 변경 없음(정규화 차이만이면 변화 아님).
 * 다르면 새 기사 버전이고, 정정 표지가 새로 생겼으면 정정 후보, 아니면 원문 변경이다.
 */
export type RecheckedBodyJudgement =
  | { readonly kind: "변경 없음" }
  | {
      readonly kind: "새 버전";
      readonly body: string;
      readonly bodyHash: string;
      readonly change: "정정 후보" | "원문 변경";
      readonly markers: readonly string[];
    };

export function judgeRecheckedBody(
  previous: { readonly body: string; readonly bodyHash: string },
  rawBody: string,
): RecheckedBodyJudgement {
  const body = normalizeBody(rawBody);
  const bodyHash = sha256Hex(body);
  if (bodyHash === previous.bodyHash) return { kind: "변경 없음" };
  const markers = newCorrectionMarkers(previous.body, body);
  return {
    kind: "새 버전",
    body,
    bodyHash,
    change: markers.length > 0 ? "정정 후보" : "원문 변경",
    markers,
  };
}
