import type { Claim, Revision, RevisionChange } from "@newsplatform/domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  type RevisionSourceRow,
  toDomainChange,
  toDomainClaim,
  toDomainRevision,
} from "../mappers.ts";
import type { RuntimeDb } from "../runtime.ts";
import {
  articles,
  claimRevisions,
  evidence,
  revisionChanges,
  sources,
  stories,
  storyRevisions,
} from "../schema/index.ts";

/**
 * 저장된 개정판 하나를 도메인 `Revision`으로 복원한다. 개정판을 읽는 유일한 곳이다 — 워커 비교(`loadLatestRevision`)와
 * 사건 페이지(`loadPublishedStory`)가 모두 이것을 조합하므로 둘이 보는 주장·근거·출처 구획은 같다.
 * `revisionId`가 없으면 그 사건의 최신 개정판(`revision_number`가 가장 큰 것). 없으면 `undefined`.
 *
 * 출처 구획은 그 개정판이 발행될 때의 기사(`source_article_ids`, #85)와 출처를 이어 만든다(발행 시각·기사 식별자 순).
 * 발행 뒤 사건에 배정된 기사는 넣지 않는다 — 개정판은 스냅샷이다(ADR-0003, 스펙 "렌더링·캐시").
 * `checkedAt`(마지막 확인 시각)은 도메인 개정판에 없는 행 값이라 따로 돌려준다.
 */
export async function loadRevision(
  db: RuntimeDb["db"],
  params: { readonly storyId: string; readonly revisionId?: string },
): Promise<{ readonly revision: Revision; readonly checkedAt: Date } | undefined> {
  const revisionRows = await db
    .select()
    .from(storyRevisions)
    .where(
      params.revisionId === undefined
        ? eq(storyRevisions.story_id, params.storyId)
        : and(
            eq(storyRevisions.story_id, params.storyId),
            eq(storyRevisions.id, params.revisionId),
          ),
    )
    .orderBy(desc(storyRevisions.revision_number))
    .limit(1);
  const revision = revisionRows[0];
  if (revision === undefined) return undefined;

  const claimRevisionRows = await db
    .select()
    .from(claimRevisions)
    .where(eq(claimRevisions.story_revision_id, revision.id));

  const evidenceRows =
    claimRevisionRows.length === 0
      ? []
      : await db
          .select()
          .from(evidence)
          .where(
            inArray(
              evidence.claim_revision_id,
              claimRevisionRows.map((cr) => cr.id),
            ),
          );

  const sourceRows: RevisionSourceRow[] =
    revision.source_article_ids.length === 0
      ? []
      : await db
          .select({
            source_id: sources.id,
            article_id: articles.id,
            article_title: articles.title,
            article_url: articles.url,
            published_at: articles.published_at,
            rights_tier: sources.rights_tier,
          })
          .from(articles)
          .innerJoin(sources, eq(sources.id, articles.source_id))
          .where(inArray(articles.id, revision.source_article_ids))
          .orderBy(articles.published_at, articles.id);

  return {
    revision: toDomainRevision({
      revision,
      claimRevisions: claimRevisionRows,
      evidence: evidenceRows,
      sources: sourceRows,
    }),
    checkedAt: revision.checked_at,
  };
}

/**
 * 사건의 최신 개정판을 도메인 `Revision`으로 복원한다(`loadRevision`). 워커가 재처리 결과를 직전 개정판과
 * 비교할 때 쓴다 — 다음 개정판의 "출처 추가" 변화와 개정판 생성 조건이 이 출처 구획과 비교한다.
 * 사건이나 개정판이 없으면 `undefined`.
 */
export async function loadLatestRevision(
  db: RuntimeDb["db"],
  params: { readonly slug: string },
): Promise<Revision | undefined> {
  const storyRows = await db
    .select({ id: stories.id })
    .from(stories)
    .where(eq(stories.slug, params.slug))
    .limit(1);
  const story = storyRows[0];
  if (story === undefined) return undefined;
  return (await loadRevision(db, { storyId: story.id }))?.revision;
}

/**
 * 사건의 주장 개정판 이력(#90): 개정판 번호 순(오래된 것 먼저)의 개정판별 주장(근거 포함, 표시 순). 열린 상충
 * 에피소드는 이 원자료에서 도메인 규칙(`openEpisodeClaims`)이 파생한다 — 별도 표는 없다.
 */
export async function loadClaimHistory(
  db: RuntimeDb["db"],
  params: { readonly storyId: string },
): Promise<Claim[][]> {
  const rows = await db
    .select({ revisionNumber: storyRevisions.revision_number, claimRevision: claimRevisions })
    .from(claimRevisions)
    .innerJoin(storyRevisions, eq(storyRevisions.id, claimRevisions.story_revision_id))
    .where(eq(storyRevisions.story_id, params.storyId))
    .orderBy(storyRevisions.revision_number, claimRevisions.display_order);
  if (rows.length === 0) return [];
  const evidenceRows = await db
    .select()
    .from(evidence)
    .where(
      inArray(
        evidence.claim_revision_id,
        rows.map((r) => r.claimRevision.id),
      ),
    );
  const byRevision = new Map<number, Claim[]>();
  for (const { revisionNumber, claimRevision } of rows) {
    const claims = byRevision.get(revisionNumber) ?? [];
    claims.push(toDomainClaim(claimRevision, evidenceRows));
    byRevision.set(revisionNumber, claims);
  }
  return [...byRevision.values()];
}

/** 개정판 하나에 저장된 변화(#85)를 순서대로 읽는다. 첫 개정판·마이그레이션 전 개정판은 빈 목록이다. */
export async function loadRevisionChanges(
  db: RuntimeDb["db"],
  params: { readonly revisionId: string },
): Promise<RevisionChange[]> {
  const rows = await db
    .select()
    .from(revisionChanges)
    .where(eq(revisionChanges.story_revision_id, params.revisionId))
    .orderBy(asc(revisionChanges.display_order));
  return rows.map(toDomainChange);
}
