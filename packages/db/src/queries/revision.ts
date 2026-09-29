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
 * 마지막 개정판에 없는 열린 상충 에피소드의 주장(#90, 스펙 "상충 상태"). 별도 표 없이 `claim_revisions`에서 파생한다:
 * 사건의 주장마다 가장 늦은 개정판의 기록을 보고, 그 상태가 보도 상충이고 마지막 개정판에 없는 주장만 그 기록 그대로
 * 돌려준다. 보도 상충은 명시 정정·해소 입력으로만 벗어나므로(전이 가드 ②) 마지막 기록이 보도 상충이면 에피소드가
 * 열려 있다. 주장 순서(`claim_id`)대로.
 */
export async function loadOpenEpisodeClaims(
  db: RuntimeDb["db"],
  params: { readonly storyId: string; readonly latestClaimIds: readonly string[] },
): Promise<Claim[]> {
  const rows = await db
    .select({ claimRevision: claimRevisions })
    .from(claimRevisions)
    .innerJoin(storyRevisions, eq(storyRevisions.id, claimRevisions.story_revision_id))
    .where(eq(storyRevisions.story_id, params.storyId))
    .orderBy(claimRevisions.claim_id, desc(storyRevisions.revision_number));
  const latestIds = new Set(params.latestClaimIds);
  const seen = new Set<string>();
  const open: (typeof claimRevisions.$inferSelect)[] = [];
  for (const { claimRevision } of rows) {
    if (seen.has(claimRevision.claim_id)) continue;
    seen.add(claimRevision.claim_id);
    if (
      claimRevision.contradiction_status === "보도 상충" &&
      !latestIds.has(claimRevision.claim_id)
    ) {
      open.push(claimRevision);
    }
  }
  if (open.length === 0) return [];
  const evidenceRows = await db
    .select()
    .from(evidence)
    .where(
      inArray(
        evidence.claim_revision_id,
        open.map((cr) => cr.id),
      ),
    );
  return open.map((cr) => toDomainClaim(cr, evidenceRows));
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
