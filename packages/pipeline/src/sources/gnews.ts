import type { CollectedArticle, Source, Topic } from "@newsplatform/domain";
import { z } from "zod";

/**
 * GNews Essential 수집 어댑터(docs/spec/v1.md "데이터 소스와 권리", "개발 중 결정 항목"
 * 토픽→GNews 쿼리와 다중 토픽). 요청 파라미터·페이지 상한·창 계산·응답 검증·도메인 매핑은 여기,
 * HTTP는 주입받은 `fetch`가 한다. 사건 배정은 하지 않는다(#53).
 */
export const GNEWS_BASE_URL = "https://gnews.io/api/v4";
export const GNEWS_PAGE_SIZE = 25;
export const GNEWS_MAX_PAGES_PER_TOPIC = 2;
/** `from` = 직전 성공 수집의 `to` − 1시간. 겹침은 정확 중복 제거가 흡수한다. */
export const GNEWS_OVERLAP_MS = 60 * 60 * 1000;

export type GnewsTopicKey = "korea" | "world" | "business" | "technology";

export interface GnewsTopicQuery {
  readonly key: GnewsTopicKey;
  readonly topic: Topic;
  readonly endpoint: "search" | "top-headlines";
  readonly params: Readonly<Record<string, string>>;
}

/** 토픽 넷의 쿼리. 스펙 줄 그대로다(`NOT (…)` 묶음은 GNews가 거부하므로 항목마다 `NOT`). */
export const GNEWS_TOPIC_QUERIES: readonly GnewsTopicQuery[] = [
  {
    key: "korea",
    topic: "한국 관련 해외 보도",
    endpoint: "search",
    params: {
      q: '("South Korea" OR "North Korea" OR Seoul OR Pyongyang) NOT "Asian Games" NOT football NOT baseball NOT "K-pop"',
    },
  },
  {
    key: "world",
    topic: "국제 정치·외교·안보",
    endpoint: "top-headlines",
    params: { category: "world" },
  },
  {
    key: "business",
    topic: "세계 경제·금융",
    endpoint: "top-headlines",
    params: { category: "business" },
  },
  {
    key: "technology",
    topic: "기술·AI",
    endpoint: "top-headlines",
    params: { category: "technology" },
  },
];

/** GNews `from`/`to` 형식: 초 단위 UTC, 밀리초 없음. */
export function formatGnewsTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function collectionWindow(input: { slotAt: Date; previousTo: Date }): {
  from: Date;
  to: Date;
} {
  return { from: new Date(input.previousTo.getTime() - GNEWS_OVERLAP_MS), to: input.slotAt };
}

/** 요청 URL(API 키 없음). 키는 `collectGnews`가 호출 직전에만 붙인다. */
export function buildGnewsRequest(
  query: GnewsTopicQuery,
  window: { from: Date; to: Date },
  page: number,
): URL {
  const url = new URL(`${GNEWS_BASE_URL}/${query.endpoint}`);
  for (const [name, value] of Object.entries(query.params)) url.searchParams.set(name, value);
  url.searchParams.set("lang", "en");
  url.searchParams.set("max", String(GNEWS_PAGE_SIZE));
  url.searchParams.set("sortby", "publishedAt");
  url.searchParams.set("from", formatGnewsTime(window.from));
  url.searchParams.set("to", formatGnewsTime(window.to));
  url.searchParams.set("page", String(page));
  return url;
}

/** 요청 URL에서 토픽 키를 되찾는다(기록된 응답 조회용). */
export function topicKeyOf(url: URL): GnewsTopicKey | undefined {
  if (url.pathname.endsWith("/search")) return "korea";
  const category = url.searchParams.get("category");
  return GNEWS_TOPIC_QUERIES.find((q) => q.params.category === category)?.key;
}

// ── 응답 스키마(2026-09-27 실측 모양) ─────────────────────────────

const GnewsSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string(),
  country: z.string().optional(),
});

const GnewsArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  content: z.string(),
  url: z.string().url(),
  publishedAt: z.iso.datetime({ offset: true }),
  source: GnewsSourceSchema,
});

export const GnewsResponseSchema = z.object({
  totalArticles: z.number().int().nonnegative(),
  articles: z.array(GnewsArticleSchema),
});

export type GnewsResponse = z.infer<typeof GnewsResponseSchema>;

export function sourceIdFor(gnewsSourceId: string): string {
  return `gnews:${gnewsSourceId}`;
}

