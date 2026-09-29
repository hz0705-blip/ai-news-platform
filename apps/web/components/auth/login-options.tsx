/** @jsxImportSource react */
"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import {
  AGE_NOTICE,
  CONTINUE_GOOGLE,
  CONTINUE_KAKAO,
  COPY_FAILED,
  COPY_LINK,
  IN_APP_MENU,
  IN_APP_REASON,
  IN_APP_TITLE,
  LINK_COPIED,
  OPEN_EXTERNAL,
  OTHER_LOGIN,
} from "../../app/auth/copy.ts";
import { detectInAppBrowser, externalOpenUrl, type InAppBrowser } from "../../lib/auth/in-app.ts";
import { loginStartPath } from "../../lib/auth/urls.ts";
import { Button, buttonVariants } from "../ui/button.tsx";

type InAppNotice = { browser: InAppBrowser; startUrl: string; openUrl: string | null };

/**
 * 로그인 선택: 14세 이상 확인 문구와 Kakao·Google 로그인 시작 링크(같은 출처 `/auth/login/start`).
 * KakaoTalk·NAVER 인앱에서 Google을 누르면 이동 대신 외부 브라우저 안내를 보인다(스펙 "계정" 인앱 브라우저):
 * 외부 열기는 사용자가 누를 때만, 링크 복사와 앱 메뉴 안내는 항상 함께. 외부 브라우저가 여는 주소는 로그인 시작 URL이다.
 */
export function LoginOptions({ next }: { next: string }) {
  const [notice, setNotice] = useState<InAppNotice | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const noticeHeading = useRef<HTMLHeadingElement>(null);
  const kakaoHref = loginStartPath("kakao", next);
  const googleHref = loginStartPath("google", next);

  useEffect(() => {
    if (notice !== null) noticeHeading.current?.focus();
  }, [notice]);

  function onGoogle(event: MouseEvent<HTMLAnchorElement>) {
    const userAgent = navigator.userAgent;
    const browser = detectInAppBrowser(userAgent);
    if (browser === null) return;
    event.preventDefault();
    const startUrl = new URL(googleHref, window.location.origin).toString();
    setCopied("idle");
    setNotice({ browser, startUrl, openUrl: externalOpenUrl(browser, userAgent, startUrl) });
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  if (notice !== null) {
    return (
      <div className="flex flex-col gap-3">
        <h2 ref={noticeHeading} tabIndex={-1} className="text-card-title font-semibold">
          {IN_APP_TITLE}
        </h2>
        <p>{IN_APP_REASON}</p>
        {notice.openUrl === null ? null : (
          <a href={notice.openUrl} className={buttonVariants()}>
            {OPEN_EXTERNAL}
          </a>
        )}
        <Button variant="outline" onClick={() => copyLink(notice.startUrl)}>
          {COPY_LINK}
        </Button>
        <p aria-live="polite" className="text-meta">
          {copied === "copied" ? LINK_COPIED : copied === "failed" ? COPY_FAILED : ""}
        </p>
        {copied === "failed" ? <p className="text-meta break-all">{notice.startUrl}</p> : null}
        <p className="text-meta">{IN_APP_MENU[notice.browser]}</p>
        <Button variant="outline" onClick={() => setNotice(null)}>
          {OTHER_LOGIN}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta">{AGE_NOTICE}</p>
      <a href={kakaoHref} className={buttonVariants({ variant: "outline" })}>
        {CONTINUE_KAKAO}
      </a>
      <a href={googleHref} onClick={onGoogle} className={buttonVariants({ variant: "outline" })}>
        {CONTINUE_GOOGLE}
      </a>
    </div>
  );
}
