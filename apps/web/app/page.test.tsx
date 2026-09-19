import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Page from "./page.tsx";

afterEach(cleanup);

describe("첫 화면", () => {
  it("제목 한 줄을 h1으로 렌더한다", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("사건으로 읽는 해외 보도");
  });

  it("임시 서비스 표기를 보여준다", () => {
    render(<Page />);
    expect(screen.getByText("임시 화면입니다. 서비스 이름과 내용은 준비 중입니다.")).toBeDefined();
  });
});
