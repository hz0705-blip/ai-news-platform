/** @jsxImportSource react */
import type { TodayStoryCard } from "@newstrail/db";
import { formatRelativeTime } from "@newstrail/domain/relative-time";
import { ArrowUpRight, ScanLine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_TIME, STORY_UPDATED, sourceCount, TOPICS_LABEL } from "../../app/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import { DemoBadge } from "../demo-badge.tsx";
import { StatusBadge } from "../status-badge.tsx";

export function EditorialIllustration() {
  return (
    <figure className="today-illustration">
      <Image src="/images/ai-editorial.png" alt="" fill sizes="(min-width: 1024px) 800px, 100vw" />
      <span className="today-image-label">
        <ScanLine size={16} aria-hidden="true" /> 기술·AI
      </span>
      <figcaption className="today-image-caption">
        AI 생성 일러스트 · 실제 사건 사진 아님
      </figcaption>
    </figure>
  );
}

/** 홈 전용 카드. 팔로우 화면에서 쓰는 StoryCard의 표시·동작은 별도로 유지한다. */
export function EditorialCard({
  story,
  now,
  featured = false,
  titleRef,
}: {
  story: TodayStoryCard;
  now: Date | null;
  featured?: boolean;
  titleRef?: (node: HTMLAnchorElement | null) => void;
}) {
  const absolute = formatAbsolute(story.updatedAt);
  const time =
    !story.isDemo && now && now >= story.updatedAt
      ? formatRelativeTime(story.updatedAt, now)
      : absolute.text;
  return (
    <article className="today-story" data-featured={featured || undefined}>
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
      <p className="today-story-summary line-clamp-2">{story.summary}</p>
      {featured && story.topics.includes("기술·AI") && <EditorialIllustration />}
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
