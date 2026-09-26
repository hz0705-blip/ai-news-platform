/** @jsxImportSource react */
import { useId } from "react";
import {
  ARTICLE_PUBLISHED,
  comparisonPosition,
  DIFFERS_IN,
  EXCERPT_UNAVAILABLE,
  FICTIONAL_SOURCE,
  ORIGINAL_LINK,
  originalLinkContext,
  TRANSLATE,
  TRANSLATE_PENDING,
} from "../../app/story/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import type { EvidenceView } from "../../lib/story-view.ts";
import { EvidenceHighlight } from "../evidence-highlight.tsx";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";

const ROW_CLASS =
  "flex flex-col gap-2 rounded-md border border-border bg-card p-4 text-card-foreground";

function SourceLine({ evidence }: { evidence: EvidenceView }) {
  return (
    <p className="flex flex-wrap items-center gap-2 font-semibold">
      <span>{evidence.sourceName}</span>
      {evidence.isFictional ? <Badge variant="demo">{FICTIONAL_SOURCE}</Badge> : null}
    </p>
  );
}

function OriginalLink({ evidence }: { evidence: EvidenceView }) {
  return (
    <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">
      {ORIGINAL_LINK}
      <span className="sr-only">{originalLinkContext(evidence.sourceName)}</span>
    </a>
  );
}

/**
 * 근거 행 하나. `발췌`: 출처·기사·발행 시각·영어 발췌(강조 구간만 표시)·원문 링크·번역 자리.
 * `발췌 불가`: 상태 문구·출처명·원문 링크, 비교 행이면 순서만(Ruling 23-6) — 잘린 조각을 완전한 근거처럼 보이지 않는다.
 * 보도 상충 주장의 비교 행이면 `position`으로 순서(`보도 i/n`)를 맨 위에(두 형태 모두), 다른 점을 발췌 뒤에 보인다
 * (`발췌` 형태만).
 */
export function EvidenceRow({
  evidence,
  position,
}: {
  evidence: EvidenceView;
  position?: { readonly index: number; readonly total: number };
}) {
  const noteId = useId();
  const positionLine =
    position === undefined ? null : (
      <p className="text-meta tabular-nums">{comparisonPosition(position.index, position.total)}</p>
    );
  if (evidence.display === "발췌 불가") {
    return (
      <li className={ROW_CLASS}>
        {positionLine}
        <p className="font-medium">{EXCERPT_UNAVAILABLE}</p>
        <SourceLine evidence={evidence} />
        <div className="flex flex-wrap items-center gap-4">
          <OriginalLink evidence={evidence} />
        </div>
      </li>
    );
  }
  const { excerpt, highlight } = evidence;
  const published = formatAbsolute(evidence.publishedAt);
  return (
    <li className={ROW_CLASS}>
      {positionLine}
      <SourceLine evidence={evidence} />
      <p lang="en">{evidence.articleTitle}</p>
      <p className="text-meta text-muted-foreground">
        <span>{ARTICLE_PUBLISHED}</span> <time dateTime={published.dateTime}>{published.text}</time>
      </p>
      {/* pe-2: 강조 구간은 줄마다 끝 여백을 복제한다(box-decoration-break: clone). Chromium은 줄을 나눌 때
          그 여백을 줄 폭에 넣지 않아 배경이 발췌 상자 밖으로 최대 8px 넘친다 — 같은 폭만큼 끝 여백을 둔다. */}
      <blockquote lang="en" className="m-0 pe-2">
        {excerpt.slice(0, highlight.start)}
        <EvidenceHighlight lang="en">
          {excerpt.slice(highlight.start, highlight.end)}
        </EvidenceHighlight>
        {excerpt.slice(highlight.end)}
      </blockquote>
      {evidence.differsIn === undefined ? null : (
        <dl>
          <dt className="font-medium">{DIFFERS_IN}</dt>
          <dd className="m-0">{evidence.differsIn}</dd>
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <OriginalLink evidence={evidence} />
        <span className="flex flex-wrap items-center gap-2">
          <Button disabled aria-disabled="true" aria-describedby={noteId}>
            {TRANSLATE}
          </Button>
          <span id={noteId} className="text-meta text-muted-foreground">
            {TRANSLATE_PENDING}
          </span>
        </span>
      </div>
    </li>
  );
}
