/**
 * 기사 동일성 키가 되는 정규화 URL(docs/spec/v1.md "개발 중 결정 항목" 정확 중복 제거):
 * 스킴·호스트 소문자, `www.` 제거, 쿼리·프래그먼트 제거, 끝 `/` 제거. 경로의 대소문자는 보존한다.
 * URL이 아니면 던진다.
 */
export function normalizeArticleUrl(raw: string): string {
  const url = new URL(raw.trim());
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const port = url.port === "" ? "" : `:${url.port}`;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol.toLowerCase()}//${host}${port}${path}`;
}

/** 저장할 수 있는 기사 이미지 URL의 최대 길이. */
export const MAX_IMAGE_URL_LENGTH = 2048;

/**
 * 기사 이미지 URL 저장 전 검증(ADR-0002: URL만 저장하고 화면은 핫링크한다). `http(s)` 절대 URL이고
 * 2048자 이하이면 앞뒤 공백을 뺀 값을, 아니면(빈 값 포함) null을 돌려준다.
 */
export function toImageUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "" || value.length > MAX_IMAGE_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
