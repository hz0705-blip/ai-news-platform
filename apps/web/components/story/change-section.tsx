/** @jsxImportSource react */
import { CHANGES_HEADING, NO_CHANGES } from "../../app/story/copy.ts";

/** 변화 구획. 첫 개정판만 있는 이 단계에서는 빈 상태 문구만 보인다. */
export function ChangeSection() {
  return (
    <section id="changes" aria-labelledby="changes-heading" className="flex flex-col gap-4">
      <h2 id="changes-heading">{CHANGES_HEADING}</h2>
      <p>{NO_CHANGES}</p>
    </section>
  );
}
