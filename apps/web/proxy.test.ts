import { NextRequest, type NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy.ts";

const { routeAuthClient, getClaims } = vi.hoisted(() => ({
  routeAuthClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("./lib/auth/route.ts", () => ({ routeAuthClient }));

beforeEach(() => {
  vi.clearAllMocks();
  routeAuthClient.mockReturnValue({
    client: { auth: { getClaims } },
    respond: (response: NextResponse) => response,
  });
});

describe("페이지 URL 검증과 개인 경로 세션 갱신", () => {
  it.each([
    "/story/%",
    "/story/%25",
    "/story/%E0%A4%A",
    "/story/%25E0%25A4%25A",
    "/story/missing/revision/%25",
  ])("깨진 경로 %s는 인증 조회 없이 한국어 400 안내를 반환한다", async (path) => {
    const response = await proxy(new NextRequest(`https://web.test${path}`));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toContain("주소를 확인해 주세요");
    expect(routeAuthClient).not.toHaveBeenCalled();
  });

  it.each([
    "/story/published-story",
    "/story/%ED%95%9C%EA%B8%80",
    "/story/missing?query=%",
    "/%73tory/published-story",
    "/story%2Fpublished-story",
    "/og/story/published-story/rev-1/ko-t3-f1.png",
    "/og/site/ko-t3-f1.png",
    "/og/story/%25/rev-1/ko-t3-f1.png",
    "/og/site/%25E0%25A4%25A",
    "/%6Fg/site/ko-t3-f1.png",
  ])("정상 공개 경로 %s는 세션·응답 캐시를 변경하지 않는다", async (path) => {
    const response = await proxy(new NextRequest(`https://web.test${path}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(routeAuthClient).not.toHaveBeenCalled();
  });

  it.each([
    "/og/story/%/rev-1/ko-t3-f1.png",
    "/og/story/published-story/%E0%A4%A/ko-t3-f1.png",
    "/og/story/published-story/rev-1/%",
    "/og/site/%",
    "/og/site/%E0%A4%A",
  ])("깨진 OG 경로 %s는 인증 조회 없이 안전 카드 경로로 바꾼다", async (path) => {
    const response = await proxy(new NextRequest(`https://web.test${path}`));
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://web.test/og/story/invalid/invalid/invalid.png",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBeNull();
    expect(routeAuthClient).not.toHaveBeenCalled();
  });

  it.each(["/auth/session", "/follows", "/account/delete"])(
    "개인 경로 %s에서는 기존 세션 갱신을 유지한다",
    async (path) => {
      const response = await proxy(new NextRequest(`https://web.test${path}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(getClaims).toHaveBeenCalledOnce();
    },
  );
});
