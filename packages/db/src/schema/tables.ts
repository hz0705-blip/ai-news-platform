import {
  CHANGE_KINDS,
  CLAIM_CHANGES,
  CLAIM_TYPES,
  CONTRADICTION_STATUSES,
  MODALITIES,
  RIGHTS_TIERS,
  STORY_LIFECYCLES,
  TOPICS,
} from "@newsplatform/domain";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";

/**
 * 테이블 여덟(#21 Ruling 5). 열 이름은 snake_case 영어이고 TS 키도 열 이름과 같게 둔다
 * (행 타입이 곧 매퍼의 행 모양이다). 식별자는 도메인이 정한 결정론 문자열을 그대로 쓰므로
 * `text`다(`story-demo-1-agreement`, `<slug>:rev-1`, `<개정판 id>/<주장 id>:<quoteId>` 등).
 * `{ enum }`은 타입만 좁히고 DB 제약을 만들지 않는다 — 값 목록은 도메인 상수가 정본이다.
 */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** 임베딩 차원(스펙 "임베딩 모델·차원": `text-embedding-3-small` 1536). */
export const EMBEDDING_DIMENSIONS = 1536;

/** 출처(CONTEXT.md "출처"). 권리 등급은 출처 단위다. */
export const sources = pgTable("sources", {
  id: text().primaryKey(),
  name: text().notNull(),
  rights_tier: text({ enum: RIGHTS_TIERS }).notNull(),
  region: text().notNull(),
  ownership: text().notNull(),
  language: text().notNull(),
  is_fictional: boolean().notNull(),
  // 이 출처가 전재한 통신 기사 식별자. 같은 값의 출처들은 보도 원점 하나로 센다(#22 Ruling 22-13).
  wire_id: text("wire_id"),
  // 제공자 쪽 식별자(GNews `source.id`). 데모의 가상 출처에는 없다(#52).
  external_id: text("external_id").unique(),
  // 출처 표(#76, `packages/db/sources/sources.json`을 `sources:sync`가 동기화)에 등록된 출처만 채운다.
  // `domains`는 수집 기사를 이 출처에 맞추는 호스트 목록(빈 배열 = 미등록), `is_excluded`면 수집 단계에서 버린다.
  domains: text().array().notNull().default([]),
  is_wire: boolean("is_wire").notNull().default(false),
  is_excluded: boolean("is_excluded").notNull().default(false),
});

/**
 * 사건(CONTEXT.md "사건"). 사건 URL은 `slug`로 찾는다. 사건의 상충 상태는 여기 두지 않는다(ADR-0009).
 * 배정(#53)이 쓰는 열: `centroid`는 소속 기사 임베딩의 평균(배정 때마다 다시 계산), `last_new_report_at`은
 * 마지막 신규 보도(새로 배정된 기사)의 발행 시각으로 활성 창 72시간의 기준, `last_processed_at`은 배치가
 * 이 사건을 마지막으로 건드린 시각(재수집·갱신 버전은 이것만 갱신한다 — 스펙 "사건 수명").
 * 데모 사건과 배정 전 사건은 셋 다 null이다.
 */
export const stories = pgTable("stories", {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  topics: text({ enum: TOPICS }).array().notNull(),
  is_demo: boolean().notNull(),
  lifecycle: text({ enum: STORY_LIFECYCLES }).notNull(),
  centroid: vector({ dimensions: EMBEDDING_DIMENSIONS }),
  last_new_report_at: timestamptz("last_new_report_at"),
  last_processed_at: timestamptz("last_processed_at"),
  // 배치가 한도·기한 도달로 미룬 시각("수집됨, 분석 대기", #55). 처리되면 null로 돌아간다.
  deferred_at: timestamptz("deferred_at"),
});

