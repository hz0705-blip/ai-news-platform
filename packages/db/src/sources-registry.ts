import type { Source } from "@newsplatform/domain";
import { sql } from "drizzle-orm";
import { toDomainSource, toSourceRow } from "./mappers.ts";
import type { RuntimeDb } from "./runtime.ts";
import { sources } from "./schema/index.ts";

/**
 * 출처 표(#76)와 DB `sources`의 동기화. `syncSourceRegistry`는 식별자로 upsert한다(멱등): 표의 열만 덮어쓰고
 * `wire_id`·`external_id`·`is_fictional`은 건드리지 않는다. 표에서 지운 행은 DB에 남는다(기사가 참조한다).
 */
export async function syncSourceRegistry(
  db: RuntimeDb["db"],
  registry: readonly Source[],
): Promise<{ synced: number }> {
  if (registry.length === 0) return { synced: 0 };
  await db
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
  return { synced: registry.length };
}

/** 워커가 배치 시작 때 읽는 출처 표: 도메인 목록이 있는(등록된) 출처 전부. */
export async function loadSourceRegistry(db: RuntimeDb["db"]): Promise<Source[]> {
  const rows = await db.select().from(sources).where(sql`cardinality(${sources.domains}) > 0`);
  return rows.map(toDomainSource);
}
