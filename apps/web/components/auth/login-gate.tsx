/** @jsxImportSource react */
"use client";

import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { CANCEL, LOGIN_REASON, LOGIN_TITLE } from "../../app/auth/copy.ts";
import { safeReturnPath } from "../../lib/auth/return-path.ts";
import { Button } from "../ui/button.tsx";
import { LoginOptions } from "./login-options.tsx";

/**
 * 로그인 게이트(스펙 "계정"): 팔로우·"읽은 이후" 동작 버튼이 여는 그 자리의 로그인 선택.
 * 로그인하면 지금 페이지로 돌아오고, 취소하면 대화상자만 닫혀 같은 페이지 읽기가 이어진다(포커스는 여는 버튼으로).
 * 네이티브 모달 `<dialog>`를 쓴다 — 포커스 가두기·Esc·배경 비활성·포커스 복귀를 브라우저가 맡는다.
 * 로그인 여부를 묻지 않는다: 공개 화면은 인증 상태를 담지 않고, 로그인 사용자의 동작은 그 동작의 서버 코드가 검증한다.
 */
export function LoginGate({ label }: { label: string }) {
  const next = safeReturnPath(usePathname());
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reasonId = useId();
  // 닫을 때마다 선택 화면을 처음 상태(인앱 안내 전)로 되돌린다.
  const [session, setSession] = useState(0);
  return (
    <>
      <Button aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={reasonId}
        onClose={() => setSession((n) => n + 1)}
        className="m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md rounded-md border border-border bg-popover p-6 text-popover-foreground backdrop:bg-black/40"
      >
        <div className="flex flex-col gap-4">
          <h2 id={titleId}>{LOGIN_TITLE}</h2>
          <p id={reasonId}>{LOGIN_REASON}</p>
          <LoginOptions key={session} next={next} />
          <Button variant="outline" onClick={() => dialog.current?.close()}>
            {CANCEL}
          </Button>
        </div>
      </dialog>
    </>
  );
}
