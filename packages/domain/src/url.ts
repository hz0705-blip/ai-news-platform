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
