/** @jsxImportSource react */
"use client";

import { Check, Eye, Plus } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import {
  CHANGE_KIND_NAMES,
  changeKindCount,
  FOLLOW,
  FOLLOW_FAILED,
  NOTHING_SINCE_LAST_SEEN,
  SEEN_POINT,
  SINCE_LAST_SEEN_HEADING,
  sinceLastSeenIntro,
  TRACKING_FAILED,
  TRACKING_LOADING,
  TRACKING_RETRY,
  VISIT_FAILED,
  VISIT_PENDING,
  VISIT_RETRY,
} from "../../app/story/copy.ts";
import { FOLLOW_INTENT_QUERY } from "../../lib/auth/return-path.ts";
import { changesSinceLastSeen } from "../../lib/last-seen.ts";
import {
  postPersonal,
  STORY_FOLLOW_PATH,
  STORY_VISIT_PATH,
  type StoryFollowRequest,
  type StoryFollowResponse,
  type StoryVisitRequest,
  type StoryVisitResponse,
} from "../../lib/story-personal-api.ts";
import type { RevisionStripItemView } from "../../lib/story-view.ts";
import { LoginGate } from "../auth/login-gate.tsx";
import { Button } from "../ui/button.tsx";
import { CHANGE_KIND_ICONS, KindLabel } from "./change-kind.tsx";

/**
 * 사건 페이지의 개인 영역(#105). 사건 HTML은 사용자와 무관한 불변 공개 캐시로 두고(스펙 "렌더링·캐시"),
 * 팔로우 상태·"읽은 이후 변화"·"내가 본 지점"은 하이드레이션 뒤 개인 엔드포인트(`/api/me/story-visit`)가 요청 시점에 인증을
 * 검증해 돌려준다(응답은 `private, no-store`).
 * 익명이면 서버에 아무것도 묻지 않고 공개 화면 그대로다(팔로우 버튼은 로그인 게이트).
 */
type PersonalState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "anonymous" }
  | {
      readonly status: "signed-in";
      readonly following: boolean;
      readonly lastSeenRevisionId: string | null;
      readonly recordStatus: "pending" | "saved" | "error";
    };

type PersonalContext = {
  readonly slug: string;
  readonly state: PersonalState;
  readonly setState: (state: PersonalState) => void;
  readonly retryVisit: () => void;
  readonly revisions: readonly RevisionStripItemView[];
};

const Context = createContext<PersonalContext>({
  slug: "",
  state: { status: "anonymous" },
  setState: () => undefined,
  retryVisit: () => undefined,
  revisions: [],
});

/**
 * Supabase SSR 세션 쿠키(`sb-<ref>-auth-token`, 조각이면 `.0`…)가 있는지. 인가 경계가 아니라 익명 방문마다 서버를 부르지 않기 위한
 * 힌트다 — 쿠키가 있어도 서버가 세션을 검증하고, 없으면 익명으로 본다(@supabase/ssr 기본 쿠키는 HttpOnly가 아니다).
 */
function hasSessionCookie(): boolean {
  return document.cookie.split(/;\s*/).some((c) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(c));
}

export function StoryPersonalProvider({
  slug,
  revisionId,
  revisions,
  children,
}: {
  slug: string;
  revisionId: string;
  revisions: readonly RevisionStripItemView[];
  children: ReactNode;
}) {
  const [state, setState] = useState<PersonalState>({ status: "loading" });
  const retryVisit = useRef<() => void>(() => undefined);
  useEffect(() => {
    let active = true;
    let pending = false;
    // 로그인 뒤 돌아온 주소의 하려던 팔로우는 한 번만 쓰고 주소에서 지운다.
    const url = new URL(window.location.href);
    const currentVisit: {
      request: Omit<StoryVisitRequest, "phase">;
      baseline: Extract<StoryVisitResponse, { signedIn: true }> | null;
    } = {
      request: { slug, revisionId, follow: url.search === `?${FOLLOW_INTENT_QUERY}` },
      baseline: null,
    };
    if (!hasSessionCookie()) {
      setState({ status: "anonymous" });
      return;
    }
    async function loadAndRecord() {
      if (pending) return;
      pending = true;
      try {
        // StrictMode가 즉시 취소한 effect는 로그인 후 동작을 URL에서 소비하지 않는다.
        await Promise.resolve();
        if (!active) return;
        if (currentVisit.request.follow)
          window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
        if (currentVisit.baseline === null) {
          setState({ status: "loading" });
          const result = await postPersonal<StoryVisitResponse>(STORY_VISIT_PATH, {
            ...currentVisit.request,
            phase: "read",
          });
          if (!active) return;
          if (!result.signedIn) {
            setState({ status: "anonymous" });
            return;
          }
          currentVisit.baseline = result;
        }
        const baseline = {
          status: "signed-in",
          following: currentVisit.baseline.following,
          lastSeenRevisionId: currentVisit.baseline.lastSeenRevisionId,
        } as const;
        setState({ ...baseline, recordStatus: "pending" });
        const recorded = await postPersonal<StoryVisitResponse>(STORY_VISIT_PATH, {
          ...currentVisit.request,
          phase: "record",
        });
        if (!active) return;
        if (recorded.signedIn) currentVisit.request = { ...currentVisit.request, follow: false };
        setState(
          recorded.signedIn
            ? { ...baseline, following: recorded.following, recordStatus: "saved" }
            : { status: "anonymous" },
        );
      } catch {
        if (!active) return;
        setState(
          currentVisit.baseline === null
            ? { status: "error" }
            : {
                status: "signed-in",
                following: currentVisit.baseline.following,
                lastSeenRevisionId: currentVisit.baseline.lastSeenRevisionId,
                recordStatus: "error",
              },
        );
      } finally {
        pending = false;
      }
    }
    retryVisit.current = () => {
      void loadAndRecord();
    };
    void loadAndRecord();
    return () => {
      active = false;
      // 재시도는 위 방문 객체를 유지하고, 실제 재방문은 새 effect에서 기준과 intent를 다시 읽는다.
      retryVisit.current = () => undefined;
    };
  }, [slug, revisionId]);
  return (
    <Context
      value={{
        slug,
        state,
        setState,
        revisions,
        retryVisit: () => retryVisit.current(),
      }}
    >
      {children}
    </Context>
  );
}

