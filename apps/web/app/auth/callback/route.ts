import { type NextRequest, NextResponse } from "next/server";
import { safeReturnPath } from "../../../lib/auth/return-path.ts";
import { routeAuthClient } from "../../../lib/auth/route.ts";
import { loginPageUrl, RETURN_COOKIE, requestOrigin } from "../../../lib/auth/urls.ts";

/** 인증 콜백: 인가 코드를 세션으로 바꾸고(`exchangeCodeForSession`) 검증된 돌아갈 주소로 보낸다. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = safeReturnPath(request.cookies.get(RETURN_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get("code");
  const { client, respond } = routeAuthClient(request);
  let target: URL;
  if (client === null) target = loginPageUrl(request, next, "unavailable");
  else if (code === null) target = loginPageUrl(request, next, "failed");
  else {
    const { error } = await client.auth.exchangeCodeForSession(code);
    target =
      error === null
        ? new URL(next, requestOrigin(request))
        : loginPageUrl(request, next, "failed");
  }
  const response = NextResponse.redirect(target, 303);
  response.cookies.delete({ name: RETURN_COOKIE, path: "/auth" });
  return respond(response);
}
