/**
 * 사건 페이지 개인 영역의 요청 시점 엔드포인트(#105). 브라우저 번들이 읽는 파일이라 서버 모듈을 import하지 않는다 —
 * 경로·본문·응답 모양만 둔다. 서버 쪽은 app/api/me/*\/route.ts(lib/auth/personal-route.ts).
 */
export const STORY_VISIT_PATH = "/api/me/story-visit";
export const STORY_FOLLOW_PATH = "/api/me/story-follow";

export type StoryVisitRequest = {
  /** 먼저 비교 기준을 받은 뒤, 실제 표시된 개정판을 기록한다. */
  readonly phase: "read" | "record";
  readonly slug: string;
  readonly revisionId: string;
  /** 로그인 뒤 돌아온 페이지가 하려던 팔로우(`?intent=follow`)를 마칠 때 참. */
  readonly follow: boolean;
};
export type StoryFollowRequest = { readonly slug: string; readonly following: boolean };

/** 익명이면 서버는 아무것도 기록하지 않고 `signedIn: false`만 돌려준다. */
export type StoryVisitResponse =
  | { readonly signedIn: false }
  | {
      readonly signedIn: true;
      readonly following: boolean;
      /** 이 방문 전의 마지막으로 본 개정판(본 적 없으면 null). "읽은 이후 변화"와 "내가 본 지점"의 기준이다. */
      readonly lastSeenRevisionId: string | null;
    };
export type StoryFollowResponse =
  | { readonly signedIn: false }
  | { readonly signedIn: true; readonly following: boolean };

/** 같은 출처 JSON POST. 실패 응답은 예외다(호출한 컨트롤 옆에서 알린다). */
export async function postPersonal<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return (await response.json()) as T;
}
