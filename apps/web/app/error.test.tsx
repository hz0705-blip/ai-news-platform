import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PageError from "./error.tsx";

afterEach(cleanup);

it("다시 시도는 실패한 서버 데이터도 다시 요청하는 retry를 호출한다", () => {
  const props = { reset: vi.fn(), retry: vi.fn() };
  render(<PageError {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(props.retry).toHaveBeenCalledOnce();
  expect(props.reset).not.toHaveBeenCalled();
});
