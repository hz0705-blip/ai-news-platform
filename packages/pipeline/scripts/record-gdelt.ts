import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildGdeltQuery, buildGdeltRequest, gdeltWindow } from "../src/sources/gdelt.ts";
import { recordedGdeltPath } from "../src/sources/gdelt-recorded.ts";

/**
 * 실제 GDELT 응답을 픽스처로 기록한다(#77 "테스트는 기록된 실제 응답을 쓴다"). 요청은 한 번이며 키가 없다.
 * 응답의 `articles`는 앞 `KEEP`건만 남긴다. 5초에 1회를 넘기면 429이므로 연달아 돌리지 않는다.
 *
 * 실행: node scripts/record-gdelt.ts <name> "<대표 기사 제목>" <firstPublishedAt ISO> <batchStartedAt ISO>
 */
const KEEP = 12;

const [name, title, firstPublishedAtRaw, batchStartedAtRaw] = process.argv.slice(2);
if (!name || !title || !firstPublishedAtRaw || !batchStartedAtRaw) {
  console.error(
    "사용법: record-gdelt.ts <name> <title> <firstPublishedAt ISO> <batchStartedAt ISO>",
  );
  process.exit(1);
}

const query = buildGdeltQuery(title);
if (query === undefined) {
  console.error(JSON.stringify({ title, error: "고유명사가 두 개 미만이다" }));
  process.exit(1);
}
const url = buildGdeltRequest(
  query,
  gdeltWindow({
    firstPublishedAt: new Date(firstPublishedAtRaw),
    batchStartedAt: new Date(batchStartedAtRaw),
  }),
);
const response = await fetch(url);
const text = await response.text();
if (!response.ok) {
  console.error(JSON.stringify({ query, status: response.status, body: text.slice(0, 200) }));
  process.exit(1);
}
const body: { articles?: unknown[] } = text.trim() === "" ? {} : JSON.parse(text);
const articles = body.articles ?? [];
const path = recordedGdeltPath(name);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(
  path,
  `${JSON.stringify(
    {
      request: {
        query,
        startdatetime: url.searchParams.get("startdatetime"),
        enddatetime: url.searchParams.get("enddatetime"),
      },
      status: response.status,
      body: { articles: articles.slice(0, KEEP) },
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ recorded: name, query, total: articles.length, kept: KEEP }));
