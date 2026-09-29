import { type NextRequest, NextResponse } from "next/server";
import { routeAuthClient } from "./lib/auth/route.ts";

/**
 * 세션 갱신(스펙 "계정"): 인증·개인 경로에서만 토큰을 확인·갱신하고 갱신된 쿠키를 요청과 응답에 싣는다.
 * 공개 화면(오늘·사건)에는 매칭하지 않는다 — 공개 응답에 `Set-Cookie`·사용자 상태가 생기지 않는다.
 * 여기서의 확인은 인가가 아니다. 각 Route Handler·Server Action이 lib/auth의 헬퍼로 직접 검증한다.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { client, respond } = routeAuthClient(request);
  if (client !== null) await client.auth.getClaims();
  return respond(NextResponse.next({ request }));
}

export const config = { matcher: ["/auth/:path*"] };
