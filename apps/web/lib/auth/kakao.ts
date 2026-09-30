import type { NextRequest, NextResponse } from "next/server";
import { type OidcClient, oidcAuthorizeRedirect } from "./oidc.ts";

/**
 * Kakao 로그인은 앱이 직접 OIDC 인가 코드 흐름을 한다(스펙 "계정", lib/auth/oidc.ts): Supabase `signInWithOAuth`는 Kakao
 * 인가 요청에 `profile_image`를 늘 붙여 동의 항목에 없는 사진 때문에 막힌다(KOE205). 콜백은 `/auth/callback/kakao`.
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
export const KAKAO_STATE_COOKIE = "kakao-oidc-state";
export const KAKAO_NONCE_COOKIE = "kakao-oidc-nonce";

export const kakaoClient = (env: KakaoEnv): OidcClient => ({
  authorizeUrl: KAKAO_AUTHORIZE_URL,
  tokenUrl: KAKAO_TOKEN_URL,
  scope: KAKAO_SCOPE,
  callbackPath: KAKAO_CALLBACK_PATH,
  stateCookie: KAKAO_STATE_COOKIE,
  nonceCookie: KAKAO_NONCE_COOKIE,
  clientId: env.restApiKey,
  clientSecret: env.clientSecret,
});

/** Kakao 인가 요청으로 보내는 응답. 계정 삭제의 재로그인은 `prompt: "login"`을 준다. */
export function kakaoAuthorizeRedirect(
  request: NextRequest,
  env: KakaoEnv,
  options: { prompt?: "login" } = {},
): NextResponse {
  return oidcAuthorizeRedirect(
    request,
    kakaoClient(env),
    options.prompt === undefined ? {} : { prompt: options.prompt },
  );
}
