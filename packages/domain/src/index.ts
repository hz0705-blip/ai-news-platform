export {
  DELETION_RECORD_RETENTION_MS,
  isUnlinkDone,
  isUnlinkOverdue,
  isUnlinkProvider,
  nextUnlinkAttemptAt,
  UNLINK_DEADLINE_MS,
  UNLINK_PROVIDERS,
  UNLINK_RETRY_DELAYS_MS,
  UNLINK_RETRY_HOURLY_MS,
  type UnlinkProvider,
  type UnlinkResult,
} from "./account-deletion.ts";
export type { Article } from "./article.ts";
export { type ArticleVersion, createArticleVersion } from "./article-version.ts";
export {
  type BatchNotice,
  DISPLAY_DELAY_MS,
  type DueBatchRun,
  deriveBatchNotice,
  dueSlotKeyOf,
} from "./batch-status.ts";
export {
  CLAIM_TYPES,
  type Claim,
  type ClaimType,
  MODALITIES,
  type Modality,
} from "./claim.ts";
export {
  CLAIM_MATCH_THRESHOLDS,
  type ClaimMatch,
  type ClaimMatchThresholds,
  classifyMatch,
  continuityScore,
  type MatchableClaim,
  type MatchKind,
  matchClaims,
} from "./claim-matching.ts";
export {
  type ClaimStatusGuard,
  type ClaimStatusInput,
  type ClaimStatusResult,
  deriveClaimStatus,
  RELATION_LABELS,
  type RelationLabel,
} from "./claim-status.ts";
export type { CollectedArticle } from "./collected-article.ts";
export { openEpisodeClaims } from "./contradiction-episode.ts";
export { CONTRADICTION_STATUSES, type ContradictionStatus } from "./contradiction-status.ts";
export {
  CORRECTION_MARKERS,
  judgeRecheckedBody,
  newCorrectionMarkers,
  type RecheckedBodyJudgement,
} from "./correction-marker.ts";
export { canDisplayExcerpt, DISPLAY_POLICY_VERSION } from "./display-policy.ts";
export type { Evidence } from "./evidence.ts";
export {
  articleIdFor,
  articleVersionIdFor,
  type DedupedArticle,
  dedupeExact,
  type ExactDedupInput,
  type KnownArticle,
} from "./exact-dedup.ts";
export {
  checkEvidenceSpan,
  GATE_FAILURES,
  type GateFailure,
  type GateStage1Result,
} from "./gate-stage1.ts";
export {
  canStartRecheck,
  GNEWS_DAILY_LIMIT,
  GNEWS_DISCOVERY_SHARE,
  GNEWS_MAX_REQUESTS_PER_LOOKUP,
  GNEWS_RECHECK_SHARE,
  type GnewsLedgerDay,
  gnewsLedgerDate,
  gnewsLedgerRemaining,
} from "./gnews-ledger.ts";
export { sha256Hex } from "./hash.ts";
export { properNounsOf } from "./proper-nouns.ts";
export {
  type DormantRecheckSlot,
  type PlannedRecheck,
  planRechecks,
  RECHECK_DORMANT_DAILY_CAP,
  RECHECK_SLOTS,
  type RecheckCandidate,
  type RecheckSlot,
} from "./recheck-schedule.ts";
export { formatRelativeTime } from "./relative-time.ts";
export {
  countReportingOrigins,
  type OriginEvidence,
  reportingOrigins,
} from "./reporting-origin.ts";
export {
  type ArticleVersionRecord,
  deriveReprocessContext,
  type ReprocessArticleVersion,
  type ReprocessContext,
  type ReprocessContextInput,
} from "./reprocess-context.ts";
export type { Revision, RevisionSource } from "./revision.ts";
export {
  CHANGE_KINDS,
  type ChangeKind,
  CLAIM_CHANGES,
  type ClaimChange,
  type ComputeChangesOptions,
  computeChanges,
  type RevisionChange,
} from "./revision-changes.ts";
export { isSameRevisionContent } from "./revision-equality.ts";
export { revisionWithSources } from "./revision-sources.ts";
export { canProcessBody, isLinkOnly, RIGHTS_TIERS, type RightsTier } from "./rights.ts";
export { splitSentences } from "./sentence.ts";
export {
  matchSourceByDomain,
  OWNERSHIP_TYPES,
  type Ownership,
  type Source,
  sourceHostOf,
} from "./source.ts";
export {
  type CodePointSpan,
  findSpan,
  spanLength,
  spanText,
  toUtf16Range,
} from "./span.ts";
export {
  createSpanAligner,
  SPAN_REALIGN_MAX_EDITS,
  type SpanRealignFailure,
  type SpanRealignResult,
} from "./span-realign.ts";
export { STORY_LIFECYCLES, type Story, type StoryLifecycle } from "./story.ts";
export {
  ACTIVE_WINDOW_MS,
  ASSIGNMENT_THRESHOLDS,
  type AssignmentCandidate,
  type AssignmentDecision,
  type AssignmentInput,
  type AssignmentThresholds,
  cosineSimilarity,
  decideAssignment,
  embeddingInputFor,
  isActiveStory,
  orderForAssignment,
  storyIdForFirstArticle,
} from "./story-assignment.ts";
export {
  countClaimStatuses,
  deriveStoryStatus,
  type StatusCounts,
  type StoryStatusInput,
} from "./story-status.ts";
export { NORMALIZATION_VERSION, normalizeBody, normalizeTitle } from "./text.ts";
export { TOPICS, type Topic } from "./topic.ts";
export { normalizeArticleUrl } from "./url.ts";
