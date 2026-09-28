import {
  matchSourceByDomain,
  normalizeArticleUrl,
  properNounsOf,
  type Source,
  sourceHostOf,
} from "@newsplatform/domain";
import { z } from "zod";

/**
 * GDELT DOC 2.0 수집 어댑터(docs/spec/v1.md "데이터 소스와 권리" GDELT, "개발 중 결정 항목" GDELT 수집, #77).
 * 쿼리·창·요청 URL·응답 검증·도메인 매핑·직렬 간격은 여기, HTTP는 주입받은 `fetch`가 한다.
 * 본문은 가져오지 않는다 — 결과는 링크만 기사의 메타데이터(`url`·`title`·`domain`·`language`·`seendate`)뿐이다.
 */
export const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
export const GDELT_MAX_RECORDS = 250;
/** 요청 간 최소 간격(스펙: 5초에 1회를 넘으면 429). */
export const GDELT_MIN_INTERVAL_MS = 6000;
/** 배치당 조회하는 사건 상한. */
export const GDELT_MAX_STORIES_PER_BATCH = 20;
/** 창 시작 = 사건 첫 기사 발행 24시간 전. */
export const GDELT_WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000;
const MIN_TERMS = 2;
const MAX_TERMS = 4;
const MIN_KEYWORD_LENGTH = 3;

/**
 * 대표 기사 제목의 고유명사 2~4개를 AND(공백)로 묶고 `sourcelang:english`를 붙인다. 두 개 미만이면 undefined.
 * GDELT는 세 글자 미만 키워드(`US`, `U.S.`, `Xi`)가 있으면 200으로 "keyword that was too short" 문장을 돌려주므로
 * (2026-09-29 실측) 따옴표로 묶지 않는 한 단어 후보 중 글자가 셋 미만인 것은 뺀다. 공백·하이픈·아포스트로피가 든 후보는
 * 따옴표로 묶는다 — 묶지 않은 `Russia-derived`는 "One or more…" 오류 문장이 온다(같은 날 실측).
 */
export function buildGdeltQuery(title: string): string | undefined {
  const terms = properNounsOf(title)
    .filter((t) => t.includes(" ") || t.replace(/[^\p{L}\p{N}]/gu, "").length >= MIN_KEYWORD_LENGTH)
    .slice(0, MAX_TERMS);
  if (terms.length < MIN_TERMS) return undefined;
  return `${terms.map((t) => (/[^\p{L}\p{N}]/u.test(t) ? `"${t}"` : t)).join(" ")} sourcelang:english`;
}

/** GDELT 시각 형식 `YYYYMMDDHHMMSS`(UTC). */
export function formatGdeltTime(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function gdeltWindow(input: { firstPublishedAt: Date; batchStartedAt: Date }): {
  from: Date;
  to: Date;
} {
  return {
    from: new Date(input.firstPublishedAt.getTime() - GDELT_WINDOW_BEFORE_MS),
    to: input.batchStartedAt,
  };
}

export function buildGdeltRequest(query: string, window: { from: Date; to: Date }): URL {
  const url = new URL(GDELT_DOC_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(GDELT_MAX_RECORDS));
  url.searchParams.set("startdatetime", formatGdeltTime(window.from));
  url.searchParams.set("enddatetime", formatGdeltTime(window.to));
  return url;
}

// ── 응답 스키마(2026-09-29 실측 모양) ─────────────────────────────

/** `seendate`는 `YYYYMMDDTHHMMSSZ`. */
const SEENDATE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export function parseSeendate(raw: string): Date | undefined {
  const m = SEENDATE.exec(raw);
  if (m === null) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y === undefined || mo === undefined || d === undefined) return undefined;
  const date = new Date(Date.UTC(y, mo - 1, d, h ?? 0, mi ?? 0, s ?? 0));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const GdeltArticleSchema = z.looseObject({
  url: z.string(),
  title: z.string(),
  seendate: z.string(),
  domain: z.string(),
  language: z.string(),
});

/** 결과가 없으면 GDELT는 빈 본문을 준다 — `parseGdeltResponse`가 빈 목록으로 읽는다. */
export const GdeltResponseSchema = z.looseObject({
  articles: z.array(GdeltArticleSchema).default([]),
});

export type GdeltResponse = z.infer<typeof GdeltResponseSchema>;

export function parseGdeltResponse(text: string): GdeltResponse {
  return GdeltResponseSchema.parse(text.trim() === "" ? {} : JSON.parse(text));
}

export function sourceIdForDomain(domain: string): string {
  return `gdelt:${domain}`;
}

/** GDELT 결과 한 건을 링크만 기사로 옮긴 것. 정규화 URL은 기존 기사와의 동일성 키다. */
export interface GdeltLink {
  readonly sourceId: string;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly title: string;
  readonly observedAt: Date;
}

export interface MappedGdelt {
  readonly sources: Source[];
  readonly links: GdeltLink[];
  readonly dropped: { nonEnglish: number; excluded: number; invalid: number };
}

/**
 * 순수 매퍼: 응답을 출처와 링크로 바꾼다. 비영어 결과와 출처 표(`registry`, #76)에서 제외된 도메인은 버리고 센다.
 * 도메인이 출처 표에 있으면 그 출처, 없으면 `gdelt:<domain>` 출처(권리 등급 "링크만", 이름 = 도메인, 지역 "미확인",
 * 소유 형태 `unknown`, 언어 `en`). URL이 아니거나 `seendate`를 읽을 수 없으면 버린다. 같은 정규화 URL은 첫 것만 남긴다.
 */
export function mapGdeltArticles(
  response: GdeltResponse,
  registry: readonly Source[] = [],
): MappedGdelt {
  const sources = new Map<string, Source>();
  const links: GdeltLink[] = [];
  const seen = new Set<string>();
  const dropped = { nonEnglish: 0, excluded: 0, invalid: 0 };
  for (const item of response.articles) {
    if (item.language.toLowerCase() !== "english") {
      dropped.nonEnglish++;
      continue;
    }
    const observedAt = parseSeendate(item.seendate);
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeArticleUrl(item.url);
    } catch {
      dropped.invalid++;
      continue;
    }
    if (observedAt === undefined || item.title.trim() === "") {
      dropped.invalid++;
      continue;
    }
    if (seen.has(normalizedUrl)) continue;
    const registered = matchSourceByDomain(item.url, registry);
    if (registered?.isExcluded) {
      dropped.excluded++;
      continue;
    }
    const domain = (item.domain || sourceHostOf(item.url) || "").toLowerCase();
    const sourceId = registered?.id ?? sourceIdForDomain(domain);
    if (!sources.has(sourceId)) {
      sources.set(
        sourceId,
        registered ?? {
          id: sourceId,
          name: domain,
          rightsTier: "링크만",
          region: "미확인",
          ownership: "unknown",
          language: "en",
          isFictional: false,
        },
      );
    }
    seen.add(normalizedUrl);
    links.push({ sourceId, url: item.url, normalizedUrl, title: item.title.trim(), observedAt });
  }
  return { sources: [...sources.values()], links, dropped };
}

