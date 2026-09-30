/** @jsxImportSource react */
"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { TodayData } from "@newstrail/db";
import { TOPICS } from "@newstrail/domain/topic";
import { Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  DEMO_NOTICE,
  DEMO_STORIES,
  LATEST_STORIES,
  MORE,
  NEXT_UPDATE,
  NO_STORIES,
  SEARCH_LINK,
  storyCount,
  TOPICS_LABEL,
  VIEW_DEMO,
} from "../../app/copy.ts";
import { Button } from "../ui/button.tsx";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty.tsx";
import { EditorialCard, EditorialSectionHeading } from "./editorial-card.tsx";
import { TodayHeader } from "./today-header.tsx";
import { TodayOverview } from "./today-overview.tsx";

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
  function selectTopics(topics: string[]) {
    setSelected(topics);
    setVisibleCount(PAGE_SIZE);
    nextFocus.current = null;
  }
  return (
    <main className="today-page" id="today-content">
      <TodayHeader lastUpdated={live.lastUpdated} operationalNotice={operationalNotice} />
      <div className="today-toolbar">
        <div className="today-topic-controls">
          <button
            type="button"
            className="today-topic-filter today-all"
            aria-pressed={selected.length === 0}
            onClick={() => selectTopics([])}
          >
            전체 사건 <span>{live.stories.length}건</span>
          </button>
          <ToggleGroup
            aria-label={TOPICS_LABEL}
            multiple={false}
            value={selected}
            onValueChange={selectTopics}
            className="today-topics"
          >
            {TOPICS.map((topic) => (
              <Toggle key={topic} value={topic} className="today-topic-filter">
                {topic}
                <span>
                  {storyCount(live.stories.filter((story) => story.topics.includes(topic)).length)}
                </span>
              </Toggle>
            ))}
          </ToggleGroup>
        </div>
        <search aria-label={SEARCH_LINK} className="today-search">
          <form
            aria-label={SEARCH_LINK}
            action="/search"
            method="get"
            className="today-search-form"
          >
            <label htmlFor="today-search-query" className="sr-only">
              검색어
            </label>
            <input
              id="today-search-query"
              type="search"
              name="q"
              placeholder="사건이나 키워드 검색"
              required
              className="today-search-input"
            />
            <button type="submit" aria-label={SEARCH_LINK} className="today-search-submit">
              <Search size={20} aria-hidden="true" />
            </button>
          </form>
        </search>
      </div>
      <div className="today-results">
        <p>
          {selected[0] ?? "전체 토픽"} · {storyCount(stories.length)}
        </p>
        <p>사건 갱신 시각 순</p>
      </div>
      <div className="today-editorial">
        <div className="today-content-column">
          <section aria-labelledby="latest-stories">
            <EditorialSectionHeading id="latest-stories" detail="발행된 사건">
              {LATEST_STORIES}
            </EditorialSectionHeading>
            {stories.length === 0 ? (
              <Empty className="my-6">
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
                <ul className="today-story-grid">
                  {stories.slice(0, visibleCount).map((story, index) => (
                    <li key={story.id} className={index === 0 ? "today-lead" : undefined}>
                      <EditorialCard
                        story={story}
                        now={now}
                        featured={index === 0}
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
                    className="mt-6"
                    variant="outline"
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
          <section aria-labelledby="demo-stories" className="today-demos">
            <EditorialSectionHeading id="demo-stories" detail={DEMO_NOTICE}>
              {DEMO_STORIES}
            </EditorialSectionHeading>
            <ul className="today-story-grid">
              {demo.stories.map((story) => (
                <li key={story.id}>
                  <EditorialCard story={story} now={now} />
                </li>
              ))}
            </ul>
          </section>
        </div>
        <TodayOverview stories={live.stories} />
      </div>
    </main>
  );
}