/** 사건 머리의 팔로우: 익명이면 로그인 게이트(돌아와 팔로우를 마친다), 로그인이면 켜고 끄는 토글 버튼(`aria-pressed`). */
export function FollowControl() {
  const { slug, state, setState, retryVisit, revisions } = useContext(Context);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (state.status === "anonymous") return <LoginGate label={FOLLOW} intent="follow" />;
  if (state.status === "loading" || state.status === "error") {
    return (
      <>
        <Button disabled variant="outline">
          {FOLLOW}
        </Button>
        <span role="status" className="self-center text-meta">
          {state.status === "loading" ? TRACKING_LOADING : TRACKING_FAILED}
        </span>
        {state.status === "error" ? (
          <Button variant="outline" onClick={retryVisit}>
            {TRACKING_RETRY}
          </Button>
        ) : null}
      </>
    );
  }

  async function toggle() {
    if (pending || state.status !== "signed-in" || state.recordStatus !== "saved") return;
    setPending(true);
    setFailed(false);
    try {
      const body: StoryFollowRequest = { slug, following: !state.following };
      const result = await postPersonal<StoryFollowResponse>(STORY_FOLLOW_PATH, body);
      setState(
        result.signedIn ? { ...state, following: result.following } : { status: "anonymous" },
      );
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        aria-pressed={state.following}
        aria-disabled={pending || state.recordStatus !== "saved" ? "true" : undefined}
        variant={state.following ? "outline" : "default"}
        onClick={toggle}
      >
        {state.following ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {state.following ? "팔로우 중" : FOLLOW}
      </Button>
      <span role="status" className="self-center text-meta">
        {failed
          ? FOLLOW_FAILED
          : state.recordStatus === "pending"
            ? VISIT_PENDING
            : state.recordStatus === "error"
              ? VISIT_FAILED
              : null}
      </span>
      {state.recordStatus === "error" ? (
        <Button variant="outline" onClick={retryVisit}>
          {VISIT_RETRY}
        </Button>
      ) : null}
      <a
        href="#changes"
        className="inline-flex min-h-11 items-center self-center text-meta underline"
      >
        {trackingSummary(revisions, state.lastSeenRevisionId)}
      </a>
      {state.following ? (
        <a
          href="/follows"
          className="inline-flex min-h-11 items-center self-center text-meta underline"
        >
          팔로우 목록
        </a>
      ) : null}
    </>
  );
}

function trackingSummary(
  revisions: readonly RevisionStripItemView[],
  lastSeenRevisionId: string | null,
): string {
  const since = changesSinceLastSeen(revisions, lastSeenRevisionId);
  if (since === undefined) {
    return lastSeenRevisionId === null
      ? `개정판 ${revisions.at(-1)?.revisionNumber ?? 1}부터 변화 추적`
      : "이전 개정판의 변화 보기";
  }
  return since.revisionCount > 0
    ? `새 개정판 ${since.revisionCount}개 · 읽은 이후 변화 보기`
    : `새 변화 없음 · 개정판 ${since.lastSeenRevisionNumber}까지 읽음`;
}

/** 변화 구획 머리의 "읽은 이후 변화": 마지막으로 본 개정판 뒤 개정판들의 변화 종류별 합. 본 적 없는 사건은 보이지 않는다. */
export function SinceLastSeenNotice({
  revisions,
}: {
  revisions: readonly RevisionStripItemView[];
}) {
  const { state } = useContext(Context);
  if (state.status !== "signed-in") return null;
  const since = changesSinceLastSeen(revisions, state.lastSeenRevisionId);
  if (since === undefined) return null;
  const counts = since.counts.filter((c) => c.count > 0);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-foreground p-4">
      <h3>{SINCE_LAST_SEEN_HEADING}</h3>
      {since.revisionCount === 0 ? (
        <p>{NOTHING_SINCE_LAST_SEEN}</p>
      ) : (
        <>
          <p>{sinceLastSeenIntro(since.lastSeenRevisionNumber, since.revisionCount)}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
            {counts.map((c) => (
              <li key={c.kind}>
                <KindLabel icon={CHANGE_KIND_ICONS[c.kind]}>
                  {changeKindCount(CHANGE_KIND_NAMES[c.kind], c.count)}
                </KindLabel>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 개정판 띠 항목의 "내가 본 지점"(이 방문 전 마지막으로 본 개정판). */
export function SeenPointMarker({ revisionId }: { revisionId: string }) {
  const { state } = useContext(Context);
  if (state.status !== "signed-in" || state.lastSeenRevisionId !== revisionId) return null;
  return <KindLabel icon={Eye}>{SEEN_POINT}</KindLabel>;
}
