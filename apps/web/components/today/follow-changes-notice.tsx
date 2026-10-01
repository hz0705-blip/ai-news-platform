/** @jsxImportSource react */
"use client";

import { useEffect, useState } from "react";
import { FOLLOWS_LINK, followChangesNotice } from "../../app/copy.ts";
import { hasSessionCookie } from "../../lib/auth/session-cookie.ts";
import {
  FOLLOW_CHANGES_PATH,
  type FollowChangesResponse,
  postPersonal,
} from "../../lib/story-personal-api.ts";

/**
 * 오늘 머리의 팔로우 변화 안내(#208). 오늘 HTML은 사용자와 무관한 공개 캐시이므로 로그인 독자의 수는 하이드레이션 뒤
 * 개인 엔드포인트(`/api/me/follow-changes`)가 채운다. 익명(세션 쿠키 힌트 없음)이면 서버를 부르지 않고 아무것도 그리지 않는다.
 * 세션 힌트가 있으면 polite 상태 영역을 먼저 두고 결과로 채운다 — 0건이거나 조회에 실패하면 지운다(팔로우 화면이 정본이다).
 */
export function FollowChangesNotice() {
  const [changed, setChanged] = useState<"idle" | "pending" | number>("idle");
  useEffect(() => {
    if (!hasSessionCookie()) return;
    let active = true;
    setChanged("pending");
    postPersonal<FollowChangesResponse>(FOLLOW_CHANGES_PATH, {})
      .then((result) => {
        if (active) setChanged(result.signedIn ? result.changed : 0);
      })
      .catch(() => {
        if (active) setChanged(0);
      });
    return () => {
      active = false;
    };
  }, []);
  if (changed === "idle" || changed === 0) return null;
  return (
    <p className="today-follow-changes" role="status">
      {changed === "pending" ? null : (
        <>
          <span>{followChangesNotice(changed)}</span>
          <a href="/follows">{FOLLOWS_LINK}</a>
        </>
      )}
    </p>
  );
}
