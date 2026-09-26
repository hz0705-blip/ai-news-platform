/** @jsxImportSource react */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaimList } from "./claim-list.tsx";

// jsdom에는 matchMedia가 없다. 데스크톱(64rem 이상)으로 스텁하고, 리스너를 모아 폭 변화를 흉내 낸다.
let listeners: Array<() => void> = [];
const media = { matches: true };

beforeEach(() => {
  media.matches = true;
  listeners = [];
  const mql = {
    get matches() {
      return media.matches;
    },
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners = listeners.filter((l) => l !== listener);
    },
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => mql,
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", window.location.pathname);
  Reflect.deleteProperty(window, "matchMedia");
});

const row = (sourceName: string, url: string) => ({
  sourceName,
  isFictional: true,
  display: "발췌" as const,
  articleTitle: `${sourceName} title`,
  publishedAt: new Date("2026-09-16T22:00:00.000Z"),
  excerpt: "Ministers agreed on the framework.",
  highlight: { start: 10, end: 16 },
  sourceUrl: url,
});

const first = {
  id: "claim-a",
  order: 1,
  text: "세 나라 장관들이 가상 항만 협정의 틀에 합의했다고 두 출처가 독립적으로 보도했다.",
  status: "복수 출처 일치" as const,
  isComparison: false,
  evidence: [
    row("Meridian Wire", "https://meridian.invalid/a"),
    row("Harbor Ledger", "https://harbor.invalid/b"),
  ],
};
const second = {
  id: "claim-b",
  order: 2,
  text: "가상 항만의 선적이 모두 중단됐다.",
  status: "단일 출처" as const,
  isComparison: false,
  evidence: [row("Atlas Dispatch", "https://atlas.invalid/c")],
};
const claims = [first, second];

function renderStory() {
  return render(<ClaimList claims={claims} />);
}

const panel = (): HTMLElement => {
  const el = document.getElementById("evidence-panel");
  if (el === null) throw new Error("근거 패널이 없다");
  return el;
};
const triggers = (): [HTMLElement, HTMLElement] => {
  const [a, b] = screen.getAllByRole("button", { name: /근거 \d+개 보기/ });
  if (!a || !b) throw new Error("트리거가 둘이 아니다");
  return [a, b];
};
const inlineRegions = () => Array.from(document.querySelectorAll("[id$='-evidence']"));

