import { type FollowFeedStory, loadFollowedTopics, loadFollowFeed } from "@newstrail/db";
import { TOPICS } from "@newstrail/domain/topic";
import { Check, CircleDot, Plus } from "lucide-react";
import type { Metadata } from "next";
import { type ReactElement, Suspense } from "react";
import { KindLabel } from "../../components/story/change-kind.tsx";
import { StoryCard } from "../../components/today/story-card.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../components/ui/empty.tsx";
import { getCurrentUserId } from "../../lib/auth/server.ts";
import { getRuntimeDb } from "../../lib/db.ts";
import { submitStoryUnfollow, submitTopicFollow } from "../../lib/follow-actions.ts";
import { arrangeFollowFeed, hasChangesSinceSeen } from "../../lib/follow-feed.ts";
import { ACCOUNT_LINK } from "../account/copy.ts";
import { NEXT_UPDATE, TODAY_LABEL } from "../copy.ts";
import {
  CHANGED_SINCE_SEEN,
  FOLLOWED_STORIES,
  FOLLOWED_STORIES_ORDER,
  FOLLOWS_LOGIN,
  FOLLOWS_LOGIN_REQUIRED,
  FOLLOWS_TITLE,
  GO_TODAY,
  NEVER_SEEN,
  NO_FOLLOWED_STORIES,
  NO_FOLLOWED_STORIES_HINT,
  TOPIC_FOLLOWS,
  TOPIC_FOLLOWS_HINT,
  UNFOLLOW,
  unfollowContext,
} from "./copy.ts";

export const metadata: Metadata = { title: FOLLOWS_TITLE };

/** 카드 바닥줄: 읽은 이후 변화 있음·아직 읽지 않음 표기와, 직접 팔로우한 사건의 팔로우 해제. */
function FollowCardExtra({ story }: { story: FollowFeedStory }) {
  return (
    <>
      {hasChangesSinceSeen(story) ? (
        <KindLabel icon={CircleDot}>{CHANGED_SINCE_SEEN}</KindLabel>
      ) : story.lastSeenRevisionNumber === null ? (
        <span className="text-muted-foreground">{NEVER_SEEN}</span>
      ) : null}
      {story.followsStory ? (
        <form action={submitStoryUnfollow}>
          <input type="hidden" name="slug" value={story.slug} />
          <Button type="submit" variant="outline">
            {UNFOLLOW}
            <span className="sr-only">{unfollowContext(story.title)}</span>
          </Button>
        </form>
      ) : null}
    </>
  );
}

function StoryList({ stories, now }: { stories: readonly FollowFeedStory[]; now: Date }) {
  return (
    <ul className="editorial-feed">
      {stories.map((story, index) => (
        <li key={story.id}>
          <StoryCard
            story={story}
            storyHref={`/story/${story.slug}/revision/${encodeURIComponent(story.latestRevisionId)}`}
            now={now}
            prominence={index === 0 ? "lead" : index < 3 ? "secondary" : "list"}
            extra={<FollowCardExtra story={story} />}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * 요청 시점 영역(스펙 "렌더링·캐시": 팔로우는 요청 시점 인증 데이터, 공개 껍데기만 캐시). 현재 사용자 헬퍼로 인증을 검증하고
 * 그 사용자의 행만 읽는다. 익명이면 로그인 안내(돌아올 주소 `/follows`).
 */
async function FollowsBody(): Promise<ReactElement> {
  const userId = await getCurrentUserId();
  if (userId === null) {
    return (
      <>
        <p>{FOLLOWS_LOGIN_REQUIRED}</p>
        <p>
          <a href={`/auth/login?next=${encodeURIComponent("/follows")}`} className="underline">
            {FOLLOWS_LOGIN}
          </a>
        </p>
      </>
    );
  }
  const db = getRuntimeDb().db;
  const [feed, followedTopics] = await Promise.all([
    loadFollowFeed(db, { userId }),
    loadFollowedTopics(db, { userId }),
  ]);
  const { live } = arrangeFollowFeed(feed);
  const now = new Date();
  return (
    <>
      <section aria-labelledby="followed-stories" className="flex flex-col gap-4">
        <h2 id="followed-stories">{FOLLOWED_STORIES}</h2>
        {live.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{NO_FOLLOWED_STORIES}</EmptyTitle>
              <EmptyDescription>{NO_FOLLOWED_STORIES_HINT}</EmptyDescription>
              <EmptyDescription>{NEXT_UPDATE}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <a href="/" className="underline">
                {GO_TODAY}
              </a>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <p className="text-meta text-muted-foreground">{FOLLOWED_STORIES_ORDER}</p>
            <StoryList stories={live} now={now} />
          </>
        )}
      </section>
      <section aria-labelledby="topic-follows" className="flex flex-col gap-4">
        <h2 id="topic-follows">{TOPIC_FOLLOWS}</h2>
        <p className="text-meta text-muted-foreground">{TOPIC_FOLLOWS_HINT}</p>
        <ul className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => {
            const followed = followedTopics.includes(topic);
            return (
              <li key={topic}>
                <form action={submitTopicFollow}>
                  <input type="hidden" name="topic" value={topic} />
                  <input type="hidden" name="follow" value={followed ? "0" : "1"} />
                  <Button
                    type="submit"
                    aria-pressed={followed}
                    variant={followed ? "outline" : "default"}
                  >
                    {followed ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                    {topic}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** 팔로우 화면(로그인). 머리는 공개 껍데기이고 목록은 요청 시점에 스트리밍한다. */
export default function FollowsPage(): ReactElement {
  return (
    <main id="main-content" tabIndex={-1} className="editorial-page follows-page">
      <header className="flex flex-col gap-3">
        <p className="flex gap-4 text-meta">
          <a href="/" className="underline">
            {TODAY_LABEL}
          </a>
          <a href="/account" className="underline">
            {ACCOUNT_LINK}
          </a>
        </p>
        <h1>{FOLLOWS_TITLE}</h1>
        <p className="section-deck">
          한 번 읽고 끝내지 않도록. 관심 있는 사건의 다음 보도와 변화를 이어 읽습니다.
        </p>
      </header>
      <Suspense fallback={<div aria-hidden="true" className="min-h-40" />}>
        <FollowsBody />
      </Suspense>
    </main>
  );
}
