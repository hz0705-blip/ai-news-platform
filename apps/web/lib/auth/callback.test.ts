import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest, type NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { DELETION_INTENT_COOKIE, encodeIntent } from "../account/deletion.ts";
import { type CallbackDeps, handleOidcCallback } from "./callback.ts";
import { googleClient } from "./google.ts";
import { kakaoClient } from "./kakao.ts";
import { RETURN_COOKIE } from "./urls.ts";

// Supabase Auth 경계 스텁: `signInWithIdToken`은 세션 쿠키를 쓰고(`setAll`), 로그아웃은 그 쿠키를 비운다 — 실제 어댑터와 같은 흐름.
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

function googleUser(id = USER_ID): User {
  return {
    id,
    identities: [
      { id: "1087", identity_id: "i-2", user_id: id, provider: "google", identity_data: {} },
    ],
  } as unknown as User;
}

/** state가 맞는 Google 콜백. */
const googleCallback = (cookies: Record<string, string> = {}) =>
  providerCallback("google", "gst", {
    "google-oidc-state": "gst",
    "google-oidc-nonce": "raw-nonce",
    ...cookies,
  });

function fakeAuth(user: User, session: Record<string, unknown> = {}) {
  const jar: { name: string; value: string }[] = [];
  const signOut = vi.fn(async () => {
    jar.push({ name: SESSION_COOKIE, value: "" });
    return { error: null };
  });
  const signInWithIdToken = vi.fn(async (_credentials: Record<string, unknown>) => {
    jar.push({ name: SESSION_COOKIE, value: "session" });
    return { data: { user, session: { user, ...session } }, error: null };
  });
  const client = {
    auth: { signInWithIdToken, signOut },
  } as unknown as SupabaseClient;
  const respond = <T extends NextResponse>(response: T): T => {
    for (const { name, value } of jar) response.cookies.set(name, value);
    return response;
  };
  return { client, respond, signInWithIdToken, signOut };
}

const kakao = kakaoClient({ restApiKey: "rest-key", clientSecret: "client-secret" });
const google = googleClient({ clientId: "google-client", clientSecret: "google-secret" });
// 테스트에서 만든 id_token(서명·aud·nonce 검증은 Supabase가 한다 — 앱은 그대로 넘긴다).
const ID_TOKEN = ["header", btoa(JSON.stringify({ sub: "4242", nonce: "hashed" })), "sig"].join(
  ".",
);

