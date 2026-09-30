import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Article,
  type ArticleVersionRecord,
  type Claim,
  createArticleVersion,
  deriveReprocessContext,
  type Evidence,
  judgeRecheckedBody,
  type Revision,
  type RevisionChange,
  type RevisionSource,
  type Source,
  type Story,
} from "@newsplatform/domain";
import { MODEL_ID } from "./openai/client.ts";
import { createRecordedModelClient } from "./recorded.ts";
import type { BatchInput, ModelClient } from "./types.ts";

/**
 * 데모 사건 픽스처가 고정하는 기준 시각(#21 Ruling: 데모 기준 시각).
 * 배치가 만드는 결정론 식별자·시각(개정판 발행 시각, 근거 검증 시각)이 이 값으로 고정된다.
 */
export const DEMO_REFERENCE_TIME = new Date("2026-09-17T00:30:00.000Z");

/**
 * 실제 모델 응답을 기록한 픽스처(`live-*`, #54)의 기준 시각: 기사 수집일(2026-09-27) KST 17:00 배치.
 * 기사 본문·제목·URL과 기록 응답의 문장은 직접 쓴 가상 텍스트로 바꿨다(#143).
 * 기록할 때와 리플레이할 때 같은 값을 써야 같은 개정판이 나온다.
 */
export const LIVE_REFERENCE_TIME = new Date("2026-09-27T08:00:00.000Z");

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
    topics: raw.topics,
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

/** 여러 개정판 데모 사건(#88)의 단계 하나: 그 단계 배치에 들어가는 기사 전체와 그 단계의 기록 응답 위치. */
export interface DemoStoryStep {
  /** 1부터. 이 단계가 만드는 개정판 번호와 같다. */
  readonly number: number;
  /** 이 단계 배치의 시각(개정판 발행 시각·근거 검증 시각). 마지막 단계는 데모 기준 시각이다. */
  readonly at: Date;
  readonly articles: readonly { readonly meta: DemoArticleMeta; readonly rawBody: string }[];
  /** `createRecordedModelClient`에 넘길 기록 위치(`<slug>` 또는 `<slug>/steps/<n>`). */
  readonly recordedSlug: string;
  /** 기록 응답을 만든 모델. 단계 픽스처는 실제 모델 응답을 기록한다(#88). */
  readonly modelId: string;
}

/** 데모 사건 하나를 단계 목록으로 읽은 것. 단계가 없는 픽스처(①②)는 단계 하나다. */
export interface DemoStorySteps {
  readonly story: Story;
  readonly sources: readonly Source[];
  readonly steps: readonly DemoStoryStep[];
}

/** `steps/<n>/step.json`의 모양. 기사 원문 경로는 픽스처 루트 기준이다. */
interface StepFile {
  readonly at: string;
  readonly articles: readonly RawArticleMeta[];
}

/**
 * 데모 사건을 단계 목록으로 읽는다(#88 Ruling "단계 형식"). `fixtures/<slug>/steps/<n>/`가 있으면 단계 픽스처다:
 * `story.json`(사건·출처), `steps/<n>/step.json`(시각·그 단계 배치의 기사 전체), `steps/<n>/recorded/`,
 * `steps/<n>/golden/revision.json`·`changes.json`. 없으면(①②) 기존 형식을 데모 기준 시각의 단계 하나로 읽는다.
 */
export function loadDemoStorySteps(slug: string): DemoStorySteps {
  const dir = fixtureDir(slug);
  if (!existsSync(`${dir}steps/1/step.json`)) {
    const inputs = loadDemoStoryInputs(slug);
    return {
      story: inputs.story,
      sources: inputs.sources,
      steps: [
        {
          number: 1,
          at: DEMO_REFERENCE_TIME,
          articles: inputs.articles,
          recordedSlug: slug,
          modelId: "recorded",
        },
      ],
    };
  }
  const storyFile = readJson<Omit<StoryFile, "articles">>(`${dir}story.json`);
  const steps: DemoStoryStep[] = [];
  for (let number = 1; existsSync(`${dir}steps/${number}/step.json`); number++) {
    const stepFile = readJson<StepFile>(`${dir}steps/${number}/step.json`);
    steps.push({
      number,
      at: new Date(stepFile.at),
      articles: stepFile.articles.map((raw) => ({
        meta: toArticleMeta(raw),
        rawBody: readFileSync(`${dir}${raw.file}`, "utf8"),
      })),
      recordedSlug: `${slug}/steps/${number}`,
      modelId: MODEL_ID,
    });
  }
  return { story: storyFile.story, sources: storyFile.sources, steps };
}

