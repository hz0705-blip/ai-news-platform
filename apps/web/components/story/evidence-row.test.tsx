/** @jsxImportSource react */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceRow } from "./evidence-row.tsx";

afterEach(cleanup);

const base = {
  sourceName: "Atlas Dispatch",
  isFictional: true,
  articleTitle: "Port deal reached",
  publishedAt: new Date("2026-09-16T23:00:00.000Z"),
  sourceUrl: "https://atlas.invalid/ports",
} as const;

describe("EvidenceRow", () => {
  it("발췌 불가 근거는 상태 문구·출처명·원문 링크만 보이고 구간·제목·시각·번역은 없다", () => {
    render(
      <ul>
        <EvidenceRow
          evidence={{ ...base, display: "발췌 불가", differsIn: "숨겨야 할 다른 점" }}
          position={{ index: 1, total: 2 }}
        />
      </ul>,
    );
    expect(screen.getByText("근거 발췌를 표시할 수 없음")).toBeTruthy();
    expect(screen.getByText("Atlas Dispatch")).toBeTruthy();
    expect(screen.getByText("가상 출처")).toBeTruthy();
    expect(screen.getByRole("link", { name: /원문/ }).getAttribute("href")).toBe(base.sourceUrl);
    expect(document.querySelector("blockquote")).toBeNull();
    expect(document.querySelector("mark")).toBeNull();
    expect(screen.queryByText("근거 구간")).toBeNull();
    expect(screen.queryByText("Port deal reached")).toBeNull();
    expect(screen.queryByText("기사 발행")).toBeNull();
    expect(screen.queryByText("보도 1/2")).toBeNull();
    expect(screen.queryByText("다른 점")).toBeNull();
    expect(screen.queryByText("숨겨야 할 다른 점")).toBeNull();
    expect(screen.queryByRole("button", { name: /번역/ })).toBeNull();
  });

  it("발췌 불가 상태 문구는 상충 상태 배지가 아니다", () => {
    render(
      <ul>
        <EvidenceRow evidence={{ ...base, display: "발췌 불가" }} />
      </ul>,
    );
    const status = screen.getByText("근거 발췌를 표시할 수 없음");
    expect(status.tagName).toBe("P");
    expect(status.closest("[data-slot='badge']")).toBeNull();
  });

  it("발췌 근거의 비활성 번역 컨트롤 옆에 설명 문구가 있고 aria-describedby로 이어진다", () => {
    render(
      <ul>
        <EvidenceRow
          evidence={{
            ...base,
            display: "발췌",
            excerpt: "All loading was halted.",
            highlight: { start: 0, end: 11 },
          }}
        />
      </ul>,
    );
    const translate = screen.getByRole("button", { name: /번역/ });
    expect(translate.hasAttribute("disabled")).toBe(true);
    const describedBy = translate.getAttribute("aria-describedby");
    expect(describedBy).toMatch(/\S/);
    const note = document.getElementById(describedBy ?? "");
    expect(note?.textContent).toBe("번역은 준비 중입니다");
    expect(note?.classList.contains("sr-only")).toBe(false);
    expect(screen.getByText("근거 구간")).toBeTruthy();
    expect(document.querySelector("mark")?.textContent).toBe("All loading");
  });
});
