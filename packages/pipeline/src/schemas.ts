import {
  CLAIM_TYPES,
  type Claim,
  CONTRADICTION_STATUSES,
  type CodePointSpan,
  type Evidence,
  MODALITIES,
  RELATION_LABELS,
  type Revision,
  type RevisionSource,
  RIGHTS_TIERS,
  type Source,
  STORY_LIFECYCLES,
  type Story,
  TOPICS,
} from "@newsplatform/domain";
import { z } from "zod";
import type { ArticleInput, BatchInput, BatchReport, Budget, StoryState } from "./types.ts";

// ── 도메인 타입과 같은 모양의 스키마 ──────────────────────────────

export const CodePointSpanSchema: z.ZodType<CodePointSpan> = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const SourceSchema: z.ZodType<Source> = z.object({
  id: z.string(),
  name: z.string(),
  rightsTier: z.enum(RIGHTS_TIERS),
  region: z.string(),
  ownership: z.string(),
  language: z.string(),
  isFictional: z.boolean(),
  wireId: z.string().exactOptional(),
});

export const StorySchema: z.ZodType<Story> = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  topics: z.array(z.enum(TOPICS)),
  isDemo: z.boolean(),
  lifecycle: z.enum(STORY_LIFECYCLES),
});

/** 도메인 `Article`의 필드. `ArticleInputSchema`가 여기에 기사 버전 식별자와 원문을 더한다. */
const articleShape = {
  id: z.string(),
  sourceId: z.string(),
  storyId: z.string(),
  url: z.string(),
  title: z.string(),
  publishedAt: z.date(),
  topic: z.enum(TOPICS),
};

export const EvidenceSchema: z.ZodType<Evidence> = z.object({
  id: z.string(),
  claimId: z.string(),
  articleId: z.string(),
  articleVersionId: z.string(),
  sourceId: z.string(),
  span: CodePointSpanSchema,
  offsetUnit: z.literal("code-point"),
  normalizationVersion: z.number().int(),
  spanText: z.string(),
  spanHash: z.string(),
  excerpt: z.string(),
  excerptSpan: CodePointSpanSchema,
  highlightInExcerpt: CodePointSpanSchema,
  sourceUrl: z.string(),
  verifiedAt: z.date(),
  differsIn: z.string().exactOptional(),
});

export const ClaimSchema: z.ZodType<Claim> = z.object({
  id: z.string(),
  text: z.string(),
  claimType: z.enum(CLAIM_TYPES),
  modality: z.enum(MODALITIES),
  order: z.number().int().nonnegative(),
  contradictionStatus: z.enum(CONTRADICTION_STATUSES),
  evidence: z.array(EvidenceSchema),
});

export const RevisionSourceSchema: z.ZodType<RevisionSource> = z.object({
  sourceId: z.string(),
  articleId: z.string(),
  articleTitle: z.string(),
  articleUrl: z.string(),
  publishedAt: z.date(),
  rightsTier: z.enum(RIGHTS_TIERS),
});

/** 개정판이 기록하는 프롬프트 버전. 값은 `<단계>@<정수>`. */
export const PromptVersionsSchema = z.object({
  evidenceExtract: z.string(),
  claimGenerate: z.string(),
  contradictionLabel: z.string(),
});

export const RevisionSchema: z.ZodType<Revision> = z.object({
  id: z.string(),
  storyId: z.string(),
  revisionNumber: z.number().int().positive(),
  title: z.string(),
  publishedAt: z.date(),
  contradictionStatus: z.enum(CONTRADICTION_STATUSES),
  promptVersions: PromptVersionsSchema,
  modelId: z.string(),
  claims: z.array(ClaimSchema),
  sources: z.array(RevisionSourceSchema),
});

// ── 기록된 응답(Ruling 3·13). 어디에도 정수 오프셋이 없다 ───────────

/** 근거 추출 응답: 인용문 원문만. 구간은 백엔드가 `findSpan`으로 계산한다. */
export const EvidenceExtractResponseSchema = z.object({
  quotes: z.array(z.object({ quoteId: z.string(), quote: z.string() })),
});

/** 주장 생성 응답: 사건 제목과 주장 문장, 각 주장이 기대는 인용문 식별자. */
export const ClaimGenerateResponseSchema = z.object({
  title: z.string(),
  claims: z.array(
    z.object({
      claimKey: z.string(),
      text: z.string(),
      claimType: z.enum(CLAIM_TYPES),
      modality: z.enum(MODALITIES),
      quoteIds: z.array(z.string()),
    }),
  ),
});

/**
 * 상충 판정 응답의 인용문 쌍 하나. `양립 불가` 쌍은 a·b 양쪽 인용의 다른 점(`differsIn`)을 반드시
 * 가지고, 다른 라벨은 가지지 않는다(#22 Ruling 22-6). a는 주장을 뒷받침, b는 양립 불가한 명제다.
 */
const PairSchema = z
  .object({
    a: z.string(),
    b: z.string(),
    label: z.enum(RELATION_LABELS),
    differsIn: z.record(z.string(), z.string().min(1)).optional(),
  })
  .superRefine((pair, ctx) => {
    if (pair.label === "양립 불가") {
      const { differsIn } = pair;
      if (!differsIn || !Object.hasOwn(differsIn, pair.a) || !Object.hasOwn(differsIn, pair.b)) {
        ctx.addIssue({ code: "custom", message: "양립 불가 쌍은 a·b 모두의 differsIn이 필요하다" });
      } else if (
        Object.keys(differsIn).some((quoteId) => quoteId !== pair.a && quoteId !== pair.b)
      ) {
        ctx.addIssue({ code: "custom", message: "양립 불가 쌍의 differsIn 키는 a·b뿐이다" });
      }
    } else if (pair.differsIn !== undefined) {
      ctx.addIssue({ code: "custom", message: `${pair.label} 쌍은 differsIn을 갖지 않는다` });
    }
  });

/** 상충 판정 응답: 인용문 쌍마다 관계 라벨 하나. */
export const ContradictionLabelResponseSchema = z.object({ pairs: z.array(PairSchema) });

// ── 배치 입력·리포트 ────────────────────────────────────────────

export const ArticleInputSchema: z.ZodType<ArticleInput> = z.object({
  ...articleShape,
  articleVersionId: z.string(),
  rawBody: z.string(),
});

export const BudgetSchema: z.ZodType<Budget> = z.object({
  tokens: z.number().nonnegative(),
  spend: z.number().nonnegative(),
});

export const StoryStateSchema: z.ZodType<StoryState> = z.object({
  story: StorySchema,
  latestRevision: RevisionSchema.exactOptional(),
});

export const BatchInputSchema: z.ZodType<BatchInput> = z.object({
  articles: z.array(ArticleInputSchema),
  now: z.date(),
  dailyBudget: BudgetSchema,
  sources: z.array(SourceSchema),
  existingStories: z.array(StoryStateSchema),
});

export const BatchReportSchema: z.ZodType<BatchReport> = z.object({
  processed: z.number().int().nonnegative(),
  deferred: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  failures: z.array(z.object({ storyId: z.string(), reason: z.string().min(1) })),
  droppedClaims: z.array(
    z.object({ storyId: z.string(), claimKey: z.string(), reason: z.string().min(1) }),
  ),
  usage: z.array(
    z.object({
      stage: z.string(),
      tokens: z.number().nonnegative(),
      spend: z.number().nonnegative(),
    }),
  ),
  budgetReached: z.boolean(),
});
