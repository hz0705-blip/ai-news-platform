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
  revisionNumber: z.number().int().positive(),
  /** 이전 개정판에서 보도 상충이었는데 이번 개정판에 없는 주장 수(Ruling 22-8). */
  openEpisodes: z.number().int().nonnegative(),
  title: z.string(),
  publishedAt: z.date(),
  promptVersions: PromptVersionsSchema,
  modelId: z.string(),
  claims: z.array(
    claimDraft.omit({ quoteIds: true }).extend({
      /** 주장 매칭이 정한 식별자(#85). 없으면 `claimId(slug, claimKey)`. */
      id: z.string().optional(),
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
          differsIn: z.string().optional(),
        }),
      ),
    }),
  ),
  sources: z.array(RevisionSourceSchema),
});

export const OutputSchema = RevisionSchema;

export type RevisionInput = z.infer<typeof InputSchema>;

export function idempotencyKey(input: RevisionInput): string {
  return `${input.story.id}:rev:${input.revisionNumber}`;
}

/**
 * 새 주장 식별자(Ruling 22-2, #85). 첫 개정판은 `<slug>:<claimKey>`, 그 뒤 개정판에서 이전 주장과 매칭되지 않은
 * 주장은 `<slug>:<claimKey>@rev-<번호>` — 매칭된 주장이 이어받은 식별자·삭제된 주장의 식별자와 겹치지 않는다.
 */
export function claimId(slug: string, claimKey: string, revisionNumber = 1): string {
  return revisionNumber === 1 ? `${slug}:${claimKey}` : `${slug}:${claimKey}@rev-${revisionNumber}`;
}

/**
 * 개정판을 만든다. 사건 상충 상태는 `deriveStoryStatus`가 주장들과 열린 에피소드 수에서 파생한다.
 * 식별자(Ruling 22-2): 개정판 `<slug>:rev-<번호>`, 주장은 입력의 `id`(매칭 결과) 또는 `claimId`,
 * 근거 `<개정판 id>/<주장 id>:<quoteId>`. 근거 검증 시각은 개정판 발행 시각과 같다.
 */
export function runRevision(input: RevisionInput): Revision {
  const { slug } = input.story;
  const revisionId = `${slug}:rev-${input.revisionNumber}`;

  const claims = input.claims.map((draft, order) => {
    const id = draft.id ?? claimId(slug, draft.claimKey, input.revisionNumber);
    return {
      id,
      text: draft.text,
      claimType: draft.claimType,
      modality: draft.modality,
      order,
      contradictionStatus: draft.contradictionStatus,
      evidence: draft.evidence.map((item) => ({
        id: `${revisionId}/${id}:${item.quoteId}`,
        claimId: id,
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
        ...(item.differsIn === undefined ? {} : { differsIn: item.differsIn }),
      })),
    };
  });

  if (claims.length === 0) {
    throw new StageFailure(STAGE, idempotencyKey(input), "표시할 주장이 없다");
  }

  return {
    id: revisionId,
    storyId: input.story.id,
    revisionNumber: input.revisionNumber,
    title: input.title,
    publishedAt: input.publishedAt,
    contradictionStatus: deriveStoryStatus(claims, input.openEpisodes),
    promptVersions: input.promptVersions,
    modelId: input.modelId,
    claims,
    sources: input.sources,
  };
}
