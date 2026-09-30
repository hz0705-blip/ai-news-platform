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
    // 네트워크 없이 저장 키를 관찰한다: PKCE 인가 URL 생성은 코드 검증자를 저장 키 접두의 쿠키로 쓴다.
    await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "http://localhost/auth/callback", skipBrowserRedirect: true },
    });
    const name = supabaseAuthCookieName("abcdref");
    expect(written.length).toBeGreaterThan(0);
    for (const cookie of written) expect(cookie.startsWith(`${name}-`)).toBe(true);
  });
});
