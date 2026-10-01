import { publishedStoryExists } from "@newstrail/db";
import { type NextRequest, NextResponse } from "next/server";
import { routeAuthClient } from "./lib/auth/route.ts";
import { getRuntimeDb } from "./lib/db.ts";

/**
 * 사건 URL·개정판 고정 URL이 가리키는 공개 사건이 있는지 응답 전에 확인한다(소프트 404 제거).
 * Cache Components는 동적 라우트의 정적 셸을 HTTP 200으로 먼저 흘리므로 페이지의 `notFound()`로는
 * 404 상태를 낼 수 없고, proxy에서는 `"use cache"` 함수를 부를 수 없어 가벼운 질의 하나로 확인한다.
 * 세그먼트는 페이지와 같게 다룬다 — slug는 받은 그대로, 개정판 id는 한 번 디코딩한다.
 * 다른 모양의 `/story/*` 경로와 질의 실패는 페이지에 맡긴다(캐시된 페이지는 DB 장애에도 그대로 보인다).
 */
async function storyExists(rawPathname: string): Promise<boolean> {
  const match = /^\/story\/([^/]+)(?:\/revision\/([^/]+))?\/?$/.exec(rawPathname);
  if (match?.[1] === undefined) return true;
  const rawRevisionId = match[2];
  return publishedStoryExists(getRuntimeDb().db, {
    slug: match[1],
    ...(rawRevisionId === undefined ? {} : { revisionId: decodeURIComponent(rawRevisionId) }),
  }).catch(() => true);
}

/**
 * 세션 갱신(스펙 "계정"): 인증·개인 경로(`/auth/*`, 팔로우 화면 `/follows`, 계정 화면 `/account/*`)에서만 토큰을 확인·갱신하고
 * 갱신된 쿠키를 요청과 응답에 싣는다.
 * 사건·공유 이미지 경로는 인코딩만 검증하고 세션을 읽지 않는다 — 공개 응답에 `Set-Cookie`·사용자 상태가 생기지 않는다.
 * 여기서의 확인은 인가가 아니다. 각 Route Handler·Server Action이 lib/auth의 헬퍼로 직접 검증한다.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(request.nextUrl.pathname);
    // OG Route Handler는 한 번 디코딩한다. %25처럼 유효한 인코딩은 기존 안전 카드 처리를 따른다.
    if (pathname === "/og" || pathname.startsWith("/og/")) return NextResponse.next();
    // 페이지는 정규화 뒤 동적 매개변수 매칭에서 다시 디코딩한다. DecodeError는 error.tsx에 닿지 않는다.
    decodeURIComponent(pathname);
  } catch {
    if (request.nextUrl.pathname.startsWith("/og/")) {
      // invalid.png는 카드 식별자가 아니므로 기존 OG Route Handler가 DB 조회 없이 5분 캐시의 안전 PNG를 만든다.
      return NextResponse.rewrite(new URL("/og/story/invalid/invalid/invalid.png", request.url));
    }
    return new NextResponse(
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>주소를 확인해 주세요 — Newstrail</title></head><body><main><h1>주소를 확인해 주세요</h1><p>잘못된 주소입니다. 링크를 확인하거나 오늘의 사건 목록에서 다시 찾아보세요.</p><a href="/">오늘의 사건으로</a></main></body></html>',
      {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }
  if (pathname === "/story" || pathname.startsWith("/story/")) {
    if (await storyExists(request.nextUrl.pathname)) return NextResponse.next();
    // 어느 페이지에도 맞지 않는 내부 경로로 옮겨 루트 not-found 화면(noindex)을 404 상태로 그린다.
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }

  const { client, respond } = routeAuthClient(request);
  if (client !== null) await client.auth.getClaims();
  return respond(NextResponse.next({ request }));
}

export const config = {
  matcher: ["/auth/:path*", "/follows", "/account/:path*", "/story/:path*", "/og/:path*"],
};
