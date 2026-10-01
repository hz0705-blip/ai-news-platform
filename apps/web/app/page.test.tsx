import type { TodayStoryCard } from "@newstrail/db";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayScreen } from "../components/today/today-screen.tsx";

const now = new Date("2026-09-23T03:00:00Z");
const story = (n: number, extra: Partial<TodayStoryCard> = {}): TodayStoryCard => ({
  id: String(n),
  slug: `story-${n}`,
  title: `사건 제목 ${n}`,
  topics: ["기술·AI"],
  summary: `가능성을 포함한 첫 주장 전문 ${n}`,
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
  render(
    <TodayScreen
      live={{ stories, lastUpdated: stories[0]?.updatedAt ?? null }}
      demo={{ stories: [demo], lastUpdated: demo.updatedAt }}
      now={now}
    />,
  );
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("오늘", () => {
  it("서버는 절대 시각을 렌더하고 클라이언트에서 상대 시각을 조용히 갱신한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const props = {
      live: { stories: [story(1)], lastUpdated: story(1).updatedAt },
      demo: { stories: [], lastUpdated: null },
    };
    const server = renderToString(<TodayScreen {...props} />);
    expect(server).toContain("2026. 9. 23. 오전 11:30 KST");
    expect(server).not.toContain("30분 전");
    const { container } = render(<TodayScreen {...props} />);
    expect(screen.getByText("30분 전")).toBeDefined();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("31분 전")).toBeDefined();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
  it("데모 배열 전체를 별도 구획에 유지한다", () => {
    render(
      <TodayScreen
        live={{ stories: [], lastUpdated: null }}
        demo={{ stories: [demo, story(100, { isDemo: true })], lastUpdated: demo.updatedAt }}
        now={now}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "데모 사건" })).getAllByRole("article"),
    ).toHaveLength(2);
  });
  it("미발행 시각을 발명하지 않고 예정과 별도 데모를 보인다", () => {
    show();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("사건으로 읽는 해외 보도");
    expect(screen.getByText("마지막 갱신 — 아직 발행된 사건이 없습니다")).toBeDefined();
    expect(screen.getAllByText("매일 오전 6시·오후 6시 갱신 예정")).toHaveLength(2);
    expect(
      within(screen.getByRole("group", { name: "토픽" })).getAllByText("사건 0건"),
    ).toHaveLength(4);
    expect(screen.getByRole("link", { name: "데모 사건 보기" }).getAttribute("href")).toBe(
      "#demo-stories",
    );
    expect(
      within(screen.getByRole("region", { name: "최신 사건" })).queryByText("고정 데모"),
    ).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "데모 사건" })).getByText("고정 데모"),
    ).toBeDefined();
  });
  it("토픽 순서·수를 보이고 선택과 해제 및 0건 필터를 지원한다", () => {
    show([
      story(1, { topics: ["기술·AI", "한국 관련 해외 보도"] }),
      story(2, { topics: ["세계 경제·금융"] }),
      story(3),
    ]);
    const group = screen.getByRole("group", { name: "토픽" });
    const tiles = within(group).getAllByRole("button");
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      "한국 관련 해외 보도사건 1건",
      "국제 정치·외교·안보사건 0건",
      "세계 경제·금융사건 1건",
      "기술·AI사건 2건",
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
  it("실제 발행 사건만 집계하고 토픽 필터·더 보기와 무관하게 전체 집계를 유지한다", () => {
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
        demo={{ stories: [story(99, { isDemo: true, status: "보도 상충" })], lastUpdated: now }}
        now={now}
      />,
    );
    const overview = screen.getByRole("region", { name: "발행 사건 현황" });
    expect(overview.textContent).toContain("전체 발행 사건 10건");
    const terms = within(overview).getAllByRole("term");
    expect(terms.map((term) => [term.textContent, term.nextElementSibling?.textContent])).toEqual([
      ["보도 상충", "1건"],
      ["정정됨", "1건"],
    ]);
    const topics = screen.getByRole("region", { name: "토픽별 사건 분포" });
    expect(
      within(topics)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "한국 관련 해외 보도사건 0건",
      "국제 정치·외교·안보사건 0건",
      "세계 경제·금융사건 1건",
      "기술·AI사건 10건",
    ]);
    expect(topics.textContent).toContain("여러 토픽에 속한 사건은 각 토픽에 포함됩니다");
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
  it("주장 전문·상태·출처·상대 시각과 데모 고정 시각을 보존한다", () => {
    show([story(1)]);
    const latest = within(screen.getByRole("region", { name: "최신 사건" }));
    expect(latest.getByText("가능성을 포함한 첫 주장 전문 1")).toBeDefined();
    expect(latest.getByText("복수 출처 일치")).toBeDefined();
    expect(latest.getByText("출처 2개")).toBeDefined();
    expect(latest.getByText("30분 전").getAttribute("datetime")).toBe("2026-09-23T02:30:00.000Z");
    expect(latest.getByRole("link", { name: "사건 제목 1" }).getAttribute("href")).toBe(
      "/story/story-1",
    );
    const demos = within(screen.getByRole("region", { name: "데모 사건" }));
    expect(demos.getByText("기능 설명을 위해 만든 데모 사건입니다.")).toBeDefined();
    expect(demos.getByText("2026. 9. 17. 오전 9:30 KST").getAttribute("datetime")).toBe(
      "2026-09-17T00:30:00.000Z",
    );
    expect(demos.getByText(/데모 기준 시각/)).toBeDefined();
  });
});
