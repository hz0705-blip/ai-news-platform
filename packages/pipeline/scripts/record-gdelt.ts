import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  decodeGkgLine,
  fetchGdeltFileList,
  formatGdeltTime,
  GDELT_MAX_FILES_PER_BATCH,
  gdeltTermsOf,
  gdeltWindow,
  gkgFilesInWindow,
  inflateZipLines,
  normalizeForMatch,
  parseGkgRow,
  titleMatchesTerms,
} from "../src/sources/gdelt.ts";
import { recordedGdeltDir } from "../src/sources/gdelt-recorded.ts";

/**
 * 실제 GKG 15분 파일에서 픽스처 조각을 기록한다(#112 "테스트는 기록된 실제 파일 조각을 쓴다"). 키가 없다.
 * 창(사건 첫 기사 발행 24시간 전 ~ 배치 시작) 안의 파일을 최근 것부터 최대 96개 읽어, 대표 기사 제목의 고유명사가 모두
 * 제목에 든 행을 도메인당 2개·모두 `KEEP`개까지, 매칭되지 않는 행 `NEGATIVE`개, 제목 없는 행 하나(있으면)를 남긴다.
 * 행은 27열을 그대로 두되 쓰지 않는 열(6~26)은 비우고 `V2.1Extras`는 `<PAGE_TITLE>`만 남긴다(크기).
 * `files.txt`에는 행을 남긴 파일과 창 바로 밖 파일의 실제 목록 줄(export·mentions·gkg)을 남긴다.
 *
 * 실행: node scripts/record-gdelt.ts <name> "<대표 기사 제목>" <firstPublishedAt ISO> <batchStartedAt ISO>
 */
const KEEP = 12;
const PER_DOMAIN = 2;
const NEGATIVE = 2;

const [name, title, firstPublishedAtRaw, batchStartedAtRaw] = process.argv.slice(2);
if (!name || !title || !firstPublishedAtRaw || !batchStartedAtRaw) {
  console.error(
    "사용법: record-gdelt.ts <name> <title> <firstPublishedAt ISO> <batchStartedAt ISO>",
  );
  process.exit(1);
}
const terms = gdeltTermsOf(title);
if (terms === undefined) {
  console.error(JSON.stringify({ title, error: "고유명사가 두 개 미만이다" }));
  process.exit(1);
}
const window = gdeltWindow({
  firstPublishedAt: new Date(firstPublishedAtRaw),
  batchStartedAt: new Date(batchStartedAtRaw),
});

// 목록 꼬리가 창 시작까지 닿게: 시간당 약 1.2KB(15분마다 세 줄).
const hours = Math.ceil((Date.now() - window.from.getTime()) / 3_600_000) + 2;
const listText = await fetchGdeltFileList({ fetch }, hours * 1500);
const files = gkgFilesInWindow(listText, window).slice(0, GDELT_MAX_FILES_PER_BATCH);

const slim = (line: string) => {
  const cols = line.split("\t");
  const extras = /<PAGE_TITLE>[\s\S]*?<\/PAGE_TITLE>/.exec(cols[26] ?? "")?.[0] ?? "";
  return [...cols.slice(0, 5), ...new Array<string>(21).fill(""), extras].join("\t");
};

const kept = new Map<string, string[]>();
const perDomain = new Map<string, number>();
let matched = 0;
let negatives = 0;
let noTitle = 0;
let rowsRead = 0;
for (const file of files) {
  if (matched >= KEEP) break;
  const ts = formatGdeltTime(file.timestamp);
  const lines: string[] = [];
  const response = await fetch(file.url.replace(/^http:/, "https:"));
  if (!response.ok || response.body === null) throw new Error(`${response.status} ${file.url}`);
  await inflateZipLines(response.body as unknown as AsyncIterable<Uint8Array>, (bytes) => {
    rowsRead++;
    const line = decodeGkgLine(bytes);
    const row = parseGkgRow(line);
    if (row === undefined) {
      if (noTitle === 0 && line.split("\t")[2] === "1" && !line.includes("<PAGE_TITLE>")) {
        lines.push(slim(line));
        noTitle++;
      }
      return;
    }
    if (!titleMatchesTerms(normalizeForMatch(row.title), terms)) {
      if (negatives < NEGATIVE && lines.length === 0) {
        lines.push(slim(line));
        negatives++;
      }
      return;
    }
    const n = perDomain.get(row.domain) ?? 0;
    if (matched >= KEEP || n >= PER_DOMAIN) return;
    perDomain.set(row.domain, n + 1);
    matched++;
    lines.push(slim(line));
  });
  if (lines.length > 0) kept.set(ts, lines);
}

const dir = recordedGdeltDir(name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const [ts, lines] of kept) writeFileSync(`${dir}${ts}.gkg.csv`, `${lines.join("\n")}\n`);

// 목록: 행을 남긴 파일 + 창 바로 밖(앞·뒤 15분) 파일의 실제 줄.
const quarter = 15 * 60 * 1000;
const listed = new Set([
  ...kept.keys(),
  formatGdeltTime(new Date(Math.floor(window.from.getTime() / quarter) * quarter)),
  formatGdeltTime(new Date(Math.floor(window.to.getTime() / quarter) * quarter + quarter)),
]);
const listLines = listText
  .split("\n")
  .filter((line) => [...listed].some((ts) => line.includes(`/${ts}.`)));
writeFileSync(`${dir}files.txt`, `${listLines.join("\n")}\n`);
console.log(
  JSON.stringify({
    recorded: name,
    terms,
    files: files.length,
    rowsRead,
    matched,
    negatives,
    noTitle,
  }),
);
