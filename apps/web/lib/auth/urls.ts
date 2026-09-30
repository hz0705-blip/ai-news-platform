import type { NextRequest } from "next/server";

/** 로그인 시작에서 콜백까지 돌아갈 주소를 들고 가는 쿠키(경로 `/auth`, 10분, HttpOnly). */
export const RETURN_COOKIE = "auth-return-path";

/** 로그인 화면 안내. `pending-deletion`은 삭제 대기 중인 제공자 계정의 재가입 차단이다. */
export type LoginError = "unavailable" | "failed" | "pending-deletion";

/**
 * 요청의 출처. `nextUrl.origin`은 서버가 듣는 이름(`localhost`)으로 바뀔 수 있어 브라우저가 보낸 Host를 쓴다 —
 * 콜백이 로그인 시작과 다른 호스트로 가면 state·nonce 쿠키가 따라오지 않는다.
 */
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  return `${request.nextUrl.protocol}//${host}`;
}

/** 로그인 화면 주소. `next`는 이미 검증된 경로다. */
export function loginPageUrl(request: NextRequest, next: string, error?: LoginError): URL {
  const url = new URL("/auth/login", requestOrigin(request));
  url.searchParams.set("next", next);
  if (error !== undefined) url.searchParams.set("error", error);
  return url;
}

/** 같은 출처 로그인 시작 경로(외부 브라우저에서도 이 경로로 인가를 새로 시작한다). */
export function loginStartPath(provider: "kakao" | "google", next: string): string {
  const params = new URLSearchParams({ provider, next });
  return `/auth/login/start?${params.toString()}`;
}
