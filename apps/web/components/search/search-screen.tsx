/** @jsxImportSource react */
"use client";

import { formatRelativeTime } from "@newstrail/domain/relative-time";
import { CircleAlert, Gauge, Timer } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { DEMO_NOTICE, DEMO_TIME, STORY_UPDATED, VIEW_DEMO } from "../../app/copy.ts";
import {
  GO_TODAY,
  INVALID_QUERY,
  NEAREST_CLAIMS,
  NO_RESULTS,
  NO_RESULTS_HINT,
  RATE_LIMITED,
  RETRY,
  resultCount,
  retryAfterText,
  SEARCH_BUTTON,
  SEARCH_DEMO_RESULTS,
  SEARCH_FAILED,
  SEARCH_FAILED_DETAIL,
  SEARCH_HINT,
  SEARCH_LABEL,
  SEARCH_LIMIT,
  SEARCH_LIMIT_DETAIL,
  SEARCH_PROMPT,
  SEARCH_RESULTS,
  SEARCH_TITLE,
  SEARCHING,
} from "../../app/search/copy.ts";
import { formatAbsolute } from "../../lib/format-time.ts";
import { SEARCH_PATH, type SearchResponse, type SearchResultStory } from "../../lib/search/api.ts";
import { DemoBadge } from "../demo-badge.tsx";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert.tsx";
import { Button } from "../ui/button.tsx";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty.tsx";

type Outcome =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; stories: readonly SearchResultStory[] }
  | { kind: "rate-limited"; retryAfter: number | null }
  | { kind: "search-limit" }
  | { kind: "invalid" }
  | { kind: "error" };

