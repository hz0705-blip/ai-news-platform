import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "./layout.tsx";

describe("루트 레이아웃", () => {
  it("html 요소의 lang이 ko다", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>내용</p>
      </RootLayout>,
    );
    expect(html.startsWith('<html lang="ko">')).toBe(true);
    expect(html).toContain("<p>내용</p>");
  });

  it("문서 제목이 화면 제목과 같다", () => {
    expect(metadata.title).toBe("사건으로 읽는 해외 보도");
  });
});
