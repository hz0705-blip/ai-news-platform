/** @jsxImportSource react */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClaimList } from "./claim-list.tsx";

afterEach(cleanup);

const claims = [
  {
    id: "claim-1",
    order: 1,
    text: "세 나라 장관들이 가상 항만 협정의 틀에 합의했다고 두 출처가 독립적으로 보도했다.",
    status: "복수 출처 일치" as const,
    evidence: [
      {
        sourceName: "Meridian Wire",
        isFictional: true,
        articleTitle: "A",
        publishedAt: new Date("2026-09-16T22:00:00.000Z"),
        excerpt: "Ministers agreed on the framework.",
        highlight: { start: 10, end: 16 },
        sourceUrl: "https://meridian.invalid/a",
      },
      {
        sourceName: "Harbor Ledger",
        isFictional: true,
        articleTitle: "B",
        publishedAt: new Date("2026-09-16T23:00:00.000Z"),
        excerpt: "The three governments signed the framework.",
        highlight: { start: 22, end: 28 },
        sourceUrl: "https://harbor.invalid/b",
      },
    ],
  },
];

describe("ClaimList", () => {
  it("첫 진입에 모든 근거가 접혀 있고 접힘 영역 안의 링크는 렌더되지 않는다", () => {
    render(<ClaimList claims={claims} />);
    const trigger = screen.getByRole("button", { name: "근거 2개 보기" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toMatch(/\S/);
    expect(screen.queryByRole("link", { name: /원문/ })).toBeNull();
  });

  it("주장 번호·문장·상태 배지는 접힘 영역 밖에 있다", () => {
    render(<ClaimList claims={claims} />);
    const item = screen.getByRole("listitem");
    const region = item.querySelector(
      `#${screen.getByRole("button").getAttribute("aria-controls")}`,
    );
    expect(within(item).getByText("주장 1").textContent).toBe("주장 1");
    expect(within(item).getByText(claims[0]?.text ?? "").textContent).toBe(claims[0]?.text);
    expect(within(item).getByText("복수 출처 일치").textContent).toBe("복수 출처 일치");
    expect(region?.contains(within(item).getByText("주장 1"))).toBe(false);
    expect(region?.contains(within(item).getByText("복수 출처 일치"))).toBe(false);
  });

  it("펼침 버튼 안에 링크·번역 컨트롤이 중첩되지 않는다", () => {
    render(<ClaimList claims={claims} />);
    const trigger = screen.getByRole("button", { name: "근거 2개 보기" });
    expect(trigger.querySelector("a")).toBeNull();
    expect(trigger.querySelector("button")).toBeNull();
  });

  it("펼치면 근거 행마다 영어 발췌·원문 링크·비활성 번역 컨트롤이 있다", () => {
    render(<ClaimList claims={claims} defaultExpanded={["claim-1"]} />);
    const links = screen.getAllByRole("link", { name: /원문/ });
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("https://meridian.invalid/a");
    expect(links[0]?.getAttribute("rel")).toContain("noopener");
    const translate = screen.getAllByRole("button", { name: /번역/ });
    expect(translate).toHaveLength(2);
    expect(translate[0]?.hasAttribute("disabled")).toBe(true);
    expect(document.querySelectorAll("[lang='en']").length).toBeGreaterThanOrEqual(2);
  });
});
