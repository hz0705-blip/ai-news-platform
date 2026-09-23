/** @jsxImportSource react */
import {
  ARTICLE_PUBLISHED,
  FICTIONAL_SOURCE,
  ORIGINAL_LINK,
  originalLinkContext,
  TRANSLATE,
} from "../../app/story/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import type { EvidenceView } from "../../lib/story-view.ts";
import { EvidenceHighlight } from "../evidence-highlight.tsx";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";

/** 근거 행 하나: 출처·기사·발행 시각·영어 발췌(강조 구간만 표시)·원문 링크·번역 자리. */
export function EvidenceRow({ evidence }: { evidence: EvidenceView }) {
  const { excerpt, highlight } = evidence;
  const published = formatAbsolute(evidence.publishedAt);
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-card p-4 text-card-foreground">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <span>{evidence.sourceName}</span>
        {evidence.isFictional ? <Badge variant="demo">{FICTIONAL_SOURCE}</Badge> : null}
      </p>
      <p lang="en">{evidence.articleTitle}</p>
      <p className="text-meta text-muted-foreground">
        <span>{ARTICLE_PUBLISHED}</span> <time dateTime={published.dateTime}>{published.text}</time>
      </p>
      <blockquote lang="en" className="m-0">
        {excerpt.slice(0, highlight.start)}
        <EvidenceHighlight lang="en">
          {excerpt.slice(highlight.start, highlight.end)}
        </EvidenceHighlight>
        {excerpt.slice(highlight.end)}
      </blockquote>
      <div className="flex flex-wrap items-center gap-4">
        <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">
          {ORIGINAL_LINK}
          <span className="sr-only">{originalLinkContext(evidence.sourceName)}</span>
        </a>
        <Button disabled aria-disabled="true">
          {TRANSLATE}
        </Button>
      </div>
    </li>
  );
}
