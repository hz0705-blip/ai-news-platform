import { createHash } from "node:crypto";
import type { Source } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import {
  collectGdelt,
  formatGdeltTime,
  GDELT_MASTERFILELIST_URL,
  GDELT_MAX_CONSECUTIVE_FAILURES,
  GDELT_MAX_FILES_PER_BATCH,
  GDELT_MAX_STORIES_PER_BATCH,
  type GdeltStoryQuery,
  gdeltTermsOf,
  gdeltWindow,
  gkgFilesInWindow,
  normalizeForMatch,
  parseGkgRow,
  titleMatchesTerms,
} from "./gdelt.ts";
import {
  createRecordedGdeltFetch,
  readRecordedGdeltFileList,
  readRecordedGkgRows,
  zipSingleEntry,
} from "./gdelt-recorded.ts";

const TITLE =
  "Marrenland says it will wait for official NU response after Oste rejects Strait of Kessel proposal";
const firstPublishedAt = new Date("2026-09-27T02:16:52.000Z");
const batchStartedAt = new Date("2026-09-27T08:00:00.000Z");
const story: GdeltStoryQuery = { storyId: "s-hormuz", title: TITLE, firstPublishedAt };

const recordedRows = readRecordedGkgRows("hormuz-proposal");
const allRows = [...recordedRows.values()].flat();

describe("GDELT 매칭 용어", () => {
  it("gdeltTermsOf picks 2-4 normalized proper nouns", () => {
    // `NU`처럼 세 글자 미만 한 단어는 뺀다(대소문자를 무시하면 흔한 짧은 낱말과 겹친다).
    expect(gdeltTermsOf(TITLE)).toEqual(["marrenland", "oste", "strait of kessel"]);
    expect(gdeltTermsOf("Lee meets Xi, Putin, Modi and Macron in Beijing")).toEqual([
      "lee",
      "putin",
      "modi",
      "macron",
    ]);
    expect(gdeltTermsOf("Markets fall as yields rise")).toBeUndefined();
    expect(gdeltTermsOf("Russia-derived system heads to Algeria")).toEqual([
      "russia derived",
      "algeria",
    ]);
  });

  it("title match requires every proper noun, case and punctuation normalized", () => {
    const terms = gdeltTermsOf(TITLE) ?? [];
    const matches = (title: string) => titleMatchesTerms(normalizeForMatch(title), terms);
    expect(matches("Oste Rejects Marrenland's Proposal To Open Strait Of Kessel")).toBe(true);
    expect(matches("NU–Marrenland standoff: OSTE rejects Strait-of-Kessel deal")).toBe(true);
    // 하나라도 빠지면(여기서는 "Strait of") 후보가 아니다.
    expect(matches("Oste rejects Marrenland proposal to open Kessel")).toBe(false);
    // 단어 경계: `Marrenlander`는 `Marrenland`가 아니다.
    expect(matches("Marrenlander Oste Strait of Kessel")).toBe(false);
    // 기록된 행 중 매칭되지 않는 행은 무관한 제목이다.
    const titles = allRows.map((l) => parseGkgRow(l)?.title ?? "");
    expect(titles.filter((t) => !matches(t))).toEqual([
      "Food Authority inspects 17 establishments in Harrow District",
      "Council to review all parking permits issued under 'temporary rules'",
    ]);
  });
});

