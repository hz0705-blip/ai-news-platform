import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { SiteHeader } from "../components/site-header.tsx";
import { SITE_METADATA } from "../lib/share-card.ts";
import { ABOUT_LINK, SERVICE_NAME } from "./copy.ts";
import { PRIVACY_PATH, PRIVACY_TITLE, TERMS_PATH, TERMS_TITLE } from "./legal.ts";
import "./globals.css";

// 사이트 기본 카드(오늘·소개·검색). 사건 페이지는 generateMetadata로 개정판 카드를 덮어쓴다.
export const metadata: Metadata = {
  ...SITE_METADATA,
  description: "해외 보도를 사건으로 읽고, 한국어 주장과 영어 원문 근거를 함께 확인합니다.",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="ko">
      <head>
        <link
          rel="preload"
          href="/fonts/NanumMyeongjo-Bold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <div className="site-footer-identity">
            <strong>{SERVICE_NAME}</strong>
            <p>사건을 읽다. 근거를 잇다.</p>
          </div>
          <nav aria-label="이용 안내">
            <a href="/about" className="underline">
              {ABOUT_LINK}
            </a>
            <a href={PRIVACY_PATH} className="underline">
              {PRIVACY_TITLE}
            </a>
            <a href={TERMS_PATH} className="underline">
              {TERMS_TITLE}
            </a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
