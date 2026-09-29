import type { JwtPayload, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { deleteAuthUser } from "./admin.ts";
import {
  canDeleteWith,
  decodeIntent,
  deletionIdentities,
  encodeIntent,
  reauthProvider,
  signedInRecently,
} from "./deletion.ts";

const user = (...providers: string[]) =>
  ({
    id: "u",
    identities: providers.map((provider, n) => ({ id: `${provider}-${n}`, provider })),
  }) as unknown as User;

describe("계정 삭제 준비", () => {
  it("재로그인 제공자는 Google이 있으면 Google, 없으면 Kakao, 제공자 연결이 없으면 없음이다", () => {
    expect(reauthProvider(user("kakao", "google"))).toBe("google");
    expect(reauthProvider(user("kakao"))).toBe("kakao");
    expect(reauthProvider(user("email"))).toBeNull();
  });

  it("Kakao 연결이 있는데 관리자 키가 없거나 Supabase secret 키가 없으면 삭제를 시작하지 않는다", () => {
    const env = { url: "http://auth.test", secretKey: "s", kakaoAdminKey: null };
    expect(canDeleteWith(null, user("google"))).toBe(false);
    expect(canDeleteWith(env, user("kakao"))).toBe(false);
    expect(canDeleteWith(env, user("google"))).toBe(true);
    expect(canDeleteWith({ ...env, kakaoAdminKey: "k" }, user("kakao"))).toBe(true);
  });

  it("Google 해제용 토큰은 갱신 토큰을 먼저 쓰고, 없으면 삭제 대상을 만들지 않는다", () => {
    expect(
      deletionIdentities(user("kakao", "google"), {
        providerToken: "access",
        providerRefreshToken: "refresh",
      }),
    ).toEqual([
      { provider: "kakao", providerSubject: "kakao-0", revocationToken: null },
      { provider: "google", providerSubject: "google-1", revocationToken: "refresh" },
    ]);
    expect(deletionIdentities(user("google"), { providerToken: "access" })).toEqual([
      { provider: "google", providerSubject: "google-0", revocationToken: "access" },
    ]);
    expect(deletionIdentities(user("google"), {})).toBeNull();
  });

  it("삭제 의도는 서명이 맞을 때만 읽는다", () => {
    const value = encodeIntent({ userId: "u1", requestKey: "k1" }, "secret");
    expect(decodeIntent(value, "secret")).toEqual({ userId: "u1", requestKey: "k1" });
    expect(decodeIntent(value, "other")).toBeNull();
    expect(decodeIntent(value.replace("u1", "u2"), "secret")).toBeNull();
    expect(decodeIntent(undefined, "secret")).toBeNull();
  });

  it("방금 로그인 판정은 JWT amr 인증 시각이 10분 안일 때다", () => {
    const now = new Date("2026-09-29T00:10:00Z");
    const at = (iso: string) =>
      ({ amr: [{ method: "password", timestamp: Date.parse(iso) / 1000 }] }) as JwtPayload;
    expect(signedInRecently(at("2026-09-29T00:00:00Z"), now)).toBe(true);
    expect(signedInRecently(at("2026-09-28T23:59:59Z"), now)).toBe(false);
    expect(signedInRecently({} as JwtPayload, now)).toBe(false);
  });
});

describe("인증 사용자 하드 삭제", () => {
  const notFound = { status: 404, message: "User not found" };
  const timeout = { status: 0, message: "timeout" };

  it("시간 초과 뒤 사용자가 이미 없으면 성공이다", async () => {
    const admin = {
      deleteUser: vi.fn(async () => ({ data: { user: null }, error: timeout })),
      getUserById: vi.fn(async () => ({ data: { user: null }, error: notFound })),
    };
    await deleteAuthUser(admin as never, "u");
    expect(admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(admin.deleteUser).toHaveBeenCalledWith("u", false);
  });

  it("시간 초과 뒤 사용자가 아직 있으면 다시 시도하고, 끝내 못 지우면 던진다", async () => {
    const admin = {
      deleteUser: vi.fn(async () => ({ data: { user: null }, error: timeout })),
      getUserById: vi.fn(async () => ({ data: { user: { id: "u" } }, error: null })),
    };
    await expect(deleteAuthUser(admin as never, "u")).rejects.toThrow();
    expect(admin.deleteUser).toHaveBeenCalledTimes(2);
  });
});
