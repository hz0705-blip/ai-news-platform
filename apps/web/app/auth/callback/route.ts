import type { NextRequest, NextResponse } from "next/server";
import { deletionEnv } from "../../../lib/account/admin.ts";
import { isRegistrationBlocked, runAccountDeletion } from "../../../lib/account/deletion.ts";
import { handleAuthCallback } from "../../../lib/auth/callback.ts";
import { routeAuthClient } from "../../../lib/auth/route.ts";

/** 인증 콜백(lib/auth/callback.ts): 세션 교환, 재가입 차단, 계정 삭제의 재로그인 마무리. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { client, respond } = routeAuthClient(request);
  const env = deletionEnv();
  return handleAuthCallback(request, {
    client,
    respond,
    intentSecret: env?.secretKey ?? null,
    isRegistrationBlocked,
    runDeletion: async (input) => {
      if (env === null) throw new Error("계정 삭제 설정이 없다");
      return runAccountDeletion(env, input);
    },
  });
}
