import type { UnlinkProvider, UnlinkResult } from "@newsplatform/domain";

/**
 * 계정 삭제의 제공자 연결 해제(스펙 "계정", #106). HTTP는 주입받은 `fetch`가 한다.
 * - Kakao `POST v1/user/unlink`: 관리자 키(`Authorization: KakaoAK …`) + `target_id_type=user_id`·Kakao 사용자 ID.
 *   이미 해제된 사용자(-101)는 완료로 본다.
 * - Google `POST oauth2/revoke`: 삭제 직전 재로그인에서 받은 토큰. 이미 폐기·만료된 토큰(`invalid_token`)은 완료로 본다.
 * 429·5xx·시간 초과·네트워크 오류는 `retry`, 관리자 키 오류(401·403)·토큰 없음 같은 나머지는 `rejected`(완료 아님).
 * 키·토큰 값은 결과·오류 문구에 담지 않는다.
 */
export const KAKAO_UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const PROVIDER_UNLINK_TIMEOUT_MS = 10_000;

/** Kakao: 앱과 연결되지 않은 사용자(이미 해제됨). */
const KAKAO_NOT_REGISTERED = -101;

export interface UnlinkTarget {
  readonly provider: UnlinkProvider;
  /** 제공자 사용자 ID(Kakao 회원번호, Google `sub`). */
  readonly providerSubject: string;
  /** 해제용 토큰(Google만). Kakao는 관리자 키로 해제하므로 null. */
  readonly revocationToken: string | null;
}

export interface ProviderUnlinkOptions {
  readonly fetch: typeof fetch;
  /** Kakao 관리자 키(`KAKAO_ADMIN_KEY`). 없으면 Kakao 해제는 `rejected`. */
  readonly kakaoAdminKey?: string | undefined;
  readonly timeoutMs?: number;
}

export type ProviderUnlinker = (target: UnlinkTarget) => Promise<UnlinkResult>;

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function transientOrRejected(provider: UnlinkProvider, status: number): UnlinkResult {
  if (status === 429 || status >= 500)
    return { outcome: "retry", reason: `${provider}-http-${status}` };
  if (status === 401 || status === 403) {
    return {
      outcome: "rejected",
      reason: provider === "kakao" ? "kakao-admin-key" : `google-http-${status}`,
    };
  }
  return { outcome: "rejected", reason: `${provider}-http-${status}` };
}

export function createProviderUnlinker(options: ProviderUnlinkOptions): ProviderUnlinker {
  const timeoutMs = options.timeoutMs ?? PROVIDER_UNLINK_TIMEOUT_MS;

  async function post(url: string, body: URLSearchParams, headers: Record<string, string>) {
    return options.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function kakao(target: UnlinkTarget): Promise<UnlinkResult> {
    const key = options.kakaoAdminKey;
    if (key === undefined || key === "") {
      return { outcome: "rejected", reason: "kakao-admin-key-missing" };
    }
    const response = await post(
      KAKAO_UNLINK_URL,
      new URLSearchParams({ target_id_type: "user_id", target_id: target.providerSubject }),
      { Authorization: `KakaoAK ${key}` },
    );
    if (response.ok) return { outcome: "unlinked" };
    const body = await readJson(response);
    if (response.status === 400 && body.code === KAKAO_NOT_REGISTERED) {
      return { outcome: "already-unlinked" };
    }
    return transientOrRejected("kakao", response.status);
  }

  async function google(target: UnlinkTarget): Promise<UnlinkResult> {
    if (target.revocationToken === null || target.revocationToken === "") {
      return { outcome: "rejected", reason: "google-token-missing" };
    }
    const response = await post(
      GOOGLE_REVOKE_URL,
      new URLSearchParams({ token: target.revocationToken }),
      {},
    );
    if (response.ok) return { outcome: "unlinked" };
    const body = await readJson(response);
    if (response.status === 400 && body.error === "invalid_token") {
      return { outcome: "already-unlinked" };
    }
    return transientOrRejected("google", response.status);
  }

  return async (target) => {
    try {
      return await (target.provider === "kakao" ? kakao(target) : google(target));
    } catch (error) {
      const name = error instanceof Error ? error.name : "unknown";
      return {
        outcome: "retry",
        reason:
          name === "TimeoutError" ? `${target.provider}-timeout` : `${target.provider}-network`,
      };
    }
  };
}
