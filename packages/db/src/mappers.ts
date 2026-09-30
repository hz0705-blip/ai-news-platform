import type {
  Article,
  ArticleVersion,
  Claim,
  Evidence,
  Revision,
  RevisionChange,
  RevisionSource,
  RightsTier,
  Source,
  Story,
} from "@newstrail/domain";
import { normalizeArticleUrl } from "@newstrail/domain";
import type {
  ArticleRow,
  ArticleVersionRow,
  ClaimRevisionRow,
  ClaimRow,
  EvidenceRow,
  RevisionChangeRow,
  SourceRow,
  StoryRevisionRow,
  StoryRow,
} from "./schema/index.ts";

/**
 * 행 ↔ 도메인 순수 매퍼(#21 Task 6). DB 접근 없이 값만 바꾼다.
 *
 * 개정판의 출처 구획(`Revision.sources`)은 별도 테이블이 없다(테이블 여덟, Ruling 5). 개정판 행은 기사 식별자
 * 목록(`source_article_ids`, #85)만 갖고, 읽을 때 `articles`와 `sources`를 이어 만든다 — `RevisionSourceRow`가 그 이은 행 모양이다.
 */
export interface RevisionSourceRow {
  readonly source_id: string;
  readonly article_id: string;
  readonly article_title: string;
  readonly article_url: string;
  readonly published_at: Date;
  readonly rights_tier: RightsTier;
}

/** 개정판 하나를 이루는 행 묶음. */
export interface RevisionRows {
  readonly revision: StoryRevisionRow;
  readonly claims: readonly ClaimRow[];
  readonly claimRevisions: readonly ClaimRevisionRow[];
  readonly evidence: readonly EvidenceRow[];
  readonly sources: readonly RevisionSourceRow[];
}

/** 기사 본문 보존 기한(docs/spec/v1.md "데이터 보존", #21 Ruling 12). */
const BODY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** `claim_revisions.id`: 개정판 안의 주장 하나를 가리키는 결정론 식별자. */
export function claimRevisionId(revisionId: string, claimId: string): string {
  return `${revisionId}/${claimId}`;
}

function toEvidenceRow(item: Evidence, claimRevision: string, order: number): EvidenceRow {
  return {
    id: item.id,
    claim_revision_id: claimRevision,
    display_order: order,
    article_id: item.articleId,
    article_version_id: item.articleVersionId,
    source_id: item.sourceId,
    span_start: item.span.start,
    span_end: item.span.end,
    offset_unit: item.offsetUnit,
    normalization_version: item.normalizationVersion,
    span_text: item.spanText,
    span_hash: item.spanHash,
    excerpt: item.excerpt,
    excerpt_start: item.excerptSpan.start,
    excerpt_end: item.excerptSpan.end,
    highlight_start: item.highlightInExcerpt.start,
    highlight_end: item.highlightInExcerpt.end,
    source_url: item.sourceUrl,
    verified_at: item.verifiedAt,
    differs_in: item.differsIn ?? null,
  };
}

/** 개정판을 쓸 행 묶음으로 바꾼다. 출처 구획은 `source_article_ids`에만 남는다(읽을 때 잇는다). */
export function toRows(revision: Revision): Omit<RevisionRows, "sources"> {
  const claimRevisions: ClaimRevisionRow[] = [];
  const evidence: EvidenceRow[] = [];
  for (const claim of revision.claims) {
    const id = claimRevisionId(revision.id, claim.id);
    claimRevisions.push({
      id,
      story_revision_id: revision.id,
      claim_id: claim.id,
      display_order: claim.order,
      text: claim.text,
      claim_type: claim.claimType,
      modality: claim.modality,
      contradiction_status: claim.contradictionStatus,
    });
    claim.evidence.forEach((item, order) => {
      evidence.push(toEvidenceRow(item, id, order));
    });
  }

  return {
    revision: {
      id: revision.id,
      story_id: revision.storyId,
      revision_number: revision.revisionNumber,
      title: revision.title,
      published_at: revision.publishedAt,
      // 확인 시각은 발행 시각으로 시작한다. 이후 갱신은 `confirmRevision`이 한다.
      checked_at: revision.publishedAt,
      contradiction_status: revision.contradictionStatus,
      prompt_evidence_extract: revision.promptVersions.evidenceExtract,
      prompt_claim_generate: revision.promptVersions.claimGenerate,
      prompt_gate: revision.promptVersions.gate,
      prompt_contradiction_label: revision.promptVersions.contradictionLabel,
      model_id: revision.modelId,
      source_article_ids: revision.sources.map((s) => s.articleId),
    },
    claims: revision.claims.map((claim) => ({ id: claim.id, story_id: revision.storyId })),
    claimRevisions,
    evidence,
  };
}

