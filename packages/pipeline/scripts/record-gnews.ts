import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { collectGnews, GNEWS_TOPIC_QUERIES, topicKeyOf } from "../src/sources/gnews.ts";
import { recordedGnewsPath } from "../src/sources/gnews-recorded.ts";

/**
 * 실제 GNews 응답을 픽스처로 기록한다(#52 인수 조건 "실제 응답에서 만든 기록 응답 픽스처").
 * 토픽 넷 × 최대 2페이지 = 요청 최대 8회(일 1,000회 한도). 응답의 `articles`는 토픽당 앞 `KEEP`건만 남기고
 * 본문은 자르지 않는다. `apikey`는 기록에서 지운다.
 *
 * 실행: GNEWS_API_KEY 필요. node --env-file=../../.env scripts/record-gnews.ts [previousTo ISO] [slotAt ISO]
 */
const KEEP = 3;

const apiKey = process.env.GNEWS_API_KEY;
if (apiKey === undefined || apiKey === "") {
  console.error("GNEWS_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}

const slotAt = process.argv[3] ? new Date(process.argv[3]) : new Date();
const previousTo = process.argv[2]
  ? new Date(process.argv[2])
  : new Date(slotAt.getTime() - 12 * 60 * 60 * 1000);

const recordingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : input);
  url.searchParams.delete("apikey");
  const topicKey = topicKeyOf(url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const text = await response.text();
  if (topicKey !== undefined && response.ok) {
    const body: { totalArticles: number; articles: unknown[] } = JSON.parse(text);
    const path = recordedGnewsPath(topicKey, page);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          request: { path: url.pathname, params: Object.fromEntries(url.searchParams) },
          status: response.status,
          body: { totalArticles: body.totalArticles, articles: body.articles.slice(0, KEEP) },
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      JSON.stringify({ recorded: `${topicKey}-page${page}`, totalArticles: body.totalArticles }),
    );
  } else {
    console.error(
      JSON.stringify({ topicKey, page, status: response.status, body: text.slice(0, 200) }),
    );
  }
  return new Response(text, { status: response.status, headers: response.headers });
};

const result = await collectGnews({ slotAt, previousTo }, { fetch: recordingFetch, apiKey });
console.log(
  JSON.stringify({
    topics: GNEWS_TOPIC_QUERIES.length,
    requestCount: result.requestCount,
    articles: result.articles.length,
    failures: result.failures,
  }),
);
