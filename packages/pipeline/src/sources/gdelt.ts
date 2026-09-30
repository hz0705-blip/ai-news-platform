import { createHash } from "node:crypto";
import { once } from "node:events";
import { createInflateRaw } from "node:zlib";
import {
  matchSourceByDomain,
  normalizeArticleUrl,
  properNounsOf,
  type Source,
  sourceHostOf,
} from "@newstrail/domain";

/**
 * GDELT GKG 2.1 15분 파일 수집 어댑터(docs/spec/v1.md "데이터 소스와 권리" GDELT, "개발 중 결정 항목" GDELT 수집,
 * #77·#112). 파일 목록(`masterfilelist.txt` 꼬리)·창·파일 스트리밍 해제·행 파싱·제목 매칭·도메인 매핑은 여기,
 * HTTP는 주입받은 `fetch`가 한다. 본문은 가져오지 않는다 — 결과는 링크만 기사의 메타데이터(URL·제목·도메인·관측 시각)뿐이다.
 */
export const GDELT_MASTERFILELIST_URL = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";
/**
 * 파일 목록은 128MB라 꼬리만 Range로 받는다. 15분마다 세 줄(export·mentions·gkg, 줄당 약 95바이트)이 붙으므로
 * 64KiB는 약 55시간 — 파일 상한(24시간)보다 넉넉하다.
 */
export const GDELT_FILE_LIST_TAIL_BYTES = 64 * 1024;
/** 배치당 읽는 GKG 파일 상한(15분 × 96 = 24시간). 창이 더 길면 최근 파일부터 이만큼만 읽는다. */
export const GDELT_MAX_FILES_PER_BATCH = 96;
/** 배치당 매칭하는 사건 상한. */
export const GDELT_MAX_STORIES_PER_BATCH = 20;
/** 요청당 제한 시간(파일 하나의 연결·내려받기·해제 전체). */
export const GDELT_REQUEST_TIMEOUT_MS = 60_000;
/** 파일이 연속으로 이만큼 실패하면 그 배치의 GDELT 조회를 멈춘다. */
export const GDELT_MAX_CONSECUTIVE_FAILURES = 3;
/** 창 시작 = 사건 첫 기사 발행 24시간 전. */
export const GDELT_WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000;
const MIN_TERMS = 2;
const MAX_TERMS = 4;
const MIN_KEYWORD_LENGTH = 3;

// ── 매칭 ────────────────────────────────────────────────────────

