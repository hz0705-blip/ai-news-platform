export { type ArticleVersion, createArticleVersion } from "./article-version.ts";
export { CONTRADICTION_STATUSES, type ContradictionStatus } from "./contradiction-status.ts";
export { sha256Hex } from "./hash.ts";
export { splitSentences } from "./sentence.ts";
export {
  type CodePointSpan,
  findSpan,
  spanLength,
  spanText,
  toUtf16Range,
} from "./span.ts";
export { NORMALIZATION_VERSION, normalizeBody } from "./text.ts";
export { TOPICS, type Topic } from "./topic.ts";
