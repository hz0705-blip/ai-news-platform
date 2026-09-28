import { readFileSync, writeFileSync } from "node:fs";
import {
  loadStoryRevisionsForSources,
  type RuntimeDb,
  type SourceTierChange,
  syncSourceRegistry,
  updateUnregisteredSourceTier,
} from "@newsplatform/db";
import { parseSourceRegistry, toSource } from "@newsplatform/db/sources-file";
import { DISPLAY_POLICY_VERSION, RIGHTS_TIERS, type RightsTier } from "@newsplatform/domain";
import type { CacheInvalidator } from "./revalidate.ts";

/** 웹 무효화 라우트가 한 요청에 받는 태그 상한(`apps/web/lib/revalidate.ts`). */
const MAX_TAGS_PER_REQUEST = 500;

/**
 * 사건마다 최신 포인터 태그와 모든 개정판 표현 태그(스펙 "개발 중 결정 항목" 캐시 태그,
 * `apps/web/lib/story-cache.ts`와 같은 형식). 사건 화면 언어는 `ko` 하나다.
 */
export function storyCacheTags(
  stories: readonly { readonly storyId: string; readonly revisionIds: readonly string[] }[],
): string[] {
  return stories.flatMap(({ storyId, revisionIds }) => [
    `story:${storyId}:latest`,
    ...revisionIds.map((id) => `story:${storyId}:rev:${id}:ko:v${DISPLAY_POLICY_VERSION}`),
  ]);
}

export interface TierExpiry {
  readonly tierChanges: readonly SourceTierChange[];
  /** 만료를 요청한(무효화 경로가 없으면 요청했어야 할) 태그 수. */
  readonly expiredTags: number;
  /** 무효화 경로(`WEB_REVALIDATE_URL`·`REVALIDATE_SECRET`)가 없어 만료 요청을 못 했으면 거짓. */
  readonly cacheInvalidated: boolean;
}

/**
 * 출처들의 기사가 붙은 사건의 최신·과거 개정판 캐시를 즉시 만료한다(스펙 "렌더링·캐시": 등급 하향은
 * stale-while-revalidate 없이 즉시 만료하고 과거 개정판 표현까지 무효화). 상향도 표시가 바뀌므로 같이 만료한다.
 */
async function expireSourceStories(
  db: RuntimeDb["db"],
  sourceIds: readonly string[],
  invalidate: CacheInvalidator | undefined,
): Promise<Pick<TierExpiry, "expiredTags" | "cacheInvalidated">> {
  const tags = storyCacheTags(await loadStoryRevisionsForSources(db, sourceIds));
  if (tags.length === 0) return { expiredTags: 0, cacheInvalidated: true };
  if (invalidate === undefined) return { expiredTags: tags.length, cacheInvalidated: false };
  for (let i = 0; i < tags.length; i += MAX_TAGS_PER_REQUEST) {
    await invalidate(tags.slice(i, i + MAX_TAGS_PER_REQUEST), { immediate: true });
  }
  return { expiredTags: tags.length, cacheInvalidated: true };
}

/**
 * 명령의 종료 코드. 만료해야 할 태그가 있었는데 무효화 경로가 없어 못 했으면 1이다 — 운영자가 무효화 경로를
 * 설정하고 `source:set-tier <출처> <현재 등급>`으로 다시 만료해야 한다.
 */
export function exitCodeOf(result: Pick<TierExpiry, "cacheInvalidated">): 0 | 1 {
  return result.cacheInvalidated ? 0 : 1;
}

/** 출처 표 파일 → DB 동기화(`sources:sync`) 뒤 등급이 바뀐 출처의 사건 캐시를 만료한다. */
export async function syncSourcesFile(
  db: RuntimeDb["db"],
  path: string,
  invalidate: CacheInvalidator | undefined,
): Promise<TierExpiry & { readonly synced: number; readonly repointedArticles: number }> {
  const registry = parseSourceRegistry(JSON.parse(readFileSync(path, "utf8"))).map(toSource);
  const { synced, repointedArticles, tierChanges } = await syncSourceRegistry(db, registry);
  const expiry = await expireSourceStories(
    db,
    tierChanges.map((c) => c.id),
    invalidate,
  );
  return { synced, repointedArticles, tierChanges, ...expiry };
}

