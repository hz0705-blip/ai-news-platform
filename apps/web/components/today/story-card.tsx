/** @jsxImportSource react */
import type { TodayStoryCard } from "@newsplatform/db";
import { formatRelativeTime } from "@newsplatform/domain/relative-time";
import Link from "next/link";
import {
  DEMO_NOTICE,
  DEMO_TIME,
  STORY_UPDATED,
  sourceCount,
  TOPICS_LABEL,
} from "../../app/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import { DemoBadge } from "../demo-badge.tsx";
import { StatusBadge } from "../status-badge.tsx";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../ui/card.tsx";

export function StoryCard({
  story,
  now,
  titleRef,
}: {
  story: TodayStoryCard;
  now: Date | null;
  titleRef?: (node: HTMLAnchorElement | null) => void;
}) {
  const absolute = formatAbsolute(story.updatedAt);
  // SSR과 첫 hydration은 같은 절대 시각. 단말 시계가 발행보다 느려도 유지한다.
  const time =
    !story.isDemo && now && now >= story.updatedAt
      ? formatRelativeTime(story.updatedAt, now)
      : absolute.text;
  return (
    <Card>
      <CardHeader>
        {story.isDemo && (
          <p className="flex flex-wrap items-center gap-2 text-meta">
            <DemoBadge />
            <span>{DEMO_NOTICE}</span>
          </p>
        )}
        <ul
          aria-label={TOPICS_LABEL}
          className="flex flex-wrap gap-2 text-meta text-muted-foreground"
        >
          {story.topics.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
        <CardTitle>
          <Link ref={titleRef} href={`/story/${story.slug}`}>
            {story.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-2">{story.summary}</p>
      </CardContent>
      <CardFooter>
        <StatusBadge status={story.status} />
        <span>{sourceCount(story.sourceCount)}</span>
        <span>
          {story.isDemo ? DEMO_TIME : STORY_UPDATED}{" "}
          <time dateTime={absolute.dateTime}>{time}</time>
        </span>
      </CardFooter>
    </Card>
  );
}
