import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClearErrorParam } from "./clear-error-param.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("주소의 error 정리", () => {
  it("마운트 뒤 주소에서 error만 지우고 next는 남긴다", () => {
    window.history.replaceState(
      { kept: true },
      "",
      "/auth/login?next=%2Fstory%2Fa&error=failed#top",
    );
    render(<ClearErrorParam />);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/auth/login?next=%2Fstory%2Fa#top",
    );
    expect(window.history.state).toEqual({ kept: true });
  });

  it("error가 없으면 주소를 건드리지 않는다", () => {
    window.history.replaceState(null, "", "/account?next=%2F");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<ClearErrorParam />);
    expect(replace).not.toHaveBeenCalled();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/account?next=%2F");
  });
});
