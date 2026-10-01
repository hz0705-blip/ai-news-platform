/** @jsxImportSource react */
import type { TodayStoryCard } from "@newstrail/db";
import { formatRelativeTime } from "@newstrail/domain/relative-time";
import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_TIME, STORY_UPDATED, sourceCount, TOPICS_LABEL } from "../../app/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import { DemoBadge } from "../demo-badge.tsx";
import { LeadImage } from "../lead-image.tsx";
import { StatusBadge } from "../status-badge.tsx";

export function StoryCard({
  story,
  now,
  titleRef,
  extra,
  storyHref,
  prominence = "list",
}: {
  story: TodayStoryCard;
  now: Date | null;
  prominence?: "lead" | "secondary" | "list";
  titleRef?: (node: HTMLAnchorElement | null) => void;
  /** 항목 상단의 화면별 표기·동작. 팔로우 화면의 변화 있음·팔로우 해제가 쓴다. */
  extra?: ReactNode;
  /** 팔로우 목록은 확인한 개정판의 고정 주소를 쓴다. */
  storyHref?: string;
}) {
  const absolute = formatAbsolute(story.updatedAt);
  // SSR과 첫 hydration은 같은 절대 시각. 단말 시계가 발행보다 느려도 유지한다.
  const time =
    !story.isDemo && now && now >= story.updatedAt
      ? formatRelativeTime(story.updatedAt, now)
      : absolute.text;
  return (
    <article className="editorial-card" data-prominence={prominence}>
      {extra && <div className="editorial-card-extra">{extra}</div>}
      {story.isDemo && (
        <p className="flex flex-wrap items-center gap-2 text-meta">
          <DemoBadge />
        </p>
      )}
      <ul aria-label={TOPICS_LABEL} className="editorial-card-topics">
        {story.topics.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>
      <h3>
        <Link ref={titleRef} href={storyHref ?? `/story/${story.slug}`}>
          {story.title}
        </Link>
      </h3>
      {prominence !== "list" && <LeadImage image={story.image} isDemo={story.isDemo} />}
      {prominence !== "list" && <p className="editorial-card-summary">{story.summary}</p>}
      <div className="editorial-card-meta">
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
