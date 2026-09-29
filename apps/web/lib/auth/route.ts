import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { PRIVATE_NO_STORE, supabaseEnv } from "./env.ts";

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };

/**
 * Route Handler·Proxy용 요청별 클라이언트. 쿠키는 요청에서 읽고, 라이브러리가 `setAll`로 넘기는 쿠키와
 * 캐시 헤더(스펙 "계정": 캐시 헤더까지 복사)를 모아 두었다가 `respond`가 응답에 싣는다.
 * 모든 인증 응답은 `Cache-Control: private, no-store`를 갖는다(라이브러리 헤더가 있으면 그것이 더 엄격하다).
 */
export function routeAuthClient(request: NextRequest): {
  client: SupabaseClient | null;
  respond: <T extends NextResponse>(response: T) => T;
} {
  const cookies: CookieToSet[] = [];
  const headers: Record<string, string> = {};
  const env = supabaseEnv();
  const client =
    env === null
      ? null
      : createServerClient(env.url, env.publishableKey, {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (list, cacheHeaders) => {
              for (const cookie of list) {
                request.cookies.set(cookie.name, cookie.value);
                cookies.push(cookie);
              }
              Object.assign(headers, cacheHeaders);
            },
          },
        });
  const respond = <T extends NextResponse>(response: T): T => {
    for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    if (!response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", PRIVATE_NO_STORE);
    }
    return response;
  };
  return { client, respond };
}
