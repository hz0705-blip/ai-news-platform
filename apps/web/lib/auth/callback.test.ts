import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest, type NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { DELETION_INTENT_COOKIE, encodeIntent } from "../account/deletion.ts";
import { type CallbackDeps, handleAuthCallback } from "./callback.ts";
import { RETURN_COOKIE } from "./urls.ts";

// Supabase Auth 경계 스텁: 코드 교환은 세션 쿠키를 쓰고(`setAll`), 로그아웃은 그 쿠키를 비운다 — 실제 어댑터와 같은 흐름.
const SESSION_COOKIE = "sb-test-auth-token";
const SECRET = "test-secret";
const USER_ID = "00000000-0000-4000-8000-00000000000a";
const KEY = "00000000-0000-4000-8000-0000000000c1";

function kakaoUser(id = USER_ID): User {
  return {
    id,
    identities: [
      { id: "4242", identity_id: "i-1", user_id: id, provider: "kakao", identity_data: {} },
    ],
  } as unknown as User;
}

function fakeAuth(user: User, session: Record<string, unknown> = {}) {
  const jar: { name: string; value: string }[] = [];
  const exchangeCodeForSession = vi.fn(async () => {
    jar.push({ name: SESSION_COOKIE, value: "session" });
    return { data: { user, session: { user, ...session } }, error: null };
  });
  const signOut = vi.fn(async () => {
    jar.push({ name: SESSION_COOKIE, value: "" });
    return { error: null };
  });
  const client = { auth: { exchangeCodeForSession, signOut } } as unknown as SupabaseClient;
  const respond = <T extends NextResponse>(response: T): T => {
    for (const { name, value } of jar) response.cookies.set(name, value);
    return response;
  };
  return { client, respond, exchangeCodeForSession, signOut };
}

function callback(cookies: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://web.test/auth/callback?code=abc", {
    headers: {
      host: "web.test",
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
  });
}

function deps(
  auth: ReturnType<typeof fakeAuth>,
  overrides: Partial<CallbackDeps> = {},
): CallbackDeps {
  return {
    client: auth.client,
    respond: auth.respond,
    intentSecret: SECRET,
    isRegistrationBlocked: vi.fn(async () => false),
    runDeletion: vi.fn(async () => "completed" as const),
    ...overrides,
  };
}

const sessionCookie = (response: NextResponse) => response.cookies.get(SESSION_COOKIE)?.value ?? "";

describe("인증 콜백 — 재가입 차단", () => {
  it("삭제 대기 행이 있는 제공자 ID의 콜백은 세션을 만들지 않고 로그인 화면의 안내로 보낸다", async () => {
    const auth = fakeAuth(kakaoUser());
    const isRegistrationBlocked = vi.fn(async () => true);
    const response = await handleAuthCallback(
      callback({ [RETURN_COOKIE]: "/follows" }),
      deps(auth, { isRegistrationBlocked }),
    );
    expect(isRegistrationBlocked).toHaveBeenCalledWith(kakaoUser());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(sessionCookie(response)).toBe("");
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("error")).toBe("pending-deletion");
  });

  it("대기 행이 없으면 세션을 싣고 돌아갈 주소로 보낸다", async () => {
    const auth = fakeAuth(kakaoUser());
    const response = await handleAuthCallback(
      callback({ [RETURN_COOKIE]: "/follows" }),
      deps(auth),
    );
    expect(sessionCookie(response)).toBe("session");
    expect(response.headers.get("location")).toBe("http://web.test/follows");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("인증 콜백 — 계정 삭제의 재로그인", () => {
  const intent = encodeIntent({ userId: USER_ID, requestKey: KEY }, SECRET);

  it("의도의 사용자로 다시 로그인하면 삭제하고 세션 쿠키를 지운 뒤 결과 화면으로 보낸다", async () => {
    const google = {
      id: USER_ID,
      identities: [
        { id: "1087", identity_id: "i-2", user_id: USER_ID, provider: "google", identity_data: {} },
      ],
    } as unknown as User;
    const auth = fakeAuth(google, {
      provider_token: "access-token",
      provider_refresh_token: "refresh-token",
    });
    const runDeletion = vi.fn(async () => "pending" as const);
    const response = await handleAuthCallback(
      callback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(auth, { runDeletion }),
    );
    expect(runDeletion).toHaveBeenCalledWith({
      userId: USER_ID,
      identities: [
        { provider: "google", providerSubject: "1087", revocationToken: "refresh-token" },
      ],
      requestKey: KEY,
    });
    expect(response.headers.get("location")).toBe("http://web.test/account/deleted");
    expect(sessionCookie(response)).toBe("");
    expect(response.cookies.get("account-deletion-key")?.value).toBe(KEY);
  });

  it("다른 계정으로 로그인하면 삭제하지 않고 로그아웃한다", async () => {
    const auth = fakeAuth(kakaoUser("00000000-0000-4000-8000-00000000000b"));
    const runDeletion = vi.fn(async () => "completed" as const);
    const response = await handleAuthCallback(
      callback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(auth, { runDeletion }),
    );
    expect(runDeletion).not.toHaveBeenCalled();
    expect(sessionCookie(response)).toBe("");
    expect(response.headers.get("location")).toBe("http://web.test/account?error=mismatch");
  });

  it("서명이 맞지 않는 의도 쿠키는 무시하고 평소 로그인으로 처리한다", async () => {
    const auth = fakeAuth(kakaoUser());
    const runDeletion = vi.fn(async () => "completed" as const);
    const forged = `${USER_ID}.${KEY}.forged`;
    const response = await handleAuthCallback(
      callback({ [DELETION_INTENT_COOKIE]: forged }),
      deps(auth, { runDeletion }),
    );
    expect(runDeletion).not.toHaveBeenCalled();
    expect(sessionCookie(response)).toBe("session");
  });

  it("Google 해제용 토큰을 받지 못했거나 삭제가 실패하면 삭제를 끝내지 않고 계정 화면의 실패 안내로 보낸다", async () => {
    const google = {
      id: USER_ID,
      identities: [
        { id: "1087", identity_id: "i-2", user_id: USER_ID, provider: "google", identity_data: {} },
      ],
    } as unknown as User;
    const noToken = fakeAuth(google);
    const runDeletion = vi.fn(async () => "completed" as const);
    const first = await handleAuthCallback(
      callback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(noToken, { runDeletion }),
    );
    expect(runDeletion).not.toHaveBeenCalled();
    expect(first.headers.get("location")).toBe("http://web.test/account?error=failed");

    const failing = vi.fn(async () => {
      throw new Error("auth down");
    });
    const second = await handleAuthCallback(
      callback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(fakeAuth(kakaoUser()), { runDeletion: failing }),
    );
    expect(second.headers.get("location")).toBe("http://web.test/account?error=failed");
    expect(second.cookies.get("account-deletion-key")).toBeUndefined();
  });
});
