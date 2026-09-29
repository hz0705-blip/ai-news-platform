import type { NextRequest, NextResponse } from "next/server";
import { handleKakaoCallback } from "../../../../lib/auth/callback.ts";
import { callbackDeps } from "../../../../lib/auth/callback-deps.ts";
import { kakaoEnv } from "../../../../lib/auth/kakao.ts";

/** Kakao 인증 콜백(lib/auth/callback.ts): state 확인, 코드 → id_token → `signInWithIdToken`, 이후는 `/auth/callback`과 같다. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleKakaoCallback(request, { ...callbackDeps(request), kakao: kakaoEnv(), fetch });
}
