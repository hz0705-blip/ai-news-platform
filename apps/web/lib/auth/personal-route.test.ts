import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { personalPost } from "./personal-route.ts";

// Supabase 환경변수가 없는 단위 테스트에서는 인증 클라이언트가 없고 현재 사용자는 늘 익명이다.
const schema = z.object({ slug: z.string() });

function post(body: unknown, origin: string | null): NextRequest {
  return new NextRequest("http://web.test/api/me/story-visit", {
    method: "POST",
    headers: {
      host: "web.test",
      "content-type": "application/json",
      ...(origin === null ? {} : { origin }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("personalPost — 개인 쓰기 Route Handler", () => {
  it.each([
    ["다른 출처", "https://evil.test"],
    ["Origin 없음", null],
  ])("%s의 요청은 403이고 아무것도 하지 않는다", async (_, origin) => {
    const run = vi.fn();
    const response = await personalPost(post({ slug: "s" }, origin), schema, run);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(run).not.toHaveBeenCalled();
  });

  it("본문이 스키마에 맞지 않으면 400이다", async () => {
    const run = vi.fn();
    const response = await personalPost(post("{not json", "http://web.test"), schema, run);
    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("익명이면 쓰지 않고 signedIn: false를 private, no-store로 돌려준다", async () => {
    const run = vi.fn();
    const response = await personalPost(post({ slug: "s" }, "http://web.test"), schema, run);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedIn: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(run).not.toHaveBeenCalled();
  });
});
