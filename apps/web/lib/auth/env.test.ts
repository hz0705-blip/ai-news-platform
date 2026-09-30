import { createServerClient } from "@supabase/ssr";
import { describe, expect, it } from "vitest";
import { supabaseAuthCookieName } from "./env.ts";

describe("Supabase 세션 쿠키 이름", () => {
  it("라이브러리가 실제로 쓰는 쿠키 이름과 같다", async () => {
    const written: string[] = [];
    const client = createServerClient("https://abcdref.supabase.co", "publishable-key", {
      cookies: {
        getAll: () => [],
        setAll: (list) => {
          for (const cookie of list) written.push(cookie.name);
        },
      },
    });
    // Google 로그인 시작과 같은 호출: PKCE 코드 검증자를 저장 키 접두로 쿠키에 쓴다(네트워크 없음).
    await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "http://localhost/auth/callback", skipBrowserRedirect: true },
    });
    const name = supabaseAuthCookieName("abcdref");
    expect(written.length).toBeGreaterThan(0);
    for (const cookie of written) expect(cookie.startsWith(`${name}-`)).toBe(true);
  });
});
