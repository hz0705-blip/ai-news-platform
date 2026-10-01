/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "./share-button.tsx";

const STORY_PATH = "/story/fixture-1-agreement";

function stubNavigator(props: { share?: unknown; clipboard?: unknown }) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

beforeEach(() => {
  window.history.replaceState(null, "", `${STORY_PATH}?from=today#claim-2`);
});

afterEach(() => {
  cleanup();
  stubNavigator({ share: undefined, clipboard: undefined });
});

describe("ShareButton", () => {
  it("Web Share가 있으면 제목·요약·정규 URL로 공유 시트를 연다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton title="사건 제목" summary="요약 한 줄" />);
    const button = screen.getByRole("button", { name: "공유" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      title: "사건 제목",
      text: "요약 한 줄",
      url: `${window.location.origin}${STORY_PATH}`,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("Web Share가 없으면 링크를 복사하고 '링크를 복사했습니다'를 알린다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share: undefined, clipboard: { writeText } });
    render(<ShareButton title="사건 제목" summary="요약 한 줄" />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    const status = screen.getByRole("status");
    await waitFor(() => expect(status.textContent).toBe("링크를 복사했습니다"));
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${STORY_PATH}`);
  });

  it("복사가 실패하면 안내 문구를 보인다", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    stubNavigator({ share: undefined, clipboard: { writeText } });
    render(<ShareButton title="사건 제목" />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "링크를 복사할 수 없습니다. 주소창의 주소를 사용하세요",
      ),
    );
  });

  it("공유 시트를 취소하면 아무것도 알리지 않는다", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton title="사건 제목" summary="요약 한 줄" />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
