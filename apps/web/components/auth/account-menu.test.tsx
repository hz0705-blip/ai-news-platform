import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu.tsx";

vi.mock("next/navigation", () => ({ usePathname: () => "/story/demo-1-agreement" }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const session = (userId: string | null) =>
  new Response(JSON.stringify({ userId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("계정 진입점", () => {
  it("세션의 userId가 null이면 로그인 버튼이 대화상자를 연다", async () => {
    fetchMock.mockResolvedValue(session(null));
    render(<AccountMenu />);
    const login = await screen.findByRole("button", { name: "로그인" });
    expect(login.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByRole("navigation", { name: "계정 메뉴" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/auth/session", { cache: "no-store" });
  });

  it("userId가 있으면 팔로우·계정 링크와 지금 페이지로 돌아오는 로그아웃을 보인다", async () => {
    fetchMock.mockResolvedValue(session("user-1"));
    render(<AccountMenu />);
    const nav = await screen.findByRole("navigation", { name: "계정 메뉴" });
    expect(within(nav).getByRole("link", { name: "팔로우" }).getAttribute("href")).toBe("/follows");
    expect(within(nav).getByRole("link", { name: "계정" }).getAttribute("href")).toBe("/account");
    const logout = within(nav).getByRole("button", { name: "로그아웃" });
    const form = logout.closest("form");
    expect(form?.getAttribute("action")).toBe("/auth/logout");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe(
      "/story/demo-1-agreement",
    );
    expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
  });

  it("세션 요청이 실패하면 로그아웃 상태로 보인다", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    render(<AccountMenu />);
    expect(await screen.findByRole("button", { name: "로그인" })).toBeTruthy();
  });

  it("세션 응답이 오류이거나 모양이 다르면 로그아웃 상태로 보인다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    render(<AccountMenu />);
    expect(await screen.findByRole("button", { name: "로그인" })).toBeTruthy();
    cleanup();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: 1 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    render(<AccountMenu />);
    expect(await screen.findByRole("button", { name: "로그인" })).toBeTruthy();
  });

  it("세션을 확인하기 전에는 진입점을 그리지 않는다", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<AccountMenu />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
