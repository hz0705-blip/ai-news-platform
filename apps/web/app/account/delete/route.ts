import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { deletionEnv } from "../../../lib/account/admin.ts";
import {
  canDeleteWith,
  expireSessionCookies,
  reauthProvider,
  runAccountDeletion,
  setIntentCookie,
  setStatusCookie,
  signedInRecently,
} from "../../../lib/account/deletion.ts";
import { googleAuthorizeRedirect, googleEnv } from "../../../lib/auth/google.ts";
import { kakaoAuthorizeRedirect, kakaoEnv } from "../../../lib/auth/kakao.ts";
import { routeAuthClient } from "../../../lib/auth/route.ts";
import { verifiedSession } from "../../../lib/auth/session.ts";
import { requestOrigin } from "../../../lib/auth/urls.ts";

/** 폼이 보낼 수 있는 필드는 확인 하나뿐이다 — 사용자 ID 같은 다른 값이 오면 거부한다(대상은 서버가 정한다). */
const ALLOWED_FIELDS = new Set(["confirm"]);

/**
 * 계정 삭제 시작(POST 폼, 계정 화면). 같은 출처 요청만 받고, 현재 사용자 헬퍼로 대상을 정한다.
 * Kakao·Google 계정은 로그인과 같은 직접 OIDC 흐름으로 그 제공자 재로그인을 시작하고(Google은 해제용 토큰을 받도록
 * `access_type=offline`·`prompt=select_account consent` — lib/auth/google.ts, Kakao는 `prompt=login` — lib/auth/kakao.ts),
 * 삭제는 인증 콜백이 마친다(lib/auth/callback.ts). 제공자 연결이 없는 사용자는 방금 로그인했을 때만
 * 여기서 바로 삭제한다. 응답은 모두 `private, no-store`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { client, respond } = routeAuthClient(request);
  const origin = requestOrigin(request);
  const to = (path: string) => respond(NextResponse.redirect(new URL(path, origin), 303));
  if (request.headers.get("origin") !== origin) {
    return respond(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  }
  const form = await request.formData().catch(() => null);
  if (form === null || [...form.keys()].some((key) => !ALLOWED_FIELDS.has(key))) {
    return respond(NextResponse.json({ error: "invalid" }, { status: 400 }));
  }
  const session = await verifiedSession(client);
  if (session === null || client === null) return to("/auth/login?next=%2Faccount");
  if (form.get("confirm") !== "yes") return to("/account?error=confirm");
  const env = deletionEnv();
  const { user, claims } = session;
  if (!canDeleteWith(env, user)) return to("/account?error=unavailable");

  const requestKey = randomUUID();
  const provider = reauthProvider(user);
  if (provider === null) {
    if (!signedInRecently(claims, new Date())) return to("/account?error=reauth");
    const status = await runAccountDeletion(env, {
      userId: user.id,
      identities: [],
      requestKey,
    }).catch(() => null);
    if (status === null) return to("/account?error=failed");
    const response = to("/account/deleted");
    expireSessionCookies(request, response);
    setStatusCookie(request, response, requestKey);
    return response;
  }

  let redirect: NextResponse | null;
  if (provider === "kakao") {
    const kakao = kakaoEnv();
    redirect = kakao === null ? null : kakaoAuthorizeRedirect(request, kakao, { prompt: "login" });
  } else {
    const google = googleEnv();
    redirect = google === null ? null : googleAuthorizeRedirect(request, google, { reauth: true });
  }
  if (redirect === null) return to("/account?error=unavailable");
  const response = respond(redirect);
  setIntentCookie(request, response, { userId: user.id, requestKey }, env.secretKey);
  return response;
}
