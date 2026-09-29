import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "./urls.ts";

/**
 * Kakao 로그인은 앱이 직접 OIDC 인가 코드 흐름을 한다(스펙 "계정"): Supabase `signInWithOAuth`는 Kakao 인가 요청에
 * `profile_image`를 늘 붙여 동의 항목에 없는 사진 때문에 막힌다(KOE205). 인가 → `/auth/callback/kakao`에서 서버가
 * 코드를 `id_token`으로 바꾸고 → `signInWithIdToken`으로 Supabase 세션을 만든다(lib/auth/callback.ts).
 * 서버 전용 변수 `KAKAO_REST_API_KEY`(= Supabase Kakao 제공자의 Client ID, `id_token`의 `aud`)·`KAKAO_CLIENT_SECRET`.
 */
export interface KakaoEnv {
  readonly restApiKey: string;
  readonly clientSecret: string;
}

/** 둘 중 하나라도 비면 null — Kakao 로그인은 "지금은 로그인할 수 없습니다"다. */
export function kakaoEnv(): KakaoEnv | null {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!restApiKey || !clientSecret) return null;
  return { restApiKey, clientSecret };
}

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
export const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
/** 요청하는 동의 항목은 정확히 이것뿐이다(프로필 이미지는 요청하지 않는다). Kakao scope는 쉼표로 잇는다. */
export const KAKAO_SCOPE = "openid,profile_nickname,account_email";
export const KAKAO_CALLBACK_PATH = "/auth/callback/kakao";
/** CSRF `state`와 `nonce` 원문(경로 `/auth`, 10분, HttpOnly). 콜백이 검증하고 지운다. */
export const KAKAO_STATE_COOKIE = "kakao-oidc-state";
export const KAKAO_NONCE_COOKIE = "kakao-oidc-nonce";
const COOKIE_MAX_AGE_S = 600;

/**
 * Supabase(GoTrue `internal/api/token_oidc.go`)는 `signInWithIdToken`의 `nonce`를 SHA-256 16진 해시로 바꿔 `id_token`의
 * `nonce`와 비교한다. 그래서 Kakao에는 해시를 보내고 쿠키에는 원문을 두었다가 Supabase에 원문을 넘긴다.
 */
export const hashNonce = (nonce: string): string =>
  createHash("sha256").update(nonce).digest("hex");

const callbackUrl = (request: NextRequest) =>
  new URL(KAKAO_CALLBACK_PATH, requestOrigin(request)).toString();

/**
 * Kakao 인가 요청으로 보내는 응답. 새 `state`·`nonce`를 쿠키에 둔다. 계정 삭제의 재로그인은 `prompt: "login"`을 준다.
 * 호출자가 돌아갈 주소·삭제 의도 쿠키와 캐시 헤더를 더 싣는다.
 */
export function kakaoAuthorizeRedirect(
  request: NextRequest,
  env: KakaoEnv,
  options: { prompt?: "login" } = {},
): NextResponse {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.restApiKey,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: KAKAO_SCOPE,
    state,
    nonce: hashNonce(nonce),
    ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
  }).toString();
  const response = NextResponse.redirect(url, 303);
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
    path: "/auth",
    maxAge: COOKIE_MAX_AGE_S,
  };
  response.cookies.set(KAKAO_STATE_COOKIE, state, cookie);
  response.cookies.set(KAKAO_NONCE_COOKIE, nonce, cookie);
  return response;
}

const sameValue = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * 콜백의 인가 코드를 Kakao 토큰 엔드포인트에서 `id_token`으로 바꾼다. `state`가 쿠키와 다르거나 코드·nonce·`id_token`이
 * 없거나 교환이 실패하면 null. `id_token`의 서명·`aud`·`nonce`는 Supabase가 검증한다.
 */
export async function exchangeKakaoCode(
  request: NextRequest,
  env: KakaoEnv,
  fetchImpl: typeof fetch,
): Promise<{ idToken: string; accessToken?: string; nonce: string } | null> {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get(KAKAO_STATE_COOKIE)?.value;
  const nonce = request.cookies.get(KAKAO_NONCE_COOKIE)?.value;
  if (!code || !state || !expected || !nonce || !sameValue(state, expected)) return null;
  const response = await fetchImpl(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.restApiKey,
      client_secret: env.clientSecret,
      redirect_uri: callbackUrl(request),
      code,
    }).toString(),
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    id_token?: unknown;
    access_token?: unknown;
  } | null;
  if (typeof body?.id_token !== "string" || body.id_token === "") return null;
  return {
    idToken: body.id_token,
    ...(typeof body.access_token === "string" ? { accessToken: body.access_token } : {}),
    nonce,
  };
}
