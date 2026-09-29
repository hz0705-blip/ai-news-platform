import type { User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifiedSession } from "../../../lib/auth/session.ts";
import { POST } from "./route.ts";

// 현재 사용자 헬퍼만 바꿔 끼울 수 있게 둔다(기본은 실제 구현).
vi.mock("../../../lib/auth/session.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth/session.ts")>();
  return { ...actual, verifiedSession: vi.fn(actual.verifiedSession) };
});

afterEach(() => vi.unstubAllEnvs());

// Supabase 환경변수가 없는 단위 테스트에서는 현재 사용자가 늘 익명이다.
function post(fields: Record<string, string>, origin: string | null): NextRequest {
  return new NextRequest("http://web.test/account/delete", {
    method: "POST",
    headers: {
      host: "web.test",
      "content-type": "application/x-www-form-urlencoded",
      ...(origin === null ? {} : { origin }),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("계정 삭제 시작", () => {
  it("다른 출처의 요청은 403이다", async () => {
    const response = await POST(post({ confirm: "yes" }, "https://evil.test"));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("클라이언트가 보낸 사용자 ID는 거부한다(대상은 서버가 정한다)", async () => {
    const response = await POST(
      post({ confirm: "yes", user_id: "00000000-0000-4000-8000-00000000000b" }, "http://web.test"),
    );
    expect(response.status).toBe(400);
  });

  it("익명이면 삭제하지 않고 계정 화면으로 돌아오는 로그인으로 보낸다", async () => {
    const response = await POST(post({ confirm: "yes" }, "http://web.test"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://web.test/auth/login?next=%2Faccount");
  });
});

describe("계정 삭제 시작 — Kakao 재로그인", () => {
  it("Kakao 계정 삭제 재로그인은 prompt=login으로 같은 흐름을 쓴다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("KAKAO_ADMIN_KEY", "admin-key");
    vi.stubEnv("KAKAO_REST_API_KEY", "rest-key");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "client-secret");
    const user = {
      id: "00000000-0000-4000-8000-00000000000a",
      identities: [{ id: "4242", provider: "kakao", identity_data: {} }],
    } as unknown as User;
    vi.mocked(verifiedSession).mockResolvedValueOnce({ user, claims: {} as never });

    const response = await POST(post({ confirm: "yes" }, "http://web.test"));
    expect(response.status).toBe(303);
    const authorize = new URL(response.headers.get("location") ?? "");
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      "https://kauth.kakao.com/oauth/authorize",
    );
    expect(authorize.searchParams.get("prompt")).toBe("login");
    expect(authorize.searchParams.get("scope")).toBe("openid,profile_nickname,account_email");
    expect(authorize.searchParams.get("redirect_uri")).toBe("http://web.test/auth/callback/kakao");
    expect(response.cookies.get("kakao-oidc-state")?.value).toBe(
      authorize.searchParams.get("state"),
    );
    expect(response.cookies.get("kakao-oidc-nonce")?.value).toBeTruthy();
    expect(response.cookies.get("account-deletion-intent")?.value).toMatch(
      /^00000000-0000-4000-8000-00000000000a\./,
    );
  });
});