describe("EvidencePanel (데스크톱)", () => {
  it("선택 전에는 패널에 안내문만 있고 인라인 근거 영역은 비어 있다", () => {
    renderStory();
    expect(within(panel()).getByRole("heading", { level: 2 }).textContent).toBe("근거");
    expect(within(panel()).getByText("주장의 근거 보기를 누르면 여기에 보입니다")).toBeTruthy();
    expect(within(panel()).queryAllByRole("listitem")).toHaveLength(0);
    expect(inlineRegions()).toHaveLength(2);
    for (const region of inlineRegions()) expect(region.childElementCount).toBe(0);
  });

  it("트리거를 활성화하면 그 주장의 근거가 패널에만 렌더되고 트리거는 aria-controls=evidence-panel, aria-expanded=true", () => {
    renderStory();
    const [a] = triggers();
    a.focus();
    fireEvent.click(a);
    expect(a.getAttribute("aria-controls")).toBe("evidence-panel");
    expect(a.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(first.evidence.length);
    for (const region of inlineRegions()) expect(region.childElementCount).toBe(0);
    expect(document.activeElement).toBe(a);
  });

  it("다른 주장을 활성화하면 패널이 바뀌고 이전 트리거는 aria-expanded=false, 선택됨 표시가 옮겨간다", () => {
    renderStory();
    const [a, b] = triggers();
    fireEvent.click(a);
    const [itemA, itemB] = screen
      .getAllByRole("listitem")
      .filter((li) => li.closest("aside") === null);
    if (!itemA || !itemB) throw new Error("주장 항목이 둘이 아니다");
    expect(within(itemA).queryByText("선택됨")).not.toBeNull();
    expect(itemA.className).toContain("border-s-2");
    fireEvent.click(b);
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(within(itemA).queryByText("선택됨")).toBeNull();
    expect(itemA.className).not.toContain("border-s-2");
    expect(within(itemB).queryByText("선택됨")).not.toBeNull();
    expect(itemB.className).toContain("border-s-2");
    expect(within(panel()).getByRole("heading", { level: 2 }).textContent).toBe("주장 2의 근거");
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(second.evidence.length);
  });

  it("같은 트리거를 다시 활성화하면 선택이 풀리고 패널은 안내문으로 돌아간다", () => {
    renderStory();
    const [a] = triggers();
    fireEvent.click(a);
    fireEvent.click(a);
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(within(panel()).getByRole("heading", { level: 2 }).textContent).toBe("근거");
    expect(within(panel()).getByText("주장의 근거 보기를 누르면 여기에 보입니다")).toBeTruthy();
    expect(within(panel()).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("패널 헤딩은 주장 N의 근거이고 주장 문장을 되풀이하며 주장 N로 돌아가기 링크는 #claim-N", () => {
    renderStory();
    fireEvent.click(triggers()[0]);
    const heading = within(panel()).getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("주장 1의 근거");
    expect(heading.id).toBe("evidence-panel-heading");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(panel().getAttribute("aria-labelledby")).toBe("evidence-panel-heading");
    expect(panel().tagName).toBe("ASIDE");
    expect(within(panel()).getByText(first.text).textContent).toBe(first.text);
    expect(
      within(panel()).getByRole("link", { name: "주장 1로 돌아가기" }).getAttribute("href"),
    ).toBe("#claim-1");
  });

  it("선택한 근거로 이동을 누르면 패널 헤딩에 포커스가 가고 해시는 바뀌지 않는다", () => {
    renderStory();
    expect(screen.queryByRole("link", { name: "선택한 근거로 이동" })).toBeNull();
    fireEvent.click(triggers()[0]);
    const links = screen.getAllByRole("link", { name: "선택한 근거로 이동" });
    expect(links).toHaveLength(1);
    const link = links[0] as HTMLElement;
    expect(link.getAttribute("href")).toBe("#evidence-panel-heading");
    fireEvent.click(link);
    expect(document.activeElement?.id).toBe("evidence-panel-heading");
    expect(window.location.hash).toBe("");
  });

  it("포커스만 옮겨도 선택이 바뀌지 않는다", () => {
    renderStory();
    const [a, b] = triggers();
    fireEvent.click(a);
    b.focus();
    fireEvent.focus(b);
    expect(a.getAttribute("aria-expanded")).toBe("true");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(within(panel()).getByRole("heading", { level: 2 }).textContent).toBe("주장 1의 근거");
  });

  it("live 영역에 주장 N의 근거를 옆 패널에 표시합니다가 쓰인다", () => {
    renderStory();
    const live = panel().querySelector("[aria-live='polite']");
    if (live === null) throw new Error("live 영역이 없다");
    expect(live.classList.contains("sr-only")).toBe(true);
    expect(live.textContent).toBe("");
    fireEvent.click(triggers()[1]);
    expect(live.textContent).toBe("주장 2의 근거를 옆 패널에 표시합니다");
    fireEvent.click(triggers()[1]);
    expect(live.textContent).toBe("");
  });

  it("딥링크 #claim-2는 데스크톱에서도 선택·패널 표시·헤딩 포커스", () => {
    window.history.replaceState(null, "", "#claim-2");
    renderStory();
    const [a, b] = triggers();
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel()).getByRole("heading", { level: 2 }).textContent).toBe("주장 2의 근거");
    expect(document.activeElement?.id).toBe("claim-2");
  });

  it("matchMedia 결과가 false로 바뀌면 선택 주장이 인라인 아코디언에서 열려 있다", () => {
    renderStory();
    fireEvent.click(triggers()[1]);
    act(() => {
      media.matches = false;
      for (const listener of listeners) listener();
    });
    const [a, b] = triggers();
    expect(b.getAttribute("aria-controls")).toBe("claim-2-evidence");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(a.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById("claim-2-evidence");
    expect(region?.hidden).toBe(false);
    expect(region?.querySelectorAll("li")).toHaveLength(second.evidence.length);
    expect(within(panel()).queryAllByRole("listitem")).toHaveLength(0);
  });
});
