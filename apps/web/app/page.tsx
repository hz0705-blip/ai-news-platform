import type { ReactElement } from "react";
import { SCREEN_TITLE, TEMPORARY_NOTICE } from "./copy.ts";

// #17 빈 화면. 데이터·DB 호출 없음. 문구는 ./copy.ts에 있다.
export default function Page(): ReactElement {
  return (
    <main className="mx-auto flex max-w-[76rem] flex-col gap-4 px-4 py-12 lg:px-6">
      <h1>{SCREEN_TITLE}</h1>
      <p>{TEMPORARY_NOTICE}</p>
    </main>
  );
}
