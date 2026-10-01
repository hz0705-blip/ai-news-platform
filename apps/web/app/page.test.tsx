import type { TodayStoryCard } from "@newstrail/db";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../components/site-header.tsx";
import { TodayScreen } from "../components/today/today-screen.tsx";

const now = new Date("2026-09-23T03:00:00Z");
const story = (n: number, extra: Partial<TodayStoryCard> = {}): TodayStoryCard => ({
  id: String(n),
  slug: `story-${n}`,
  title: `사건 제목 ${n}`,
  topics: ["기술·AI"],
  summary: `가능성을 포함한 첫 주장 전문 ${n}`,
  claims: [`가능성을 포함한 첫 주장 전문 ${n}`],
  status: "복수 출처 일치",
  sourceCount: 2,
  updatedAt: new Date("2026-09-23T02:30:00Z"),
  isDemo: false,
  image: null,
  ...extra,
});
const demo = story(99, {
  isDemo: true,
  title: "고정 데모",
  updatedAt: new Date("2026-09-17T00:30:00Z"),
});
const show = (stories: TodayStoryCard[] = []) =>
  render(<TodayScreen live={{ stories, lastUpdated: stories[0]?.updatedAt ?? null }} now={now} />);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("오늘", () => {
  it("대표 사건·두 번째 위계·목록에서도 사건 링크와 상태를 읽을 수 있다", () => {
    show(Array.from({ length: 5 }, (_, n) => story(n + 1)));
    const latest = within(screen.getByRole("region", { name: "최신 사건" }));
    expect(latest.getAllByRole("link").map((link) => link.textContent)).toEqual(
      Array.from({ length: 5 }, (_, n) => `사건 제목 ${n + 1}`),
    );
    expect(latest.getAllByText("복수 출처 일치")).toHaveLength(5);
    expect(latest.getByText("가능성을 포함한 첫 주장 전문 1")).toBeDefined();
  });
  it("서버는 절대 시각을 렌더하고 클라이언트에서 상대 시각을 조용히 갱신한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const props = {
      live: { stories: [story(1)], lastUpdated: story(1).updatedAt },
    };
    const server = renderToString(<TodayScreen {...props} />);
    expect(server).toContain("2026. 9. 23. 오전 11:30 KST");
    expect(server).not.toContain("30분 전");
    const { container } = render(<TodayScreen {...props} />);
    expect(screen.getAllByText("30분 전")[0]).toBeDefined();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getAllByText("31분 전")[0]).toBeDefined();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
  it("가상 사건을 제외하고 여러 출처의 최신 사건 최대 4개를 보인다", () => {
    show([demo, ...Array.from({ length: 6 }, (_, n) => story(n)), story(8, { sourceCount: 1 })]);
    expect(screen.queryByText("고정 데모")).toBeNull();
    const multi = within(screen.getByRole("region", { name: "여러 출처로 읽는 사건" }));
    expect(multi.getAllByRole("article")).toHaveLength(4);
    expect(multi.getAllByRole("link").map((link) => link.textContent)).toEqual(
      Array.from({ length: 4 }, (_, n) => `사건 제목 ${n}`),
    );
  });
  it("미발행 시각이나 대체 기사를 발명하지 않고 검색 진입점을 보인다", () => {
    show();
    expect(screen.getByText("마지막 갱신 — 아직 발행된 사건이 없습니다")).toBeDefined();
    expect(screen.queryByRole("region", { name: "여러 출처로 읽는 사건" })).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "최신 사건" }))
        .getByRole("link", { name: "사건 검색" })
        .getAttribute("href"),
    ).toBe("/search");
  });
  it("토픽 순서·수를 보이고 선택과 해제 및 0건 필터를 지원한다", () => {
    show([
      story(1, { topics: ["기술·AI", "한국 관련 해외 보도"] }),
      story(2, { topics: ["세계 경제·금융"] }),
      story(3),
    ]);
    const group = screen.getByRole("group", { name: "토픽" });
    const tiles = within(group).getAllByRole("button");
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "한국 관련 해외 보도 사건 1건",
      "국제 정치·외교·안보 사건 0건",
      "세계 경제·금융 사건 1건",
      "기술·AI 사건 2건",
    ]);
    const latest = within(screen.getByRole("region", { name: "최신 사건" }));
    const economy = within(group).getByRole("button", { name: /^세계 경제·금융/ });
    const politics = within(group).getByRole("button", { name: /^국제 정치·외교·안보/ });
    fireEvent.click(economy);
    expect(economy.getAttribute("aria-pressed")).toBe("true");
    expect(latest.getAllByRole("article")).toHaveLength(1);
    expect(latest.getByRole("link", { name: "사건 제목 2" })).toBeDefined();
    fireEvent.click(economy);
    expect(economy.getAttribute("aria-pressed")).toBe("false");
    expect(latest.getAllByRole("article")).toHaveLength(3);
    fireEvent.click(politics);
    expect(latest.getByText("아직 발행된 사건이 없습니다")).toBeDefined();
    fireEvent.click(politics);
    expect(latest.getAllByRole("article")).toHaveLength(3);
  });
  it("보도가 달라진 사건은 데모와 섞지 않고 필터와 무관하게 이어 읽을 수 있다", () => {
    render(
      <TodayScreen
        live={{
          stories: [
            story(1, { status: "보도 상충", topics: ["기술·AI", "세계 경제·금융"] }),
            story(2, { status: "정정됨" }),
            ...Array.from({ length: 8 }, (_, n) => story(n + 3)),
          ],
          lastUpdated: now,
        }}
        now={now}
      />,
    );
    const overview = screen.getByRole("region", { name: "상충·정정 살펴보기" });
    expect(
      within(overview)
        .getAllByRole("link", { name: /^사건 제목/ })
        .map((link) => link.textContent),
    ).toEqual(["사건 제목 1", "사건 제목 2"]);
    expect(within(overview).queryByText("사건 제목 99")).toBeNull();
    const before = overview.textContent;
    fireEvent.click(screen.getByRole("button", { name: /^세계 경제·금융/ }));
    expect(overview.textContent).toBe(before);
    expect(
      within(screen.getByRole("region", { name: "최신 사건" })).getAllByRole("article"),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^전체 사건/ }));
    expect(
      within(screen.getByRole("region", { name: "최신 사건" })).getAllByRole("article"),
    ).toHaveLength(8);
  });
  it("홈 검색은 실제 검색 화면의 q로 보내고 팔로우·소개 진입점을 유지한다", () => {
    render(<SiteHeader />);
    show([story(1)]);
    const form = screen.getByRole("form", { name: "사건 검색" });
    expect(form.getAttribute("action")).toBe("/search");
    expect(form.getAttribute("method")).toBe("get");
    const input = within(form).getByRole("searchbox", { name: "검색어" });
    expect(input.getAttribute("name")).toBe("q");
    expect(screen.getByRole("link", { name: "팔로우한 사건 보기" }).getAttribute("href")).toBe(
      "/follows",
    );
    expect(screen.getByRole("link", { name: "사건 검색" }).getAttribute("href")).toBe("/search");
  });
  it("8개씩 늘리고 마지막 더 보기에서 새 사건 링크로 포커스를 옮긴다", () => {
    show(Array.from({ length: 18 }, (_, n) => story(n)));
    const latest = within(screen.getByRole("region", { name: "최신 사건" }));
    expect(latest.getAllByRole("article")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(latest.getAllByRole("article")).toHaveLength(16);
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(latest.getAllByRole("article")).toHaveLength(18);
    expect(document.activeElement).toBe(latest.getByRole("link", { name: "사건 제목 16" }));
    fireEvent.click(screen.getByRole("button", { name: /^기술·AI/ }));
    expect(latest.getAllByRole("article")).toHaveLength(8);
  });
  it("첫 사건 요약은 앞 주장 최대 3개를 한 문단으로 보이고 다른 카드와 바뀐 첫 사건도 같은 규칙을 따른다", () => {
    show([
      story(1, {
        topics: ["기술·AI"],
        summary: "첫 주장 1.",
        claims: ["첫 주장 1.", "둘째 주장 1.", "셋째 주장 1."],
      }),
      story(2, {
        topics: ["세계 경제·금융"],
        summary: "첫 주장 2.",
        claims: ["첫 주장 2.", "둘째 주장 2."],
      }),
    ]);
    const latest = within(screen.getByRole("region", { name: "최신 사건" }));
    expect(latest.getByText("첫 주장 1. 둘째 주장 1. 셋째 주장 1.").tagName).toBe("P");
    expect(latest.getByText("첫 주장 2.")).toBeDefined();
    expect(latest.queryByText("둘째 주장 2.", { exact: false })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^세계 경제·금융/ }));
    expect(latest.getByText("첫 주장 2. 둘째 주장 2.")).toBeDefined();
    cleanup();
    // 앞 주장이 비면 첫 주장 한 문장(summary)으로 돌아간다.
    show([story(3, { claims: [] })]);
    expect(
      within(screen.getByRole("region", { name: "최신 사건" })).getByText(
        "가능성을 포함한 첫 주장 전문 3",
      ),
    ).toBeDefined();
  });
  it("주장 전문·상태·출처·상대 시각과 데모 고정 시각을 보존한다", () => {
    show([story(1)]);
    const latest = within(screen.getByRole("region", { name: "최신 사건" }));
    expect(latest.getByText("가능성을 포함한 첫 주장 전문 1")).toBeDefined();
    expect(latest.getByText("복수 출처 일치")).toBeDefined();
    expect(latest.getByText("출처 2곳")).toBeDefined();
    expect(latest.getByText("30분 전").getAttribute("datetime")).toBe("2026-09-23T02:30:00.000Z");
    expect(latest.getByRole("link", { name: "사건 제목 1" }).getAttribute("href")).toBe(
      "/story/story-1",
    );
    expect(screen.queryByText("데모 기준 시각")).toBeNull();
  });
});