/** 단계의 정답: 그 단계가 만드는 개정판과 직전 개정판과의 변화. 단계가 없는 픽스처는 `golden/revision.json`과 빈 변화다. */
export function loadDemoStepGolden(
  slug: string,
  number: number,
): { readonly revision: Revision; readonly changes: readonly RevisionChange[] } {
  const dir = fixtureDir(slug);
  const base = existsSync(`${dir}steps/1/step.json`) ? `${dir}steps/${number}/` : dir;
  const revision = toRevision(readJson<RawRevision>(`${base}golden/revision.json`));
  const changesPath = `${base}golden/changes.json`;
  const changes = existsSync(changesPath) ? readJson<RevisionChange[]>(changesPath) : [];
  return { revision, changes };
}

/** 단계의 기록 응답으로 답하는 모델 클라이언트. */
export function createDemoStepModelClient(step: DemoStoryStep): ModelClient {
  return createRecordedModelClient(step.recordedSlug, { modelId: step.modelId });
}

/**
 * 단계 하나의 배치 입력(#88). 단계 파일을 재처리 컨텍스트의 원자료로 바꿔 라이브와 같은 규칙(`deriveReprocessContext`)을
 * 탄다. 기사 버전 원자료: 1단계부터 이 단계까지 기사마다 버전이 처음 나온 단계의 시각을 수집 시각으로, 직전 버전과의
 * 정정 표지 판별(`judgeRecheckedBody`)이 정정 후보면 정정 후보로 둔다. 주장 개정판 이력: `latestRevision` 앞 번호 단계의
 * 정답 개정판과 `latestRevision`. 최신 확인 시각은 `latestRevision`의 발행 시각이다.
 * `latestRevision`은 직전 개정판(적재는 DB에서, 리플레이는 직전 단계 정답), `now`는 기본 단계 시각이다.
 */
export function demoStepBatchInput(
  demo: DemoStorySteps,
  index: number,
  options: { readonly latestRevision?: Revision; readonly now?: Date } = {},
): BatchInput {
  const step = demo.steps[index];
  if (step === undefined) throw new Error(`데모 사건 단계 없음: ${demo.story.slug} ${index + 1}`);
  const versions: ArticleVersionRecord[] = [];
  const lastRaw = new Map<
    string,
    { readonly articleVersionId: string; readonly rawBody: string }
  >();
  for (const earlier of demo.steps.slice(0, index + 1)) {
    for (const { meta, rawBody } of earlier.articles) {
      const previous = lastRaw.get(meta.id);
      if (previous?.articleVersionId === meta.articleVersionId) continue;
      lastRaw.set(meta.id, { articleVersionId: meta.articleVersionId, rawBody });
      const version = createArticleVersion({
        id: meta.articleVersionId,
        articleId: meta.id,
        rawBody,
        capturedAt: earlier.at,
      });
      const judged =
        previous === undefined
          ? undefined
          : judgeRecheckedBody(
              createArticleVersion({
                id: previous.articleVersionId,
                articleId: meta.id,
                rawBody: previous.rawBody,
                capturedAt: earlier.at,
              }),
              rawBody,
            );
      versions.push({
        articleId: meta.id,
        articleVersionId: version.id,
        body: version.body,
        capturedAt: earlier.at,
        correctionCandidate: judged?.kind === "새 버전" && judged.change === "정정 후보",
      });
    }
  }
  const { latestRevision } = options;
  const claimHistory =
    latestRevision === undefined
      ? []
      : [
          ...demo.steps
            .filter((s) => s.number < latestRevision.revisionNumber)
            .map((s) => loadDemoStepGolden(demo.story.slug, s.number).revision.claims),
          latestRevision.claims,
        ];
  const context = deriveReprocessContext({
    latestRevision,
    latestCheckedAt: latestRevision?.publishedAt,
    claimHistory,
    articleVersions: versions,
  });
  const articles = step.articles.map(({ meta, rawBody }) => {
    const current = context.currentVersions.get(meta.id);
    return {
      ...meta,
      rawBody,
      ...(current?.correctionCandidate ? { correctionCandidate: true } : {}),
      ...(current?.correctionFirstReprocess ? { correctionFirstReprocess: true } : {}),
    };
  });
  return {
    articles,
    now: options.now ?? step.at,
    dailyBudget: { tokens: 1_000_000, spend: 10 },
    sources: demo.sources,
    existingStories: [
      {
        story: demo.story,
        ...(context.latestRevision ? { latestRevision: context.latestRevision } : {}),
        ...(context.previousVersionBodies
          ? { previousVersionBodies: context.previousVersionBodies }
          : {}),
        ...(context.openEpisodeClaims ? { openEpisodeClaims: context.openEpisodeClaims } : {}),
      },
    ],
  };
}
