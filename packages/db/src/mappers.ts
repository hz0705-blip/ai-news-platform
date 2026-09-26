import type {
  Article,
  ArticleVersion,
  Claim,
  Evidence,
  Revision,
  RevisionSource,
  RightsTier,
  Source,
  Story,
} from "@newsplatform/domain";
import type {
  ArticleRow,
  ArticleVersionRow,
  ClaimRevisionRow,
  ClaimRow,
  EvidenceRow,
  SourceRow,
  StoryRevisionRow,
  StoryRow,
} from "./schema/index.ts";

/**
 * 행 ↔ 도메인 순수 매퍼(#21 Task 6). DB 접근 없이 값만 바꾼다.
 *
 * 개정판의 출처 구획(`Revision.sources`)은 별도 테이블이 없다(테이블 여덟, Ruling 5).
 * 읽을 때 그 사건의 `articles`와 `sources`를 이어 만든다 — `RevisionSourceRow`가 그 이은 행 모양이다.
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

export function toRows(revision: Revision): RevisionRows {
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
      prompt_contradiction_label: revision.promptVersions.contradictionLabel,
      model_id: revision.modelId,
    },
    claims: revision.claims.map((claim) => ({ id: claim.id, story_id: revision.storyId })),
    claimRevisions,
    evidence,
    sources: revision.sources.map((s) => ({
      source_id: s.sourceId,
      article_id: s.articleId,
      article_title: s.articleTitle,
      article_url: s.articleUrl,
      published_at: s.publishedAt,
      rights_tier: s.rightsTier,
    })),
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

/** 행 묶음을 개정판으로 되돌린다. 주장·근거는 `display_order` 순, 출처 구획은 받은 순서다. */
export function toDomainRevision(rows: RevisionRows): Revision {
  const { revision } = rows;
  const claims: Claim[] = [...rows.claimRevisions].sort(byDisplayOrder).map((cr) => ({
    id: cr.claim_id,
    text: cr.text,
    claimType: cr.claim_type,
    modality: cr.modality,
    order: cr.display_order,
    contradictionStatus: cr.contradiction_status,
    evidence: rows.evidence
      .filter((e) => e.claim_revision_id === cr.id)
      .sort(byDisplayOrder)
      .map((e) => toDomainEvidence(e, cr.claim_id)),
  }));

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
  };
}

export function toArticleRow(article: Article, storyId: string): ArticleRow {
  return {
    id: article.id,
    source_id: article.sourceId,
    story_id: storyId,
    url: article.url,
    title: article.title,
    published_at: article.publishedAt,
    topic: article.topic,
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
  };
}
