import type { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback } from "../../../lib/auth/callback.ts";
import { callbackDeps } from "../../../lib/auth/callback-deps.ts";

/** 인증 콜백(lib/auth/callback.ts): 세션 교환, 재가입 차단, 계정 삭제의 재로그인 마무리. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAuthCallback(request, callbackDeps(request));
}
