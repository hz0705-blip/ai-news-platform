/** @jsxImportSource react */
import {
  DEMO_NOTICE,
  FOLLOW,
  SHARE,
  STATUS_COUNTS_LABEL,
  STORY_UPDATED,
  sourceCount,
  statusCount,
  statusCountClaims,
  TOPICS_LABEL,
} from "../../app/story/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import type { StoryView } from "../../lib/story-view.ts";
import { DemoBadge } from "../demo-badge.tsx";
import { StatusBadge } from "../status-badge.tsx";
import { Button } from "../ui/button.tsx";

/** 사건 머리: 데모 표기·토픽·제목·사건 상충 상태·출처 개수·갱신 시각, 팔로우·공유 자리. */
export function StoryHeader({ header }: { header: StoryView["header"] }) {
  const updated = formatAbsolute(header.updatedAt);
  return (
    <header className="flex flex-col gap-3">
      {header.isDemo ? (
        <p className="flex flex-wrap items-center gap-2">
          <DemoBadge />
          <span>{DEMO_NOTICE}</span>
        </p>
      ) : null}
      <ul
        aria-label={TOPICS_LABEL}
        className="flex flex-wrap gap-2 text-meta text-muted-foreground"
      >
        {header.topics.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>
      <h1>{header.title}</h1>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-meta">
        <StatusBadge status={header.status} description="visible" />
        <span>{sourceCount(header.sourceCount)}</span>
        <span>
          {STORY_UPDATED} <time dateTime={updated.dateTime}>{updated.text}</time>
        </span>
      </p>
      <ul aria-label={STATUS_COUNTS_LABEL} className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
        {header.statusCounts.map(({ status, count, claimOrders }) => (
          <li key={status}>
            <a href={`#claim-${claimOrders[0]}-label`} className="underline">
              {statusCount(status, count)}
              {claimOrders.length > 1 ? (
                <span className="sr-only"> {statusCountClaims(claimOrders)}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-2">
        <Button disabled aria-disabled="true">
          {FOLLOW}
        </Button>
        <Button disabled aria-disabled="true">
          {SHARE}
        </Button>
      </p>
    </header>
  );
}
