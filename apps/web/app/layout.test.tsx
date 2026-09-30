import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout, { metadata } from "./layout.tsx";

describe("루트 레이아웃", () => {
  it("html 요소의 lang이 ko다", () => {
    // <html>을 반환하는 컴포넌트는 Testing Library render(문서에 mount)로 검증하기 어려워 정적 마크업 문자열로 확인한다.
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>내용</p>
      </RootLayout>,
    );
    expect(html.startsWith('<html lang="ko">')).toBe(true);
    expect(html).toContain("<p>내용</p>");
  });

  it("문서 제목은 Newstrail — 사건으로 읽는 해외 보도이고 하위 화면은 ' — Newstrail'이 붙는다", () => {
    expect(metadata.title).toEqual({
      default: "Newstrail — 사건으로 읽는 해외 보도",
      template: "%s — Newstrail",
    });
    expect(metadata.openGraph?.siteName).toBe("Newstrail");
  });
});
