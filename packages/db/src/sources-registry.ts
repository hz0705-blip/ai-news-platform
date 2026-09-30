import { matchSourceByDomain, type RightsTier, type Source } from "@newstrail/domain";
import { and, eq, inArray, like, ne, type SQLWrapper, sql } from "drizzle-orm";
import { toDomainSource, toSourceRow } from "./mappers.ts";
import type { RuntimeDb } from "./runtime.ts";
import { articles, claimRevisions, evidence, sources, storyRevisions } from "./schema/index.ts";

/** 권리 등급이 바뀐 출처 하나(#78). 새로 만든 출처 행은 넣지 않는다. */
export interface SourceTierChange {
  readonly id: string;
  readonly from: RightsTier;
  readonly to: RightsTier;
}

export interface SyncSourceRegistryResult {
  readonly synced: number;
  /** 미등록 `gnews:*` 출처에서 등록 출처로 옮긴 기사 수. */
  readonly repointedArticles: number;
  /** 옛 `gnews:*` 출처에서 기사의 현재 출처로 옮긴 근거 수(#115). */
  readonly repointedEvidence: number;
  /** 근거를 옮긴 사건(식별자 순)과 근거가 옮겨 간 출처(식별자 순). 워커가 그 사건 캐시를 만료한다. */
  readonly repointedEvidenceStories: readonly string[];
  readonly repointedEvidenceSources: readonly string[];
  /** 이번 동기화로 권리 등급이 바뀐 기존 출처(식별자 순). 워커가 영향받는 사건 캐시를 만료한다. */
  readonly tierChanges: readonly SourceTierChange[];
}

/**
 * 출처 표(#76)와 DB `sources`의 동기화. 한 트랜잭션에서 (1) 식별자로 upsert(멱등): 표의 열만 덮어쓰고
 * `wire_id`·`external_id`·`is_fictional`은 건드리지 않는다. 표에서 지운 행은 DB에 남는다(기사가 참조한다).
 * (2) 미등록 `gnews:*` 출처의 기사 중 URL 호스트가 등록 출처의 도메인에 맞는 것을 그 출처로 옮긴다 —
 * 같은 발행사가 옛 `gnews:<id>`와 등록 식별자로 갈라져 보도 원점이 둘로 세이지 않게(#76 리뷰). 제외 출처도
 * 옮긴다(이미 저장된 기사는 두고 새 수집만 버린다). 옛 출처 행은 남긴다. (3) 미등록 `gnews:*` 출처를 가리키는 근거 중
 * 기사의 현재 출처와 다른 것의 출처 식별자를 기사의 출처로 옮긴다(#115) — 사건 페이지는 출처 구획을 기사의 현재
 * 출처로 만들므로 근거가 옛 출처에 남으면 그 사건을 그리지 못한다. 근거 구간·해시·URL은 그대로다. 이 단계는 (2)가
 * 이번에 옮긴 기사뿐 아니라 예전 실행이 이미 옮긴 기사의 근거도 고친다. 두 번째 실행은 옮길 기사·근거가 없다.
 * upsert 전 등급과 비교해 등급이 바뀐 기존 출처를 `tierChanges`로 돌려준다.
 */