function providerCallback(
  provider: "kakao" | "google",
  state: string,
  cookies: Record<string, string>,
): NextRequest {
  return new NextRequest(`http://web.test/auth/callback/${provider}?code=pcode&state=${state}`, {
    headers: {
      host: "web.test",
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
  });
}

/** state가 맞는 Kakao 콜백(공통 규칙 테스트용). */
const callback = (cookies: Record<string, string> = {}) =>
  providerCallback("kakao", "st", {
    "kakao-oidc-state": "st",
    "kakao-oidc-nonce": "raw-nonce",
    ...cookies,
  });

const tokenFetch = (body: Record<string, unknown> = { id_token: ID_TOKEN }) =>
  vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

function deps(
  auth: ReturnType<typeof fakeAuth>,
  overrides: Partial<CallbackDeps> = {},
  provider: { provider: "kakao" | "google"; fetch: typeof fetch } = {
    provider: "kakao",
    fetch: tokenFetch(),
  },
) {
  return {
    client: auth.client,
    respond: auth.respond,
    intentSecret: SECRET,
    isRegistrationBlocked: vi.fn(async () => false),
    runDeletion: vi.fn(async () => "completed" as const),
    ...overrides,
    ...provider,
    oidc: provider.provider === "kakao" ? kakao : google,
  } satisfies Parameters<typeof handleOidcCallback>[1];
}

const sessionCookie = (response: NextResponse) => response.cookies.get(SESSION_COOKIE)?.value ?? "";

describe("인증 콜백 — 재가입 차단", () => {
  it("삭제 대기 행이 있는 제공자 ID의 콜백은 세션을 만들지 않고 로그인 화면의 안내로 보낸다", async () => {
    const auth = fakeAuth(kakaoUser());
    const isRegistrationBlocked = vi.fn(async () => true);
    const response = await handleOidcCallback(
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
    const response = await handleOidcCallback(
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
    const auth = fakeAuth(kakaoUser());
    const runDeletion = vi.fn(async () => "pending" as const);
    const response = await handleOidcCallback(
      callback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(auth, { runDeletion }),
    );
    // Kakao 연결 해제는 관리자 키 + Kakao ID(identity id)라 토큰을 넘기지 않는다.
    expect(runDeletion).toHaveBeenCalledWith({
      userId: USER_ID,
      identities: [{ provider: "kakao", providerSubject: "4242", revocationToken: null }],
      requestKey: KEY,
    });
    expect(response.headers.get("location")).toBe("http://web.test/account/deleted");
    expect(sessionCookie(response)).toBe("");
    expect(response.cookies.get("account-deletion-key")?.value).toBe(KEY);
  });

  it("다른 계정으로 로그인하면 삭제하지 않고 로그아웃한다", async () => {
    const auth = fakeAuth(kakaoUser("00000000-0000-4000-8000-00000000000b"));
    const runDeletion = vi.fn(async () => "completed" as const);
    const response = await handleOidcCallback(
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
    const response = await handleOidcCallback(
      callback({ [DELETION_INTENT_COOKIE]: forged }),
      deps(auth, { runDeletion }),
    );
    expect(runDeletion).not.toHaveBeenCalled();
    expect(sessionCookie(response)).toBe("session");
  });

  it("계정 삭제 재로그인은 Google access token을 연결 해제에 넘긴다", async () => {
    const auth = fakeAuth(googleUser());
    const runDeletion = vi.fn(async () => "pending" as const);
    const response = await handleOidcCallback(
      googleCallback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(
        auth,
        { runDeletion },
        { provider: "google", fetch: tokenFetch({ id_token: ID_TOKEN, access_token: "g-access" }) },
      ),
    );
    expect(runDeletion).toHaveBeenCalledWith({
      userId: USER_ID,
      identities: [{ provider: "google", providerSubject: "1087", revocationToken: "g-access" }],
      requestKey: KEY,
    });
    expect(response.headers.get("location")).toBe("http://web.test/account/deleted");
    expect(sessionCookie(response)).toBe("");
  });

  it("Google 토큰 교환이 refresh token도 주면 그것을 연결 해제에 넘긴다(재시도가 access token 만료 뒤에도 된다)", async () => {
    const runDeletion = vi.fn(async () => "pending" as const);
    await handleOidcCallback(
      googleCallback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(
        fakeAuth(googleUser()),
        { runDeletion },
        {
          provider: "google",
          fetch: tokenFetch({
            id_token: ID_TOKEN,
            access_token: "g-access",
            refresh_token: "g-refresh",
          }),
        },
      ),
    );
    expect(runDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        identities: [{ provider: "google", providerSubject: "1087", revocationToken: "g-refresh" }],
      }),
    );
  });

  it("Google 해제용 토큰을 받지 못했거나 삭제가 실패하면 삭제를 끝내지 않고 계정 화면의 실패 안내로 보낸다", async () => {
    const runDeletion = vi.fn(async () => "completed" as const);
    const first = await handleOidcCallback(
      googleCallback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(fakeAuth(googleUser()), { runDeletion }, { provider: "google", fetch: tokenFetch() }),
    );
    expect(runDeletion).not.toHaveBeenCalled();
    expect(first.headers.get("location")).toBe("http://web.test/account?error=failed");

    const failing = vi.fn(async () => {
      throw new Error("auth down");
    });
    const second = await handleOidcCallback(
      callback({ [DELETION_INTENT_COOKIE]: intent }),
      deps(fakeAuth(kakaoUser()), { runDeletion: failing }),
    );
    expect(second.headers.get("location")).toBe("http://web.test/account?error=failed");
    expect(second.cookies.get("account-deletion-key")).toBeUndefined();
  });
});

describe("Kakao 콜백", () => {
  it("Kakao 콜백은 state가 다르면 거부한다", async () => {
    const auth = fakeAuth(kakaoUser());
    const fetch = tokenFetch();
    const response = await handleOidcCallback(
      providerCallback("kakao", "forged", {
        "kakao-oidc-state": "expected",
        "kakao-oidc-nonce": "raw-nonce",
        [RETURN_COOKIE]: "/follows",
      }),
      deps(auth, {}, { provider: "kakao", fetch }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(sessionCookie(response)).toBe("");
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("error")).toBe("failed");
  });

  it("Kakao 콜백은 코드를 id_token으로 바꿔 signInWithIdToken으로 로그인하고 돌아갈 주소로 보낸다", async () => {
    const auth = fakeAuth(kakaoUser());
    const fetch = tokenFetch({ id_token: ID_TOKEN, access_token: "kakao-access" });
    const response = await handleOidcCallback(
      callback({ [RETURN_COOKIE]: "/follows" }),
      deps(auth, {}, { provider: "kakao", fetch }),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://kauth.kakao.com/oauth/token");
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "authorization_code",
      client_id: "rest-key",
      client_secret: "client-secret",
      redirect_uri: "http://web.test/auth/callback/kakao",
      code: "pcode",
    });
    // Supabase에는 nonce 원문을 넘긴다(GoTrue가 SHA-256 해시로 id_token의 nonce와 비교한다).
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "kakao",
      token: ID_TOKEN,
      nonce: "raw-nonce",
      access_token: "kakao-access",
    });
    expect(sessionCookie(response)).toBe("session");
    expect(response.headers.get("location")).toBe("http://web.test/follows");
    for (const name of ["kakao-oidc-state", "kakao-oidc-nonce", RETURN_COOKIE]) {
      expect(response.cookies.get(name)?.value).toBe("");
    }
  });
});