/**
 * 기사(CONTEXT.md "기사"). 본문은 기사 버전이 갖는다.
 * 동일성 키는 `normalized_url`(#52, 스펙 "정확 중복 제거"). `story_id`는 사건 배정(#53) 전까지 null이다.
 * `topics`는 이 기사를 가져온 수집 쿼리 토픽의 합집합, `external_id`는 GNews 기사 id(보조 기록),
 * `description`은 임베딩 입력(스펙 "임베딩 모델·차원")이 될 응답의 설명이다.
 * `embedding`은 제목+설명의 임베딩(#53)이며 HNSW 코사인 인덱스로 후보를 찾는다. null을 허용하므로
 * 사건 종료 시 임베딩 삭제(스펙 "사건 수명")는 이 열을 null로 두면 된다(삭제 자체는 이 티켓 밖).
 */
export const articles = pgTable(
  "articles",
  {
    id: text().primaryKey(),
    source_id: text()
      .notNull()
      .references(() => sources.id),
    story_id: text().references(() => stories.id),
    url: text().notNull(),
    normalized_url: text("normalized_url").notNull().unique(),
    external_id: text("external_id"),
    title: text().notNull(),
    description: text(),
    published_at: timestamptz("published_at").notNull(),
    topics: text({ enum: TOPICS }).array().notNull(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
    // GDELT(#77). `observed_at`은 GDELT가 이 기사를 처음 본 시각(`seendate`)이다 — 기존 기사가 GDELT 결과에
    // 나오면 이 열만 채운다(관측). `is_link_only`는 GDELT가 만든 링크만 기사로, 기사 버전(본문)이 없고
    // 발행 시각을 모르므로 `published_at`은 `observed_at`의 복사본(정렬 키)이며 임베딩도 두지 않는다.
    observed_at: timestamptz("observed_at"),
    is_link_only: boolean("is_link_only").notNull().default(false),
  },
  (t) => [
    index("articles_story_id_idx").on(t.story_id),
    index("articles_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/**
 * 기사 버전: 한 시점에 정규화한 기사 본문. `body`는 보존 기한이 있는 유일한 열이다 —
 * `body_expires_at` = 기사 발행 시각 + 30일, 발행 시각을 모르면 수집 시각 + 30일
 * (docs/spec/v1.md "데이터 보존", #21 Ruling 12). 근거가 영구 보존하는 값은 `evidence`에 따로 있다.
 */
export const articleVersions = pgTable(
  "article_versions",
  {
    id: text().primaryKey(),
    article_id: text()
      .notNull()
      .references(() => articles.id),
    body: text().notNull(),
    normalization_version: integer().notNull(),
    body_hash: text().notNull(),
    captured_at: timestamptz("captured_at").notNull(),
    body_expires_at: timestamptz("body_expires_at").notNull(),
  },
  // 같은 기사의 같은 본문은 한 버전이다(#52, 스펙 "정확 중복 제거").
  (t) => [unique().on(t.article_id, t.body_hash)],
);

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
    // 마지막으로 확인한 시각. 발행 시 `published_at`으로 시작하고, 재처리가 새 개정판을 만들지 않으면
    // 이 값만 갱신한다(`confirmRevision`).
    checked_at: timestamptz("checked_at").notNull().defaultNow(),
    // 파생 값이며 편집 필드가 아니다: 발행 시점에 주장들의 상충 상태에서 `deriveStoryStatus`로
    // 계산해 같은 트랜잭션에서 기록한 값이다. 상태의 권위는 주장에 있다(ADR-0009).
    contradiction_status: text({ enum: CONTRADICTION_STATUSES }).notNull(),
    prompt_evidence_extract: text().notNull(),
    prompt_claim_generate: text().notNull(),
    prompt_gate: text().notNull(),
    prompt_contradiction_label: text().notNull(),
    model_id: text().notNull(),
    // 이 개정판의 출처 구획(기사 식별자). 다음 개정판의 "출처 추가" 변화와 개정판 생성 조건이 이것과 비교한다(#85).
    // 마이그레이션 전 개정판은 그 시점 사건의 기사 전부로 채웠다.
    source_article_ids: text("source_article_ids").array().notNull().default([]),
  },
  (t) => [
    unique().on(t.story_id, t.revision_number),
    index("story_revisions_story_id_idx").on(t.story_id),
  ],
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
export const evidence = pgTable(
  "evidence",
  {
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
    // 같은 주장의 다른 근거와 이 근거가 다른 점(양립 불가 쌍에만 있다).
    differs_in: text("differs_in"),
  },
  (t) => [index("evidence_claim_revision_id_idx").on(t.claim_revision_id)],
);

/**
 * 변화(CONTEXT.md "변화", #85): 개정판과 직전 개정판 사이의 차이 한 줄. 종류(`kind`)마다 쓰는 열이 다르다 —
 * 주장 변화는 `claim_change`·`claim_id`·문장(추가는 현재, 삭제는 이전, 수정은 둘 다)과 계보(`lineage_claim_id`,
 * 이전 주장과 연속으로 잇지 못한 새 주장), 상충 상태 변화는 상태 이전→현재(`claim_id`가 null이면 사건 상태),
 * 원문 변경은 `article_id`·`article_version_id`, 출처 추가는 `article_id`. 첫 개정판과 마이그레이션 전 개정판은 행이 없다.
 */
export const revisionChanges = pgTable(
  "revision_changes",
  {
    id: text().primaryKey(),
    story_revision_id: text()
      .notNull()
      .references(() => storyRevisions.id),
    display_order: integer().notNull(),
    kind: text({ enum: CHANGE_KINDS }).notNull(),
    claim_change: text({ enum: CLAIM_CHANGES }),
    claim_id: text().references(() => claims.id),
    lineage_claim_id: text().references(() => claims.id),
    previous_text: text(),
    current_text: text(),
    previous_status: text({ enum: CONTRADICTION_STATUSES }),
    current_status: text({ enum: CONTRADICTION_STATUSES }),
    article_id: text().references(() => articles.id),
    article_version_id: text().references(() => articleVersions.id),
  },
  (t) => [index("revision_changes_story_revision_id_idx").on(t.story_revision_id)],
);

/** 배치 실행 상태(슬롯 원장). */
export const BATCH_RUN_STATUSES = ["running", "completed", "failed"] as const;

/**
 * 슬롯 원장(#55, 스펙 "배포와 운영" 스케줄러). 행 하나 = 의도한 KST 슬롯 하나(`slot_key`, 예 `2026-09-27T17:00+09:00`),
 * 시각은 UTC로 저장한다. `running` 행의 `lease_expires_at`이 DB 리스다 — 유효한 리스가 하나라도 있으면
 * 다른 슬롯의 배치는 시작하지 않는다(한 번에 한 배치). `report`는 배치 리포트 JSON, `spend_usd`는
 * 같은 KST 날짜의 일일 예산 잔액 계산용 합계다.
 */
export const batchRuns = pgTable("batch_runs", {
  slot_key: text("slot_key").primaryKey(),
  slot_at: timestamptz("slot_at").notNull(),
  status: text({ enum: BATCH_RUN_STATUSES }).notNull(),
  attempt: integer().notNull(),
  lease_expires_at: timestamptz("lease_expires_at"),
  started_at: timestamptz("started_at").notNull(),
  finished_at: timestamptz("finished_at"),
  spend_usd: doublePrecision("spend_usd").notNull(),
  report: jsonb(),
  error: text(),
});

export type SourceRow = typeof sources.$inferSelect;
export type StoryRow = typeof stories.$inferSelect;
export type ArticleRow = typeof articles.$inferSelect;
export type ArticleVersionRow = typeof articleVersions.$inferSelect;
export type StoryRevisionRow = typeof storyRevisions.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type ClaimRevisionRow = typeof claimRevisions.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
export type RevisionChangeRow = typeof revisionChanges.$inferSelect;
export type BatchRunRow = typeof batchRuns.$inferSelect;
