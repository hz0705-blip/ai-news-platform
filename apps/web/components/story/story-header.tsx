/** @jsxImportSource react */

import { DEMO_TIME } from "../../app/copy.ts";
import {
  DEMO_NOTICE,
  SHARE,
  STATUS_COUNTS_LABEL,
  STORY_UPDATED,
  sourceCount,
  statusCount,
  statusCountClaims,
  TOPICS_LABEL,
} from "../../app/story/copy.ts";
import { claimHref } from "../../lib/claim-anchor.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import type { StoryView } from "../../lib/story-view.ts";
import { DemoBadge } from "../demo-badge.tsx";
import { LeadImage } from "../lead-image.tsx";
import { StatusBadge } from "../status-badge.tsx";
import { Button } from "../ui/button.tsx";
import { FollowControl } from "./story-personal.tsx";

/** 사건 머리: 데모 표기·토픽·제목·사건 상충 상태·출처 개수·갱신 시각, 팔로우·공유 자리. */
export function StoryHeader({
  header,
  summary,
  sourceNames = [],
}: {
  header: StoryView["header"];
  summary?: string | undefined;
  sourceNames?: readonly string[];
}) {
  const updated = formatAbsolute(header.updatedAt);
  return (
    <header className="story-header">
      {header.isDemo ? (
        <p className="story-demo">
          <DemoBadge />
          <span>{DEMO_NOTICE}</span>
        </p>
      ) : null}
      <ul aria-label={TOPICS_LABEL} className="story-topic">
        {header.topics.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>
      <h1>{header.title}</h1>
      {summary && <p className="story-summary">{summary}</p>}
      <div className="story-meta">
        <p className="story-status-line">
          <StatusBadge status={header.status} description="visible" />
        </p>
        <p className="story-byline">
          <span>{sourceCount(header.sourceCount)}</span>
          <span>
            {header.isDemo ? DEMO_TIME : STORY_UPDATED}{" "}
            <time dateTime={updated.dateTime}>{updated.text}</time>
          </span>
        </p>
      </div>
      {sourceNames.length > 0 && (
        <div className="story-source-ribbon">
          <p>함께 읽은 출처</p>
          <p>
            {sourceNames.join(" · ")}
            <a href="#sources">
              출처 살펴보기 <span aria-hidden="true">↗</span>
            </a>
          </p>
        </div>
      )}
      <LeadImage image={header.image} isDemo={header.isDemo} priority />
      <div className="story-header-bottom">
        <ul aria-label={STATUS_COUNTS_LABEL} className="story-status-index">
          {header.statusCounts.map(({ status, count, claimOrders }) => (
            <li key={status}>
              <a href={claimHref(claimOrders[0] ?? 1)} className="underline">
                {statusCount(status, count)}
                {claimOrders.length > 1 ? (
                  <span className="sr-only"> {statusCountClaims(claimOrders)}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
        {/* 로그인 게이트의 <dialog>는 <p> 안에 둘 수 없다. */}
        <div className="flex flex-wrap gap-2">
          <FollowControl />
          <Button variant="outline" disabled aria-disabled="true" title="공유 기능 준비 중">
            {SHARE}
          </Button>
        </div>
      </div>
    </header>
  );
}