describe("Google 콜백", () => {
  it("Google 콜백은 state가 다르면 거부한다", async () => {
    const auth = fakeAuth(googleUser());
    const fetch = tokenFetch();
    const response = await handleOidcCallback(
      providerCallback("google", "forged", {
        "google-oidc-state": "expected",
        "google-oidc-nonce": "raw-nonce",
        [RETURN_COOKIE]: "/follows",
      }),
      deps(auth, {}, { provider: "google", fetch }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(sessionCookie(response)).toBe("");
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("error")).toBe("failed");
  });

  it("Google 콜백은 nonce 원문을 signInWithIdToken에 넘긴다", async () => {
    const auth = fakeAuth(googleUser());
    const fetch = tokenFetch({ id_token: ID_TOKEN, access_token: "g-access" });
    const response = await handleOidcCallback(
      googleCallback({ [RETURN_COOKIE]: "/follows" }),
      deps(auth, {}, { provider: "google", fetch }),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "authorization_code",
      client_id: "google-client",
      client_secret: "google-secret",
      redirect_uri: "http://web.test/auth/callback/google",
      code: "pcode",
    });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: ID_TOKEN,
      nonce: "raw-nonce",
      access_token: "g-access",
    });
    expect(sessionCookie(response)).toBe("session");
    expect(response.headers.get("location")).toBe("http://web.test/follows");
    for (const name of ["google-oidc-state", "google-oidc-nonce", RETURN_COOKIE]) {
      expect(response.cookies.get(name)?.value).toBe("");
    }
  });

  it("Google 토큰 교환 실패는 로그인 실패로 돌아간다", async () => {
    const auth = fakeAuth(googleUser());
    const failing = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    const response = await handleOidcCallback(
      googleCallback({ [RETURN_COOKIE]: "/follows" }),
      deps(auth, {}, { provider: "google", fetch: failing }),
    );
    expect(failing).toHaveBeenCalledTimes(1);
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(sessionCookie(response)).toBe("");
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("next")).toBe("/follows");
    expect(location.searchParams.get("error")).toBe("failed");
  });

  it("Google 변수가 없으면 교환하지 않고 로그인할 수 없음 안내로 보낸다", async () => {
    const auth = fakeAuth(googleUser());
    const fetch = tokenFetch();
    const response = await handleOidcCallback(googleCallback(), {
      ...deps(auth, {}, { provider: "google", fetch }),
      oidc: null,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "unavailable",
    );
  });
});
