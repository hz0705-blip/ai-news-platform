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

/** 파일명 토큰에 있으면 기사 사진이 아닌 파비콘·로고·공용 이미지로 보는 단어. */
const NON_PHOTO_TOKENS = new Set(["favicon", "logo", "icon", "sprite", "placeholder", "default"]);
const NON_PHOTO_EXTENSIONS = new Set(["ico", "svg"]);

/** URL 경로의 마지막 조각(파일명)이 파비콘·로고·공용 공유 이미지로 보이면 true. 호스트·쿼리는 보지 않는다. */
function isNonPhotoImagePath(pathname: string): boolean {
  const fileName =
    pathname
      .split("/")
      .filter((part) => part !== "")
      .at(-1)
      ?.toLowerCase() ?? "";
  const dot = fileName.lastIndexOf(".");
  if (dot !== -1 && NON_PHOTO_EXTENSIONS.has(fileName.slice(dot + 1))) return true;
  const tokens = fileName.split(/[^a-z0-9]+/);
  return tokens.some(
    (token, i) => NON_PHOTO_TOKENS.has(token) || (token === "og" && tokens[i + 1] === "image"),
  );
}

/**
 * 기사 이미지 URL 저장 전 검증(ADR-0002: URL만 저장하고 화면은 핫링크한다). `http(s)` 절대 URL이고
 * 2048자 이하이며 파일명이 파비콘·로고·공용 공유 이미지로 보이지 않으면 앞뒤 공백을 뺀 값을,
 * 아니면(빈 값 포함) null을 돌려준다.
 */
export function toImageUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "" || value.length > MAX_IMAGE_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return isNonPhotoImagePath(url.pathname) ? null : value;
  } catch {
    return null;
  }
}
