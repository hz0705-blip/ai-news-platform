import type { ReactElement } from "react";

// #17 빈 화면. 데이터·DB 호출 없음. 문구는 Ruling(PR 본문 "무엇을 남겼나")이며 서비스 이름 확정(M4 전) 시 바꾼다.
export default function Page(): ReactElement {
  return (
    <main>
      <h1>사건으로 읽는 해외 보도</h1>
      <p>임시 화면입니다. 서비스 이름과 내용은 준비 중입니다.</p>
    </main>
  );
}
