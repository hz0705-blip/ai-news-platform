/** @jsxImportSource react */
"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { TodayData } from "@newsplatform/db";
import { TOPICS } from "@newsplatform/domain/topic";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  DEMO_STORIES,
  LAST_UPDATED,
  LATEST_STORIES,
  MORE,
  NEVER_PUBLISHED,
  NEXT_UPDATE,
  NO_STORIES,
  SCREEN_TITLE,
  storyCount,
  TODAY_LABEL,
  TOPICS_LABEL,
  VIEW_DEMO,
} from "../../app/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import { Button } from "../ui/button.tsx";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty.tsx";
import { StoryCard } from "./story-card.tsx";

const PAGE_SIZE = 8;

export function TodayScreen({
  live,
  demo,
  now: fixedNow,
  operationalNotice,
}: {
  live: TodayData;
  demo: TodayData;
  now?: Date;
  operationalNotice?: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [clock, setClock] = useState<Date | null>(null);
  const nextFocus = useRef<string | null>(null);
  useEffect(() => {
    if (fixedNow) return;
    setClock(new Date());
    const timer = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [fixedNow]);
  const now = fixedNow ?? clock;
  const stories = live.stories.filter(
    (story) => selected.length === 0 || story.topics.some((topic) => selected.includes(topic)),
  );
  const updated = live.lastUpdated ? formatAbsolute(live.lastUpdated) : null;
  return (
    <main className="mx-auto flex max-w-[76rem] flex-col gap-8 px-4 py-12 lg:px-6">
      <header className="flex flex-col gap-3">
        <p className="text-meta text-muted-foreground">{TODAY_LABEL}</p>
        <h1>{SCREEN_TITLE}</h1>
        <p className="text-meta text-muted-foreground">
          {updated ? (
            <>
              {LAST_UPDATED} <time dateTime={updated.dateTime}>{updated.text}</time>
            </>
          ) : (
            NEVER_PUBLISHED
          )}
        </p>
        <p className="text-meta text-muted-foreground">{NEXT_UPDATE}</p>
        {operationalNotice}
      </header>
      <ToggleGroup
        aria-label={TOPICS_LABEL}
        multiple={false}
        value={selected}
        onValueChange={(value) => {
          setSelected(value);
          setVisibleCount(PAGE_SIZE);
        }}
        className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2"
      >
        {TOPICS.map((topic) => {
          const members = live.stories.filter((story) => story.topics.includes(topic));
          return (
            <Toggle
              key={topic}
              value={topic}
              className="flex min-w-0 flex-col items-start gap-2 rounded-md border border-input bg-card p-4 text-left text-card-foreground data-pressed:bg-primary data-pressed:text-primary-foreground"
            >
              <span className="text-card-title font-semibold">{topic}</span>
              <span className="text-meta">{storyCount(members.length)}</span>
              <span>{members[0]?.title ?? NO_STORIES}</span>
            </Toggle>
          );
        })}
      </ToggleGroup>
      <section aria-labelledby="latest-stories" className="flex flex-col gap-4">
        <h2 id="latest-stories">{LATEST_STORIES}</h2>
        {stories.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{NO_STORIES}</EmptyTitle>
              <EmptyDescription>{NEXT_UPDATE}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <a href="#demo-stories">{VIEW_DEMO}</a>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ul className="flex flex-col gap-4">
              {stories.slice(0, visibleCount).map((story) => (
                <li key={story.id}>
                  <StoryCard
                    story={story}
                    now={now}
                    titleRef={(node) => {
                      if (node && nextFocus.current === story.id) {
                        node.focus();
                        nextFocus.current = null;
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
            {visibleCount < stories.length && (
              <Button
                className="self-start"
                onClick={() => {
                  nextFocus.current = stories[visibleCount]?.id ?? null;
                  setVisibleCount((count) => count + PAGE_SIZE);
                }}
              >
                {MORE}
              </Button>
            )}
          </>
        )}
      </section>
      <section aria-labelledby="demo-stories" className="flex flex-col gap-4">
        <h2 id="demo-stories">{DEMO_STORIES}</h2>
        <ul className="flex flex-col gap-4">
          {demo.stories.map((story) => (
            <li key={story.id}>
              <StoryCard story={story} now={now} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