/**
 * 순수 매퍼: 응답 한 페이지를 출처와 수집 기사로 바꾼다. 권리 등급은 GNews Essential 계약대로
 * "본문 처리 + 발췌 표시", 지역은 GNews `country`, 소유 형태는 알 수 없고(리서치 대기 #9) 언어는 영어다.
 */
export function toCollected(
  response: GnewsResponse,
  topic: Topic,
): { sources: Source[]; articles: CollectedArticle[] } {
  const sources = new Map<string, Source>();
  const articles: CollectedArticle[] = [];
  for (const item of response.articles) {
    const sourceId = sourceIdFor(item.source.id);
    if (!sources.has(sourceId)) {
      sources.set(sourceId, {
        id: sourceId,
        name: item.source.name,
        rightsTier: "본문 처리 + 발췌 표시",
        region: item.source.country ?? "불명",
        ownership: "불명",
        language: "영어",
        isFictional: false,
        externalId: item.source.id,
      });
    }
    articles.push({
      sourceId,
      externalId: item.id,
      url: item.url,
      title: item.title,
      description: item.description ?? "",
      publishedAt: new Date(item.publishedAt),
      topics: [topic],
      rawBody: item.content,
    });
  }
  return { sources: [...sources.values()], articles };
}

// ── 수집 ────────────────────────────────────────────────────────

export interface CollectGnewsDeps {
  readonly fetch: typeof fetch;
  readonly apiKey: string;
  /** 재시도 전 대기(기본 2초). 테스트는 0. */
  readonly retryDelayMs?: number;
}

export interface CollectGnewsResult {
  readonly sources: readonly Source[];
  readonly articles: readonly CollectedArticle[];
  /** 재시도를 포함해 실제로 보낸 요청 수. */
  readonly requestCount: number;
  /** 재시도 뒤에도 실패한 토픽·페이지. 나머지 토픽의 기사는 그대로 돌려준다. */
  readonly failures: readonly { topic: Topic; page: number; reason: string }[];
}

export class GnewsRequestError extends Error {
  override readonly name = "GnewsRequestError";
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`GNews ${status}: ${detail}`);
    this.status = status;
  }
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;

/** 요청 1회. 429·5xx·네트워크 오류는 한 번만 재시도한다(그 이상은 일 1,000회 한도만 축낸다). */
async function requestPage(
  url: URL,
  deps: CollectGnewsDeps,
  count: { requests: number },
): Promise<GnewsResponse> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, deps.retryDelayMs ?? 2000));
    }
    count.requests++;
    const withKey = new URL(url);
    withKey.searchParams.set("apikey", deps.apiKey);
    try {
      const response = await deps.fetch(withKey);
      if (!response.ok) {
        const error = new GnewsRequestError(response.status, (await response.text()).slice(0, 200));
        if (!RETRYABLE(response.status)) throw error;
        lastError = error;
        continue;
      }
      return GnewsResponseSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof GnewsRequestError || error instanceof z.ZodError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("GNews 요청 실패");
}

/**
 * 수집 한 번: 토픽 넷을 창 `[from, to]`로 조회한다. 토픽당 최대 2페이지, 배치당 요청 8회 이하
 * (재시도 제외). 페이지 2는 `totalArticles`가 첫 페이지를 넘을 때만 요청한다.
 */
export async function collectGnews(
  input: { slotAt: Date; previousTo: Date },
  deps: CollectGnewsDeps,
): Promise<CollectGnewsResult> {
  const window = collectionWindow(input);
  const count = { requests: 0 };
  const sources = new Map<string, Source>();
  const articles: CollectedArticle[] = [];
  const failures: { topic: Topic; page: number; reason: string }[] = [];

  for (const query of GNEWS_TOPIC_QUERIES) {
    for (let page = 1; page <= GNEWS_MAX_PAGES_PER_TOPIC; page++) {
      let response: GnewsResponse;
      try {
        response = await requestPage(buildGnewsRequest(query, window, page), deps, count);
      } catch (error) {
        failures.push({
          topic: query.topic,
          page,
          reason: error instanceof Error ? error.message : String(error),
        });
        break;
      }
      const mapped = toCollected(response, query.topic);
      for (const source of mapped.sources) sources.set(source.id, source);
      articles.push(...mapped.articles);
      if (response.totalArticles <= page * GNEWS_PAGE_SIZE) break;
    }
  }

  return { sources: [...sources.values()], articles, requestCount: count.requests, failures };
}
