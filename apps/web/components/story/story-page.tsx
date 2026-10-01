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
import { StoryPersonalProvider } from "./story-personal.tsx";

/**
 * 사건 URL과 개정판 URL이 함께 쓰는 화면. 구획 셋은 탭이 아니라 문서 앵커로 잇는다.
 * 넓은 화면에서는 주장과 근거를 나란히 읽고, 좁은 화면에서는 근거를 주장 바로 아래에서 읽는다.
 */
export function StoryPage({ view }: { view: StoryView }) {
  return (
    <main className="editorial-page story-page" id="main-content" tabIndex={-1}>
      <StoryPersonalProvider slug={view.slug} revisionId={view.revisionId}>
        <StoryHeader
          header={view.header}
          summary={view.claims[0]?.text}
          sourceNames={[...new Set(view.sources.map((source) => source.name))]}
        />
        <nav aria-label={SECTION_NAV_LABEL} className="story-section-navigation">
          <ul className="flex flex-wrap gap-4">
            <li>
              <a href="#claims">
                <span aria-hidden="true">01</span>
                {CLAIMS_HEADING} <span>{view.claims.length}</span>
              </a>
            </li>
            <li>
              <a href="#sources">
                <span aria-hidden="true">02</span>
                {SOURCES_HEADING}
              </a>
            </li>
            <li>
              <a href="#changes">
                <span aria-hidden="true">03</span>
                {CHANGES_HEADING}
              </a>
            </li>
          </ul>
        </nav>
        <ClaimList
          claims={view.claims}
          frame={(list) => (
            <section id="claims" aria-labelledby="claims-heading" className="flex flex-col gap-4">
              <h2 id="claims-heading">{CLAIMS_HEADING}</h2>
              <p className="section-deck">
                사건을 이루는 주요 주장과, 그 문장의 근거를 확인합니다.
              </p>
              {list}
            </section>
          )}
        />
        <SourceSection sources={view.sources} />
        <ChangeSection view={view} />
      </StoryPersonalProvider>
    </main>
  );
}
