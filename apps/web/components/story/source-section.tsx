/** @jsxImportSource react */
import {
  ARTICLE_OBSERVED,
  ARTICLE_PUBLISHED,
  FICTIONAL_SOURCE,
  languageName,
  ownershipName,
  SOURCE_LANGUAGE,
  SOURCE_NO_EXCERPT,
  SOURCE_OWNERSHIP,
  SOURCE_REGION,
  SOURCE_RIGHTS_TIER,
  SOURCES_HEADING,
} from "../../app/story/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import type { SourceView } from "../../lib/story-view.ts";
import { SourceTile } from "../source-tile.tsx";
import { Badge } from "../ui/badge.tsx";

/**
 * 출처 구획. 링크만 등급 출처도 여기에는 나온다(근거는 주지 않는다). 링크만 등급 행은 발췌가 없다는 것을 글로 밝히고,
 * 링크만 기사(GDELT)는 발행 시각 대신 관측 시각을 보인다.
 */
export function SourceSection({ sources }: { sources: readonly SourceView[] }) {
  return (
    <section id="sources" aria-labelledby="sources-heading" className="flex flex-col gap-4">
      <h2 id="sources-heading">{SOURCES_HEADING}</h2>
      <p className="section-deck">
        이 사건을 보도한 출처와 원문입니다. 출처별 배경과 발췌 가능 범위를 함께 표시합니다.
      </p>
      <ul className="source-list">
        {sources.map((source) => {
          const time = formatAbsolute(source.isLinkOnly ? source.observedAt : source.publishedAt);
          return (
            <li key={`${source.id}:${source.articleUrl}`} className="source-row">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <SourceTile name={source.name} />
                {source.isFictional ? <Badge variant="demo">{FICTIONAL_SOURCE}</Badge> : null}
              </p>
              <dl className="source-details">
                <dt className="text-muted-foreground">{SOURCE_REGION}</dt>
                <dd className="m-0">{source.region}</dd>
                <dt className="text-muted-foreground">{SOURCE_OWNERSHIP}</dt>
                <dd className="m-0">{ownershipName(source.ownership)}</dd>
                <dt className="text-muted-foreground">{SOURCE_LANGUAGE}</dt>
                <dd className="m-0">{languageName(source.language)}</dd>
                <dt className="text-muted-foreground">{SOURCE_RIGHTS_TIER}</dt>
                <dd className="m-0">{source.rightsTier}</dd>
              </dl>
              <div className="source-article">
                <p>
                  <a href={source.articleUrl} target="_blank" rel="noopener noreferrer" lang="en">
                    {source.articleTitle}
                  </a>
                </p>
                <p className="text-meta text-muted-foreground">
                  <span>{source.isLinkOnly ? ARTICLE_OBSERVED : ARTICLE_PUBLISHED}</span>{" "}
                  <time dateTime={time.dateTime}>{time.text}</time>
                </p>
                {source.excerptAvailable ? null : <p className="text-meta">{SOURCE_NO_EXCERPT}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
