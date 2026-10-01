/** @jsxImportSource react */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ABOUT_LINK, FOLLOWS_LINK, SEARCH_LINK, SERVICE_NAME, TODAY_LABEL } from "../app/copy.ts";
import { AccountMenu } from "./auth/account-menu.tsx";

const links = [
  { href: "/", label: TODAY_LABEL, text: "오늘" },
  { href: "/follows", label: FOLLOWS_LINK, text: "팔로우" },
  { href: "/search", label: SEARCH_LINK, text: "검색" },
  { href: "/about", label: ABOUT_LINK, text: "소개" },
];

function NavigationLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="주요 탐색" className="site-navigation">
      {links.map(({ href, label, text }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={pathname === href ? "page" : undefined}
          aria-label={label}
        >
          {text}
        </Link>
      ))}
    </nav>
  );
}

function ActiveNavigation() {
  return <NavigationLinks pathname={usePathname()} />;
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      <div className="site-masthead">
        <p className="site-masthead-note">
          세계의 보도를,
          <br />
          하나의 맥락으로.
        </p>
        <Link href="/" prefetch={false} className="site-wordmark" aria-label={`${SERVICE_NAME} 홈`}>
          <span>{SERVICE_NAME}</span>
          <span className="site-wordmark-caption" aria-hidden="true">
            사건을 읽다. 근거를 잇다.
          </span>
        </Link>
        <div className="site-account">
          <AccountMenu />
        </div>
      </div>
      <Suspense fallback={<NavigationLinks pathname={null} />}>
        <ActiveNavigation />
      </Suspense>
    </header>
  );
}
