export { PROMPT_VERSIONS, runBatch } from "./batch-run.ts";
export {
  type ClaimGenerateRecord,
  type ContradictionLabelRecord,
  DEMO_REFERENCE_TIME,
  type DemoArticleMeta,
  type DemoStoryFixture,
  type EvidenceExtractRecord,
  listGoldenSetSlugs,
  loadDemoStoryFixture,
  loadDemoStoryInputs,
} from "./fixtures.ts";
export {
  createOpenAiEmbeddingClient,
  EMBEDDING_MODEL,
  EMBEDDING_USD_PER_TOKEN,
  type OpenAiEmbeddingOptions,
} from "./openai/embedding.ts";
export {
  createRecordedEmbeddingFetch,
  type RecordedEmbeddingResponse,
} from "./openai/embedding-recorded.ts";
export {
  createRecordedModelClient,
  type RecordedModelClientOptions,
  RecordedResponseMissingError,
} from "./recorded.ts";
export { BatchInputSchema, BatchReportSchema, RevisionSchema } from "./schemas.ts";
export {
  buildGnewsRequest,
  type CollectGnewsDeps,
  type CollectGnewsResult,
  collectGnews,
  collectionWindow,
  GNEWS_MAX_PAGES_PER_TOPIC,
  GNEWS_PAGE_SIZE,
  GNEWS_TOPIC_QUERIES,
  GnewsRequestError,
  GnewsResponseSchema,
  type GnewsTopicKey,
  type GnewsTopicQuery,
  toCollected,
} from "./sources/gnews.ts";
export { createRecordedGnewsFetch, type RecordedGnewsResponse } from "./sources/gnews-recorded.ts";
export {
  type AssignmentArticle,
  type AssignmentDeps,
  type AssignmentInput,
  type AssignmentOutcome,
  type AssignmentResult,
  type AssignmentStore,
  runAssignment,
} from "./stages/assign.ts";
export {
  type ArticleInput,
  type BatchDeps,
  type BatchInput,
  type BatchReport,
  type BatchResult,
  type Budget,
  CHANGE_KINDS,
  type Change,
  type ChangeKind,
  type ConfirmedRevision,
  type DroppedClaim,
  type EmbeddingClient,
  type EmbeddingResult,
  type ModelClient,
  StageFailure,
  type StoryState,
} from "./types.ts";
