import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env.ts";
import { verifiedUserId } from "./session.ts";

/**
 * Server Component·Server Action용 요청별 클라이언트(`next/headers` 쿠키). 요청마다 새로 만든다.
 * Server Component에서는 쿠키를 쓸 수 없으므로 setAll이 실패하면 버린다 — 세션 갱신은 proxy.ts가 한다.
 * Route Handler는 응답에 쿠키·캐시 헤더를 직접 싣는 lib/auth/route.ts를 쓴다.
 */
export async function createRequestAuthClient(): Promise<SupabaseClient | null> {
  const env = supabaseEnv();
  if (env === null) return null;
  const store = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component 렌더 중에는 쿠키를 쓸 수 없다.
        }
      },
    },
  });
}

/** 현재 요청의 검증된 사용자 ID(lib/auth/session.ts). 익명·무효 세션·Supabase 미설정이면 null. */
export async function getCurrentUserId(): Promise<string | null> {
  return verifiedUserId(await createRequestAuthClient());
}
