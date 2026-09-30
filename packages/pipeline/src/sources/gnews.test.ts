import { readFileSync } from "node:fs";
import { dedupeExact, type Source } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import {
  buildGnewsRequest,
  buildTitleSearchRequest,
  collectGnews,
  collectionWindow,
  GNEWS_TOPIC_QUERIES,
  GnewsResponseSchema,
  searchByExactTitle,
  toCollected,
} from "./gnews.ts";
import {
  createRecordedGnewsFetch,
  createRecordedRecheckFetch,
  loadRecordedRecheck,
  recordedGnewsPath,
} from "./gnews-recorded.ts";

const registeredSource: Source = {
  id: "other.example",
  name: "Other",
  rightsTier: "본문 처리 + 발췌 표시",
  region: "kr",
  ownership: "private",
  language: "en",
  isFictional: false,
};

const slotAt = new Date("2026-09-27T04:07:03.000Z");
const previousTo = new Date("2026-09-26T16:07:03.000Z");
const window = collectionWindow({ slotAt, previousTo });

function recorded(topicKey: "korea" | "world" | "business" | "technology", page: number) {
  const file: { body: unknown } = JSON.parse(
    readFileSync(recordedGnewsPath(topicKey, page), "utf8"),
  );
  return GnewsResponseSchema.parse(file.body);
}

describe("GNews 요청", () => {
  it("builds GNews request params per topic with page cap of 2", () => {
    const korea = GNEWS_TOPIC_QUERIES[0];
    const world = GNEWS_TOPIC_QUERIES[1];
    if (korea === undefined || world === undefined) throw new Error("토픽 쿼리 없음");

    const search = buildGnewsRequest(korea, window, 1);
    expect(search.pathname).toBe("/api/v4/search");
    expect(search.searchParams.get("q")).toBe(
      '("South Korea" OR "North Korea" OR Seoul OR Pyongyang) NOT "Asian Games" NOT football NOT baseball NOT "K-pop"',
    );
    expect(Object.fromEntries(search.searchParams)).toMatchObject({
      lang: "en",
      max: "25",
      sortby: "publishedAt",
      // from = 직전 수집 to − 1시간, to = 슬롯 시각. 밀리초 없는 UTC.
      from: "2026-09-26T15:07:03Z",
      to: "2026-09-27T04:07:03Z",
      page: "1",
    });
    expect(search.searchParams.has("apikey")).toBe(false);

    const headlines = buildGnewsRequest(world, window, 2);
    expect(headlines.pathname).toBe("/api/v4/top-headlines");
    expect(headlines.searchParams.get("category")).toBe("world");
    expect(headlines.searchParams.get("page")).toBe("2");

    expect(GNEWS_TOPIC_QUERIES.map((q) => q.params.category ?? "search")).toEqual([
      "search",
      "world",
      "business",
      "technology",
    ]);
  });

  it("토픽당 2페이지·배치당 8회를 넘지 않고, 첫 페이지로 끝나는 토픽은 페이지 2를 요청하지 않는다", async () => {
    // 기록: korea는 totalArticles 7(1페이지), 나머지 셋은 100건 넘음(2페이지에서 자름) → 7회.
    const seen: string[] = [];
    const recordedFetch = createRecordedGnewsFetch();
    const result = await collectGnews(
      { slotAt, previousTo },
      {
        apiKey: "test-key",
        fetch: (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input);
          seen.push(
            `${url.searchParams.get("category") ?? "search"}:${url.searchParams.get("page")}`,
          );
          expect(url.searchParams.get("apikey")).toBe("test-key");
          return recordedFetch(input, init);
        },
      },
    );
    expect(seen).toEqual([
      "search:1",
      "world:1",
      "world:2",
      "business:1",
      "business:2",
      "technology:1",
      "technology:2",
    ]);
    expect(result.requestCount).toBe(7);
    expect(result.requestCount).toBeLessThanOrEqual(8);
    expect(result.failures).toEqual([]);
    // 기록 파일마다 3건씩 남겼다.
    expect(result.articles).toHaveLength(21);
    expect(result.articles.every((a) => a.rawBody.length > 0)).toBe(true);
  });

  it("429·5xx는 한 번만 재시도하고 그래도 실패하면 그 토픽만 실패로 남긴다", async () => {
    let calls = 0;
    const recordedFetch = createRecordedGnewsFetch();
    const result = await collectGnews(
      { slotAt, previousTo },
      {
        apiKey: "k",
        retryDelayMs: 0,
        fetch: (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (url.pathname.endsWith("/search")) {
            calls++;
            return Promise.resolve(new Response("rate limited", { status: 429 }));
          }
          return recordedFetch(input, init);
        },
      },
    );
    expect(calls).toBe(2);
    expect(result.failures).toEqual([
      { topic: "한국 관련 해외 보도", page: 1, reason: expect.stringContaining("429") },
    ]);
    expect(result.requestCount).toBe(8);
    expect(result.articles).toHaveLength(18);
  });
});

