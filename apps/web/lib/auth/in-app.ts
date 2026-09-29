/**
 * 인앱 브라우저 판별(스펙 "계정" 인앱 브라우저). Google은 임베디드 WebView에서 막히므로(`disallowed_useragent`)
 * 이 두 인앱이면 Google 로그인 전에 외부 브라우저 안내를 띄운다. 안내용이며 인가 경계가 아니다.
 */
export type InAppBrowser = "kakaotalk" | "naver";

const KAKAOTALK = /KAKAOTALK/i;
const NAVER = /NAVER\s*\((?:inapp|higgs)\s*;\s*search\s*;/i;

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  if (KAKAOTALK.test(userAgent)) return "kakaotalk";
  if (NAVER.test(userAgent)) return "naver";
  return null;
}

/**
 * 외부 브라우저 열기 시도 URL(사용자가 누를 때만 연다). KakaoTalk은 `kakaotalk://web/openExternal`,
 * Android NAVER는 `intent://`. iOS NAVER는 열기 스킴이 없으므로 null — 링크 복사와 메뉴 안내만 남는다.
 */
export function externalOpenUrl(
  browser: InAppBrowser,
  userAgent: string,
  targetUrl: string,
): string | null {
  if (browser === "kakaotalk") {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`;
  }
  if (!/Android/i.test(userAgent)) return null;
  const target = new URL(targetUrl);
  const scheme = target.protocol.replace(":", "");
  return `intent://${target.host}${target.pathname}${target.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
}