describe("GKG 행·파일 목록", () => {
  it("gkg row parsing reads url, domain, observed time and title and drops rows without a title", () => {
    const line = allRows.find((l) => l.includes("gulf-courier.example/world/region/nu-marrenland"));
    if (line === undefined) throw new Error("기록된 행 없음");
    expect(parseGkgRow(line)).toEqual({
      recordId: "20260927061500-308",
      observedAt: new Date("2026-09-27T06:15:00.000Z"),
      domain: "gulf-courier.example",
      url: "https://gulf-courier.example/world/region/nu-marrenland-tensions-varos-awaits-response-as-oste-rejects-kessel-plan-1.500689272",
      // HTML 엔터티(`&#x2013;`)를 푼다.
      title:
        "NU–Marrenland Tensions Rise as Oste Rejects Strait of Kessel Deal; Varos Awaits Response, Talvia Urges Restraint",
    });
    // 폭 없는 공백(`&#x200B;`)과 `&#xA0;`도 정리한다.
    const zeroWidth = allRows.map((l) => parseGkgRow(l)?.title ?? "");
    expect(zeroWidth).toContain(
      "'They Have No Cargo Moving Out': Halvard Oste Rejects Marrenland's Offer to Reopen Strait of Kessel - Pragati Daily I Latest Regional News in English I Breaking News",
    );
    expect(zeroWidth).toContain(
      "Oste Rejects Marrenland's Plan to Reopen Strait of Kessel in Ten Days – THISDAYWIRE",
    );
    // 제목 태그가 없거나 비었으면 버린다.
    expect(parseGkgRow(line.replace(/<PAGE_TITLE>.*<\/PAGE_TITLE>/, ""))).toBeUndefined();
    expect(
      parseGkgRow(line.replace(/<PAGE_TITLE>.*<\/PAGE_TITLE>/, "<PAGE_TITLE></PAGE_TITLE>")),
    ).toBeUndefined();
    // 웹 문서(수집 식별자 1)가 아니면 버린다.
    expect(
      parseGkgRow(line.replace("\t1\tgulf-courier.example", "\t2\tgulf-courier.example")),
    ).toBeUndefined();
  });

  it("file window from the file list keeps gkg files inside the window, newest first", () => {
    const window = gdeltWindow({ firstPublishedAt, batchStartedAt });
    const files = gkgFilesInWindow(readRecordedGdeltFileList("hormuz-proposal"), window);
    // 창 = 첫 기사 발행 24시간 전(09-26 02:16:52) ~ 배치 시작(09-27 08:00). 02:15·08:15 파일과 export·mentions는 빠진다.
    expect(files.map((f) => formatGdeltTime(f.timestamp))).toEqual([
      "20260927080000",
      "20260927074500",
      "20260927070000",
      "20260927063000",
      "20260927061500",
      "20260927053000",
    ]);
    expect(files[0]).toEqual({
      url: "http://data.gdeltproject.org/gdeltv2/20260927080000.gkg.csv.zip",
      md5: "0231c73075d6f579b6847626d2d3815a",
      size: 2382783,
      timestamp: new Date("2026-09-27T08:00:00.000Z"),
    });
  });
});

describe("GDELT 수집(기록된 GKG 조각)", () => {
  it("collectGdelt links recorded rows whose titles carry every proper noun", async () => {
    const result = await collectGdelt(
      { stories: [story], batchStartedAt },
      { fetch: createRecordedGdeltFetch() },
    );
    expect(result.failures).toEqual([]);
    expect(result.files).toMatchObject({ inWindow: 6, read: 6, rows: allRows.length });
    const [group] = result.linksByStory;
    expect(group?.storyId).toBe(story.storyId);
    expect(group?.links).toHaveLength(12);
    for (const link of group?.links ?? []) {
      expect(titleMatchesTerms(normalizeForMatch(link.title), group?.terms ?? [])).toBe(true);
      expect(link.sourceId).toMatch(/^gdelt:/);
    }
    // 출처 표에 없는 도메인은 `gdelt:<domain>` 출처(링크만, 이름 = 도메인, 영어).
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        id: "gdelt:gulf-courier.example",
        name: "gulf-courier.example",
        rightsTier: "링크만",
        language: "en",
      }),
    );
  });

  it("excluded domains in the source registry are dropped", async () => {
    const excluded: Source = {
      id: "excluded.example",
      name: "Excluded",
      rightsTier: "링크만",
      region: "kr",
      ownership: "private",
      language: "en",
      isFictional: false,
      domains: ["gulf-courier.example"],
      isExcluded: true,
    };
    const result = await collectGdelt(
      { stories: [story], batchStartedAt, registry: [excluded] },
      { fetch: createRecordedGdeltFetch() },
    );
    expect(result.dropped).toEqual({ excluded: 2, invalid: 0 });
    expect(result.linksByStory[0]?.links.some((l) => l.url.includes("gulf-courier.example"))).toBe(
      false,
    );
  });

  it("checksum mismatch skips the file and is reported", async () => {
    const result = await collectGdelt(
      { stories: [story], batchStartedAt },
      { fetch: createRecordedGdeltFetch("hormuz-proposal", { wrongMd5: ["20260927080000"] }) },
    );
    expect(result.failures).toEqual([
      {
        file: "http://data.gdeltproject.org/gdeltv2/20260927080000.gkg.csv.zip",
        reason: expect.stringContaining("MD5"),
      },
    ]);
    expect(result.files.read).toBe(5);
    // 그 파일의 행은 쓰지 않는다.
    const links = result.linksByStory[0]?.links ?? [];
    expect(links).toHaveLength(9);
    expect(links.some((l) => l.observedAt.getTime() === batchStartedAt.getTime())).toBe(false);
  });
});