function toDomainEvidence(row: EvidenceRow, claimId: string): Evidence {
  return {
    id: row.id,
    claimId,
    articleId: row.article_id,
    articleVersionId: row.article_version_id,
    sourceId: row.source_id,
    span: { start: row.span_start, end: row.span_end },
    offsetUnit: row.offset_unit,
    normalizationVersion: row.normalization_version,
    spanText: row.span_text,
    spanHash: row.span_hash,
    excerpt: row.excerpt,
    excerptSpan: { start: row.excerpt_start, end: row.excerpt_end },
    highlightInExcerpt: { start: row.highlight_start, end: row.highlight_end },
    sourceUrl: row.source_url,
    verifiedAt: row.verified_at,
    ...(row.differs_in === null ? {} : { differsIn: row.differs_in }),
  };
}

function byDisplayOrder(a: { display_order: number }, b: { display_order: number }): number {
  return a.display_order - b.display_order;
}

/** 주장 개정판 행 하나를 도메인 주장으로 되돌린다. `evidence` 중 그 행의 근거만 `display_order` 순으로 붙인다. */
export function toDomainClaim(row: ClaimRevisionRow, evidence: readonly EvidenceRow[]): Claim {
  return {
    id: row.claim_id,
    text: row.text,
    claimType: row.claim_type,
    modality: row.modality,
    order: row.display_order,
    contradictionStatus: row.contradiction_status,
    evidence: evidence
      .filter((e) => e.claim_revision_id === row.id)
      .sort(byDisplayOrder)
      .map((e) => toDomainEvidence(e, row.claim_id)),
  };
}

/**
 * 행 묶음을 개정판으로 되돌린다. 주장·근거는 `display_order` 순, 출처 구획은 받은 순서다.
 * 주장 행(`claims`)은 식별자뿐이라 읽지 않는다 — 주장 내용은 `claimRevisions`에 있다.
 */
export function toDomainRevision(rows: Omit<RevisionRows, "claims">): Revision {
  const { revision } = rows;
  const claims: Claim[] = [...rows.claimRevisions]
    .sort(byDisplayOrder)
    .map((cr) => toDomainClaim(cr, rows.evidence));

  const sources: RevisionSource[] = rows.sources.map((s) => ({
    sourceId: s.source_id,
    articleId: s.article_id,
    articleTitle: s.article_title,
    articleUrl: s.article_url,
    publishedAt: s.published_at,
    rightsTier: s.rights_tier,
  }));

  return {
    id: revision.id,
    storyId: revision.story_id,
    revisionNumber: revision.revision_number,
    title: revision.title,
    publishedAt: revision.published_at,
    contradictionStatus: revision.contradiction_status,
    promptVersions: {
      evidenceExtract: revision.prompt_evidence_extract,
      claimGenerate: revision.prompt_claim_generate,
      gate: revision.prompt_gate,
      contradictionLabel: revision.prompt_contradiction_label,
    },
    modelId: revision.model_id,
    claims,
    sources,
  };
}

export function toStoryRow(story: Story): StoryRow {
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    topics: [...story.topics],
    is_demo: story.isDemo,
    lifecycle: story.lifecycle,
    // 배정 열(#53)은 배정 단계가 채운다. 발행으로 만드는 데모 사건은 셋 다 없다.
    centroid: null,
    last_new_report_at: null,
    last_processed_at: null,
    deferred_at: null,
  };
}

/** 사건 행을 도메인 사건으로 되돌린다. 배정 열(중심·시각)은 도메인 사건에 없다. */
export function toDomainStory(row: StoryRow): Story {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    topics: row.topics,
    isDemo: row.is_demo,
    lifecycle: row.lifecycle,
  };
}

export function toSourceRow(source: Source): SourceRow {
  return {
    id: source.id,
    name: source.name,
    rights_tier: source.rightsTier,
    region: source.region,
    ownership: source.ownership,
    language: source.language,
    is_fictional: source.isFictional,
    wire_id: source.wireId ?? null,
    external_id: source.externalId ?? null,
    domains: [...(source.domains ?? [])],
    is_wire: source.isWire ?? false,
    is_excluded: source.isExcluded ?? false,
  };
}

export function toDomainSource(row: SourceRow): Source {
  return {
    id: row.id,
    name: row.name,
    rightsTier: row.rights_tier,
    region: row.region,
    ownership: row.ownership,
    language: row.language,
    isFictional: row.is_fictional,
    ...(row.wire_id === null ? {} : { wireId: row.wire_id }),
    ...(row.external_id === null ? {} : { externalId: row.external_id }),
    ...(row.domains.length === 0 ? {} : { domains: row.domains }),
    ...(row.is_wire ? { isWire: true } : {}),
    ...(row.is_excluded ? { isExcluded: true } : {}),
  };
}

