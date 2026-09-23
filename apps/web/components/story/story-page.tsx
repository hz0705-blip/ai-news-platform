/** @jsxImportSource react */
import {
  CHANGES_HEADING,
  CLAIMS_HEADING,
  SECTION_NAV_LABEL,
  SOURCES_HEADING,
} from "../../app/story/copy.ts";
import type { StoryView } from "../../lib/story-view.ts";
import { ChangeSection } from "./change-section.tsx";
import { ClaimList } from "./claim-list.tsx";
import { SourceSection } from "./source-section.tsx";
import { StoryHeader } from "./story-header.tsx";

/** 사건 URL과 개정판 URL이 함께 쓰는 화면. 구획 셋은 탭이 아니라 문서 앵커로 잇는다. */
export function StoryPage({ view }: { view: StoryView }) {
  return (
    <main className="mx-auto flex max-w-[76rem] flex-col gap-8 px-4 py-12 lg:px-6">
      <StoryHeader header={view.header} />
      <nav aria-label={SECTION_NAV_LABEL}>
        <ul className="flex flex-wrap gap-4">
          <li>
            <a href="#claims">{CLAIMS_HEADING}</a>
          </li>
          <li>
            <a href="#sources">{SOURCES_HEADING}</a>
          </li>
          <li>
            <a href="#changes">{CHANGES_HEADING}</a>
          </li>
        </ul>
      </nav>
      <section id="claims" aria-labelledby="claims-heading" className="flex flex-col gap-4">
        <h2 id="claims-heading">{CLAIMS_HEADING}</h2>
        <ClaimList claims={view.claims} />
      </section>
      <SourceSection sources={view.sources} />
      <ChangeSection />
    </main>
  );
}
