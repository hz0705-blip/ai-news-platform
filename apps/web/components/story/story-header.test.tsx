/** @jsxImportSource react */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StoryHeader } from "./story-header.tsx";

afterEach(cleanup);

describe("StoryHeader", () => {
  it("사건 배지 옆에 보이는 설명 문구와 상태별 개수 링크를 보인다", () => {
    render(
      <StoryHeader
        header={{
          title: "제목",
          topics: ["세계 경제·금융"],
          isDemo: true,
          status: "보도 상충",
          sourceCount: 2,
          updatedAt: new Date("2026-09-17T00:30:00.000Z"),
          statusCounts: [
            { status: "복수 출처 일치", count: 2, claimOrders: [1, 3] },
            { status: "보도 상충", count: 1, claimOrders: [2] },
          ],
        }}
      />,
    );
    expect(screen.getByText("출처에 따라 보도가 다릅니다.").classList.contains("sr-only")).toBe(
      false,
    );
    const list = screen.getByRole("list", { name: "주장 상태별 개수" });
    expect(list.textContent).toContain("복수 출처 일치 2개");
    expect(screen.getByRole("link", { name: /보도 상충 1개/ }).getAttribute("href")).toBe(
      "#claim-2-label",
    );
  });
});
