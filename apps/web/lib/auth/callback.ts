import type { AccountDeletionStatus, DeletionIdentity } from "@newsplatform/db";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import {
  DELETION_INTENT_COOKIE,
  decodeIntent,
  deletionIdentities,
  expireSessionCookies,
  setStatusCookie,
} from "../account/deletion.ts";
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

/**
 * 인증 콜백: 인가 코드를 세션으로 바꾸고(`exchangeCodeForSession`) 검증된 돌아갈 주소로 보낸다.
 * - 재가입 차단(스펙 "계정"): 삭제 대기 중인 제공자 계정의 로그인이면 세션을 곧바로 끝내고 쿠키를 싣지 않은 채 로그인 화면의
 *   안내로 보낸다.
 * - 계정 삭제의 재로그인(삭제 의도 쿠키): 다시 로그인한 사용자가 의도의 사용자와 같을 때만 삭제하고, 세션 쿠키를 지운 뒤
 *   결과 화면(`/account/deleted`)으로 보낸다. 다른 계정이면 삭제하지 않고 로그아웃한다.
 */
export async function handleAuthCallback(
  request: NextRequest,
  deps: CallbackDeps,
): Promise<NextResponse> {
  const next = safeReturnPath(request.cookies.get(RETURN_COOKIE)?.value);
  const intent = decodeIntent(
    request.cookies.get(DELETION_INTENT_COOKIE)?.value,
    deps.intentSecret,
  );
  const code = request.nextUrl.searchParams.get("code");
  const { client } = deps;

  let target: URL;
  let endSession = false;
  let statusKey: string | null = null;
  if (client === null) target = loginPageUrl(request, next, "unavailable");
  else if (code === null) {
    target =
      intent === null ? loginPageUrl(request, next, "failed") : accountUrl(request, "failed");
  } else {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error !== null) {
      target =
        intent === null ? loginPageUrl(request, next, "failed") : accountUrl(request, "failed");
    } else if (intent !== null) {
      if (data.user.id !== intent.userId) {
        await client.auth.signOut({ scope: "local" });
        endSession = true;
        target = accountUrl(request, "mismatch");
      } else {
        const identities = deletionIdentities(data.user, {
          providerToken: data.session.provider_token ?? null,
          providerRefreshToken: data.session.provider_refresh_token ?? null,
        });
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
  if (endSession) expireSessionCookies(request, response);
  if (statusKey !== null) setStatusCookie(request, response, statusKey);
  return response;
}
