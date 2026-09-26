/** @jsxImportSource react */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClaimList } from "./claim-list.tsx";

afterEach(() => {
  cleanup();
  // 해시 초기화. replaceState는 hashchange를 내지 않는다.
  window.history.replaceState(null, "", window.location.pathname);
});

const claims = [
  {
    id: "claim-1",
    order: 1,
    text: "세 나라 장관들이 가상 항만 협정의 틀에 합의했다고 두 출처가 독립적으로 보도했다.",
    status: "복수 출처 일치" as const,
    isComparison: false,
    evidence: [
      {
        sourceName: "Meridian Wire",
        isFictional: true,
        display: "발췌" as const,
        articleTitle: "A",
        publishedAt: new Date("2026-09-16T22:00:00.000Z"),
        excerpt: "Ministers agreed on the framework.",
        highlight: { start: 10, end: 16 },
        sourceUrl: "https://meridian.invalid/a",
      },
      {
        sourceName: "Harbor Ledger",
        isFictional: true,
        display: "발췌" as const,
        articleTitle: "B",
        publishedAt: new Date("2026-09-16T23:00:00.000Z"),
        excerpt: "The three governments signed the framework.",
        highlight: { start: 22, end: 28 },
        sourceUrl: "https://harbor.invalid/b",
      },
    ],
  },
];

const conflictClaim = {
  id: "claim-c",
  order: 1,
  text: "가상 항만의 선적이 모두 중단됐다.",
  status: "보도 상충" as const,
  isComparison: true,
  evidence: [
    {
      sourceName: "Atlas Dispatch (가상 출처)",
      isFictional: true,
      display: "발췌" as const,
      articleTitle: "Port halts all loading",
      publishedAt: new Date("2026-09-16T07:15:00.000Z"),
      excerpt: "All loading at the port was halted.",
      highlight: { start: 0, end: 18 },
      sourceUrl: "https://atlas.invalid/halt",
      differsIn: "모두 중단됐다고 보도",
    },
    {
      sourceName: "Harbor Ledger (가상 출처)",
      isFictional: true,
      display: "발췌" as const,
      articleTitle: "Some loading continues",
      publishedAt: new Date("2026-09-16T08:40:00.000Z"),
      excerpt: "Some loading continued at the port.",
      highlight: { start: 0, end: 22 },
      sourceUrl: "https://harbor.invalid/continue",
      differsIn: "일부는 계속됐다고 보도",
    },
  ],
};

const agreeClaim = { ...(claims[0] as (typeof claims)[number]), id: "claim-a", order: 2 };

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
  it("상충 주장의 근거 행은 순서와 다른 점을 보이고, 다른 주장의 행은 보이지 않는다", () => {
    render(
      <ClaimList
        claims={[conflictClaim, agreeClaim]}
        defaultExpanded={[conflictClaim.id, agreeClaim.id]}
      />,
    );
    expect(screen.getByText("보도 1/2")).toBeTruthy();
    expect(screen.getByText("보도 2/2")).toBeTruthy();
    expect(screen.getAllByText("다른 점")).toHaveLength(2);
    expect(screen.getByText("모두 중단됐다고 보도")).toBeTruthy();
    const agreeRegion = document.getElementById("claim-2-evidence");
    if (agreeRegion === null) throw new Error("주장 2의 펼침 영역이 없다");
    expect(within(agreeRegion).queryByText(/^보도 \d\/\d$/)).toBeNull();
    expect(within(agreeRegion).queryByText("다른 점")).toBeNull();
  });

  it("주장마다 h3 헤딩이 있고 id는 claim-N이며 프로그램 포커스가 가능하다", () => {
    render(<ClaimList claims={[conflictClaim, agreeClaim]} />);
    const heading = screen.getByRole("heading", { level: 3, name: "주장 2" });
    expect(heading.id).toBe("claim-2");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    const triggers = screen.getAllByRole("button", { name: "근거 2개 보기" });
    expect(triggers).toHaveLength(2);
    expect(triggers[0]?.getAttribute("aria-controls")).toBe("claim-1-evidence");
    expect(triggers[1]?.getAttribute("aria-controls")).toBe("claim-2-evidence");
  });

  it("펼침 영역은 랜드마크가 아니다", () => {
    render(<ClaimList claims={claims} defaultExpanded={["claim-1"]} />);
    expect(screen.queryByRole("region")).toBeNull();
    const panel = document.getElementById("claim-1-evidence");
    expect(panel?.tagName).toBe("DIV");
    expect(panel?.hasAttribute("aria-labelledby")).toBe(false);
    expect(panel?.hasAttribute("role")).toBe(false);
  });

  it("두 주장의 패널을 동시에 열 수 있고 하나를 닫아도 다른 하나는 열려 있다", () => {
    render(<ClaimList claims={[conflictClaim, agreeClaim]} />);
    const [first, second] = screen.getAllByRole("button", { name: /근거 \d+개 보기/ });
    if (!first || !second) throw new Error("트리거가 둘이 아니다");
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
  });

  it("딥링크 #claim-2로 들어오면 그 주장만 펼쳐지고 헤딩에 포커스가 간다", () => {
    window.history.replaceState(null, "", "#claim-2"); // hashchange 없이 해시만 둔다(첫 진입 재현)
    render(<ClaimList claims={[conflictClaim, agreeClaim]} />);
    const [first, second] = screen.getAllByRole("button", { name: /근거 \d+개 보기/ });
    expect(first?.getAttribute("aria-expanded")).toBe("false");
    expect(second?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("claim-2");
  });

  it("페이지 안에서 해시가 바뀌면 그 주장을 추가로 펼치고 이미 열린 패널은 닫지 않는다", () => {
    render(<ClaimList claims={[conflictClaim, agreeClaim]} />);
    const [first, second] = screen.getAllByRole("button", { name: /근거 \d+개 보기/ });
    if (!first || !second) throw new Error("트리거가 둘이 아니다");
    fireEvent.click(first);
    act(() => {
      window.history.replaceState(null, "", "#claim-2");
      window.dispatchEvent(new Event("hashchange")); // replaceState는 hashchange를 내지 않으므로 정확히 한 번 보낸다
    });
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("claim-2");
  });

  it("해시가 같아 hashchange가 나지 않아도 #claim-N 링크를 누르면 다시 펼치고 포커스한다", () => {
    window.history.replaceState(null, "", "#claim-2");
    render(
      <>
        <a href="#claim-2">보도 상충 1개</a>
        <ClaimList claims={[conflictClaim, agreeClaim]} />
      </>,
    );
    const second = screen.getAllByRole("button", { name: /근거 \d+개 보기/ })[1];
    if (!second) throw new Error("트리거가 없다");
    fireEvent.click(second); // 닫는다
    expect(second.getAttribute("aria-expanded")).toBe("false");
    second.blur();
    fireEvent.click(screen.getByRole("link", { name: "보도 상충 1개" }));
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("claim-2");
  });

  it("해시가 주장 형식이 아니거나 범위 밖이면 아무것도 펼치지 않는다", () => {
    window.history.replaceState(null, "", "#claim-9");
    render(<ClaimList claims={claims} />);
    expect(screen.getByRole("button", { name: /근거/ }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("주장 배지에는 스크린리더 전용 설명 문구가 붙는다", () => {
    render(<ClaimList claims={[conflictClaim]} />);
    expect(screen.getByText("출처에 따라 보도가 다릅니다.").classList.contains("sr-only")).toBe(
      true,
    );
  });
});
