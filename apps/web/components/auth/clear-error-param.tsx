/** @jsxImportSource react */
"use client";

import { useEffect } from "react";

/**
 * 서버가 `error`로 알림을 그린 뒤 브라우저 주소에서 `error`만 지운다(#195). 새로고침·뒤로 가기·주소 복사로
 * 알림이 다시 뜨지 않게 한다. 다른 파라미터·해시·Next 라우터 상태(`history.state`)는 그대로 둔다.
 */
export function ClearErrorParam(): null {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error")) return;
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