async function runSearch(query: string): Promise<Outcome> {
  try {
    const response = await fetch(SEARCH_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const body = (await response.json().catch(() => null)) as SearchResponse | null;
    if (response.ok && body?.state === "ok") return { kind: "ok", stories: body.stories };
    if (body?.state === "search-limit") return { kind: "search-limit" };
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      return { kind: "rate-limited", retryAfter: header === null ? null : Number(header) };
    }
    if (body?.state === "invalid") return { kind: "invalid" };
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

function ResultCard({
  story,
  now,
  index,
}: {
  story: SearchResultStory;
  now: Date | null;
  index: number;
}) {
  const updatedAt = new Date(story.updatedAt);
  const absolute = formatAbsolute(updatedAt);
  // 목록 카드는 상대 시각, 데모는 고정 기준 시각이라 절대 시각(오늘 카드와 같다).
  const time =
    !story.isDemo && now && now >= updatedAt ? formatRelativeTime(updatedAt, now) : absolute.text;
  return (
    <article
      className="editorial-card"
      data-prominence={index === 0 ? "lead" : index < 3 ? "secondary" : "list"}
    >
      {story.isDemo && (
        <p className="flex flex-wrap items-center gap-2 text-meta">
          <DemoBadge />
        </p>
      )}
      <h3>
        <Link href={`/story/${story.slug}`}>{story.title}</Link>
      </h3>
      {story.claims.length > 0 && (
        <div className="search-matches">
          <p>{NEAREST_CLAIMS}</p>
          <ul aria-label={NEAREST_CLAIMS}>
            {story.claims.map((claim) => (
              <li key={claim.claimId}>{claim.text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="editorial-card-meta">
        <span>
          {story.isDemo ? DEMO_TIME : STORY_UPDATED}{" "}
          <time dateTime={absolute.dateTime}>{time}</time>
        </span>
      </div>
    </article>
  );
}

function ResultList({ stories, now }: { stories: readonly SearchResultStory[]; now: Date | null }) {
  return (
    <ul className="editorial-feed">
      {stories.map((story, index) => (
        <li key={story.slug}>
          <ResultCard story={story} now={now} index={index} />
        </li>
      ))}
    </ul>
  );
}

/**
 * 검색 화면(#126). 질의는 `?q=`로 공유되고, 실행 경로 `POST /api/search`는 같은 출처 브라우저 요청만 받는다.
 * 데모 결과는 라이브 순위와 섞지 않고 별도 구획에 둔다(스펙 "화면과 경험").
 */
export function SearchScreen({
  initialQuery,
  now: fixedNow,
}: {
  initialQuery: string;
  now?: Date;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery.trim());
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [clock, setClock] = useState<Date | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (fixedNow) return;
    setClock(new Date());
    const timer = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [fixedNow]);
  const now = fixedNow ?? clock;

  async function search(raw: string) {
    const trimmed = raw.trim();
    setSubmitted(trimmed);
    const request = ++latest.current;
    if (trimmed === "") {
      setOutcome({ kind: "idle" });
      return;
    }
    setOutcome({ kind: "loading" });
    const result = await runSearch(trimmed);
    // 늦게 도착한 이전 질의의 응답은 버린다.
    if (request === latest.current) setOutcome(result);
  }

  // 공유된 `?q=` 주소로 들어오면 바로 검색한다. 마운트 때 한 번만.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 첫 질의만 자동 실행한다.
  useEffect(() => {
    if (initialQuery.trim() !== "") void search(initialQuery);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const url = trimmed === "" ? "/search" : `/search?q=${encodeURIComponent(trimmed)}`;
    window.history.replaceState(null, "", url);
    void search(query);
  }

  const live = outcome.kind === "ok" ? outcome.stories.filter((story) => !story.isDemo) : [];
  const demo = outcome.kind === "ok" ? outcome.stories.filter((story) => story.isDemo) : [];

  return (
    <main id="main-content" tabIndex={-1} className="editorial-page search-page">
      <header className="flex flex-col gap-3">
        <p className="text-meta">
          <a href="/" className="underline">
            {GO_TODAY}
          </a>
        </p>
        <h1>{SEARCH_TITLE}</h1>
        <p className="section-deck">{SEARCH_HINT}</p>
      </header>
      <search>
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3"
          aria-busy={outcome.kind === "loading"}
        >
          <label htmlFor="search-query" className="font-semibold">
            {SEARCH_LABEL}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="search-query"
              name="q"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              aria-invalid={outcome.kind === "invalid" || undefined}
              aria-describedby="search-feedback"
              className="min-w-0 flex-1 basis-60 rounded-md border border-input bg-background px-3 py-2 text-body text-foreground"
            />
            <Button type="submit" disabled={outcome.kind === "loading"}>
              {outcome.kind === "loading" ? SEARCHING : SEARCH_BUTTON}
            </Button>
          </div>
          {/* 진행·결과 수·실패는 입력 바로 아래에서 한 번만 알린다. */}
          <div id="search-feedback" aria-live="polite" className="flex flex-col gap-3">
            {outcome.kind === "loading" && <p className="text-meta">{SEARCHING}</p>}
            {outcome.kind === "ok" && (
              <p className="text-meta text-muted-foreground">
                {resultCount(live.length, demo.length)}
              </p>
            )}
            {outcome.kind === "rate-limited" && (
              <Alert data-search-state="rate-limited">
                <Timer aria-hidden="true" />
                <AlertTitle>{RATE_LIMITED}</AlertTitle>
                <AlertDescription>{retryAfterText(outcome.retryAfter)}</AlertDescription>
              </Alert>
            )}
            {outcome.kind === "search-limit" && (
              <Alert data-search-state="search-limit">
                <Gauge aria-hidden="true" />
                <AlertTitle>{SEARCH_LIMIT}</AlertTitle>
                <AlertDescription>{SEARCH_LIMIT_DETAIL}</AlertDescription>
              </Alert>
            )}
            {outcome.kind === "invalid" && (
              <Alert data-search-state="invalid">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>{INVALID_QUERY}</AlertTitle>
              </Alert>
            )}
            {outcome.kind === "error" && (
              <Alert data-search-state="error">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>{SEARCH_FAILED}</AlertTitle>
                <AlertDescription>{SEARCH_FAILED_DETAIL}</AlertDescription>
                <div className="col-start-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => void search(submitted)}>
                    {RETRY}
                  </Button>
                </div>
              </Alert>
            )}
          </div>
        </form>
      </search>
      {outcome.kind === "idle" && <p className="text-muted-foreground">{SEARCH_PROMPT}</p>}
      {outcome.kind === "ok" && (
        <>
          <section aria-labelledby="search-results" className="flex flex-col gap-4">
            <h2 id="search-results">{SEARCH_RESULTS}</h2>
            {live.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{NO_RESULTS}</EmptyTitle>
                  <EmptyDescription>{NO_RESULTS_HINT}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <a href={demo.length > 0 ? "#search-demo-results" : "/#demo-stories"}>
                    {VIEW_DEMO}
                  </a>
                </EmptyContent>
              </Empty>
            ) : (
              <ResultList stories={live} now={now} />
            )}
          </section>
          {demo.length > 0 && (
            <section aria-labelledby="search-demo-results" className="flex flex-col gap-4">
              <h2 id="search-demo-results">{SEARCH_DEMO_RESULTS}</h2>
              <p className="text-meta text-muted-foreground">{DEMO_NOTICE}</p>
              <ResultList stories={demo} now={now} />
            </section>
          )}
        </>
      )}
    </main>
  );
}
