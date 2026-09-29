import { connection, type NextRequest, NextResponse } from "next/server";
import { routeAuthClient } from "../../../lib/auth/route.ts";
import { verifiedUserId } from "../../../lib/auth/session.ts";

/** 요청 시점 로그인 상태(개인 응답, 캐시 없음). 공개 화면은 인증 상태를 담지 않으므로 필요한 곳이 이것을 묻는다. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // 요청 쿠키만 읽는 GET은 빌드 때 정적으로 굳을 수 있다 — 요청 시점에만 돌게 한다.
  await connection();
  const { client, respond } = routeAuthClient(request);
  const userId = await verifiedUserId(client);
  return respond(NextResponse.json({ userId }));
}
