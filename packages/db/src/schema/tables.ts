import {
  CLAIM_TYPES,
  CONTRADICTION_STATUSES,
  MODALITIES,
  RIGHTS_TIERS,
  STORY_LIFECYCLES,
  TOPICS,
} from "@newsplatform/domain";
import { boolean, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 테이블 여덟(#21 Ruling 5). 열 이름은 snake_case 영어이고 TS 키도 열 이름과 같게 둔다
 * (행 타입이 곧 매퍼의 행 모양이다). 식별자는 도메인이 정한 결정론 문자열을 그대로 쓰므로
 * `text`다(`story-demo-1-agreement`, `<slug>:rev-1`, `<주장 id>:<quoteId>` 등).
 * `{ enum }`은 타입만 좁히고 DB 제약을 만들지 않는다 — 값 목록은 도메인 상수가 정본이다.
 */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** 출처(CONTEXT.md "출처"). 권리 등급은 출처 단위다. */
export const sources = pgTable("sources", {
  id: text().primaryKey(),
  name: text().notNull(),
  rights_tier: text({ enum: RIGHTS_TIERS }).notNull(),
  region: text().notNull(),
  ownership: text().notNull(),
  language: text().notNull(),
  is_fictional: boolean().notNull(),
});

/** 사건(CONTEXT.md "사건"). 사건 URL은 `slug`로 찾는다. 사건의 상충 상태는 여기 두지 않는다(ADR-0009). */
export const stories = pgTable("stories", {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  topics: text({ enum: TOPICS }).array().notNull(),
  is_demo: boolean().notNull(),
  lifecycle: text({ enum: STORY_LIFECYCLES }).notNull(),
});

/** 기사(CONTEXT.md "기사"). 본문은 기사 버전이 갖는다. */
export const articles = pgTable("articles", {
  id: text().primaryKey(),
  source_id: text()
    .notNull()
    .references(() => sources.id),
  story_id: text()
    .notNull()
    .references(() => stories.id),
  url: text().notNull(),
  title: text().notNull(),
  published_at: timestamptz("published_at").notNull(),
  topic: text({ enum: TOPICS }).notNull(),
});

/**
 * 기사 버전: 한 시점에 정규화한 기사 본문. `body`는 보존 기한이 있는 유일한 열이다 —
 * `body_expires_at` = 기사 발행 시각 + 30일, 발행 시각을 모르면 수집 시각 + 30일
 * (docs/spec/v1.md "데이터 보존", #21 Ruling 12). 근거가 영구 보존하는 값은 `evidence`에 따로 있다.
 */
export const articleVersions = pgTable("article_versions", {
  id: text().primaryKey(),
  article_id: text()
    .notNull()
    .references(() => articles.id),
  body: text().notNull(),
  normalization_version: integer().notNull(),
  body_hash: text().notNull(),
  captured_at: timestamptz("captured_at").notNull(),
  body_expires_at: timestamptz("body_expires_at").notNull(),
});

/** 개정판(CONTEXT.md "개정판"). 사건 하나에서 `revision_number`는 한 번만 쓰인다(발행 멱등). */
export const storyRevisions = pgTable(
  "story_revisions",
  {
    id: text().primaryKey(),
    story_id: text()
      .notNull()
      .references(() => stories.id),
    revision_number: integer().notNull(),
    title: text().notNull(),
    published_at: timestamptz("published_at").notNull(),
    // 파생 값이며 편집 필드가 아니다: 발행 시점에 주장들의 상충 상태에서 `deriveStoryStatus`로
    // 계산해 같은 트랜잭션에서 기록한 값이다. 상태의 권위는 주장에 있다(ADR-0009).
    contradiction_status: text({ enum: CONTRADICTION_STATUSES }).notNull(),
    prompt_evidence_extract: text().notNull(),
    prompt_claim_generate: text().notNull(),
    prompt_contradiction_label: text().notNull(),
    model_id: text().notNull(),
  },
  (t) => [unique().on(t.story_id, t.revision_number)],
);

/** 주장(CONTEXT.md "주장")의 식별자. 개정판을 넘어 유지되며, 개정판마다의 내용은 `claim_revisions`에 있다. */
export const claims = pgTable("claims", {
  id: text().primaryKey(),
  story_id: text()
    .notNull()
    .references(() => stories.id),
});

/** 한 개정판 안의 주장 하나. 한 개정판에 같은 주장은 한 번만 온다. */
export const claimRevisions = pgTable(
  "claim_revisions",
  {
    id: text().primaryKey(),
    story_revision_id: text()
      .notNull()
      .references(() => storyRevisions.id),
    claim_id: text()
      .notNull()
      .references(() => claims.id),
    display_order: integer().notNull(),
    text: text().notNull(),
    claim_type: text({ enum: CLAIM_TYPES }).notNull(),
    modality: text({ enum: MODALITIES }).notNull(),
    contradiction_status: text({ enum: CONTRADICTION_STATUSES }).notNull(),
  },
  (t) => [unique().on(t.story_revision_id, t.claim_id)],
);

/**
 * 근거(CONTEXT.md "근거"). 기사 본문이 지워진 뒤에도 화면을 그릴 값을 전부 영구 보존한다:
 * 강조 구간(`span_*`, 원문·해시), 허용 발췌 창 원문과 그 본문 기준 구간(`excerpt*`),
 * 발췌 안 강조 지역 구간(`highlight_*`), 원문 URL(#21 Ruling 11). 오프셋은 코드 포인트다.
 */
export const evidence = pgTable("evidence", {
  id: text().primaryKey(),
  claim_revision_id: text()
    .notNull()
    .references(() => claimRevisions.id),
  display_order: integer().notNull(),
  article_id: text()
    .notNull()
    .references(() => articles.id),
  article_version_id: text()
    .notNull()
    .references(() => articleVersions.id),
  source_id: text()
    .notNull()
    .references(() => sources.id),
  span_start: integer().notNull(),
  span_end: integer().notNull(),
  offset_unit: text({ enum: ["code-point"] }).notNull(),
  normalization_version: integer().notNull(),
  span_text: text().notNull(),
  span_hash: text().notNull(),
  excerpt: text().notNull(),
  excerpt_start: integer().notNull(),
  excerpt_end: integer().notNull(),
  highlight_start: integer().notNull(),
  highlight_end: integer().notNull(),
  source_url: text().notNull(),
  verified_at: timestamptz("verified_at").notNull(),
});

export type SourceRow = typeof sources.$inferSelect;
export type StoryRow = typeof stories.$inferSelect;
export type ArticleRow = typeof articles.$inferSelect;
export type ArticleVersionRow = typeof articleVersions.$inferSelect;
export type StoryRevisionRow = typeof storyRevisions.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type ClaimRevisionRow = typeof claimRevisions.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
