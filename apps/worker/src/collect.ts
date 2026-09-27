import { type RuntimeDb, saveCollectedArticles } from "@newsplatform/db";
import type { ArticleVersion } from "@newsplatform/domain";
import { type CollectGnewsDeps, collectGnews } from "@newsplatform/pipeline";

export interface CollectInput {
  /** 이번 배치의 슬롯 시각. GNews `to`가 된다. */
  readonly slotAt: Date;
  /** 직전 성공 수집의 `to`. `from` = 이 값 − 1시간. */
  readonly previousTo: Date;
}

export interface CollectResult {
  readonly savedVersions: readonly ArticleVersion[];
  readonly requestCount: number;
  readonly newArticles: number;
  readonly mergedArticles: number;
  readonly failures: readonly { topic: string; page: number; reason: string }[];
}

/**
 * 수집 함수 하나(#52): GNews 토픽 넷 조회 → 정확 중복 제거 → 저장. 사건 배정은 하지 않는다(#53).
 * 도메인·DB·파이프라인을 잇는 자리는 워커뿐이다. 스케줄과 직전 `to`의 보관은 #55.
 */
export async function collectFromGnews(
  input: CollectInput,
  deps: { readonly db: RuntimeDb["db"]; readonly gnews: CollectGnewsDeps },
): Promise<CollectResult> {
  const collected = await collectGnews(input, deps.gnews);
  const saved = await saveCollectedArticles(deps.db, {
    sources: collected.sources,
    articles: collected.articles,
    capturedAt: input.slotAt,
  });
  return {
    savedVersions: saved.savedVersions,
    requestCount: collected.requestCount,
    newArticles: saved.newArticles,
    mergedArticles: saved.mergedArticles,
    failures: collected.failures,
  };
}