describe("GNews 응답 매핑", () => {
  it("기록된 응답을 출처(본문 처리 + 발췌 표시)와 수집 기사로 바꾼다", () => {
    const { sources, articles } = toCollected(recorded("korea", 1), "한국 관련 해외 보도");
    expect(articles).toHaveLength(3);
    const first = articles[0];
    const source = sources.find((s) => s.id === first?.sourceId);
    expect(source).toMatchObject({
      rightsTier: "본문 처리 + 발췌 표시",
      ownership: "unknown",
      language: "en",
      isFictional: false,
      externalId: expect.any(String),
    });
    expect(source?.id).toBe(`gnews:${source?.externalId}`);
    expect(first).toMatchObject({
      topics: ["한국 관련 해외 보도"],
      externalId: expect.any(String),
    });
    expect(first?.publishedAt.getTime()).not.toBeNaN();
    expect(first?.rawBody.length).toBeGreaterThan(100);
  });

  it("collect drops articles from excluded sources and reports count", async () => {
    const registered = (id: string, isExcluded: boolean): Source => ({
      id,
      name: id,
      rightsTier: "본문 처리 + 발췌 표시",
      region: "in",
      ownership: "private",
      language: "en",
      isFictional: false,
      domains: [id],
      isExcluded,
    });
    // korea 1페이지: lakeview-times.example, business.meridian-times.example, harbor-post.example 각 1건.
    const registry = [
      registered("lakeview-times.example", true),
      registered("meridian-times.example", false),
    ];
    const mapped = toCollected(recorded("korea", 1), "한국 관련 해외 보도", registry);
    expect(mapped.excluded).toBe(1);
    expect(mapped.articles.map((a) => a.sourceId)).toEqual([
      "meridian-times.example",
      expect.stringMatching(/^gnews:/),
    ]);
    // 등록 출처는 표의 행 그대로다(서브도메인 `business.meridian-times.example`이 `meridian-times.example`에 맞는다).
    expect(mapped.sources.find((s) => s.id === "meridian-times.example")).toEqual(registry[1]);

    const result = await collectGnews(
      { slotAt, previousTo, registry },
      { apiKey: "k", fetch: createRecordedGnewsFetch() },
    );
    expect(result.excludedArticles).toBe(1);
    expect(result.articles).toHaveLength(20);
  });

  it("unregistered GNews source falls back to 미확인 metadata", () => {
    const response = GnewsResponseSchema.parse({
      totalArticles: 1,
      articles: [
        {
          id: "a1",
          title: "Title",
          description: null,
          content: "Body",
          url: "https://www.unknown-paper.example/story",
          publishedAt: "2026-09-27T03:00:00Z",
          source: { id: "src-1", name: "Unknown Paper", url: "https://www.unknown-paper.example" },
        },
      ],
    });
    const { sources, excluded } = toCollected(response, "기술·AI", [
      { ...registeredSource, domains: ["other.example"], isExcluded: true },
    ]);
    expect(excluded).toBe(0);
    expect(sources).toEqual([
      {
        id: "gnews:src-1",
        name: "Unknown Paper",
        rightsTier: "본문 처리 + 발췌 표시",
        region: "미확인",
        ownership: "unknown",
        language: "en",
        isFictional: false,
        externalId: "src-1",
      },
    ]);
  });

  it("같은 기사가 두 토픽 쿼리에서 오면 정확 중복 제거 뒤 토픽 합집합을 가진 기사 하나다", () => {
    const world = toCollected(recorded("world", 1), "국제 정치·외교·안보");
    const asBusiness = toCollected(recorded("world", 1), "세계 경제·금융");
    const deduped = dedupeExact({
      known: [],
      collected: [...world.articles, ...asBusiness.articles],
      capturedAt: slotAt,
    });
    expect(deduped).toHaveLength(3);
    expect(deduped.every((a) => a.topics.length === 2)).toBe(true);
    expect(deduped[0]?.topics).toEqual(["국제 정치·외교·안보", "세계 경제·금융"]);
  });
});

