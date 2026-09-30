import type { NextRequest, NextResponse } from "next/server";
import { type OidcClient, oidcAuthorizeRedirect } from "./oidc.ts";

/**
 * Google 로그인도 앱이 직접 OIDC 인가 코드 흐름을 한다(스펙 "계정", lib/auth/oidc.ts): 동의 화면과 리디렉션에 앱 주소만
 * 보이고 Supabase 주소는 드러나지 않는다. 콜백은 `/auth/callback/google`(Google OAuth 클라이언트의 승인된 리디렉션 URI).
 * 서버 전용 변수 `GOOGLE_CLIENT_ID`(= Supabase Google 제공자의 Client ID, `id_token`의 `aud`)·`GOOGLE_CLIENT_SECRET`.
 */
export interface GoogleEnv {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** 둘 중 하나라도 비면 null — Google 로그인은 "지금은 로그인할 수 없습니다"다. */
export function googleEnv(): GoogleEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** 요청 scope는 정확히 이것뿐이다. Google scope는 공백으로 잇는다. */
export const GOOGLE_SCOPE = "openid email profile";
export const GOOGLE_CALLBACK_PATH = "/auth/callback/google";
export const GOOGLE_STATE_COOKIE = "google-oidc-state";
export const GOOGLE_NONCE_COOKIE = "google-oidc-nonce";

export const googleClient = (env: GoogleEnv): OidcClient => ({
  authorizeUrl: GOOGLE_AUTHORIZE_URL,
  tokenUrl: GOOGLE_TOKEN_URL,
  scope: GOOGLE_SCOPE,
  callbackPath: GOOGLE_CALLBACK_PATH,
  stateCookie: GOOGLE_STATE_COOKIE,
  nonceCookie: GOOGLE_NONCE_COOKIE,
  clientId: env.clientId,
  clientSecret: env.clientSecret,
});

/**
 * Google 인가 요청으로 보내는 응답. 계정 삭제의 재로그인(`reauth`)은 계정을 다시 고르고 동의를 다시 받아
 * (`prompt=select_account consent`) 연결 해제용 refresh token을 받는다(`access_type=offline`).
 */
export function googleAuthorizeRedirect(
  request: NextRequest,
  env: GoogleEnv,
  options: { reauth?: boolean } = {},
): NextResponse {
  return oidcAuthorizeRedirect(
    request,
    googleClient(env),
    options.reauth === true ? { access_type: "offline", prompt: "select_account consent" } : {},
  );
}
