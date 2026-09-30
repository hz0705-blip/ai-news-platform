import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { AccountMenu } from "../components/auth/account-menu.tsx";
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
        {/* 모든 화면 공통 상단 바: 우측 상단 계정 진입점(스펙 "계정"). 로그인 여부는 마운트 뒤 클라이언트가 묻는다. */}
        <header className="mx-auto flex max-w-[76rem] justify-end px-4 pt-4 lg:px-6">
          <AccountMenu />
        </header>
        {children}
        <footer className="mx-auto flex max-w-[76rem] flex-wrap justify-center gap-x-4 gap-y-2 px-4 pb-12 text-meta lg:px-6">
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
