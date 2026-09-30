import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { SITE_METADATA } from "../lib/share-card.ts";
import { ABOUT_LINK } from "./copy.ts";
import { PRIVACY_PATH, PRIVACY_TITLE, TERMS_PATH, TERMS_TITLE } from "./legal.ts";
import "./globals.css";

// 사이트 기본 카드(오늘·소개·검색). 사건 페이지는 generateMetadata로 개정판 카드를 덮어쓴다.
export const metadata: Metadata = {
  ...SITE_METADATA,
  description: "임시 화면",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="ko">
      <body>
        {children}
        <footer className="mx-auto flex max-w-[76rem] flex-wrap gap-x-4 gap-y-2 px-4 pb-12 lg:px-6">
          <a href="/about" className="underline">
            {ABOUT_LINK}
          </a>
          <a href={PRIVACY_PATH} className="underline">
            {PRIVACY_TITLE}
          </a>
          <a href={TERMS_PATH} className="underline">
            {TERMS_TITLE}
          </a>
        </footer>
      </body>
    </html>
  );
}
