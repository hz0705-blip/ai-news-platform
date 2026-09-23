/** 기사 본문 정규화 규칙의 버전. 규칙이 바뀌면 올린다(#21 브리프). */
export const NORMALIZATION_VERSION = 1;

const HTML_ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&nbsp;/g, " "],
  // &amp;는 위 치환들이 만든 문자열을 다시 풀어버리지 않도록 가장 마지막에 처리한다.
  [/&amp;/g, "&"],
];

/**
 * 원문 기사 본문을 정규화한다. 순서가 결과에 영향을 준다:
 * 1) HTML 마크업 제거(태그 제거 → 엔티티 해제)
 * 2) 개행 통일(CRLF/CR → LF)
 * 3) 유니코드 NFC 정규화
 * 4) 빈 줄 축약(세 줄 이상 → 두 줄)
 * 5) 앞뒤 공백 다듬기
 */
export function normalizeBody(raw: string): string {
  let text = raw.replace(/<[^>]*>/g, "");
  for (const [pattern, replacement] of HTML_ENTITIES) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  text = text.normalize("NFC");

  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
