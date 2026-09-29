import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type AccountDeletionStatus,
  type DeletionIdentity,
  deleteAccount,
  hasPendingDeletion,
} from "@newsplatform/db";
import { isUnlinkProvider, type UnlinkProvider } from "@newsplatform/domain";
import { createProviderUnlinker } from "@newsplatform/pipeline/provider-unlink";
import type { JwtPayload, User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { getRuntimeDb } from "../db.ts";
import { createAdminClient, type DeletionEnv, deleteAuthUser } from "./admin.ts";

/**
 * 계정 삭제 흐름(스펙 "계정" 계정 삭제, #106): 계정 화면 확인 → 재로그인 → 인증 콜백에서 삭제.
 * - 재로그인 방식: Kakao·Google 계정은 삭제 직전에 그 제공자로 다시 로그인한다(Google은 이때 해제용 토큰을 받는다).
 *   제공자 연결이 없는 사용자(로컬·E2E의 이메일 사용자)는 로그인한 지 10분 안이면(JWT `amr` 시각) 재로그인으로 본다.
 * - 삭제 의도는 서명한 HttpOnly 쿠키(경로 `/auth`, 10분)로 콜백에 전한다: 삭제 전 사용자 ID와 멱등 키. 콜백은 다시 로그인한
 *   사용자가 그 ID와 같을 때만 삭제한다 — 클라이언트가 보낸 사용자 ID는 받지 않는다.
 * - 결과 화면은 멱등 키 쿠키(경로 `/account`)로 대기 행을 보고 "처리 중"·"완료"를 가린다.
 */
export const DELETION_INTENT_COOKIE = "account-deletion-intent";
export const DELETION_STATUS_COOKIE = "account-deletion-key";
const INTENT_MAX_AGE_S = 600;
/** 결과 화면이 처리 중·완료를 보일 수 있는 기간(연결 해제 기한 72시간 + 여유). */
const STATUS_MAX_AGE_S = 4 * 24 * 60 * 60;
/** 제공자 연결이 없는 사용자의 "방금 로그인" 판정. */
export const RECENT_SIGN_IN_S = 600;

/** 사용자가 가진 Kakao·Google 연결(제공자 ID는 Supabase identity의 `id`). */
export function providerIdentities(
  user: User,
): { provider: UnlinkProvider; providerSubject: string }[] {
  return (user.identities ?? []).flatMap((identity) =>
    isUnlinkProvider(identity.provider)
      ? [{ provider: identity.provider, providerSubject: identity.id }]
      : [],
  );
}

/** 재로그인할 제공자. Google이 있으면 Google(해제용 토큰이 필요하다), 없으면 Kakao, 둘 다 없으면 null. */
export function reauthProvider(user: User): UnlinkProvider | null {
  const providers = providerIdentities(user).map((identity) => identity.provider);
  if (providers.includes("google")) return "google";
  return providers.includes("kakao") ? "kakao" : null;
}

/** Kakao 연결이 있는데 관리자 키가 없으면 삭제를 시작하지 않는다(연결 해제를 끝낼 수 없다). */
export function canDeleteWith(env: DeletionEnv | null, user: User): env is DeletionEnv {
  if (env === null) return false;
  return (
    env.kakaoAdminKey !== null || !providerIdentities(user).some((i) => i.provider === "kakao")
  );
}

/** 방금 로그인했는가(JWT `amr` 인증 시각이 10분 안). */
export function signedInRecently(claims: JwtPayload, now: Date): boolean {
  const times = (claims.amr ?? []).flatMap((entry) =>
    typeof entry === "object" && typeof entry.timestamp === "number" ? [entry.timestamp] : [],
  );
  if (times.length === 0) return false;
  return now.getTime() / 1000 - Math.max(...times) <= RECENT_SIGN_IN_S;
}

/**
 * 삭제할 제공자 계정과 해제용 토큰. Google은 재로그인에서 받은 토큰(갱신 토큰 우선 — 폐기하면 연결이 풀리고, 접근 토큰보다
 * 오래 산다)이 없으면 null(삭제하지 않는다).
 */
export function deletionIdentities(
  user: User,
  tokens: { providerToken?: string | null; providerRefreshToken?: string | null },
): DeletionIdentity[] | null {
  const identities: DeletionIdentity[] = [];
  for (const identity of providerIdentities(user)) {
    if (identity.provider === "kakao") {
      identities.push({ ...identity, revocationToken: null });
      continue;
    }
    const token = tokens.providerRefreshToken || tokens.providerToken;
    if (!token) return null;
    identities.push({ ...identity, revocationToken: token });
  }
  return identities;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`account-deletion:${payload}`).digest("base64url");
}

export interface DeletionIntent {
  readonly userId: string;
  readonly requestKey: string;
}

export function encodeIntent(intent: DeletionIntent, secret: string): string {
  const payload = `${intent.userId}.${intent.requestKey}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeIntent(
  value: string | undefined,
  secret: string | null,
): DeletionIntent | null {
  if (value === undefined || secret === null) return null;
  const [userId, requestKey, signature, ...rest] = value.split(".");
  if (!userId || !requestKey || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(`${userId}.${requestKey}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { userId, requestKey };
}

export function setIntentCookie(
  request: NextRequest,
  response: NextResponse,
  intent: DeletionIntent,
  secret: string,
): void {
  response.cookies.set(DELETION_INTENT_COOKIE, encodeIntent(intent, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/auth",
    maxAge: INTENT_MAX_AGE_S,
  });
}

export function setStatusCookie(
  request: NextRequest,
  response: NextResponse,
  requestKey: string,
): void {
  response.cookies.set(DELETION_STATUS_COOKIE, requestKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/account",
    maxAge: STATUS_MAX_AGE_S,
  });
}

/** 삭제된(또는 막힌) 사용자의 Supabase 세션 쿠키를 응답에서 모두 만료시킨다. `respond` 뒤에 부른다. */
export function expireSessionCookies(request: NextRequest, response: NextResponse): void {
  const names = new Set(
    [...request.cookies.getAll(), ...response.cookies.getAll()]
      .map((cookie) => cookie.name)
      .filter((name) => name.startsWith("sb-")),
  );
  for (const name of names) response.cookies.set(name, "", { path: "/", maxAge: 0 });
}

/** 삭제를 실행한다(packages/db `deleteAccount`에 Supabase 관리자 API·제공자 HTTP를 붙인다). */
export async function runAccountDeletion(
  env: DeletionEnv,
  input: {
    readonly userId: string;
    readonly identities: readonly DeletionIdentity[];
    readonly requestKey: string;
  },
): Promise<AccountDeletionStatus> {
  const admin = createAdminClient(env).auth.admin;
  const unlink = createProviderUnlinker({
    fetch,
    kakaoAdminKey: env.kakaoAdminKey ?? undefined,
  });
  return deleteAccount(
    getRuntimeDb().db,
    { ...input, now: new Date() },
    { deleteAuthUser: (userId) => deleteAuthUser(admin, userId), unlink },
  );
}

/** 이 사용자의 Kakao·Google 계정 중 삭제 대기 중인 것이 있는가(재가입 차단). */
export async function isRegistrationBlocked(user: User): Promise<boolean> {
  const identities = providerIdentities(user);
  if (identities.length === 0) return false;
  return hasPendingDeletion(getRuntimeDb().db, identities);
}
