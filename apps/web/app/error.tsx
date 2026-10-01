"use client";

import { Button } from "../components/ui/button.tsx";

export default function PageError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="editorial-page">
      <header className="flex flex-col gap-3">
        <h1>페이지를 불러오지 못했습니다</h1>
        <p role="alert">잠시 후 다시 시도해 주세요. 읽고 있던 주소는 그대로 유지됩니다.</p>
      </header>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={reset}>다시 시도</Button>
        <a href="/">오늘의 사건으로</a>
      </div>
    </main>
  );
}