/** 대소문자·구두점 정규화: 소문자, 글자·숫자가 아닌 것은 공백 하나로. 단어 경계 비교를 위해 양끝에 공백을 둔다. */
export function normalizeForMatch(text: string): string {
  return ` ${text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/**
 * 대표 기사 제목의 고유명사 2~4개(정규화한 것). 두 개 미만이면 undefined.
 * 한 단어 후보 중 세 글자 미만(`US`, `Xi`)은 뺀다 — 대소문자를 무시하면 `US`가 대명사 `us`와 같아진다.
 */
export function gdeltTermsOf(title: string): string[] | undefined {
  const terms = properNounsOf(title)
    .filter((t) => t.includes(" ") || t.replace(/[^\p{L}\p{N}]/gu, "").length >= MIN_KEYWORD_LENGTH)
    .slice(0, MAX_TERMS)
    .map((t) => normalizeForMatch(t).trim())
    .filter((t) => t !== "");
  return terms.length < MIN_TERMS ? undefined : terms;
}

/** 모든 용어가 제목에 단어 경계로 들어 있으면 true. `normalizedTitle`은 `normalizeForMatch`의 결과다. */
export function titleMatchesTerms(normalizedTitle: string, terms: readonly string[]): boolean {
  return terms.every((term) => normalizedTitle.includes(` ${term} `));
}

// ── 시각·창 ─────────────────────────────────────────────────────

const GDELT_TIME = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

/** GDELT 시각 형식 `YYYYMMDDHHMMSS`(UTC). */
export function formatGdeltTime(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function parseGdeltTime(raw: string): Date | undefined {
  const m = GDELT_TIME.exec(raw);
  if (m === null) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y === undefined || mo === undefined || d === undefined) return undefined;
  const date = new Date(Date.UTC(y, mo - 1, d, h ?? 0, mi ?? 0, s ?? 0));
  return Number.isNaN(date.getTime()) ? undefined : date;
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

// ── 파일 목록 ───────────────────────────────────────────────────

/** GKG 15분 파일 하나. `timestamp`는 파일 이름의 `YYYYMMDDHHMMSS`. */
export interface GkgFile {
  readonly url: string;
  readonly md5: string;
  readonly size: number;
  readonly timestamp: Date;
}

const GKG_FILE_URL = /\/(\d{14})\.gkg\.csv\.zip$/;

/**
 * 파일 목록 텍스트(`<size> <md5> <url>` 줄)에서 창 `[from, to]` 안의 GKG 파일을 최근 것부터 고른다.
 * export·mentions 줄과 잘린 줄은 무시한다. 번역 스트림은 다른 목록(`masterfilelist-translation.txt`)이라 여기 없다.
 */
export function gkgFilesInWindow(listText: string, window: { from: Date; to: Date }): GkgFile[] {
  const files = new Map<string, GkgFile>();
  for (const line of listText.split("\n")) {
    const [sizeRaw, md5, url] = line.trim().split(" ");
    if (sizeRaw === undefined || md5 === undefined || url === undefined) continue;
    const m = GKG_FILE_URL.exec(url);
    const timestamp = m?.[1] === undefined ? undefined : parseGdeltTime(m[1]);
    const size = Number(sizeRaw);
    if (timestamp === undefined || !/^[0-9a-f]{32}$/.test(md5) || !Number.isInteger(size)) continue;
    const t = timestamp.getTime();
    if (t < window.from.getTime() || t > window.to.getTime()) continue;
    files.set(url, { url, md5, size, timestamp });
  }
  return [...files.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export class GdeltRequestError extends Error {
  override readonly name = "GdeltRequestError";
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`GDELT ${status}: ${detail}`);
    this.status = status;
  }
}

/** 파일 목록 꼬리를 Range로 받는다. 서버가 Range를 무시하면(200, 128MB) 본문을 읽지 않고 실패한다. */
export async function fetchGdeltFileList(
  deps: { fetch: typeof fetch; timeoutMs?: number },
  tailBytes = GDELT_FILE_LIST_TAIL_BYTES,
): Promise<string> {
  const response = await deps.fetch(GDELT_MASTERFILELIST_URL, {
    headers: { range: `bytes=-${tailBytes}` },
    signal: AbortSignal.timeout(deps.timeoutMs ?? GDELT_REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new GdeltRequestError(response.status, "파일 목록 Range 응답이 아니다");
  }
  const text = await response.text();
  // 꼬리의 첫 줄은 중간에서 잘렸을 수 있다.
  return text.slice(text.indexOf("\n") + 1);
}

// ── 파일 읽기(스트리밍 해제) ────────────────────────────────────

export class GdeltChecksumError extends Error {
  override readonly name = "GdeltChecksumError";

  constructor(file: string, expected: string, actual: string) {
    super(`GDELT MD5 불일치 ${file}: 목록 ${expected}, 받은 파일 ${actual}`);
  }
}

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_LOCAL_HEADER_BYTES = 30;
const ZIP_DEFLATE = 8;
const ZIP_DATA_DESCRIPTOR_FLAG = 0x08;

/**
 * zip 본문(항목 하나)을 스트리밍으로 풀어 줄(바이트) 단위로 `onLine`에 넘긴다. 디스크·메모리에 파일 전체를 쌓지 않는다.
 * 첫 로컬 헤더만 읽고 deflate 데이터를 `inflateRaw`에 흘린다. 압축 바이트 전체의 MD5와 바이트 수를 돌려준다.
 */
export async function inflateZipLines(
  body: AsyncIterable<Uint8Array>,
  onLine: (line: Buffer) => void,
): Promise<{ md5: string; bytes: number }> {
  const hash = createHash("md5");
  const inflate = createInflateRaw();
  let bytes = 0;
  const producer = (async () => {
    let header: Buffer | undefined = Buffer.alloc(0);
    let remaining = Number.POSITIVE_INFINITY;
    for await (const chunk of body) {
      hash.update(chunk);
      bytes += chunk.length;
      let data: Buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      if (header !== undefined) {
        header = Buffer.concat([header, data]);
        if (header.length < ZIP_LOCAL_HEADER_BYTES) continue;
        if (header.readUInt32LE(0) !== ZIP_LOCAL_HEADER) throw new Error("zip 로컬 헤더가 아니다");
        if (header.readUInt16LE(8) !== ZIP_DEFLATE) throw new Error("deflate가 아닌 zip 항목");
        const start = ZIP_LOCAL_HEADER_BYTES + header.readUInt16LE(26) + header.readUInt16LE(28);
        if (header.length < start) continue;
        const compressed = header.readUInt32LE(18);
        // 데이터 설명자(비트 3)면 크기가 헤더에 없다 — deflate 스트림 끝에서 inflate가 스스로 멈춘다.
        if ((header.readUInt16LE(6) & ZIP_DATA_DESCRIPTOR_FLAG) === 0) remaining = compressed;
        data = header.subarray(start);
        header = undefined;
      }
      if (remaining <= 0) continue;
      const forward = data.subarray(0, Math.min(data.length, remaining));
      remaining -= forward.length;
      if (!inflate.write(forward)) await once(inflate, "drain");
    }
    inflate.end();
  })().catch((error: unknown) => {
    inflate.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  let rest: Buffer = Buffer.alloc(0);
  for await (const out of inflate as AsyncIterable<Buffer>) {
    let buffer = rest.length === 0 ? out : Buffer.concat([rest, out]);
    let newline = buffer.indexOf(0x0a);
    while (newline !== -1) {
      onLine(buffer.subarray(0, newline));
      buffer = buffer.subarray(newline + 1);
      newline = buffer.indexOf(0x0a);
    }
    rest = Buffer.from(buffer);
  }
  if (rest.length > 0) onLine(rest);
  await producer;
  return { md5: hash.digest("hex"), bytes };
}

// ── 행 파싱 ─────────────────────────────────────────────────────

const utf8 = new TextDecoder("utf-8", { fatal: true });
const latin1 = new TextDecoder("latin1");

/** 줄 바이트를 문자열로: UTF-8이 아니면 latin-1로 읽는다(파일에 인코딩이 섞여 있다). */
export function decodeGkgLine(line: Uint8Array): string {
  try {
    return utf8.decode(line);
  } catch {
    return latin1.decode(line);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** cp1252 0x80~0x9F 자리 문자 → 바이트(UTF-8을 cp1252로 잘못 읽은 제목을 되돌리기 위해). */
const CP1252_BYTES = new Map<number, number>(
  [
    [0x20ac, 0x80],
    [0x201a, 0x82],
    [0x0192, 0x83],
    [0x201e, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02c6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8a],
    [0x2039, 0x8b],
    [0x0152, 0x8c],
    [0x017d, 0x8e],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201c, 0x93],
    [0x201d, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02dc, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9a],
    [0x203a, 0x9b],
    [0x0153, 0x9c],
    [0x017e, 0x9e],
    [0x0178, 0x9f],
  ].map(([char, byte]) => [char as number, byte as number]),
);

/** `â€™`처럼 UTF-8 바이트를 latin-1/cp1252 문자로 읽은 문자열이면 되돌린다. 아니면 그대로. */
function repairMojibake(text: string): string {
  if (!/[Â-ô]/.test(text)) return text;
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const byte = code <= 0xff ? code : CP1252_BYTES.get(code);
    if (byte === undefined) return text;
    bytes.push(byte);
  }
  try {
    return utf8.decode(Uint8Array.from(bytes));
  } catch {
    return text;
  }
}

/** `<PAGE_TITLE>`의 HTML 엔터티(`&#x2013;`·`&amp;`)를 풀고 깨진 인코딩을 되돌린다. */
export function decodeGkgTitle(raw: string): string {
  const unescaped = raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
  return repairMojibake(unescaped)
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** GKG 2.1 한 행에서 쓰는 필드. 27열 탭 구분, 머리 행 없음(2026-09-29 실제 파일로 확인). */
export interface GkgRow {
  readonly recordId: string;
  /** `DATE`(2열) — GDELT가 기사를 본 시각. "관측 시각"이다. */
  readonly observedAt: Date;
  /** `V2SourceCommonName`(4열). */
  readonly domain: string;
  /** `DocumentIdentifier`(5열). */
  readonly url: string;
  /** `V2.1Extras`(27열)의 `<PAGE_TITLE>`. */
  readonly title: string;
}

const GKG_COLUMNS = 27;
const GKG_WEB_COLLECTION = "1";
const PAGE_TITLE = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/;

/** 한 행을 읽는다. 웹 문서(`SourceCollectionIdentifier` 1)가 아니거나 시각·URL·제목이 없으면 undefined. */
export function parseGkgRow(line: string): GkgRow | undefined {
  const cols = line.split("\t");
  if (cols.length < GKG_COLUMNS) return undefined;
  const [recordId = "", date = "", collection, domain = "", url = ""] = cols;
  if (collection !== GKG_WEB_COLLECTION) return undefined;
  const observedAt = parseGdeltTime(date);
  const titleRaw = PAGE_TITLE.exec(cols[GKG_COLUMNS - 1] ?? "")?.[1];
  const title = titleRaw === undefined ? "" : decodeGkgTitle(titleRaw);
  if (observedAt === undefined || url === "" || title === "") return undefined;
  return { recordId, observedAt, domain: domain.toLowerCase(), url, title };
}

// ── 링크 매핑 ───────────────────────────────────────────────────

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

/**
 * 행 하나를 출처와 링크로 바꾼다. 출처 표(`registry`, #76)에서 제외된 도메인은 `excluded`, URL이 아니면 `invalid`.
 * 도메인이 출처 표에 있으면 그 출처, 없으면 `gdelt:<domain>` 출처(권리 등급 "링크만", 이름 = 도메인, 지역 "미확인",
 * 소유 형태 `unknown`, 언어 `en` — 영어 원본 스트림만 읽는다).
 */
export function mapGkgRow(
  row: GkgRow,
  registry: readonly Source[] = [],
): { kind: "link"; source: Source; link: GdeltLink } | { kind: "excluded" | "invalid" } {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeArticleUrl(row.url);
  } catch {
    return { kind: "invalid" };
  }
  const registered = matchSourceByDomain(row.url, registry);
  if (registered?.isExcluded) return { kind: "excluded" };
  const domain = (row.domain || sourceHostOf(row.url) || "").toLowerCase();
  const sourceId = registered?.id ?? sourceIdForDomain(domain);
  const source: Source = registered ?? {
    id: sourceId,
    name: domain,
    rightsTier: "링크만",
    region: "미확인",
    ownership: "unknown",
    language: "en",
    isFictional: false,
  };
  return {
    kind: "link",
    source,
    link: { sourceId, url: row.url, normalizedUrl, title: row.title, observedAt: row.observedAt },
  };
}

// ── 수집 ────────────────────────────────────────────────────────

/** 매칭할 사건 하나: 대표 기사(발행 시각·식별자 순 첫 기사)의 제목과 발행 시각. */
export interface GdeltStoryQuery {
  readonly storyId: string;
  readonly title: string;
  readonly firstPublishedAt: Date;
}

export interface CollectGdeltDeps {
  readonly fetch: typeof fetch;
  readonly clock?: () => Date;
  /** 요청당 제한 시간. 기본 `GDELT_REQUEST_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
}

export interface CollectGdeltResult {
  readonly sources: readonly Source[];
  /** 사건별 링크. 매칭된 행이 없는 사건은 없다. */
  readonly linksByStory: readonly {
    storyId: string;
    terms: readonly string[];
    links: readonly GdeltLink[];
  }[];
  /** 사건 창의 합집합(가장 이른 창 시작 ~ 배치 시작). 매칭할 사건이 없으면 undefined. */
  readonly window: { readonly from: Date; readonly to: Date } | undefined;
  readonly files: {
    /** 창 안에 있는 GKG 파일 수(상한 전). */
    readonly inWindow: number;
    /** 끝까지 읽고 MD5가 맞은 파일 수. */
    readonly read: number;
    /** 끝까지 읽은 파일의 압축 바이트 합. */
    readonly bytes: number;
    /** 읽은 행 수(MD5가 맞은 파일). */
    readonly rows: number;
    /** 상한(96)에 걸려 읽지 않은 파일 수(오래된 쪽). */
    readonly skippedOverCap: number;
    /** 기한(`deadline`)에 걸려 읽지 않은 파일 수. */
    readonly skippedDeadline: number;
    /** 연속 실패로 조회를 멈춰 읽지 않은 파일 수. */
    readonly skippedAfterFailures: number;
  };
  readonly dropped: { excluded: number; invalid: number };
  /** 고유명사가 부족해 매칭하지 않은 사건 수. */
  readonly skippedNoTerms: number;
  /** 상한(20)에 걸려 매칭하지 않은 사건 수. */
  readonly skippedOverCap: number;
  /** 실패한 파일(목록 포함). 배치는 실패하지 않는다. */
  readonly failures: readonly { file: string; reason: string }[];
}

function errorReason(error: unknown): string {
  // undici의 "fetch failed"는 원인(연결 거부·시간 초과)이 `cause`에 있다.
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

/**
 * 수집 한 번: 사건(최대 20개)의 창을 합친 구간의 GKG 파일을 최근 것부터 최대 96개 직렬로 내려받아 스트리밍으로 풀고,
 * 행마다 그 사건 창 안이고 제목에 사건의 고유명사가 모두 들어간 사건에 링크로 붙인다. 파일 하나가 실패(HTTP 오류·시간 초과·
 * MD5 불일치)하면 그 파일만 건너뛰고(그 파일의 매칭은 버린다) 다음 파일로 간다. 연속 3회 실패하면 남은 파일을 읽지 않는다.
 * `deadline`에 이르면 남은 파일을 건너뛴다. 같은 사건에 같은 정규화 URL이 여러 번 나오면 가장 이른 관측 시각 하나만 남긴다.
 */
export async function collectGdelt(
  input: {
    readonly stories: readonly GdeltStoryQuery[];
    readonly batchStartedAt: Date;
    readonly registry?: readonly Source[];
    /** 이 시각 이후에는 파일을 새로 받지 않는다(배치 리스 안에서 끝내기 위해). */
    readonly deadline?: Date;
  },
  deps: CollectGdeltDeps,
): Promise<CollectGdeltResult> {
  const clock = deps.clock ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? GDELT_REQUEST_TIMEOUT_MS;
  const capped = input.stories.slice(0, GDELT_MAX_STORIES_PER_BATCH);
  const targets = capped.flatMap((story) => {
    const terms = gdeltTermsOf(story.title);
    if (terms === undefined) return [];
    const window = gdeltWindow({
      firstPublishedAt: story.firstPublishedAt,
      batchStartedAt: input.batchStartedAt,
    });
    return [
      { storyId: story.storyId, terms, from: window.from.getTime(), to: window.to.getTime() },
    ];
  });
  const sources = new Map<string, Source>();
  const linksByStory = new Map<string, Map<string, GdeltLink>>();
  const failures: { file: string; reason: string }[] = [];
  const dropped = { excluded: 0, invalid: 0 };
  const files = {
    inWindow: 0,
    read: 0,
    bytes: 0,
    rows: 0,
    skippedOverCap: 0,
    skippedDeadline: 0,
    skippedAfterFailures: 0,
  };
  const result = (): CollectGdeltResult => ({
    sources: [...sources.values()],
    linksByStory: targets.flatMap((t) => {
      const links = linksByStory.get(t.storyId);
      return links === undefined || links.size === 0
        ? []
        : [{ storyId: t.storyId, terms: t.terms, links: [...links.values()] }];
    }),
    window,
    files,
    dropped,
    skippedNoTerms: capped.length - targets.length,
    skippedOverCap: input.stories.length - capped.length,
    failures,
  });

  const window =
    targets.length === 0
      ? undefined
      : { from: new Date(Math.min(...targets.map((t) => t.from))), to: input.batchStartedAt };
  if (window === undefined) return result();

  let listed: GkgFile[];
  try {
    listed = gkgFilesInWindow(await fetchGdeltFileList({ fetch: deps.fetch, timeoutMs }), window);
  } catch (error) {
    failures.push({ file: GDELT_MASTERFILELIST_URL, reason: errorReason(error) });
    return result();
  }
  files.inWindow = listed.length;
  const toRead = listed.slice(0, GDELT_MAX_FILES_PER_BATCH);
  files.skippedOverCap = listed.length - toRead.length;

  let consecutiveFailures = 0;
  for (const [index, file] of toRead.entries()) {
    if (consecutiveFailures >= GDELT_MAX_CONSECUTIVE_FAILURES) {
      files.skippedAfterFailures = toRead.length - index;
      break;
    }
    if (input.deadline !== undefined && clock().getTime() >= input.deadline.getTime()) {
      files.skippedDeadline = toRead.length - index;
      break;
    }
    // 이 파일의 매칭은 MD5가 맞을 때만 반영한다.
    const matched: { storyId: string; row: GkgRow }[] = [];
    let rows = 0;
    let bytes: number;
    try {
      const response = await deps.fetch(file.url.replace(/^http:/, "https:"), {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok || response.body === null) {
        await response.body?.cancel();
        throw new GdeltRequestError(response.status, file.url);
      }
      const read = await inflateZipLines(
        response.body as unknown as AsyncIterable<Uint8Array>,
        (line) => {
          const row = parseGkgRow(decodeGkgLine(line));
          rows++;
          if (row === undefined) return;
          const t = row.observedAt.getTime();
          const title = normalizeForMatch(row.title);
          for (const target of targets) {
            if (t >= target.from && t <= target.to && titleMatchesTerms(title, target.terms)) {
              matched.push({ storyId: target.storyId, row });
            }
          }
        },
      );
      bytes = read.bytes;
      if (read.md5 !== file.md5) throw new GdeltChecksumError(file.url, file.md5, read.md5);
    } catch (error) {
      failures.push({ file: file.url, reason: errorReason(error) });
      consecutiveFailures++;
      continue;
    }
    consecutiveFailures = 0;
    files.read++;
    files.bytes += bytes;
    files.rows += rows;
    for (const { storyId, row } of matched) {
      const mapped = mapGkgRow(row, input.registry);
      if (mapped.kind !== "link") {
        dropped[mapped.kind]++;
        continue;
      }
      sources.set(mapped.source.id, mapped.source);
      const byUrl = linksByStory.get(storyId) ?? new Map<string, GdeltLink>();
      linksByStory.set(storyId, byUrl);
      const seen = byUrl.get(mapped.link.normalizedUrl);
      if (seen === undefined || mapped.link.observedAt < seen.observedAt) {
        byUrl.set(mapped.link.normalizedUrl, mapped.link);
      }
    }
  }
  return result();
}
