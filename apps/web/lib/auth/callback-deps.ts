import type { NextRequest } from "next/server";
import { deletionEnv } from "../account/admin.ts";
import { isRegistrationBlocked, runAccountDeletion } from "../account/deletion.ts";
import type { CallbackDeps } from "./callback.ts";
import { routeAuthClient } from "./route.ts";

/** 인증 콜백 Route Handler(`/auth/callback/kakao`, `/auth/callback/google`)의 실제 의존성. */
export function callbackDeps(request: NextRequest): CallbackDeps {
  const { client, respond } = routeAuthClient(request);
  const env = deletionEnv();
  return {
    client,
    respond,
    intentSecret: env?.secretKey ?? null,
    isRegistrationBlocked,
    runDeletion: async (input) => {
      if (env === null) throw new Error("계정 삭제 설정이 없다");
      return runAccountDeletion(env, input);
    },
  };
}