export async function syncSourceRegistry(
  db: RuntimeDb["db"],
  registry: readonly Source[],
): Promise<SyncSourceRegistryResult> {
  if (registry.length === 0) {
    return {
      synced: 0,
      repointedArticles: 0,
      repointedEvidence: 0,
      repointedEvidenceStories: [],
      repointedEvidenceSources: [],
      tierChanges: [],
    };
  }
  return db.transaction(async (tx) => {
    const before = await tx
      .select({ id: sources.id, tier: sources.rights_tier })
      .from(sources)
      .where(
        inArray(
          sources.id,
          registry.map((s) => s.id),
        ),
      );
    const tierChanges = before
      .flatMap((row) => {
        const to = registry.find((s) => s.id === row.id)?.rightsTier;
        return to === undefined || to === row.tier ? [] : [{ id: row.id, from: row.tier, to }];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    await tx
      .insert(sources)
      .values(registry.map(toSourceRow))
      .onConflictDoUpdate({
        target: sources.id,
        set: {
          name: sql`excluded.name`,
          rights_tier: sql`excluded.rights_tier`,
          region: sql`excluded.region`,
          ownership: sql`excluded.ownership`,
          language: sql`excluded.language`,
          domains: sql`excluded.domains`,
          is_wire: sql`excluded.is_wire`,
          is_excluded: sql`excluded.is_excluded`,
        },
      });

    const candidates = await tx
      .select({ id: articles.id, url: articles.url })
      .from(articles)
      .innerJoin(sources, eq(articles.source_id, sources.id))
      .where(and(like(sources.id, "gnews:%"), sql`cardinality(${sources.domains}) = 0`));
    const byTarget = new Map<string, string[]>();
    for (const article of candidates) {
      const target = matchSourceByDomain(article.url, registry);
      if (target === undefined) continue;
      byTarget.set(target.id, [...(byTarget.get(target.id) ?? []), article.id]);
    }
    let repointedArticles = 0;
    for (const [sourceId, ids] of byTarget) {
      await tx.update(articles).set({ source_id: sourceId }).where(inArray(articles.id, ids));
      repointedArticles += ids.length;
    }

    const oldSources = tx
      .select({ id: sources.id })
      .from(sources)
      .where(and(like(sources.id, "gnews:%"), sql`cardinality(${sources.domains}) = 0`));
    const moved = await tx
      .update(evidence)
      .set({ source_id: sql`${articles.source_id}` })
      .from(articles)
      .where(
        and(
          eq(evidence.article_id, articles.id),
          ne(evidence.source_id, articles.source_id),
          inArray(evidence.source_id, oldSources),
        ),
      )
      .returning({ claimRevisionId: evidence.claim_revision_id, sourceId: evidence.source_id });
    const storyRows =
      moved.length === 0
        ? []
        : await tx
            .selectDistinct({ storyId: storyRevisions.story_id })
            .from(claimRevisions)
            .innerJoin(storyRevisions, eq(storyRevisions.id, claimRevisions.story_revision_id))
            .where(
              inArray(
                claimRevisions.id,
                moved.map((m) => m.claimRevisionId),
              ),
            );
    return {
      synced: registry.length,
      repointedArticles,
      repointedEvidence: moved.length,
      repointedEvidenceStories: storyRows.map((r) => r.storyId).sort(),
      repointedEvidenceSources: [...new Set(moved.map((m) => m.sourceId))].sort(),
      tierChanges,
    };
  });
}

/**
 * 출처 표에 없는 출처(`gnews:*`·`gdelt:*`)의 권리 등급만 DB에서 바꾼다(#78 `source:set-tier`). 출처 표 행은
 * 파일이 정본이라 이 함수로 바꾸지 않는다 — 워커 명령이 파일을 고치고 동기화한다. 동기화는 표의 행만 upsert하므로
 * 이 변경을 되돌리지 않는다. 바꾸기 전 등급을 돌려주고, 출처가 없으면 undefined(아무것도 쓰지 않는다).
 */
export async function updateUnregisteredSourceTier(
  db: RuntimeDb["db"],
  sourceId: string,
  tier: RightsTier,
): Promise<RightsTier | undefined> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ tier: sources.rights_tier })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("update");
    const from = rows[0]?.tier;
    if (from !== undefined && from !== tier) {
      await tx.update(sources).set({ rights_tier: tier }).where(eq(sources.id, sourceId));
    }
    return from;
  });
}

/**
 * 출처들의 기사가 배정된 사건과 그 사건의 모든 개정판 식별자(#78). 사건 화면은 출처의 현재 권리 등급으로
 * 발췌를 가리므로 등급이 바뀌면 최신뿐 아니라 과거 개정판 표현도 다시 그려야 한다(스펙 "렌더링·캐시").
 * 사건 식별자 순, 개정판은 번호 순.
 */
export async function loadStoryRevisionsForSources(
  db: RuntimeDb["db"],
  sourceIds: readonly string[],
): Promise<{ storyId: string; revisionIds: string[] }[]> {
  if (sourceIds.length === 0) return [];
  const affected = db
    .selectDistinct({ storyId: articles.story_id })
    .from(articles)
    .where(inArray(articles.source_id, [...sourceIds]));
  return loadStoryRevisions(db, affected);
}

/** 사건들의 모든 개정판 식별자(#115, 근거를 옮긴 사건). 사건 식별자 순, 개정판은 번호 순. */
export async function loadStoryRevisionsForStories(
  db: RuntimeDb["db"],
  storyIds: readonly string[],
): Promise<{ storyId: string; revisionIds: string[] }[]> {
  if (storyIds.length === 0) return [];
  return loadStoryRevisions(db, [...storyIds]);
}

async function loadStoryRevisions(
  db: RuntimeDb["db"],
  storyIds: string[] | SQLWrapper,
): Promise<{ storyId: string; revisionIds: string[] }[]> {
  const rows = await db
    .select({ storyId: storyRevisions.story_id, revisionId: storyRevisions.id })
    .from(storyRevisions)
    .where(inArray(storyRevisions.story_id, storyIds))
    .orderBy(storyRevisions.story_id, storyRevisions.revision_number);
  const byStory = new Map<string, string[]>();
  for (const row of rows)
    byStory.set(row.storyId, [...(byStory.get(row.storyId) ?? []), row.revisionId]);
  return [...byStory].map(([storyId, revisionIds]) => ({ storyId, revisionIds }));
}

/** 워커가 배치 시작 때 읽는 출처 표: 도메인 목록이 있는(등록된) 출처 전부. */
export async function loadSourceRegistry(db: RuntimeDb["db"]): Promise<Source[]> {
  const rows = await db.select().from(sources).where(sql`cardinality(${sources.domains}) > 0`);
  return rows.map(toDomainSource);
}
