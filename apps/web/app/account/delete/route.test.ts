import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route.ts";

// Supabase 환경변수가 없는 단위 테스트에서는 현재 사용자가 늘 익명이다.
function post(fields: Record<string, string>, origin: string | null): NextRequest {
  return new NextRequest("http://web.test/account/delete", {
    method: "POST",
    headers: {
      host: "web.test",
      "content-type": "application/x-www-form-urlencoded",
      ...(origin === null ? {} : { origin }),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("계정 삭제 시작", () => {
  it("다른 출처의 요청은 403이다", async () => {
    const response = await POST(post({ confirm: "yes" }, "https://evil.test"));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("클라이언트가 보낸 사용자 ID는 거부한다(대상은 서버가 정한다)", async () => {
    const response = await POST(
      post({ confirm: "yes", user_id: "00000000-0000-4000-8000-00000000000b" }, "http://web.test"),
    );
    expect(response.status).toBe(400);
  });

  it("익명이면 삭제하지 않고 계정 화면으로 돌아오는 로그인으로 보낸다", async () => {
    const response = await POST(post({ confirm: "yes" }, "http://web.test"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://web.test/auth/login?next=%2Faccount");
  });
});
