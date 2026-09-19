import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { SCREEN_TITLE } from "./copy.ts";

export const metadata: Metadata = {
  title: SCREEN_TITLE,
  description: "임시 화면",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
