import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { requestOrigin } from "./urls.ts";

/**
 * 앱이 직접 하는 OIDC 인가 코드 흐름(스펙 "계정", Kakao·Google 공통): 인가 → 앱 콜백에서 서버가 코드를 `id_token`으로
 * 바꾸고 → `signInWithIdToken`으로 Supabase 세션을 만든다(lib/auth/callback.ts). 제공자 설정은 kakao.ts·google.ts.
 */
export interface OidcClient {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly scope: string;
  readonly callbackPath: string;
  /** CSRF `state`와 `nonce` 원문(경로 `/auth`, 10분, HttpOnly). 콜백이 검증하고 지운다. */
  readonly stateCookie: string;
  readonly nonceCookie: string;
  /** = Supabase 제공자의 Client ID(`id_token`의 `aud`). */
  readonly clientId: string;
  readonly clientSecret: string;
}

const COOKIE_MAX_AGE_S = 600;

/**
 * Supabase(GoTrue `internal/api/token_oidc.go`)는 `signInWithIdToken`의 `nonce`를 SHA-256 16진 해시로 바꿔 `id_token`의
 * `nonce`와 비교한다. 그래서 제공자에는 해시를 보내고 쿠키에는 원문을 두었다가 Supabase에 원문을 넘긴다.
 */
export const hashNonce = (nonce: string): string =>
  createHash("sha256").update(nonce).digest("hex");

const callbackUrl = (request: NextRequest, client: OidcClient) =>
  new URL(client.callbackPath, requestOrigin(request)).toString();

/**
 * 인가 요청으로 보내는 303 응답. 새 `state`·`nonce`를 쿠키에 둔다. `extra`는 제공자별 질의(예: `prompt`).
 * 호출자가 돌아갈 주소·삭제 의도 쿠키와 캐시 헤더를 더 싣는다.
 */
export function oidcAuthorizeRedirect(
  request: NextRequest,
  client: OidcClient,
  extra: Readonly<Record<string, string>> = {},
): NextResponse {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const url = new URL(client.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: callbackUrl(request, client),
    response_type: "code",
    scope: client.scope,
    state,
    nonce: hashNonce(nonce),
    ...extra,
  }).toString();
  const response = NextResponse.redirect(url, 303);
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
    path: "/auth",
    maxAge: COOKIE_MAX_AGE_S,
  };
  response.cookies.set(client.stateCookie, state, cookie);
  response.cookies.set(client.nonceCookie, nonce, cookie);
  return response;
}

const sameValue = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export interface OidcTokens {
  readonly idToken: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  /** `nonce` 원문(쿠키). Supabase에 넘긴다. */
  readonly nonce: string;
}

/**
 * 콜백의 인가 코드를 토큰 엔드포인트에서 `id_token`으로 바꾼다. `state`가 쿠키와 다르거나 코드·nonce·`id_token`이
 * 없거나 교환이 실패하면 null. `id_token`의 서명·`aud`·`nonce`는 Supabase가 검증한다.
 */
export async function exchangeOidcCode(
  request: NextRequest,
  client: OidcClient,
  fetchImpl: typeof fetch,
): Promise<OidcTokens | null> {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get(client.stateCookie)?.value;
  const nonce = request.cookies.get(client.nonceCookie)?.value;
  if (!code || !state || !expected || !nonce || !sameValue(state, expected)) return null;
  const response = await fetchImpl(client.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: callbackUrl(request, client),
      code,
    }).toString(),
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    id_token?: unknown;
    access_token?: unknown;
    refresh_token?: unknown;
  } | null;
  if (typeof body?.id_token !== "string" || body.id_token === "") return null;
  return {
    idToken: body.id_token,
    ...(typeof body.access_token === "string" ? { accessToken: body.access_token } : {}),
    ...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}),
    nonce,
  };
}
