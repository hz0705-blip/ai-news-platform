import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashNonce } from "../../../../lib/auth/kakao.ts";
import { GET } from "./route.ts";

afterEach(() => vi.unstubAllEnvs());

function start(provider: string): NextRequest {
  const next = encodeURIComponent("/story/s-1?intent=follow");
  return new NextRequest(`https://web.test/auth/login/start?provider=${provider}&next=${next}`, {
    headers: { host: "web.test" },
  });
}

describe("로그인 시작", () => {
  it("평소 로그인은 남아 있는 계정 삭제 의도 쿠키를 지운다", async () => {
    const response = await GET(
      new NextRequest("http://web.test/auth/login/start?provider=kakao&next=%2F", {
        headers: { host: "web.test", cookie: "account-deletion-intent=u.k.sig" },
      }),
    );
    expect(response.status).toBe(303);
    const cleared = response.cookies.get("account-deletion-intent");
    expect(cleared?.value).toBe("");
    expect(cleared?.path).toBe("/auth");
  });
});

describe("로그인 시작 — Kakao", () => {
  it("Kakao 로그인 시작은 openid·닉네임·이메일만 요청하고 state·nonce 쿠키를 둔다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("KAKAO_REST_API_KEY", "rest-key");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "client-secret");
    const response = await GET(start("kakao"));

    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const authorize = new URL(response.headers.get("location") ?? "");
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      "https://kauth.kakao.com/oauth/authorize",
    );
    const params = Object.fromEntries(authorize.searchParams);
    expect(params.scope).toBe("openid,profile_nickname,account_email");
    expect(params.client_id).toBe("rest-key");
    expect(params.response_type).toBe("code");
    expect(params.redirect_uri).toBe("https://web.test/auth/callback/kakao");
    expect(params.prompt).toBeUndefined();

    const state = response.cookies.get("kakao-oidc-state");
    const nonce = response.cookies.get("kakao-oidc-nonce");
    expect(state?.value).toBe(params.state);
    expect(state).toMatchObject({ httpOnly: true, path: "/auth", maxAge: 600, secure: true });
    expect(nonce).toMatchObject({ httpOnly: true, path: "/auth", maxAge: 600 });
    // Kakao에는 원문의 SHA-256 해시를 보낸다 — Supabase가 원문을 해시해 id_token의 nonce와 비교한다.
    expect(params.nonce).toBe(hashNonce(nonce?.value ?? ""));
    expect(params.nonce).not.toBe(nonce?.value);
    expect(response.cookies.get("auth-return-path")?.value).toBe("/story/s-1?intent=follow");
  });

  it("Kakao 변수가 없으면 로그인할 수 없음 안내로 보낸다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    const response = await GET(start("kakao"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("error")).toBe("unavailable");
  });
});
