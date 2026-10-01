/** @jsxImportSource react */
"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { ACCOUNT_LINK } from "../../app/account/copy.ts";
import { ACCOUNT_NAV, HEADER_FOLLOWS, HEADER_LOGIN } from "../../app/auth/copy.ts";
import { buttonVariants } from "../ui/button.tsx";
import { LoginGate } from "./login-gate.tsx";

const sessionResponse = z.object({ userId: z.string().nullable() });

async function fetchUserId(): Promise<string | null> {
  const response = await fetch("/auth/session", { cache: "no-store" });
  if (!response.ok) return null;
  const parsed = sessionResponse.safeParse(await response.json());
  return parsed.success ? parsed.data.userId : null;
}

function SignedInMenu() {
  return (
    <nav
      aria-label={ACCOUNT_NAV}
      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
    >
      <a href="/follows" className="underline">
        {HEADER_FOLLOWS}
      </a>
      <a href="/account" className="underline">
        {ACCOUNT_LINK}
      </a>
    </nav>
  );
}

/**
 * 우측 상단 계정 진입점(스펙 "계정"). 공개 화면은 인증 상태를 담지 않으므로 마운트 뒤 `GET /auth/session`으로 묻는다.
 * 확인 전에는 보이지 않는 버튼 상자로 자리를 잡아 두고(레이아웃 흔들림 없음), 요청이 실패하면 로그아웃 상태로 보인다.
 */
export function AccountMenu() {
  // undefined = 아직 모름, null = 로그아웃, 문자열 = 로그인한 사용자 ID
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    fetchUserId()
      .catch(() => null)
      .then((id) => {
        if (active) setUserId(id);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="flex items-center justify-end">
      {userId === undefined ? (
        // 버튼과 같은 상자로 높이를 잡아 둔다(글자 크기가 바뀌어도 높이가 같다).
        <span aria-hidden="true" className={buttonVariants({ className: "invisible" })}>
          {HEADER_LOGIN}
        </span>
      ) : userId === null ? (
        <LoginGate label={HEADER_LOGIN} />
      ) : (
        <SignedInMenu />
      )}
    </div>
  );
}
