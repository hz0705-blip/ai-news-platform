import type { Source } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import {
  buildGdeltQuery,
  buildGdeltRequest,
  collectGdelt,
  GDELT_MIN_INTERVAL_MS,
  type GdeltResponse,
  type GdeltStoryQuery,
  gdeltWindow,
  mapGdeltArticles,
  parseGdeltResponse,
} from "./gdelt.ts";
import { readRecordedGdelt } from "./gdelt-recorded.ts";

const TITLE =
  "Iran says it will wait for official US response after Trump rejects Strait of Hormuz proposal";
const firstPublishedAt = new Date("2026-09-27T02:16:52.000Z");
const batchStartedAt = new Date("2026-09-27T08:00:00.000Z");

function recorded(): GdeltResponse {
  const file = readRecordedGdelt("hormuz-proposal");
  if (file === undefined) throw new Error("기록된 GDELT 응답 없음");
  return parseGdeltResponse(JSON.stringify(file.body));
}

describe("GDELT 요청", () => {
  it("buildGdeltQuery picks 2-4 proper nouns and window", () => {
    // `US`처럼 세 글자 미만 키워드는 GDELT가 거부하므로 뺀다.
    expect(buildGdeltQuery(TITLE)).toBe('Iran Trump "Strait of Hormuz" sourcelang:english');
    // 고유명사가 넷을 넘으면 앞 넷, 둘 미만이면 조회하지 않는다.
    expect(buildGdeltQuery("Lee meets Xi, Putin, Modi and Macron in Beijing")).toBe(
      "Lee Putin Modi Macron sourcelang:english",
    );
    expect(buildGdeltQuery("Markets fall as yields rise")).toBeUndefined();
    // 하이픈·아포스트로피가 든 후보는 따옴표로 묶는다.
    expect(buildGdeltQuery("Russia-derived system heads to Algeria")).toBe(
      '"Russia-derived" Algeria sourcelang:english',
    );

    const window = gdeltWindow({ firstPublishedAt, batchStartedAt });
    const url = buildGdeltRequest("Iran US sourcelang:english", window);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.gdeltproject.org/api/v2/doc/doc");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: "Iran US sourcelang:english",
      mode: "artlist",
      format: "json",
      maxrecords: "250",
      // 창 = 사건 첫 기사 발행 24시간 전 ~ 배치 시작.
      startdatetime: "20260926021652",
      enddatetime: "20260927080000",
    });
  });
});

describe("GDELT 응답 매핑", () => {
  it("mapGdeltArticles drops non-English and excluded domains", () => {
    const response = recorded();
    const [first, second, third] = response.articles;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("기록된 결과가 셋 미만");
    }
    const excluded: Source = {
      id: "excluded.example",
      name: "Excluded",
      rightsTier: "링크만",
      region: "kr",
      ownership: "private",
      language: "en",
      isFictional: false,
      domains: [second.domain],
      isExcluded: true,
    };
    const mapped = mapGdeltArticles(
      {
        articles: [
          first,
          { ...first }, // 같은 URL은 한 번만
          second,
          { ...third, language: "Spanish" },
        ],
      },
      [excluded],
    );
    expect(mapped.dropped).toEqual({ nonEnglish: 1, excluded: 1, invalid: 0 });
    expect(mapped.links).toHaveLength(1);
    const link = mapped.links[0];
    // 쓰는 필드는 url·title·domain·language·seendate뿐이다(이미지·톤 무시).
    expect(link).toEqual({
      sourceId: `gdelt:${first.domain}`,
      url: first.url,
      normalizedUrl: expect.any(String),
      title: first.title.trim(),
      observedAt: expect.any(Date),
    });
    expect(Object.keys(link ?? {}).sort()).toEqual(
      ["normalizedUrl", "observedAt", "sourceId", "title", "url"].sort(),
    );
    // 출처 표에 없는 도메인은 `gdelt:<domain>` 출처(링크만, 이름 = 도메인).
    expect(mapped.sources).toEqual([
      expect.objectContaining({
        id: `gdelt:${first.domain}`,
        name: first.domain,
        rightsTier: "링크만",
      }),
    ]);
    // 결과가 없으면 GDELT는 빈 본문을 준다.
    expect(parseGdeltResponse("").articles).toEqual([]);
  });
});

function stories(n: number): GdeltStoryQuery[] {
  return Array.from({ length: n }, (_, i) => ({
    storyId: `s-${i}`,
    title: `Seoul and Tokyo talks round ${i}`,
    firstPublishedAt,
  }));
}

/** 시계는 `sleep`만 옮긴다. `fetch`가 부른 시각을 남긴다. */
function fakeTime() {
  let now = batchStartedAt.getTime();
  const calls: number[] = [];
  return {
    calls,
    clock: () => new Date(now),
    sleep: async (ms: number) => {
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("GDELT 수집", () => {
  it("gdelt stage paces requests >=6s and caps at 20 stories", async () => {
    const time = fakeTime();
    const result = await collectGdelt(
      { stories: stories(22), batchStartedAt },
      {
        clock: time.clock,
        sleep: time.sleep,
        fetch: async () => {
          time.calls.push(time.clock().getTime());
          time.advance(1000); // 응답에 1초
          return new Response("", { status: 200 });
        },
      },
    );
    expect(result.requestCount).toBe(20);
    expect(result.skippedOverCap).toBe(2);
    expect(time.calls).toHaveLength(20);
    for (let i = 1; i < time.calls.length; i++) {
      expect((time.calls[i] ?? 0) - (time.calls[i - 1] ?? 0)).toBeGreaterThanOrEqual(
        GDELT_MIN_INTERVAL_MS,
      );
    }
    // 첫 요청은 기다리지 않는다.
    expect(time.calls[0]).toBe(batchStartedAt.getTime());
  });

  it("gdelt 429 skips the story and is reported", async () => {
    const time = fakeTime();
    const body = readRecordedGdelt("hormuz-proposal")?.body;
    let call = 0;
    const result = await collectGdelt(
      { stories: stories(3), batchStartedAt },
      {
        clock: time.clock,
        sleep: time.sleep,
        fetch: async () => {
          call++;
          if (call === 2) {
            return new Response("Please limit requests to one every 5 seconds", { status: 429 });
          }
          return new Response(JSON.stringify(body), { status: 200 });
        },
      },
    );
    expect(result.requestCount).toBe(3);
    expect(result.failures).toEqual([{ storyId: "s-1", reason: expect.stringContaining("429") }]);
    expect(result.linksByStory.map((s) => s.storyId)).toEqual(["s-0", "s-2"]);
  });
});
