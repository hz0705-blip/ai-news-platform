import type { ReactElement } from "react";

// 사건 URL·개정판 URL의 정적 스켈레톤(Suspense 폴백). 제목·시각 슬롯의 높이를 고정하고,
// 동작 없이 그리며, 보조기술이 조각을 하나씩 읽지 않게 숨긴다.
export default function StoryLoading(): ReactElement {
  return (
    <main aria-busy="true" className="mx-auto flex max-w-[76rem] flex-col gap-8 px-4 py-12 lg:px-6">
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="h-6 w-40 rounded-md bg-muted" />
        <div className="h-11 w-full max-w-2xl rounded-md bg-muted" />
        <div className="h-6 w-72 rounded-md bg-muted" />
      </div>
    </main>
  );
}
