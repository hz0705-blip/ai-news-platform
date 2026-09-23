export type { Article } from "./article.ts";
export { type ArticleVersion, createArticleVersion } from "./article-version.ts";
export {
  CLAIM_TYPES,
  type Claim,
  type ClaimType,
  MODALITIES,
  type Modality,
} from "./claim.ts";
export {
  type ClaimStatusGuard,
  type ClaimStatusInput,
  type ClaimStatusResult,
  deriveClaimStatus,
  RELATION_LABELS,
  type RelationLabel,
} from "./claim-status.ts";
export { CONTRADICTION_STATUSES, type ContradictionStatus } from "./contradiction-status.ts";
export { DISPLAY_POLICY_VERSION } from "./display-policy.ts";
export type { Evidence } from "./evidence.ts";
export {
  checkEvidenceSpan,
  GATE_FAILURES,
  type GateFailure,
  type GateStage1Result,
} from "./gate-stage1.ts";
export { sha256Hex } from "./hash.ts";
export { formatRelativeTime } from "./relative-time.ts";
export {
  countReportingOrigins,
  type OriginEvidence,
  reportingOrigins,
} from "./reporting-origin.ts";
export type { Revision, RevisionSource } from "./revision.ts";
export { RIGHTS_TIERS, type RightsTier } from "./rights.ts";
export { splitSentences } from "./sentence.ts";
export type { Source } from "./source.ts";
export {
  type CodePointSpan,
  findSpan,
  spanLength,
  spanText,
  toUtf16Range,
} from "./span.ts";
export { STORY_LIFECYCLES, type Story, type StoryLifecycle } from "./story.ts";
export { deriveStoryStatus } from "./story-status.ts";
export { NORMALIZATION_VERSION, normalizeBody } from "./text.ts";
export { TOPICS, type Topic } from "./topic.ts";