// ── 수집 ────────────────────────────────────────────────────────

/** 조회할 사건 하나: 대표 기사(발행 시각·식별자 순 첫 기사)의 제목과 발행 시각. */
export interface GdeltStoryQuery {
  readonly storyId: string;
  readonly title: string;
  readonly firstPublishedAt: Date;
}

export interface CollectGdeltDeps {
  readonly fetch: typeof fetch;
  /** 간격 대기. 기본 `setTimeout`. 테스트는 시계만 옮기는 함수를 준다. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly clock?: () => Date;
}

export interface CollectGdeltResult {
  readonly sources: readonly Source[];
  /** 사건별 링크(요청 순). 결과가 없거나 실패한 사건은 없다. */
  readonly linksByStory: readonly { storyId: string; query: string; links: readonly GdeltLink[] }[];
  readonly requestCount: number;
  readonly dropped: { nonEnglish: number; excluded: number; invalid: number };
  /** 고유명사가 부족해 조회하지 않은 사건 수. */
  readonly skippedNoQuery: number;
  /** 상한(20)에 걸려 조회하지 않은 사건 수. */
  readonly skippedOverCap: number;
  /** 429·오류로 건너뛴 사건. 배치는 실패하지 않는다. */
  readonly failures: readonly { storyId: string; reason: string }[];
}

export class GdeltRequestError extends Error {
  override readonly name = "GdeltRequestError";
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`GDELT ${status}: ${detail}`);
    this.status = status;
  }
}

/**
 * 수집 한 번: 사건을 받은 순서대로 최대 20개, 요청 사이 6초 이상 간격으로 직렬 조회한다. 첫 요청은 기다리지 않는다.
 * 429·오류·검증 실패는 그 사건만 실패로 남기고 다음 사건으로 간다(재시도 없음 — 재시도는 한도만 더 축낸다).
 */
export async function collectGdelt(
  input: {
    readonly stories: readonly GdeltStoryQuery[];
    readonly batchStartedAt: Date;
    readonly registry?: readonly Source[];
  },
  deps: CollectGdeltDeps,
): Promise<CollectGdeltResult> {
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = deps.clock ?? (() => new Date());
  const sources = new Map<string, Source>();
  const linksByStory: { storyId: string; query: string; links: GdeltLink[] }[] = [];
  const failures: { storyId: string; reason: string }[] = [];
  const dropped = { nonEnglish: 0, excluded: 0, invalid: 0 };
  let requestCount = 0;
  let skippedNoQuery = 0;
  let lastRequestAt: number | undefined;

  const stories = input.stories.slice(0, GDELT_MAX_STORIES_PER_BATCH);
  for (const story of stories) {
    const query = buildGdeltQuery(story.title);
    if (query === undefined) {
      skippedNoQuery++;
      continue;
    }
    const url = buildGdeltRequest(
      query,
      gdeltWindow({
        firstPublishedAt: story.firstPublishedAt,
        batchStartedAt: input.batchStartedAt,
      }),
    );
    if (lastRequestAt !== undefined) {
      const wait = GDELT_MIN_INTERVAL_MS - (clock().getTime() - lastRequestAt);
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt = clock().getTime();
    requestCount++;
    let response: GdeltResponse;
    try {
      const raw = await deps.fetch(url);
      const text = await raw.text();
      if (!raw.ok) throw new GdeltRequestError(raw.status, text.slice(0, 200));
      response = parseGdeltResponse(text);
    } catch (error) {
      failures.push({
        storyId: story.storyId,
        // undici의 "fetch failed"는 원인(연결 거부·시간 초과)이 `cause`에 있다.
        reason:
          error instanceof Error
            ? error.cause instanceof Error
              ? `${error.message}: ${error.cause.message}`
              : error.message
            : String(error),
      });
      continue;
    }
    const mapped = mapGdeltArticles(response, input.registry);
    for (const source of mapped.sources) sources.set(source.id, source);
    dropped.nonEnglish += mapped.dropped.nonEnglish;
    dropped.excluded += mapped.dropped.excluded;
    dropped.invalid += mapped.dropped.invalid;
    if (mapped.links.length > 0) {
      linksByStory.push({ storyId: story.storyId, query, links: mapped.links });
    }
  }

  return {
    sources: [...sources.values()],
    linksByStory,
    requestCount,
    dropped,
    skippedNoQuery,
    skippedOverCap: input.stories.length - stories.length,
    failures,
  };
}
