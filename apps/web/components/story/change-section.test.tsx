/** @jsxImportSource react */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  MULTI_REV_1,
  multiRevisionFirstFixture,
  multiRevisionFixture,
} from "../../e2e/story-data.ts";
import { asOlderRevision, buildStoryView } from "../../lib/story-view.ts";
import { ChangeSection } from "./change-section.tsx";

afterEach(cleanup);

const changesList = () => {
  const section = screen.getByRole("region", { name: "변화" });
  const list = section.querySelector("ul");
  if (list === null) throw new Error("변화 목록이 없다");
  return list;
};

describe("ChangeSection", () => {
  it("주장 변화는 이전·현재 문장을 병기하고 단어 차이를 ins/del로 표시한다", () => {
    render(<ChangeSection view={buildStoryView(multiRevisionFixture)} />);
    const item = within(changesList()).getByText("주장 수정").closest("li") as HTMLElement;
    expect(within(item).getByText("이전")).toBeTruthy();
    expect(within(item).getByText("현재")).toBeTruthy();
    expect([...item.querySelectorAll("del")].map((d) => d.textContent)).toEqual([
      "지운 단어: 이번",
      "지운 단어: 한",
    ]);
    expect([...item.querySelectorAll("ins")].map((d) => d.textContent)).toEqual([
      "넣은 단어: 다음",
      "넣은 단어: 두",
    ]);
    expect(item.querySelector("del .sr-only")?.textContent).toBe("지운 단어: ");
    expect(within(item).getByRole("link", { name: "주장 1" }).getAttribute("href")).toBe(
      "#claim-1",
    );
  });

  it("상태 변화·원문 변경은 항목별, 출처 추가는 접어서 개수만", () => {
    render(<ChangeSection view={buildStoryView(multiRevisionFixture)} />);
    const list = within(changesList());
    expect(
      within(screen.getByRole("region", { name: "변화" })).getByText(
        "개정판 2 · 직전 개정판과 비교한 변화입니다.",
      ),
    ).toBeTruthy();
    const items = changesList().querySelectorAll(":scope > li");
    expect(items).toHaveLength(7);
    expect(list.getByText("주장 추가")).toBeTruthy();
    expect(list.getByText("주장 삭제").closest("li")?.textContent).toContain(
      "선석 배정 중단 이유는 알려지지 않았다.",
    );
    const statusItems = list
      .getAllByText("상충 상태 변화")
      .map((e) => e.closest("li") as HTMLElement);
    expect(statusItems).toHaveLength(2);
    expect(
      within(statusItems[0] as HTMLElement).getByRole("link", { name: "주장 1" }),
    ).toBeTruthy();
    expect(within(statusItems[1] as HTMLElement).getByText("사건 상태")).toBeTruthy();
    expect(within(statusItems[1] as HTMLElement).getByText("보도 상충")).toBeTruthy();
    expect(within(statusItems[1] as HTMLElement).getByText("상충 해소")).toBeTruthy();
    const edited = list.getByText("원문 변경").closest("li") as HTMLElement;
    expect(
      within(edited).getByRole("link", { name: "Tidewater Gazette article" }).getAttribute("href"),
    ).toBe("https://tidewater.example/berth");
    // 출처 추가는 한 줄의 개수이고 개별 기사를 늘어놓지 않는다
    expect(list.getByText("출처 추가 2건")).toBeTruthy();
    expect(list.queryByText("Harbor Ledger article")).toBeNull();
  });

  it("개정판 뷰는 직전 개정판과의 변화만 보이고 첫 개정판은 변화가 없다", () => {
    render(<ChangeSection view={buildStoryView(multiRevisionFirstFixture)} />);
    const section = within(screen.getByRole("region", { name: "변화" }));
    expect(section.getByText("아직 변화가 없습니다")).toBeTruthy();
    expect(section.queryByText("주장 수정")).toBeNull();
    const strip = section.getByRole("figure", { name: /개정판 이력/ });
    expect(
      within(strip).getAllByRole("link", { name: "개정판 1" })[0]?.getAttribute("aria-current"),
    ).toBe("page");
    expect(within(strip).queryByRole("link", { name: "개정판 2" })).toBeNull();
  });

  it("개정판 띠는 발행 순서대로 절대 시각·종류별 개수·현재 표시와 고정 URL 링크를 낸다", () => {
    render(<ChangeSection view={buildStoryView(multiRevisionFixture)} />);
    const strip = screen.getByRole("figure", { name: /개정판 이력/ });
    const entries = [...(strip.querySelector("ol")?.children ?? [])] as HTMLElement[];
    expect(entries.map((e) => within(e).getByRole("link").textContent)).toEqual([
      "개정판 1",
      "개정판 2",
    ]);
    const [first, second] = entries as [HTMLElement, HTMLElement];
    expect(within(first).getByRole("link").getAttribute("href")).toBe(
      `/story/multi-revision-changes/revision/${encodeURIComponent(MULTI_REV_1)}`,
    );
    expect(within(first).getByRole("link").getAttribute("aria-current")).toBeNull();
    expect(within(first).getByText("첫 개정판")).toBeTruthy();
    expect(within(first).getByText("2026. 9. 17. 오전 9:30 KST").getAttribute("datetime")).toBe(
      "2026-09-17T00:30:00.000Z",
    );
    expect(within(second).getByRole("link").getAttribute("aria-current")).toBe("page");
    expect(within(second).getByText("최신")).toBeTruthy();
    expect(within(second).getByText("보는 중")).toBeTruthy();
    expect(within(second).getByText("사건 갱신")).toBeTruthy();
    for (const label of ["주장 변화 3건", "상충 상태 변화 2건", "원문 변경 1건", "출처 추가 2건"]) {
      expect(within(second).getByText(label)).toBeTruthy();
    }
    // 같은 데이터의 표는 접힌 채 figure 안에 있고 같은 링크를 가진다
    const details = strip.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("표로 보기").tagName).toBe("SUMMARY");
    const rows = within(details).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(
      within(rows[2] as HTMLElement)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["2026. 9. 18. 오전 9:30 KST", "3", "2", "1", "2"]);
    expect(
      within(rows[1] as HTMLElement)
        .getByRole("link", { name: "개정판 1" })
        .getAttribute("href"),
    ).toBe(within(first).getByRole("link").getAttribute("href"));
  });

  it("최신 개정판을 보면 그 항목에 최신·보는 중이 함께 붙는다", () => {
    render(<ChangeSection view={buildStoryView(multiRevisionFixture)} />);
    const strip = screen.getByRole("figure", { name: /개정판 이력/ });
    const [first, second] = [...(strip.querySelector("ol")?.children ?? [])] as HTMLElement[];
    expect(within(first as HTMLElement).queryByText("최신")).toBeNull();
    expect(within(first as HTMLElement).queryByText("보는 중")).toBeNull();
    expect(within(second as HTMLElement).getByText("최신")).toBeTruthy();
    expect(within(second as HTMLElement).getByText("보는 중")).toBeTruthy();
    expect(second?.dataset.current).toBe("true");
    const row = within(strip.querySelector("table") as HTMLElement).getAllByRole("row")[2];
    expect(within(row as HTMLElement).getByText("최신")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("보는 중")).toBeTruthy();
  });

  it("옛 개정판을 보면 최신과 보는 중이 다른 항목에 붙고 aria-current는 보는 중에만 있다", () => {
    // 띠에 뒤 개정판이 실린 경우: 최신 판정은 띠의 개정판 번호 최대값이다.
    render(
      <ChangeSection
        view={buildStoryView({
          ...multiRevisionFirstFixture,
          revisions: multiRevisionFixture.revisions,
        })}
      />,
    );
    const strip = screen.getByRole("figure", { name: /개정판 이력/ });
    const [first, second] = [...(strip.querySelector("ol")?.children ?? [])] as HTMLElement[];
    expect(within(first as HTMLElement).getByText("보는 중")).toBeTruthy();
    expect(within(first as HTMLElement).queryByText("최신")).toBeNull();
    expect(
      within(first as HTMLElement)
        .getByRole("link")
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(first?.dataset.current).toBe("true");
    expect(within(second as HTMLElement).getByText("최신")).toBeTruthy();
    expect(within(second as HTMLElement).queryByText("보는 중")).toBeNull();
    expect(
      within(second as HTMLElement)
        .getByRole("link")
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(second?.dataset.current).toBe("false");
    const [, row1, row2] = within(strip.querySelector("table") as HTMLElement).getAllByRole("row");
    expect(within(row1 as HTMLElement).getByText("보는 중")).toBeTruthy();
    expect(within(row1 as HTMLElement).queryByText("최신")).toBeNull();
    expect(within(row2 as HTMLElement).getByText("최신")).toBeTruthy();
    expect(
      within(row2 as HTMLElement)
        .getByRole("link")
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("이전 개정판 화면의 띠는 보는 중만 표기한다", () => {
    render(<ChangeSection view={asOlderRevision(buildStoryView(multiRevisionFirstFixture))} />);
    const strip = screen.getByRole("figure", { name: /개정판 이력/ });
    expect(within(strip).queryByText("최신")).toBeNull();
    expect(within(strip).getAllByText("보는 중")).toHaveLength(2);
  });

  it("보도량 추이는 KST 구간 표와 관측 시각 대체 캡션을 figure 안에 둔다", () => {
    render(<ChangeSection view={buildStoryView(multiRevisionFixture)} />);
    const figure = screen.getByRole("figure", { name: /보도량 추이/ });
    expect(
      within(figure).getByText("기사 발행 시각 기준 6시간 구간별 기사 수, 한국 시간(KST)"),
    ).toBeTruthy();
    expect(
      within(figure).getByText("발행 시각을 모르는 기사 1건은 관측 시각으로 셌습니다."),
    ).toBeTruthy();
    const rows = within(figure).getAllByRole("row").slice(1);
    expect(rows.map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["2026. 9. 17. 06:00~12:00", "2", "0"],
      ["2026. 9. 17. 12:00~18:00", "0", "0"],
      ["2026. 9. 17. 18:00~24:00", "0", "0"],
      ["2026. 9. 18. 00:00~06:00", "1", "0"],
      ["2026. 9. 18. 06:00~12:00", "1", "1"],
    ]);
    expect(
      within(figure).getByRole("columnheader", { name: "관측 시각으로 센 기사" }),
    ).toBeTruthy();
  });
});
