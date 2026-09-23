import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  Article,
  Claim,
  Evidence,
  Revision,
  RevisionSource,
  Source,
  Story,
} from "@newsplatform/domain";

/**
 * 데모 사건 픽스처가 고정하는 기준 시각(#21 Ruling: 데모 기준 시각).
 * 배치가 만드는 결정론 식별자·시각(개정판 발행 시각, 근거 검증 시각)이 이 값으로 고정된다.
 */
export const DEMO_REFERENCE_TIME = new Date("2026-09-17T00:30:00.000Z");

/** 기사 메타데이터에 기사 버전 식별자를 더한 것(#21 브리프: 고정 문자열 `av-*`). */
export interface DemoArticleMeta extends Article {
  readonly articleVersionId: string;
}

/** `recorded/evidence-extract.json`의 모양(#21 브리프 "기록된 응답"). */
export interface EvidenceExtractRecord {
  readonly [articleVersionId: string]: {
    readonly quotes: readonly { readonly quoteId: string; readonly quote: string }[];
  };
}

/** `recorded/claim-generate.json`의 모양. 최상위 키는 주장 생성 멱등키다. */
export interface ClaimGenerateRecord {
  readonly [idempotencyKey: string]: {
    readonly title: string;
    readonly claims: readonly {
      readonly claimKey: string;
      readonly text: string;
      readonly claimType: string;
      readonly modality: string;
      readonly quoteIds: readonly string[];
    }[];
  };
}

/** `recorded/contradiction-label.json`의 모양. 최상위 키는 상충 판정 멱등키 `<storyId>:<claimKey>`다. */
export interface ContradictionLabelRecord {
  readonly [idempotencyKey: string]: {
    readonly pairs: readonly {
      readonly a: string;
      readonly b: string;
      readonly label: string;
      readonly differsIn?: Readonly<Record<string, string>>;
    }[];
  };
}

/**
 * 데모 사건 픽스처 전체(#21 브리프 "Produces"). `fixtures/<slug>/` 아래 파일들을
 * 읽어 만든다. zod 검증은 Task 5의 스키마가 맡으므로 여기서는 타입 단언 없이
 * 좁은 인터페이스로만 읽는다.
 */
export interface DemoStoryFixture {
  readonly story: Story;
  readonly sources: readonly Source[];
  readonly articles: readonly { readonly meta: DemoArticleMeta; readonly rawBody: string }[];
  readonly recorded: {
    readonly evidenceExtract: EvidenceExtractRecord;
    readonly claimGenerate: ClaimGenerateRecord;
    readonly contradictionLabel: ContradictionLabelRecord;
  };
  readonly golden: Revision;
}

/** `story.json`의 기사 메타 한 줄. 발행 시각은 아직 문자열이고 원문 파일 경로를 더 가진다. */
interface RawArticleMeta extends Omit<Article, "publishedAt"> {
  readonly publishedAt: string;
  readonly articleVersionId: string;
  readonly file: string;
}

/** `story.json`의 모양. */
interface StoryFile {
  readonly story: Story;
  readonly sources: readonly Source[];
  readonly articles: readonly RawArticleMeta[];
}

/** `golden/revision.json`의 근거 한 줄. 검증 시각은 아직 문자열이다. */
interface RawEvidence extends Omit<Evidence, "verifiedAt"> {
  readonly verifiedAt: string;
}

/** `golden/revision.json`의 주장 한 줄. */
interface RawClaim extends Omit<Claim, "evidence"> {
  readonly evidence: readonly RawEvidence[];
}

/** `golden/revision.json`의 출처 구획 한 줄. 발행 시각은 아직 문자열이다. */
interface RawRevisionSource extends Omit<RevisionSource, "publishedAt"> {
  readonly publishedAt: string;
}

/** `golden/revision.json`의 모양. 날짜는 아직 문자열이다. */
interface RawRevision extends Omit<Revision, "publishedAt" | "claims" | "sources"> {
  readonly publishedAt: string;
  readonly claims: readonly RawClaim[];
  readonly sources: readonly RawRevisionSource[];
}

