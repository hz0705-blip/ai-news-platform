import type { AccountDeletionStatus, DeletionIdentity } from "@newstrail/db";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import {
  DELETION_INTENT_COOKIE,
  decodeIntent,
  deletionIdentities,
  expireSessionCookies,
  setStatusCookie,
} from "../account/deletion.ts";
import { GOOGLE_NONCE_COOKIE, GOOGLE_STATE_COOKIE } from "./google.ts";
import { KAKAO_NONCE_COOKIE, KAKAO_STATE_COOKIE } from "./kakao.ts";
import { exchangeOidcCode, type OidcClient } from "./oidc.ts";
import { safeReturnPath } from "./return-path.ts";
import { loginPageUrl, RETURN_COOKIE, requestOrigin } from "./urls.ts";

export interface CallbackDeps {
  readonly client: SupabaseClient | null;
  readonly respond: <T extends NextResponse>(response: T) => T;
  /** 삭제 의도 쿠키의 서명 키(삭제 설정이 없으면 null — 삭제 의도는 무시된다). */
  readonly intentSecret: string | null;
  /** 이 사용자의 Kakao·Google 계정 중 삭제 대기 중인 것이 있는가. */
  readonly isRegistrationBlocked: (user: User) => Promise<boolean>;
  readonly runDeletion: (input: {
    readonly userId: string;
    readonly identities: readonly DeletionIdentity[];
    readonly requestKey: string;
  }) => Promise<AccountDeletionStatus>;
}

type AccountError = "failed" | "mismatch";

const accountUrl = (request: NextRequest, error: AccountError) =>
  new URL(`/account?error=${error}`, requestOrigin(request));

/** 제공자 로그인 결과와 연결 해제용 제공자 토큰. 실패(state 불일치·교환 실패)면 null. */
type SignIn = (client: SupabaseClient) => Promise<{
  user: User;
  session: Session;
  providerToken: string | null;
  providerRefreshToken: string | null;
} | null>;

/**
 * 제공자 콜백(Kakao `/auth/callback/kakao`, Google `/auth/callback/google` — lib/auth/oidc.ts): `state`를 확인하고 코드를
 * `id_token`으로 바꿔 `signInWithIdToken`으로 세션을 만든다. identity의 제공자 ID는 `id_token.sub`다(Kakao 회원번호 — 연결
 * 해제가 이 ID를 쓴다). Supabase는 제공자 토큰을 돌려주지 않으므로 토큰 교환에서 받은 access·refresh token을 Google 연결
 * 해제용으로 넘긴다. `oidc`가 null(제공자 변수 없음)이면 "지금은 로그인할 수 없습니다". 이후는 `finishSignIn`.
 */
export async function handleOidcCallback(
  request: NextRequest,
  deps: CallbackDeps & {
    readonly provider: "kakao" | "google";
    readonly oidc: OidcClient | null;
    readonly fetch: typeof fetch;
  },
): Promise<NextResponse> {
  const { oidc } = deps;
  if (oidc === null) return finishSignIn(request, { ...deps, client: null }, async () => null);
  return finishSignIn(request, deps, async (client) => {
    const token = await exchangeOidcCode(request, oidc, deps.fetch);
    if (token === null) return null;
    const { data, error } = await client.auth.signInWithIdToken({
      provider: deps.provider,
      token: token.idToken,
      nonce: token.nonce,
      ...(token.accessToken === undefined ? {} : { access_token: token.accessToken }),
    });
    if (error !== null) return null;
    return {
      ...data,
      providerToken: token.accessToken ?? null,
      providerRefreshToken: token.refreshToken ?? null,
    };
  });
}

/**
 * 제공자 콜백이 함께 쓰는 로그인 뒤 규칙: 검증된 돌아갈 주소로 보낸다.
 * - 재가입 차단(스펙 "계정"): 삭제 대기 중인 제공자 계정의 로그인이면 세션을 곧바로 끝내고 쿠키를 싣지 않은 채 로그인 화면의
 *   안내로 보낸다.
 * - 계정 삭제의 재로그인(삭제 의도 쿠키): 다시 로그인한 사용자가 의도의 사용자와 같을 때만 삭제하고, 세션 쿠키를 지운 뒤
 *   결과 화면(`/account/deleted`)으로 보낸다. 다른 계정이면 삭제하지 않고 로그아웃한다.
 * 로그인 시작 때 둔 쿠키(돌아갈 주소·삭제 의도·제공자 state·nonce)는 늘 지운다.
 */
async function finishSignIn(
  request: NextRequest,
  deps: CallbackDeps,
  signIn: SignIn,
): Promise<NextResponse> {
  const next = safeReturnPath(request.cookies.get(RETURN_COOKIE)?.value);
  const intent = decodeIntent(
    request.cookies.get(DELETION_INTENT_COOKIE)?.value,
    deps.intentSecret,
  );
  const { client } = deps;

  let target: URL;
  let endSession = false;
  let statusKey: string | null = null;
  if (client === null) target = loginPageUrl(request, next, "unavailable");
  else {
    const data = await signIn(client);
    if (data === null) {
      target =
        intent === null ? loginPageUrl(request, next, "failed") : accountUrl(request, "failed");
    } else if (intent !== null) {
      if (data.user.id !== intent.userId) {
        await client.auth.signOut({ scope: "local" });
        endSession = true;
        target = accountUrl(request, "mismatch");
      } else {
        const identities = deletionIdentities(data.user, data);
        const deleted =
          identities === null
            ? null
            : await deps
                .runDeletion({ userId: data.user.id, identities, requestKey: intent.requestKey })
                .catch(() => null);
        if (deleted === null) target = accountUrl(request, "failed");
        else {
          endSession = true;
          statusKey = intent.requestKey;
          target = new URL("/account/deleted", requestOrigin(request));
        }
      }
    } else if (await deps.isRegistrationBlocked(data.user).catch(() => true)) {
      await client.auth.signOut({ scope: "local" });
      endSession = true;
      target = loginPageUrl(request, next, "pending-deletion");
    } else {
      target = new URL(next, requestOrigin(request));
    }
  }

  const response = deps.respond(NextResponse.redirect(target, 303));
  response.cookies.delete({ name: RETURN_COOKIE, path: "/auth" });
  response.cookies.delete({ name: DELETION_INTENT_COOKIE, path: "/auth" });
  response.cookies.delete({ name: KAKAO_STATE_COOKIE, path: "/auth" });
  response.cookies.delete({ name: KAKAO_NONCE_COOKIE, path: "/auth" });
  response.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/auth" });
  response.cookies.delete({ name: GOOGLE_NONCE_COOKIE, path: "/auth" });
  if (endSession) expireSessionCookies(request, response);
  if (statusKey !== null) setStatusCookie(request, response, statusKey);
  return response;
}
