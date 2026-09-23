import {
  CONTRADICTION_STATUSES,
  deriveStoryStatus,
  type Revision,
  sha256Hex,
} from "@newsplatform/domain";
import { z } from "zod";
import {
  ClaimGenerateResponseSchema,
  CodePointSpanSchema,
  PromptVersionsSchema,
  RevisionSchema,
  RevisionSourceSchema,
} from "../schemas.ts";
import { StageFailure } from "../types.ts";

export const STAGE = "revision";

const claimDraft = ClaimGenerateResponseSchema.shape.claims.element;

/**
 * 개정판 생성(모델 없음). 주장은 게이트 1단계와 상충 판정을 통과한 것만, 표시 순서대로 온다.
 * 결정론 식별자는 여기서 붙인다.
 */
export const InputSchema = z.object({
  story: z.object({ id: z.string(), slug: z.string() }),
  title: z.string(),
  publishedAt: z.date(),
  promptVersions: PromptVersionsSchema,
  modelId: z.string(),
  claims: z.array(
    claimDraft.omit({ quoteIds: true }).extend({
      contradictionStatus: z.enum(CONTRADICTION_STATUSES),
      evidence: z.array(
        z.object({
          quoteId: z.string(),
          articleId: z.string(),
          articleVersionId: z.string(),
          sourceId: z.string(),
          sourceUrl: z.string(),
          span: CodePointSpanSchema,
          normalizationVersion: z.number().int(),
          spanText: z.string(),
          excerpt: z.string(),
          excerptSpan: CodePointSpanSchema,
          highlightInExcerpt: CodePointSpanSchema,
        }),
      ),
    }),
  ),
  sources: z.array(RevisionSourceSchema),
});

export const OutputSchema = RevisionSchema;

export type RevisionInput = z.infer<typeof InputSchema>;

export function idempotencyKey(input: RevisionInput): string {
  return `${input.story.id}:rev:1`;
}

/**
 * 첫 개정판을 만든다(`revisionNumber: 1`). 사건 상충 상태는 `deriveStoryStatus`가 주장들에서
 * 파생한다. 식별자: 개정판 `<slug>:rev-1`, 주장 `<slug>:<claimKey>`, 근거 `<주장 id>:<quoteId>`.
 * 근거 검증 시각은 개정판 발행 시각과 같다.
 */
export function runRevision(input: RevisionInput): Revision {
  const { slug } = input.story;

  const claims = input.claims.map((draft, order) => {
    const claimId = `${slug}:${draft.claimKey}`;
    return {
      id: claimId,
      text: draft.text,
      claimType: draft.claimType,
      modality: draft.modality,
      order,
      contradictionStatus: draft.contradictionStatus,
      evidence: draft.evidence.map((item) => ({
        id: `${claimId}:${item.quoteId}`,
        claimId,
        articleId: item.articleId,
        articleVersionId: item.articleVersionId,
        sourceId: item.sourceId,
        span: item.span,
        offsetUnit: "code-point" as const,
        normalizationVersion: item.normalizationVersion,
        spanText: item.spanText,
        spanHash: sha256Hex(item.spanText),
        excerpt: item.excerpt,
        excerptSpan: item.excerptSpan,
        highlightInExcerpt: item.highlightInExcerpt,
        sourceUrl: item.sourceUrl,
        verifiedAt: input.publishedAt,
      })),
    };
  });

  if (claims.length === 0) {
    throw new StageFailure(STAGE, idempotencyKey(input), "표시할 주장이 없다");
  }

  return {
    id: `${slug}:rev-1`,
    storyId: input.story.id,
    revisionNumber: 1,
    title: input.title,
    publishedAt: input.publishedAt,
    contradictionStatus: deriveStoryStatus(claims),
    promptVersions: input.promptVersions,
    modelId: input.modelId,
    claims,
    sources: input.sources,
  };
}
