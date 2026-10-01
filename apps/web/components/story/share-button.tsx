/** @jsxImportSource react */
"use client";

import { useState } from "react";
import { SHARE, SHARE_COPIED, SHARE_COPY_FAILED } from "../../app/story/copy.ts";
import { Button } from "../ui/button.tsx";

/** 사건 헤더의 공유: Web Share가 있으면 공유 시트, 없으면 정규 URL(해시·질의 제외) 복사. */
export function ShareButton({ title, summary }: { title: string; summary?: string | undefined }) {
  const [message, setMessage] = useState<string | null>(null);

  async function share() {
    setMessage(null);
    const url = window.location.origin + window.location.pathname;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(summary ? { title, text: summary, url } : { title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 취소가 아닌 실패(권한 거부 등)는 링크 복사로 넘어간다.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage(SHARE_COPIED);
    } catch {
      setMessage(SHARE_COPY_FAILED);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={share}>
        {SHARE}
      </Button>
      <span role="status" aria-live="polite" className="self-center text-meta">
        {message}
      </span>
    </>
  );
}