/**
 * 출처 표 파일 텍스트에서 행 하나의 `rightsTier`만 바꾼다(나머지 서식은 그대로 둔다). 결과를 다시 검증해
 * 그 행의 등급 외에는 아무것도 바뀌지 않았음을 확인한다.
 */
export function setTierInRegistryText(text: string, sourceId: string, tier: RightsTier): string {
  const before = parseSourceRegistry(JSON.parse(text));
  const idAt = text.indexOf(`"id": ${JSON.stringify(sourceId)}`);
  const tierAt = idAt < 0 ? -1 : text.indexOf(`"rightsTier": `, idAt);
  if (tierAt < 0) throw new Error(`출처 표 파일에서 ${sourceId} 행을 찾지 못했다`);
  const valueEnd = text.indexOf("\n", tierAt);
  const line = text.slice(tierAt, valueEnd);
  const next = `${text.slice(0, tierAt)}"rightsTier": ${JSON.stringify(tier)}${line.endsWith(",") ? "," : ""}${text.slice(valueEnd)}`;
  const expected = before.map((row) => (row.id === sourceId ? { ...row, rightsTier: tier } : row));
  if (JSON.stringify(parseSourceRegistry(JSON.parse(next))) !== JSON.stringify(expected)) {
    throw new Error(`출처 표 파일의 ${sourceId} 행 등급을 안전하게 바꾸지 못했다`);
  }
  return next;
}

/**
 * 운영자 권리 등급 변경(`source:set-tier`, #78). 출처 표 파일이 정본이다: 표에 있는 출처는 파일의 등급을 고친 뒤
 * `sources:sync`와 같은 동기화를 돌린다(그래서 파일을 손으로 고치고 `sources:sync`를 돌려도 결과가 같다).
 * 표에 없는 출처(`gnews:*`·`gdelt:*`)는 DB 행만 고친다 — 동기화는 표의 행만 upsert하므로 되돌리지 않는다.
 * 등급·출처를 모르거나 무효화 경로가 없으면 아무것도 쓰지 않고 거부한다. 등급이 이미 같아도 그 출처의 사건 캐시를
 * 만료한다 — 만료가 중간에 실패했을 때 같은 명령을 다시 돌리면 끝까지 만료된다(멱등 재시도).
 */
export async function setSourceTier(
  db: RuntimeDb["db"],
  input: { readonly sourceId: string; readonly tier: string; readonly registryPath: string },
  invalidate: CacheInvalidator | undefined,
): Promise<TierExpiry & { readonly registry: "file" | "db" }> {
  const tier = RIGHTS_TIERS.find((t) => t === input.tier);
  if (tier === undefined) {
    throw new Error(`알 수 없는 권리 등급: ${input.tier} (${RIGHTS_TIERS.join(" | ")})`);
  }
  if (invalidate === undefined) {
    throw new Error(
      "캐시 무효화 경로가 설정되지 않았다(WEB_REVALIDATE_URL·REVALIDATE_SECRET). 등급을 바꾸지 않았다.",
    );
  }
  const text = readFileSync(input.registryPath, "utf8");
  const row = parseSourceRegistry(JSON.parse(text)).find((r) => r.id === input.sourceId);
  if (row !== undefined) {
    if (row.rightsTier !== tier) {
      writeFileSync(input.registryPath, setTierInRegistryText(text, input.sourceId, tier));
    }
    const registry = parseSourceRegistry(JSON.parse(readFileSync(input.registryPath, "utf8")));
    const { tierChanges } = await syncSourceRegistry(db, registry.map(toSource));
    const ids = [...new Set([input.sourceId, ...tierChanges.map((c) => c.id)])];
    return { registry: "file", tierChanges, ...(await expireSourceStories(db, ids, invalidate)) };
  }
  const from = await updateUnregisteredSourceTier(db, input.sourceId, tier);
  if (from === undefined) throw new Error(`알 수 없는 출처: ${input.sourceId}`);
  const tierChanges = from === tier ? [] : [{ id: input.sourceId, from, to: tier }];
  return {
    registry: "db",
    tierChanges,
    ...(await expireSourceStories(db, [input.sourceId], invalidate)),
  };
}
