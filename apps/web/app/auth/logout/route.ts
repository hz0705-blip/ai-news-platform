import { type NextRequest, NextResponse } from "next/server";
import { safeReturnPath } from "../../../lib/auth/return-path.ts";
import { routeAuthClient } from "../../../lib/auth/route.ts";
import { requestOrigin } from "../../../lib/auth/urls.ts";

/**
 * 로그아웃(POST 폼): 이 기기의 세션만 끝낸다(`scope: "local"` — 다른 기기의 세션은 그대로).
 * Auth 서버에서 세션이 지워지므로 같은 토큰을 다시 보내도 현재 사용자 헬퍼가 거부한다.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const nextValue = form?.get("next");
  const next = safeReturnPath(typeof nextValue === "string" ? nextValue : null);
  const { client, respond } = routeAuthClient(request);
  if (client !== null) await client.auth.signOut({ scope: "local" });
  return respond(NextResponse.redirect(new URL(next, requestOrigin(request)), 303));
}
