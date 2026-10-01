import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResultStory } from "../../lib/search/api.ts";
import { SearchScreen } from "./search-screen.tsx";

const now = new Date("2026-09-30T03:00:00Z");
const live = (n: number, extra: Partial<SearchResultStory> = {}): SearchResultStory => ({
  slug: `live-${n}`,
  title: `라이브 사건 ${n}`,
  updatedAt: "2026-09-30T01:00:00.000Z",
  isDemo: false,
  lifecycle: "활성",
  claims: [
    { claimId: `c${n}-1`, text: `가까운 주장 ${n}-1` },
    { claimId: `c${n}-2`, text: `가까운 주장 ${n}-2` },
  ],
  ...extra,
});
const demo = live(9, {
  slug: "demo-1-agreement",
  title: "데모 합의 사건",
  isDemo: true,
  updatedAt: "2026-09-17T00:30:00.000Z",
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/search");
});
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const input = () => screen.getByRole("searchbox", { name: "검색어" });
function submit(query: string) {
  fireEvent.change(input(), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
}
const liveRegion = () => screen.getByRole("region", { name: "검색 결과" });
const findLive = () => screen.findByRole("region", { name: "검색 결과" });

describe("검색 화면", () => {
  it("결과 목록은 제목 링크·주장·상대 시각을 보인다", async () => {
    fetchMock.mockResolvedValue(json({ state: "ok", stories: [live(1)] }));
    render(<SearchScreen initialQuery="" now={now} />);
    submit("  태풍 피해  ");
    const link = within(await findLive()).getByRole("link", { name: "라이브 사건 1" });
    expect(link.getAttribute("href")).toBe("/story/live-1");
    const claims = within(liveRegion()).getByRole("list", { name: "가까운 주장" });
    expect(
      within(claims)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["가까운 주장 1-1", "가까운 주장 1-2"]);
    const time = within(liveRegion()).getByText("2시간 전");
    expect(time.getAttribute("datetime")).toBe("2026-09-30T01:00:00.000Z");
    expect(screen.getByText("검색 결과 사건 1건")).toBeDefined();
    // 질의는 앞뒤 공백을 지워 보내고 주소 `?q=`로 공유된다.
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/search");
    expect(JSON.parse(String(init?.body))).toEqual({ query: "태풍 피해" });
    expect(window.location.search).toBe(`?q=${encodeURIComponent("태풍 피해")}`);
  });

  it("공유된 ?q= 주소로 들어오면 바로 검색한다", async () => {
    fetchMock.mockResolvedValue(json({ state: "ok", stories: [live(1)] }));
    render(<SearchScreen initialQuery="태풍" now={now} />);
    expect(input()).toHaveProperty("value", "태풍");
    expect(await screen.findByRole("link", { name: "라이브 사건 1" })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("데모·라이브가 섞인 응답에서도 데모는 노출하지 않는다", async () => {
    fetchMock.mockResolvedValue(json({ state: "ok", stories: [live(1), demo, live(2)] }));
    render(<SearchScreen initialQuery="" now={now} />);
    submit("합의");
    await screen.findByRole("region", { name: "검색 결과" });
    expect(
      within(liveRegion())
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["라이브 사건 1", "라이브 사건 2"]);
    expect(within(liveRegion()).queryByText("데모 사건")).toBeNull();
    expect(screen.queryByRole("region", { name: "데모 사건 결과" })).toBeNull();
    expect(screen.queryByText("데모 합의 사건")).toBeNull();
    expect(screen.getByText("검색 결과 사건 2건")).toBeDefined();
  });

  it("결과 0건이면 오늘 링크를 보인다", async () => {
    fetchMock.mockResolvedValue(json({ state: "ok", stories: [] }));
    render(<SearchScreen initialQuery="" now={now} />);
    submit("없는 사건");
    expect(within(await findLive()).getByText("검색 결과가 없습니다")).toBeDefined();
    expect(
      within(liveRegion()).getByRole("link", { name: "오늘로 가기" }).getAttribute("href"),
    ).toBe("/");
  });

  it("429면 Retry-After를 사람이 읽는 문구로 보인다", async () => {
    fetchMock.mockResolvedValueOnce(json({ state: "rate-limited" }, 429, { "retry-after": "42" }));
    fetchMock.mockResolvedValueOnce(json({ state: "rate-limited" }, 429, { "retry-after": "90" }));
    render(<SearchScreen initialQuery="" now={now} />);
    submit("태풍");
    expect(await screen.findByText("검색 요청이 많습니다")).toBeDefined();
    expect(screen.getByText("42초 뒤에 다시 시도하세요.")).toBeDefined();
    submit("태풍");
    expect(await screen.findByText("2분 뒤에 다시 시도하세요.")).toBeDefined();
    expect(input()).toHaveProperty("value", "태풍");
  });

  it("503·오류면 입력값을 유지하고 재시도를 보인다", async () => {
    fetchMock.mockResolvedValueOnce(json({ state: "unavailable" }, 503));
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    fetchMock.mockResolvedValueOnce(json({ state: "ok", stories: [live(1)] }));
    render(<SearchScreen initialQuery="" now={now} />);
    submit("태풍 상륙");
    expect(await screen.findByText("검색하지 못했습니다")).toBeDefined();
    expect(input()).toHaveProperty("value", "태풍 상륙");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    // 네트워크 오류도 같은 실패 상태다.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("검색하지 못했습니다")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("link", { name: "라이브 사건 1" })).toBeDefined();
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(String(init?.body))).toEqual({ query: "태풍 상륙" });
    }
  });

  it("예산 소진이면 오늘 검색 한도 도달을 보인다", async () => {
    fetchMock.mockResolvedValue(json({ state: "search-limit" }, 429, { "retry-after": "3600" }));
    render(<SearchScreen initialQuery="" now={now} />);
    submit("태풍");
    expect(await screen.findByText("오늘 검색 한도 도달")).toBeDefined();
    expect(screen.queryByText("검색 요청이 많습니다")).toBeNull();
    expect(input()).toHaveProperty("value", "태풍");
  });

  it("빈 질의면 안내를 보인다", () => {
    render(<SearchScreen initialQuery="" now={now} />);
    expect(screen.getByText("찾고 싶은 사건을 한국어로 입력하세요.")).toBeDefined();
    submit("   ");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("찾고 싶은 사건을 한국어로 입력하세요.")).toBeDefined();
    expect(window.location.search).toBe("");
  });
});
