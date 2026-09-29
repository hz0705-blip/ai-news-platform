import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { routeAuthClient } from "./route.ts";
import { verifiedUserId } from "./session.ts";
import { requestOrigin } from "./urls.ts";

/**
 * 개인 쓰기 Route Handler의 공통 절차(스펙 "계정"): 같은 출처 요청만 받고(`Origin` = 요청 출처, 교차 출처 위조 방지),
 * 본문을 zod로 검증한 뒤, 현재 사용자 헬퍼로 인증을 직접 검증해 그 사용자 ID만 `run`에 넘긴다. 익명이면 아무것도 쓰지 않고
 * `{ signedIn: false }`. 응답은 모두 `Cache-Control: private, no-store`이고 세션 갱신 쿠키가 있으면 싣는다(lib/auth/route.ts).
 */
export async function personalPost<Input, Output extends object>(
  request: NextRequest,
  schema: z.ZodType<Input>,
  run: (userId: string, input: Input) => Promise<Output>,
): Promise<NextResponse> {
  const { client, respond } = routeAuthClient(request);
  if (request.headers.get("origin") !== requestOrigin(request)) {
    return respond(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  }
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return respond(NextResponse.json({ error: "invalid" }, { status: 400 }));
  const userId = await verifiedUserId(client);
  if (userId === null) return respond(NextResponse.json({ signedIn: false }));
  return respond(NextResponse.json({ signedIn: true, ...(await run(userId, parsed.data)) }));
}
