import { readSourceRegistryFile, SOURCES_FILE_PATH } from "../src/sources-file.ts";
import {
  buildWikidataQuery,
  diffRegistryRow,
  draftsFromWikidata,
  WIKIDATA_SPARQL_URL,
} from "../src/sources-wikidata.ts";

/**
 * Wikidata 보조 명령(#76): 도메인마다 행 초안을 만들어 출처 표 파일과의 차이만 출력한다. 파일은 쓰지 않는다.
 * 실행: pnpm --filter @newstrail/db sources:wikidata <도메인…>  (예 yna.co.kr reuters.com)
 */
const domains = process.argv.slice(2).map((d) => d.toLowerCase().replace(/^www\./, ""));
if (domains.length === 0) {
  console.error("사용법: sources:wikidata <도메인…>");
  process.exit(1);
}

// 도메인마다 IRI 여덟이라 GET URL이 길어진다 — POST 폼으로 보낸다.
const response = await fetch(WIKIDATA_SPARQL_URL, {
  method: "POST",
  headers: {
    accept: "application/sparql-results+json",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "ai-news-platform sources:wikidata (github.com/hz0705-blip/ai-news-platform)",
  },
  body: new URLSearchParams({ query: buildWikidataQuery(domains) }),
});
if (!response.ok) {
  console.error(`Wikidata ${response.status}: ${(await response.text()).slice(0, 200)}`);
  process.exit(1);
}

const existing = readSourceRegistryFile(SOURCES_FILE_PATH);
const checkedOn = new Date().toISOString().slice(0, 10);
for (const draft of draftsFromWikidata(await response.json(), domains, checkedOn)) {
  console.log(`## ${draft.domain}`);
  for (const hint of draft.hints) console.log(`  # ${hint}`);
  if (draft.row === undefined) continue;
  const current = existing.find((row) => row.domains.includes(draft.domain));
  const lines = diffRegistryRow(current, draft.row);
  for (const line of lines.length === 0 ? ["  (차이 없음)"] : lines) console.log(`  ${line}`);
}
