import { clearArticleImages, loadStoryRevisionsForStories, type RuntimeDb } from "@newstrail/db";
import type { CacheInvalidator } from "./revalidate.ts";
import { TODAY_CACHE_TAG } from "./run-batch-slot.ts";
import { expireStoryCaches } from "./source-tier.ts";

/**
 * 기사 이미지 삭제 요청(`article:clear-image`, #180, ADR-0002): 기사 URL 또는 출처 식별자의 기사 이미지 URL을 지우고,
 * 영향받는 사건의 최신·모든 개정판 캐시와 오늘 화면 캐시(카드의 대표 이미지)를 즉시 만료한다. 무효화 경로가 없거나
 * 대상을 모르면 아무것도 쓰지 않고 거부한다. 이미 지운 기사도 만료 대상에 넣으므로 다시 돌리면 끝까지 만료된다.
 */
export async function clearArticleImage(
  db: RuntimeDb["db"],
  target: string,
  invalidate: CacheInvalidator | undefined,
): Promise<{
  readonly scope: "article" | "source";
  readonly clearedArticles: number;
  readonly expiredStories: number;
  readonly expiredTags: number;
}> {
  if (invalidate === undefined) {
    throw new Error(
      "캐시 무효화 경로가 설정되지 않았다(WEB_REVALIDATE_URL·REVALIDATE_SECRET). 이미지 URL을 지우지 않았다.",
    );
  }
  const cleared = await clearArticleImages(db, target);
  if (cleared === undefined) throw new Error(`알 수 없는 기사 URL 또는 출처: ${target}`);
  const stories = await loadStoryRevisionsForStories(db, cleared.storyIds);
  const { expiredStories, expiredTags } = await expireStoryCaches(stories, invalidate, [
    TODAY_CACHE_TAG,
  ]);
  return {
    scope: cleared.scope,
    clearedArticles: cleared.clearedArticles,
    expiredStories,
    expiredTags,
  };
}
