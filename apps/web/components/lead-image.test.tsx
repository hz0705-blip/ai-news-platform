/** @jsxImportSource react */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadImage } from "./lead-image.tsx";

const image = {
  url: "https://images.example.test/story.jpg",
  sourceName: "테스트 출처",
  articleUrl: "https://example.test/story",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("대표 이미지", () => {
  it("발행사 이미지 주소와 크레딧 원문 링크를 표시하고 리드만 즉시 로딩한다", () => {
    const { container, rerender } = render(<LeadImage image={image} isDemo={false} priority />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(image.url);
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("loading")).toBe("eager");
    expect(screen.getByRole("link", { name: "사진 · 테스트 출처" }).getAttribute("href")).toBe(
      image.articleUrl,
    );
    rerender(<LeadImage image={image} isDemo={false} />);
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("이미지 부재·데모·로드 실패에는 크레딧과 슬롯 전체를 접고 새 URL은 표시한다", () => {
    const { container, rerender } = render(<LeadImage image={null} isDemo={false} />);
    expect(container.childElementCount).toBe(0);
    rerender(<LeadImage image={image} isDemo />);
    expect(container.childElementCount).toBe(0);
    rerender(<LeadImage image={image} isDemo={false} />);
    fireEvent.error(screen.getByRole("presentation"));
    expect(container.childElementCount).toBe(0);
    rerender(<LeadImage image={{ ...image, url: `${image.url}?v=2` }} isDemo={false} />);
    expect(screen.getByRole("figure")).toBeDefined();
  });

  it("마운트 시 이미 실패한 이미지는 슬롯을 접는다", () => {
    const proto = HTMLImageElement.prototype;
    vi.spyOn(proto, "complete", "get").mockReturnValue(true);
    const naturalWidth = vi.spyOn(proto, "naturalWidth", "get").mockReturnValue(0);
    const { container, rerender } = render(<LeadImage image={image} isDemo={false} priority />);
    expect(container.childElementCount).toBe(0);
    naturalWidth.mockReturnValue(900);
    rerender(<LeadImage image={{ ...image, url: `${image.url}?v=2` }} isDemo={false} priority />);
    expect(screen.getByRole("figure")).toBeDefined();
  });
});
