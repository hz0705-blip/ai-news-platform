import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildTitleSearchRequest,
  pickRecheckMatch,
  searchByExactTitle,
} from "../src/sources/gnews.ts";
import { recordedRecheckPath } from "../src/sources/gnews-recorded.ts";

/**
 * 실제 GNews 정확 제목 조회 응답을 재수집 픽스처로 기록한다(#86). 요청 1회(재시도 포함 최대 2회).
 * 응답의 `articles`는 URL이 일치한 기사와 앞 `KEEP`건만 남기고 `apikey`는 기록에서 지운다.
 *
 * 실행: GNEWS_API_KEY 필요. node --env-file=../../.env scripts/record-gnews-recheck.ts <이름> <제목> <URL> <발행 ISO>
 */
const KEEP = 2;

const apiKey = process.env.GNEWS_API_KEY;
const [name, title, url, publishedAt] = process.argv.slice(2);
if (apiKey === undefined || apiKey === "") {
  console.error("GNEWS_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
if (name === undefined || title === undefined || url === undefined || publishedAt === undefined) {
  console.error("사용: record-gnews-recheck.ts <이름> <제목> <URL> <발행 ISO>");
  process.exit(1);
}
const target = { title, url, publishedAt: new Date(publishedAt) };

const recordingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const text = await response.text();
  if (response.ok) {
    const body: { totalArticles: number; articles: { url: string }[] } = JSON.parse(text);
    const request = buildTitleSearchRequest(target);
    const matched = pickRecheckMatch(
      // 기록 전 판정은 URL만 본다 — 스키마 검증은 리플레이가 한다.
      body as Parameters<typeof pickRecheckMatch>[0],
      target,
    );
    const kept = body.articles.filter(
      (a, i) => i < KEEP || (matched.kind === "found" && a.url === matched.article.url),
    );
    const path = recordedRecheckPath(name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          request: { path: request.pathname, params: Object.fromEntries(request.searchParams) },
          status: response.status,
          body: { totalArticles: body.totalArticles, articles: kept },
        },
        null,
        2,
      )}\n`,
    );
  } else {
    console.error(JSON.stringify({ status: response.status, body: text.slice(0, 200) }));
  }
  return new Response(text, { status: response.status, headers: response.headers });
};

const { result, requestCount, error } = await searchByExactTitle(target, {
  fetch: recordingFetch,
  apiKey,
});
console.log(JSON.stringify({ name, result: result.kind, requestCount, error }));
