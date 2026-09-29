import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type AdmitInput, kstDateOf } from "@newsplatform/db";

/**
 * 익명 유료 요청(번역·검색)의 카운터 키(#125, 스펙 "배치와 비용" 익명 요청 남용 방지).
 * - 쿠키: 서명된 무작위 식별자 `<id>.<서명>`(`__Host-`, Secure·HttpOnly·SameSite=Lax, 24시간). 비용이 드는 요청 때만 발급하고
 *   계정과 연결하지 않는다. 서명이 맞지 않으면 새로 발급한다.
 * - IP: Vercel이 넣는 `x-vercel-forwarded-for`의 첫 값만 믿는다(없으면 한 버킷 `unknown` — 로컬). 날짜(KST)마다 파생한
 *   키로 HMAC하므로 비밀은 매일 바뀐다.
 * 카운터 키에는 HMAC만 들어가고, 원시 쿠키·IP는 DB·로그 어디에도 남지 않는다. 비밀은 `ANON_REQUEST_SECRET` 하나에서
 * 용도별로 파생한다(쿠키 서명·쿠키 카운터 키·날짜별 IP 키).
 */
export const ANON_COOKIE = "__Host-anon-id";
export const ANON_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

/** 검색 한도(스펙 "개발 중 결정 항목" 익명 요청 한도 숫자). */
export const SEARCH_LIMITS = {
  cookiePerMinute: 10,
  cookiePerDay: 100,
  cookieConcurrent: 2,
  ipPerMinute: 60,
  ipPerDay: 5000,
} as const;
/** 검색 일일 예산(USD, 스펙 "개발 중 결정 항목" 토큰 계량: 번역·검색 합계 $0.20 중 검색 몫). */
export const SEARCH_DAILY_BUDGET_USD = 0.1;
/** 동시 한도 행의 수명. 죽은 요청의 행은 이 시간이 지나면 세지 않는다. */
export const SEARCH_LEASE_MS = 30_000;

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sign(secret: string, id: string): string {
  return hmac(hmac(secret, "anon-cookie-sign"), id).toString("base64url");
}

/** 쿠키 값이 우리가 서명한 것이면 식별자, 아니면 null. */
export function verifyAnonCookie(secret: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  const [id, signature, ...rest] = value.split(".");
  if (id === undefined || signature === undefined || rest.length > 0 || id === "") return null;
  const expected = Buffer.from(sign(secret, id));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** 새 쿠키: 무작위 16바이트 식별자와 서명. */
export function issueAnonCookie(secret: string): { readonly id: string; readonly value: string } {
  const id = randomBytes(16).toString("base64url");
  return { id, value: `${id}.${sign(secret, id)}` };
}

/** Vercel이 넣는 클라이언트 IP. 다른 헤더(`x-forwarded-for` 등)는 보지 않는다. */
export function clientIp(headers: Headers): string {
  return headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function counterKey(secret: string, purpose: string, value: string): string {
  return hmac(hmac(secret, purpose), value).toString("hex").slice(0, 32);
}

/** 검색 요청 하나의 입장 조건(쿠키·IP 카운터, 쿠키 동시 한도, 검색 일일 예산). */
export function searchAdmission(input: {
  readonly secret: string;
  readonly cookieId: string;
  readonly ip: string;
  readonly now: Date;
  readonly reserveUsd: number;
}): AdmitInput {
  const cookie = `search:cookie:${counterKey(input.secret, "anon-cookie-counter", input.cookieId)}`;
  const ip = `search:ip:${counterKey(input.secret, `anon-ip:${kstDateOf(input.now)}`, input.ip)}`;
  return {
    now: input.now,
    counters: [
      {
        key: cookie,
        limits: [
          { window: "minute", max: SEARCH_LIMITS.cookiePerMinute },
          { window: "day", max: SEARCH_LIMITS.cookiePerDay },
        ],
      },
      {
        key: ip,
        limits: [
          { window: "minute", max: SEARCH_LIMITS.ipPerMinute },
          { window: "day", max: SEARCH_LIMITS.ipPerDay },
        ],
      },
    ],
    concurrency: { key: cookie, max: SEARCH_LIMITS.cookieConcurrent, leaseMs: SEARCH_LEASE_MS },
    budget: { kind: "search", capUsd: SEARCH_DAILY_BUDGET_USD, reserveUsd: input.reserveUsd },
  };
}
