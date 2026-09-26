import { useSyncExternalStore } from "react";

/** Tailwind `lg:`와 같은 경계. 데스크톱 근거 패널이 보이는 폭(Ruling 24-5·24-6). */
export const DESKTOP_QUERY = "(min-width: 64rem)";

const hasMatchMedia = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = (): boolean => hasMatchMedia() && window.matchMedia(DESKTOP_QUERY).matches;
const getServerSnapshot = (): boolean => false;

/** 뷰포트가 데스크톱 폭인지. 서버 렌더와 matchMedia가 없는 환경(jsdom)은 모바일(false)로 본다. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
