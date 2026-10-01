/** @jsxImportSource react */
import type { TodayStoryCard } from "@newstrail/db";
import { formatRelativeTime } from "@newstrail/domain/relative-time";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_TIME, STORY_UPDATED, sourceCount, TOPICS_LABEL } from "../../app/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import { DemoBadge } from "../demo-badge.tsx";
import { LeadImage } from "../lead-image.tsx";
import { StatusBadge } from "../status-badge.tsx";

/** 대표 사건·두 번째 위계·짧은 목록을 같은 사건 데이터로 그린다. */
export function EditorialCard({
  story,
  now,
  featured = false,
  compact = false,
  withImage = false,
  titleRef,
}: {
  story: TodayStoryCard;
  now: Date | null;
  featured?: boolean;
  compact?: boolean;
  withImage?: boolean;
  titleRef?: (node: HTMLAnchorElement | null) => void;
}) {
  const absolute = formatAbsolute(story.updatedAt);
  const time =
    !story.isDemo && now && now >= story.updatedAt
      ? formatRelativeTime(story.updatedAt, now)
      : absolute.text;
  // 첫 사건만 앞 주장 최대 3개를 한 문단으로 잇는다. 그 밖은 첫 주장 한 문장.
  const summary = featured && story.claims.length > 0 ? story.claims.join(" ") : story.summary;
  return (
    <article
      className="today-story"
      data-featured={featured || undefined}
      data-compact={compact || undefined}
    >
      {story.isDemo && (
        <p className="today-demo-notice">
          <DemoBadge />
        </p>
      )}
      <ul aria-label={TOPICS_LABEL} className="today-story-topics">
        {story.topics.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>
      <h3 className="today-story-title">
        <Link ref={titleRef} href={`/story/${story.slug}`} className="today-story-link">
          <span>{story.title}</span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </h3>
      {!compact && (featured || withImage) && (
        <LeadImage image={story.image} isDemo={story.isDemo} priority={featured} />
      )}
      {!compact && <p className="today-story-summary">{summary}</p>}
      <div className="today-story-meta">
        <StatusBadge status={story.status} />
        <span>{sourceCount(story.sourceCount)}</span>
        <span>
          {story.isDemo ? DEMO_TIME : STORY_UPDATED}{" "}
          <time dateTime={absolute.dateTime}>{time}</time>
        </span>
      </div>
    </article>
  );
}

export function EditorialSectionHeading({
  id,
  children,
  detail,
}: {
  id: string;
  children: ReactNode;
  detail: string;
}) {
  return (
    <div className="today-section-heading">
      <h2 id={id}>{children}</h2>
      <span>{detail}</span>
    </div>
  );
}
