import { matchSourceByDomain, type Source } from "@newsplatform/domain";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { toDomainSource, toSourceRow } from "./mappers.ts";
import type { RuntimeDb } from "./runtime.ts";
import { articles, sources } from "./schema/index.ts";

export interface SyncSourceRegistryResult {
  readonly synced: number;
  /** 미등록 `gnews:*` 출처에서 등록 출처로 옮긴 기사 수. */
  readonly repointedArticles: number;
}

/**
 * 출처 표(#76)와 DB `sources`의 동기화. 한 트랜잭션에서 (1) 식별자로 upsert(멱등): 표의 열만 덮어쓰고
 * `wire_id`·`external_id`·`is_fictional`은 건드리지 않는다. 표에서 지운 행은 DB에 남는다(기사가 참조한다).
 * (2) 미등록 `gnews:*` 출처의 기사 중 URL 호스트가 등록 출처의 도메인에 맞는 것을 그 출처로 옮긴다 —
 * 같은 발행사가 옛 `gnews:<id>`와 등록 식별자로 갈라져 보도 원점이 둘로 세이지 않게(#76 리뷰). 제외 출처도
 * 옮긴다(이미 저장된 기사는 두고 새 수집만 버린다). 옛 출처 행은 남긴다. 발행된 개정판의 출처 참조는 고치지 않는다.
 * 두 번째 실행은 옮길 기사가 없다.
 */
export async function syncSourceRegistry(
  db: RuntimeDb["db"],
  registry: readonly Source[],
): Promise<SyncSourceRegistryResult> {
  if (registry.length === 0) return { synced: 0, repointedArticles: 0 };
  return db.transaction(async (tx) => {
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
    return { synced: registry.length, repointedArticles };
  });
}

/** 워커가 배치 시작 때 읽는 출처 표: 도메인 목록이 있는(등록된) 출처 전부. */
export async function loadSourceRegistry(db: RuntimeDb["db"]): Promise<Source[]> {
  const rows = await db.select().from(sources).where(sql`cardinality(${sources.domains}) > 0`);
  return rows.map(toDomainSource);
}
