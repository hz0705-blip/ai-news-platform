import type { NextRequest, NextResponse } from "next/server";
import { handleOidcCallback } from "../../../../lib/auth/callback.ts";
import { callbackDeps } from "../../../../lib/auth/callback-deps.ts";
import { googleClient, googleEnv } from "../../../../lib/auth/google.ts";

/** Google 인증 콜백(lib/auth/callback.ts): state 확인, 코드 → id_token → `signInWithIdToken`, 이후는 공통 규칙. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = googleEnv();
  return handleOidcCallback(request, {
    ...callbackDeps(request),
    provider: "google",
    oidc: env === null ? null : googleClient(env),
    fetch,
  });
}
