/** @jsxImportSource react */
"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { TodayData } from "@newstrail/db";
import { TOPICS } from "@newstrail/domain/topic";
import { Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  LATEST_STORIES,
  MORE,
  NEXT_UPDATE,
  NO_STORIES,
  SEARCH_LINK,
  storyCount,
  TOPICS_LABEL,
} from "../../app/copy.ts";
import { Button } from "../ui/button.tsx";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty.tsx";
import { EditorialCard, EditorialSectionHeading } from "./editorial-card.tsx";
import { TodayHeader } from "./today-header.tsx";
import { TodayOverview } from "./today-overview.tsx";

const PAGE_SIZE = 8;

export function TodayScreen({
  live,
  now: fixedNow,
  operationalNotice,
}: {
  live: TodayData;
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
  const published = live.stories.filter((story) => !story.isDemo);
  const multiSource = published.filter((story) => story.sourceCount >= 2).slice(0, 4);
  const stories = published.filter(
    (story) => selected.length === 0 || story.topics.some((topic) => selected.includes(topic)),
  );
  function selectTopics(topics: string[]) {
    setSelected(topics);
    setVisibleCount(PAGE_SIZE);
    nextFocus.current = null;
  }
  return (
    <main className="today-page" id="main-content" tabIndex={-1}>
      <TodayHeader lastUpdated={live.lastUpdated} operationalNotice={operationalNotice} />
      <div className="today-toolbar">
        <div className="today-topic-controls">
          <button
            type="button"
            className="today-topic-filter today-all"
            aria-pressed={selected.length === 0}
            onClick={() => selectTopics([])}
          >
            전체 사건 <span>{published.length}건</span>
          </button>
          <ToggleGroup
            aria-label={TOPICS_LABEL}
            multiple={false}
            value={selected}
            onValueChange={selectTopics}
            className="today-topics"
          >
            {TOPICS.map((topic) => {
              const count = published.filter((story) => story.topics.includes(topic)).length;
              return (
                <Toggle
                  key={topic}
                  value={topic}
                  className="today-topic-filter"
                  aria-label={`${topic} ${storyCount(count)}`}
                >
                  {topic}
                  <span aria-hidden="true">{count}</span>
                </Toggle>
              );
            })}
          </ToggleGroup>
        </div>
        <search aria-label={SEARCH_LINK} className="today-search">
          <form
            aria-label={SEARCH_LINK}
            action="/search"
            method="get"
            className="today-search-form"
          >
            <label htmlFor="today-search-query" className="today-search-label">
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
      <div className="today-editorial">
        <div className="today-content-column">
          <section aria-labelledby="latest-stories">
            <EditorialSectionHeading
              id="latest-stories"
              detail={`${selected[0] ?? "전체 토픽"} · ${storyCount(stories.length)} · 사건 갱신 시각 순`}
            >
              {LATEST_STORIES}
            </EditorialSectionHeading>
            {stories.length === 0 ? (
              <Empty className="my-6">
                <EmptyHeader>
                  <EmptyTitle>{NO_STORIES}</EmptyTitle>
                  <EmptyDescription>{NEXT_UPDATE}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <a href="/search">{SEARCH_LINK}</a>
                </EmptyContent>
              </Empty>
            ) : (
              <>
                <ul className="today-story-grid">
                  {stories.slice(0, visibleCount).map((story, index) => (
                    <li
                      key={story.id}
                      className={
                        index === 0
                          ? "today-lead"
                          : index < 3
                            ? "today-secondary"
                            : "today-list-item"
                      }
                    >
                      <EditorialCard
                        story={story}
                        now={now}
                        featured={index === 0}
                        compact={index >= 3}
                        withImage={index === 1 || index === 2}
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
        </div>
        <TodayOverview stories={published} />
      </div>
      {multiSource.length > 0 && (
        <section aria-labelledby="multi-source-stories" className="today-multi-source">
          <EditorialSectionHeading
            id="multi-source-stories"
            detail="출처 2곳 이상의 보도를 함께 읽어보세요."
          >
            여러 출처로 읽는 사건
          </EditorialSectionHeading>
          <ul className="today-multi-source-grid">
            {multiSource.map((story, index) => (
              <li key={story.id}>
                <p className="today-multi-source-index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <EditorialCard story={story} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
