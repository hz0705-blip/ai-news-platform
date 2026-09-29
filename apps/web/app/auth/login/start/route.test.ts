import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route.ts";

describe("로그인 시작", () => {
  it("평소 로그인은 남아 있는 계정 삭제 의도 쿠키를 지운다", async () => {
    const response = await GET(
      new NextRequest("http://web.test/auth/login/start?provider=kakao&next=%2F", {
        headers: { host: "web.test", cookie: "account-deletion-intent=u.k.sig" },
      }),
    );
    expect(response.status).toBe(303);
    const cleared = response.cookies.get("account-deletion-intent");
    expect(cleared?.value).toBe("");
    expect(cleared?.path).toBe("/auth");
  });
});