export function toArticleRow(article: Article, storyId: string): ArticleRow {
  return {
    id: article.id,
    source_id: article.sourceId,
    story_id: storyId,
    url: article.url,
    normalized_url: normalizeArticleUrl(article.url),
    external_id: null,
    title: article.title,
    description: null,
    published_at: article.publishedAt,
    topics: [...article.topics],
    embedding: null,
    observed_at: null,
    is_link_only: false,
  };
}

/**
 * 기사 버전 행. 본문 보존 기한 = 기사 발행 시각 + 30일, 기사를 모르면(발행 시각 불명) 수집 시각 + 30일
 * (#21 Ruling 12).
 */
export function toArticleVersionRow(
  version: ArticleVersion,
  article: Article | undefined,
): ArticleVersionRow {
  const basis = article?.publishedAt ?? version.capturedAt;
  return {
    id: version.id,
    article_id: version.articleId,
    body: version.body,
    normalization_version: version.normalizationVersion,
    body_hash: version.bodyHash,
    captured_at: version.capturedAt,
    body_expires_at: new Date(basis.getTime() + BODY_RETENTION_MS),
    correction_candidate: false,
  };
}

/** 변화 행(#85). 식별자는 `<개정판 id>/change-<순서>`. 종류에 쓰지 않는 열은 null이다. */
export function toChangeRows(
  revisionId: string,
  changes: readonly RevisionChange[],
): RevisionChangeRow[] {
  return changes.map((change, order) => {
    const row: RevisionChangeRow = {
      id: `${revisionId}/change-${order}`,
      story_revision_id: revisionId,
      display_order: order,
      kind: change.kind,
      claim_change: null,
      claim_id: null,
      lineage_claim_id: null,
      previous_text: null,
      current_text: null,
      previous_status: null,
      current_status: null,
      article_id: null,
      article_version_id: null,
    };
    switch (change.kind) {
      case "주장 추가·삭제·수정":
        return {
          ...row,
          claim_change: change.claimChange,
          claim_id: change.claimId,
          lineage_claim_id: change.claimChange === "추가" ? (change.lineageClaimId ?? null) : null,
          previous_text: change.claimChange === "추가" ? null : change.previousText,
          current_text: change.claimChange === "삭제" ? null : change.currentText,
        };
      case "상충 상태 변화":
        return {
          ...row,
          claim_id: change.claimId ?? null,
          previous_status: change.previousStatus,
          current_status: change.currentStatus,
        };
      case "원문 변경":
        return {
          ...row,
          article_id: change.articleId,
          article_version_id: change.articleVersionId,
        };
      case "출처 추가":
        return { ...row, article_id: change.articleId };
    }
    return row;
  });
}

function required<T>(value: T | null, row: RevisionChangeRow, column: string): T {
  if (value === null) throw new Error(`변화 행 ${row.id}의 ${column}이 비었다(${row.kind})`);
  return value;
}

/** 변화 행을 도메인 변화로 되돌린다. 종류에 필요한 열이 비었으면 던진다. */
export function toDomainChange(row: RevisionChangeRow): RevisionChange {
  switch (row.kind) {
    case "주장 추가·삭제·수정": {
      const claimId = required(row.claim_id, row, "claim_id");
      const claimChange = required(row.claim_change, row, "claim_change");
      if (claimChange === "추가") {
        return {
          kind: row.kind,
          claimChange,
          claimId,
          currentText: required(row.current_text, row, "current_text"),
          ...(row.lineage_claim_id === null ? {} : { lineageClaimId: row.lineage_claim_id }),
        };
      }
      if (claimChange === "삭제") {
        return {
          kind: row.kind,
          claimChange,
          claimId,
          previousText: required(row.previous_text, row, "previous_text"),
        };
      }
      return {
        kind: row.kind,
        claimChange,
        claimId,
        previousText: required(row.previous_text, row, "previous_text"),
        currentText: required(row.current_text, row, "current_text"),
      };
    }
    case "상충 상태 변화":
      return {
        kind: row.kind,
        ...(row.claim_id === null ? {} : { claimId: row.claim_id }),
        previousStatus: required(row.previous_status, row, "previous_status"),
        currentStatus: required(row.current_status, row, "current_status"),
      };
    case "원문 변경":
      return {
        kind: row.kind,
        articleId: required(row.article_id, row, "article_id"),
        articleVersionId: required(row.article_version_id, row, "article_version_id"),
      };
    case "출처 추가":
      return { kind: row.kind, articleId: required(row.article_id, row, "article_id") };
  }
}
