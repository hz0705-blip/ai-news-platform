/**
 * 로그인 뒤 돌아갈 주소 검증(스펙 "계정"): 같은 출처의 허용 경로만 받는다.
 * 허용 경로는 오늘(`/`)·사건(`/story/<slug>`)·개정판(`/story/<slug>/revision/<id>`)의 경로뿐이며 질의·해시는 받지 않는다.
 * 프로토콜 상대(`//`), 역슬래시, 디코딩하면 `/`·`\`가 되는 인코딩, 외부 호스트는 모두 fallback으로 바뀐다.
 */
const SLUG = /^[a-z0-9-]+$/;
// 개정판 식별자는 `:`를 담고 링크에서 퍼센트 인코딩된다(lib/story-view.ts). 디코딩 결과는 아래에서 다시 본다.
const ENCODED_SEGMENT = /^(?:[A-Za-z0-9._~:-]|%[0-9A-Fa-f]{2})+$/;

function isSafeSegment(segment: string): boolean {
  if (!ENCODED_SEGMENT.test(segment)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return false;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 제어 문자 거부가 목적이다
  return decoded !== "." && decoded !== ".." && !/[/\\\u0000-\u001f\u007f]/.test(decoded);
}

function isAllowedPath(path: string): boolean {
  if (path === "/") return true;
  const parts = path.split("/");
  if (parts[0] !== "" || parts[1] !== "story") return false;
  const slug = parts[2];
  if (slug === undefined || !SLUG.test(slug)) return false;
  if (parts.length === 3) return true;
  return parts.length === 5 && parts[3] === "revision" && isSafeSegment(parts[4] ?? "");
}

export function safeReturnPath(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (!isAllowedPath(raw)) return fallback;
  // 이중 확인: 임의 기준 출처에 붙여도 출처·경로가 그대로여야 한다.
  const base = "http://return-path.invalid";
  const url = new URL(raw, base);
  return url.origin === base && url.pathname === raw && url.search === "" && url.hash === ""
    ? raw
    : fallback;
}