/** 픽스처 루트(`packages/pipeline/fixtures/`). `golden-set.json`과 `<slug>/` 디렉터리가 이 아래에 있다. */
const FIXTURES_ROOT = fileURLToPath(new URL("../fixtures/", import.meta.url));

function fixtureDir(slug: string): string {
  if (slug.length === 0 || slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    throw new Error(`픽스처 slug가 올바르지 않다: ${slug}`);
  }
  return `${FIXTURES_ROOT}${slug}/`;
}

/** `golden-set.json`에 등록된 slug를 등록 순서대로 돌려준다(#22 브리프 "Produces"). */
export function listGoldenSetSlugs(): readonly string[] {
  const entries = readJson<readonly { readonly storySlug: string }[]>(
    `${FIXTURES_ROOT}golden-set.json`,
  );
  return entries.map((entry) => entry.storySlug);
}

/** JSON 파일을 좁은 인터페이스 `T`로 읽는다. `JSON.parse`는 `any`를 돌려주므로 변수 타입만 좁힌다(단언 없음). */
function readJson<T>(path: string): T {
  const data: T = JSON.parse(readFileSync(path, "utf8"));
  return data;
}

function toRevisionSource(raw: RawRevisionSource): RevisionSource {
  return { ...raw, publishedAt: new Date(raw.publishedAt) };
}

function toEvidence(raw: RawEvidence): Evidence {
  return { ...raw, verifiedAt: new Date(raw.verifiedAt) };
}

function toClaim(raw: RawClaim): Claim {
  return { ...raw, evidence: raw.evidence.map(toEvidence) };
}

function toRevision(raw: RawRevision): Revision {
  return {
    ...raw,
    publishedAt: new Date(raw.publishedAt),
    claims: raw.claims.map(toClaim),
    sources: raw.sources.map(toRevisionSource),
  };
}

function toArticleMeta(raw: RawArticleMeta): DemoArticleMeta {
  return {
    id: raw.id,
    sourceId: raw.sourceId,
    storyId: raw.storyId,
    url: raw.url,
    title: raw.title,
    publishedAt: new Date(raw.publishedAt),
    topic: raw.topic,
    articleVersionId: raw.articleVersionId,
  };
}

/**
 * 데모 사건 픽스처에서 정답(`golden/revision.json`)을 뺀 입력 부분만 읽는다.
 * 정답이 아직 없는 slug의 정답 생성(`scripts/write-golden.ts`, Ruling 22-14)에 쓴다.
 */
export function loadDemoStoryInputs(slug: string): Omit<DemoStoryFixture, "golden"> {
  const dir = fixtureDir(slug);
  const storyFile = readJson<StoryFile>(`${dir}story.json`);

  const articles = storyFile.articles.map((raw) => ({
    meta: toArticleMeta(raw),
    rawBody: readFileSync(`${dir}${raw.file}`, "utf8"),
  }));

  const evidenceExtract = readJson<EvidenceExtractRecord>(`${dir}recorded/evidence-extract.json`);
  const claimGenerate = readJson<ClaimGenerateRecord>(`${dir}recorded/claim-generate.json`);
  const contradictionLabel = readJson<ContradictionLabelRecord>(
    `${dir}recorded/contradiction-label.json`,
  );

  return {
    story: storyFile.story,
    sources: storyFile.sources,
    articles,
    recorded: { evidenceExtract, claimGenerate, contradictionLabel },
  };
}

/**
 * 데모 사건 픽스처 하나를 정답까지 읽는다(#21 브리프 Step 3).
 * `node:fs`의 `readFileSync`와 `import.meta.url` 기준 경로를 쓴다.
 */
export function loadDemoStoryFixture(slug: string): DemoStoryFixture {
  const golden = toRevision(readJson<RawRevision>(`${fixtureDir(slug)}golden/revision.json`));
  return { ...loadDemoStoryInputs(slug), golden };
}