describe("원문 재수집 정확 제목 조회(#86)", () => {
  const found = loadRecordedRecheck("korea-pow-transfer");
  const target = {
    title: "Aldmark outraged by Mensk revealing Veskar POW transfer",
    url: "https://www.capital-ledger.example/news/world/4745534/aldmark-outraged-mensk-revealing-veskar-pow-transfer/",
    publishedAt: new Date("2026-09-28T19:41:58.000Z"),
  };
  const deps = (recorded = found) => ({
    fetch: createRecordedRecheckFetch(recorded),
    apiKey: "test-key",
  });

  it("요청은 /search·in=title·따옴표 제목·발행 ±24시간이고 키가 없다", () => {
    const url = buildTitleSearchRequest({ ...target, title: 'He said "no" today' });
    expect(url.pathname).toBe("/api/v4/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: '"He said no today"',
      in: "title",
      lang: "en",
      max: "10",
      from: "2026-09-27T19:41:58Z",
      to: "2026-09-29T19:41:58Z",
    });
    // 기록된 요청과 같은 모양이다(키는 기록에 없다).
    expect(found.request.params).toEqual(
      Object.fromEntries(buildTitleSearchRequest(target).searchParams),
    );
  });

  it("정규화 URL이 일치하는 결과만 채택하고 없으면 미확인", async () => {
    const hit = await searchByExactTitle(target, deps());
    expect(hit.result.kind).toBe("found");
    expect(hit.requestCount).toBe(1);
    // www·쿼리·끝 / 차이는 같은 기사다(정규화 URL).
    const variant = await searchByExactTitle(
      {
        ...target,
        url: `${target.url.replace("https://www.", "https://").replace(/\/$/, "")}?utm_source=x`,
      },
      deps(),
    );
    expect(variant.result.kind).toBe("found");
    // 제목이 같아도 URL이 다르면 채택하지 않는다.
    const other = await searchByExactTitle({ ...target, url: "https://example.com/other" }, deps());
    expect(other.result).toEqual({ kind: "unconfirmed" });
    // 결과가 0건인 기록된 조회도 미확인이다.
    const empty = await searchByExactTitle(
      {
        title:
          "Marrenland says it will wait for official NU response after Oste rejects Strait of Kessel proposal",
        url: "https://www.northgate-world.example/news/articles/k7r2m4x9qa",
        publishedAt: new Date("2026-09-27T02:16:52.000Z"),
      },
      deps(loadRecordedRecheck("hormuz-bbc-com")),
    );
    expect(empty.result).toEqual({ kind: "unconfirmed" });
  });

  it("요청이 끝내 실패하면 던지지 않고 미확인과 요청 수를 돌려준다", async () => {
    const failing = await searchByExactTitle(target, {
      fetch: async () => new Response("rate limited", { status: 429 }),
      apiKey: "test-key",
      retryDelayMs: 0,
    });
    expect(failing.result).toEqual({ kind: "unconfirmed" });
    expect(failing.requestCount).toBe(2);
    expect(failing.error).toMatch(/429/);
  });
});
