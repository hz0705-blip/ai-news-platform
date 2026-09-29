import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "../auth/env.ts";

/**
 * 계정 삭제 전용 서버 코드(스펙 "계정": 관리자 키는 삭제 전용 서버 코드에만 둔다). `SUPABASE_SECRET_KEY`는 여기서만 읽는다.
 * Kakao 연결 해제의 관리자 키 `KAKAO_ADMIN_KEY`도 여기서 읽는다. 값을 로그·응답에 싣지 않는다.
 */
export interface DeletionEnv {
  readonly url: string;
  readonly secretKey: string;
  /** 없으면 Kakao 계정의 삭제는 시작하지 않는다(연결 해제를 끝낼 수 없으므로). */
  readonly kakaoAdminKey: string | null;
}

/** 삭제에 필요한 설정. Supabase URL·secret 키가 없으면 null — 계정 삭제는 "지금은 할 수 없음"이다. */
export function deletionEnv(): DeletionEnv | null {
  const env = supabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (env === null || !secretKey) return null;
  const kakaoAdminKey = process.env.KAKAO_ADMIN_KEY;
  return { url: env.url, secretKey, kakaoAdminKey: kakaoAdminKey ? kakaoAdminKey : null };
}

/** Auth 관리자 요청 하나의 시간 상한. 넘기면 사용자 존재를 확인한 뒤 다시 한다. */
export const ADMIN_REQUEST_TIMEOUT_MS = 10_000;

export function createAdminClient(env: DeletionEnv): SupabaseClient {
  return createClient(env.url, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(ADMIN_REQUEST_TIMEOUT_MS) }),
    },
  });
}

type AdminAuth = Pick<SupabaseClient["auth"]["admin"], "deleteUser" | "getUserById">;

/** 사용자가 아직 있는가. 확인하지 못하면(시간 초과 등) null. */
async function userExists(admin: AdminAuth, userId: string): Promise<boolean | null> {
  const { data, error } = await admin.getUserById(userId);
  if (error === null) return data.user !== null;
  return error.status === 404 ? false : null;
}

/**
 * 인증 사용자 하드 삭제(`deleteUser(id, false)`). 실패·시간 초과면 사용자 존재를 확인하고, 이미 없으면 성공이다.
 * 아직 있으면 한 번 더 시도하고, 그래도 지우지 못하면 던진다(호출자는 계정을 그대로 두고 실패를 알린다).
 */
export async function deleteAuthUser(admin: AdminAuth, userId: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await admin.deleteUser(userId, false);
    if (error === null || error.status === 404) return;
    const exists = await userExists(admin, userId);
    if (exists === false) return;
  }
  throw new Error("인증 사용자를 삭제하지 못했다");
}
