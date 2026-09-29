import { describe, expect, it } from "vitest";
import {
  createProviderUnlinker,
  GOOGLE_REVOKE_URL,
  KAKAO_UNLINK_URL,
  type UnlinkTarget,
} from "./provider-unlink.ts";

// 제공자 HTTP 경계 스텁: 실제 네트워크를 타지 않는다.
type Call = { url: string; headers: Record<string, string>; body: string };

function stubFetch(respond: () => Response | Promise<Response>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: String(init?.body),
    });
    return respond();
  };
  return { fetch: fake as typeof fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const KAKAO: UnlinkTarget = { provider: "kakao", providerSubject: "4242", revocationToken: null };
const GOOGLE: UnlinkTarget = {
  provider: "google",
  providerSubject: "1087",
  revocationToken: "refresh-token",
};

describe("제공자 연결 해제", () => {
  it("Kakao는 관리자 키와 user_id 대상으로 해제하고 200이면 해제됨이다", async () => {
    const stub = stubFetch(() => json(200, { id: 4242 }));
    const unlink = createProviderUnlinker({ fetch: stub.fetch, kakaoAdminKey: "admin-key" });
    expect(await unlink(KAKAO)).toEqual({ outcome: "unlinked" });
    expect(stub.calls).toEqual([
      {
        url: KAKAO_UNLINK_URL,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "KakaoAK admin-key",
        },
        body: "target_id_type=user_id&target_id=4242",
      },
    ]);
  });

  it("Google은 재로그인 때 받은 토큰을 폐기하고 200이면 해제됨이다", async () => {
    const stub = stubFetch(() => new Response("", { status: 200 }));
    const unlink = createProviderUnlinker({ fetch: stub.fetch });
    expect(await unlink(GOOGLE)).toEqual({ outcome: "unlinked" });
    expect(stub.calls[0]?.url).toBe(GOOGLE_REVOKE_URL);
    expect(stub.calls[0]?.body).toBe("token=refresh-token");
  });

  it("이미 해제된 Kakao 사용자(-101)와 이미 폐기된 Google 토큰은 완료다", async () => {
    const kakao = createProviderUnlinker({
      fetch: stubFetch(() => json(400, { code: -101, msg: "NotRegisteredUserException" })).fetch,
      kakaoAdminKey: "admin-key",
    });
    expect(await kakao(KAKAO)).toEqual({ outcome: "already-unlinked" });
    const google = createProviderUnlinker({
      fetch: stubFetch(() => json(400, { error: "invalid_token" })).fetch,
    });
    expect(await google(GOOGLE)).toEqual({ outcome: "already-unlinked" });
  });

  it.each([429, 500, 503])("%i 응답은 재시도다", async (status) => {
    const unlink = createProviderUnlinker({
      fetch: stubFetch(() => json(status, {})).fetch,
      kakaoAdminKey: "admin-key",
    });
    expect((await unlink(KAKAO)).outcome).toBe("retry");
    expect((await unlink(GOOGLE)).outcome).toBe("retry");
  });

  it("시간 초과·네트워크 오류는 재시도다", async () => {
    const timeout = createProviderUnlinker({
      fetch: stubFetch(() => {
        throw new DOMException("timed out", "TimeoutError");
      }).fetch,
      kakaoAdminKey: "admin-key",
    });
    expect(await timeout(KAKAO)).toEqual({ outcome: "retry", reason: "kakao-timeout" });
    const network = createProviderUnlinker({
      fetch: stubFetch(() => {
        throw new TypeError("fetch failed");
      }).fetch,
    });
    expect(await network(GOOGLE)).toEqual({ outcome: "retry", reason: "google-network" });
  });

  it.each([401, 403])(
    "Kakao 관리자 키 오류(%i)는 성공으로 치지 않고 요청 오류로 남긴다",
    async (status) => {
      const unlink = createProviderUnlinker({
        fetch: stubFetch(() => json(status, { code: -401, msg: "wrong appKey" })).fetch,
        kakaoAdminKey: "wrong",
      });
      expect(await unlink(KAKAO)).toEqual({ outcome: "rejected", reason: "kakao-admin-key" });
    },
  );

  it("관리자 키·Google 토큰이 없으면 요청하지 않고 완료가 아니다", async () => {
    const stub = stubFetch(() => json(200, {}));
    const unlink = createProviderUnlinker({ fetch: stub.fetch });
    expect(await unlink(KAKAO)).toEqual({
      outcome: "rejected",
      reason: "kakao-admin-key-missing",
    });
    expect(await unlink({ ...GOOGLE, revocationToken: null })).toEqual({
      outcome: "rejected",
      reason: "google-token-missing",
    });
    expect(stub.calls).toEqual([]);
  });
});
