import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { SITE_METADATA } from "../lib/share-card.ts";
import "./globals.css";

// 사이트 기본 카드(오늘·소개·검색). 사건 페이지는 generateMetadata로 개정판 카드를 덮어쓴다.
export const metadata: Metadata = {
  ...SITE_METADATA,
  description: "임시 화면",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