/** 파일 `n`개짜리 목록과 빈 zip을 주는 `fetch`. `respond`로 파일 응답을 바꾼다. */
function syntheticGdelt(n: number, respond?: (index: number) => Response | undefined) {
  const zip = zipSingleEntry("x.gkg.csv", Buffer.alloc(0));
  const md5 = createHash("md5").update(zip).digest("hex");
  const quarter = 15 * 60 * 1000;
  const urls = Array.from(
    { length: n },
    (_, i) =>
      `http://data.gdeltproject.org/gdeltv2/${formatGdeltTime(new Date(batchStartedAt.getTime() - i * quarter))}.gkg.csv.zip`,
  );
  const fetched: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const url = String(input);
    if (url === GDELT_MASTERFILELIST_URL) {
      return new Response(`cut\n${urls.map((u) => `${zip.length} ${md5} ${u}`).join("\n")}\n`, {
        status: 206,
      });
    }
    fetched.push(url);
    const index = urls.indexOf(url.replace(/^https:/, "http:"));
    return respond?.(index) ?? new Response(new Uint8Array(zip), { status: 200 });
  };
  return { fetch: fetchFn, fetched };
}

describe("GDELT 수집 상한·실패", () => {
  it("gdelt caps files per batch at 96 newest and stories at 20", async () => {
    const many = Array.from({ length: GDELT_MAX_STORIES_PER_BATCH + 2 }, (_, i) => ({
      ...story,
      storyId: `s-${i}`,
    }));
    const synthetic = syntheticGdelt(GDELT_MAX_FILES_PER_BATCH + 4);
    const result = await collectGdelt(
      { stories: [...many], batchStartedAt },
      { fetch: synthetic.fetch },
    );
    expect(result.skippedOverCap).toBe(2);
    expect(result.files).toMatchObject({
      inWindow: GDELT_MAX_FILES_PER_BATCH + 4,
      read: GDELT_MAX_FILES_PER_BATCH,
      skippedOverCap: 4,
    });
    // 최근 파일부터, https로 받는다.
    expect(synthetic.fetched[0]).toBe(
      "https://data.gdeltproject.org/gdeltv2/20260927080000.gkg.csv.zip",
    );
  });

  it("gdelt skips stories without enough proper nouns without fetching", async () => {
    const synthetic = syntheticGdelt(1);
    const result = await collectGdelt(
      { stories: [{ ...story, title: "Markets fall as yields rise" }], batchStartedAt },
      { fetch: synthetic.fetch },
    );
    expect(result.skippedNoTerms).toBe(1);
    expect(result.window).toBeUndefined();
    expect(synthetic.fetched).toEqual([]);
  });

  it("gdelt file errors skip the file and stop after 3 consecutive failures", async () => {
    // 0 실패, 1 성공, 2~4 실패 ×3 → 멈춤(남은 5~7은 읽지 않는다).
    const synthetic = syntheticGdelt(8, (i) =>
      i === 1 ? undefined : new Response("busy", { status: 503 }),
    );
    const result = await collectGdelt(
      { stories: [story], batchStartedAt },
      { fetch: synthetic.fetch },
    );
    expect(result.failures).toHaveLength(1 + GDELT_MAX_CONSECUTIVE_FAILURES);
    expect(result.failures[0]?.reason).toContain("503");
    expect(result.files).toMatchObject({ read: 1, skippedAfterFailures: 3 });
  });

  it("gdelt file download times out and counts as a failure", async () => {
    const synthetic = syntheticGdelt(1);
    const result = await collectGdelt(
      { stories: [story], batchStartedAt },
      {
        timeoutMs: 20,
        fetch: (input, init) =>
          String(input) === GDELT_MASTERFILELIST_URL
            ? synthetic.fetch(input, init)
            : new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
              }),
      },
    );
    expect(result.failures).toEqual([
      {
        file: expect.stringContaining(".gkg.csv.zip"),
        reason: expect.stringMatching(/timed? ?out/i),
      },
    ]);
  });

  it("gdelt skips remaining files once the deadline is reached", async () => {
    let now = batchStartedAt.getTime();
    const synthetic = syntheticGdelt(5, () => {
      now += 60_000; // 파일마다 1분
      return undefined;
    });
    const result = await collectGdelt(
      { stories: [story], batchStartedAt, deadline: new Date(batchStartedAt.getTime() + 120_000) },
      { fetch: synthetic.fetch, clock: () => new Date(now) },
    );
    expect(result.files).toMatchObject({ read: 2, skippedDeadline: 3 });
  });

  it("gdelt reports a file list that ignores Range and reads no files", async () => {
    const fetched: string[] = [];
    const result = await collectGdelt(
      { stories: [story], batchStartedAt },
      {
        fetch: async (input) => {
          fetched.push(String(input));
          return new Response("whole list", { status: 200 });
        },
      },
    );
    expect(fetched).toEqual([GDELT_MASTERFILELIST_URL]);
    expect(result.failures).toEqual([
      { file: GDELT_MASTERFILELIST_URL, reason: expect.stringContaining("200") },
    ]);
  });
});
