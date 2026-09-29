import type { SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { DELETION_INTENT_COOKIE } from "../../../../lib/account/deletion.ts";
import { kakaoAuthorizeRedirect, kakaoEnv } from "../../../../lib/auth/kakao.ts";
import { safeReturnPath } from "../../../../lib/auth/return-path.ts";
import { routeAuthClient } from "../../../../lib/auth/route.ts";
import { loginPageUrl, RETURN_COOKIE, requestOrigin } from "../../../../lib/auth/urls.ts";

const PROVIDERS = new Set(["kakao", "google"] as const);
type Provider = "kakao" | "google";
const isProvider = (value: string | null): value is Provider =>
  value !== null && PROVIDERS.has(value as Provider);

/**
 * 로그인 시작(같은 출처 URL). Google은 `signInWithOAuth`로 PKCE 인가 URL을 만들고 코드 검증자 쿠키와 함께 그곳으로 보낸다
 * (콜백 URL은 질의 없이 정확히 `/auth/callback`). Kakao는 앱의 직접 OIDC 인가 요청으로 보낸다(lib/auth/kakao.ts, 콜백
 * `/auth/callback/kakao`). 인앱 안내에서 외부 브라우저가 여는 주소도 이 URL이다 — 인가가 외부 브라우저에서 새로 시작한다(스펙 "계정").
 * 돌아갈 주소는 검증해 짧은 HttpOnly 쿠키에 두고 콜백이 읽는다.
 * 평소 로그인은 남아 있을 수 있는 계정 삭제 의도 쿠키를 지운다 — 삭제 재로그인을 취소한 뒤의 로그인이 삭제로 이어지지 않는다.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const provider = request.nextUrl.searchParams.get("provider");
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  const { client, respond: respondAuth } = routeAuthClient(request);
  const respond = <T extends NextResponse>(response: T): T => {
    response.cookies.delete({ name: DELETION_INTENT_COOKIE, path: "/auth" });
    return respondAuth(response);
  };
  if (client === null || !isProvider(provider)) {
    return respond(NextResponse.redirect(loginPageUrl(request, next, "unavailable"), 303));
  }
  const response = await authorizeRedirect(request, client, provider);
  if (response === null) {
    return respond(NextResponse.redirect(loginPageUrl(request, next, "unavailable"), 303));
  }
  response.cookies.set(RETURN_COOKIE, next, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/auth",
    maxAge: 600,
  });
  return respond(response);
}

async function authorizeRedirect(
  request: NextRequest,
  client: SupabaseClient,
  provider: Provider,
): Promise<NextResponse | null> {
  if (provider === "kakao") {
    const env = kakaoEnv();
    return env === null ? null : kakaoAuthorizeRedirect(request, env);
  }
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: new URL("/auth/callback", requestOrigin(request)).toString(),
      skipBrowserRedirect: true,
    },
  });
  return error !== null || !data.url ? null : NextResponse.redirect(data.url, 303);
}
