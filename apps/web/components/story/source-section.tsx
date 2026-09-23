/** @jsxImportSource react */
import {
  ARTICLE_PUBLISHED,
  FICTIONAL_SOURCE,
  languageName,
  SOURCE_LANGUAGE,
  SOURCE_OWNERSHIP,
  SOURCE_REGION,
  SOURCE_RIGHTS_TIER,
  SOURCES_HEADING,
} from "../../app/story/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import type { SourceView } from "../../lib/story-view.ts";
import { SourceTile } from "../source-tile.tsx";
import { Badge } from "../ui/badge.tsx";

/** 출처 구획. 링크만 등급 출처도 여기에는 나온다(근거는 주지 않는다). */
export function SourceSection({ sources }: { sources: readonly SourceView[] }) {
  return (
    <section id="sources" aria-labelledby="sources-heading" className="flex flex-col gap-4">
      <h2 id="sources-heading">{SOURCES_HEADING}</h2>
      <ul className="flex flex-col gap-4">
        {sources.map((source) => {
          const published = formatAbsolute(source.publishedAt);
          return (
            <li
              key={`${source.id}:${source.articleUrl}`}
              className="flex flex-col gap-2 rounded-md border border-border p-4"
            >
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <SourceTile name={source.name} />
                {source.isFictional ? <Badge variant="demo">{FICTIONAL_SOURCE}</Badge> : null}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-meta">
                <dt className="text-muted-foreground">{SOURCE_REGION}</dt>
                <dd className="m-0">{source.region}</dd>
                <dt className="text-muted-foreground">{SOURCE_OWNERSHIP}</dt>
                <dd className="m-0">{source.ownership}</dd>
                <dt className="text-muted-foreground">{SOURCE_LANGUAGE}</dt>
                <dd className="m-0">{languageName(source.language)}</dd>
                <dt className="text-muted-foreground">{SOURCE_RIGHTS_TIER}</dt>
                <dd className="m-0">{source.rightsTier}</dd>
              </dl>
              <p>
                <a href={source.articleUrl} target="_blank" rel="noopener noreferrer" lang="en">
                  {source.articleTitle}
                </a>
              </p>
              <p className="text-meta text-muted-foreground">
                <span>{ARTICLE_PUBLISHED}</span>{" "}
                <time dateTime={published.dateTime}>{published.text}</time>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
