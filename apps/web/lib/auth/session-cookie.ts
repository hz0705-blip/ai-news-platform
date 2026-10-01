/**
 * Supabase SSR 세션 쿠키(`sb-<ref>-auth-token`, 조각이면 `.0`…)가 있는지. 인가 경계가 아니라 익명 방문마다 서버를 부르지 않기 위한
 * 힌트다 — 쿠키가 있어도 서버가 세션을 검증하고, 없으면 익명으로 본다(@supabase/ssr 기본 쿠키는 HttpOnly가 아니다).
 * 브라우저 전용(클라이언트 컴포넌트의 effect에서만 부른다).
 */
export function hasSessionCookie(): boolean {
  return document.cookie.split(/;\s*/).some((c) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(c));
}
