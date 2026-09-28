import {
  findArticleIdsByNormalizedUrl,
  findCandidateStories,
  loadGdeltStories,
  loadRevisionToExtend,
  loadSourceRegistry,
  publishRevision,
  type RuntimeDb,
  recordArticleObservations,
  saveLinkOnlyArticle,
} from "@newsplatform/db";
import type { Story } from "@newsplatform/domain";
import {
  attachLinkOnlyArticles,
  type CollectGdeltDeps,
  collectGdelt,
  type EmbeddingClient,
  type LinkOnlyStore,
} from "@newsplatform/pipeline";

export interface GdeltStageReport {
  readonly requestCount: number;
  /** 이번 배치에서 발행된 사건 중 대표 기사가 있는 것(상한 전). */
  readonly candidateStories: number;
  readonly skippedNoQuery: number;
  readonly skippedOverCap: number;
  readonly skippedDeadline: number;
  readonly skippedAfterFailures: number;
  readonly results: number;
  readonly dropped: {
    readonly nonEnglish: number;
    readonly excluded: number;
    readonly invalid: number;
  };
  readonly observed: number;
  readonly attached: number;
  readonly discarded: number;
  /** 출처 추가 개정판을 발행한 사건. */
  readonly revisedStoryIds: readonly string[];
  readonly failures: readonly { readonly storyId: string; readonly reason: string }[];
  readonly usage: { readonly tokens: number; readonly spend: number };
}

/**
 * GDELT 단계(#77, 배치의 발행 뒤): 이번 배치에서 발행된 사건의 대표 기사 제목으로 GDELT를 직렬 조회하고
 * (최대 20개, 6초 간격, 429·오류는 그 사건만 건너뜀) 링크를 관측·링크만 기사·버림으로 나눈 뒤, 링크가 붙은
 * 사건에 출처 추가 개정판을 모델 호출 없이 발행한다.
 */
export async function runGdeltStage(
  input: {
    readonly storyIds: readonly string[];
    readonly batchStartedAt: Date;
    readonly now: Date;
    readonly deadline?: Date;
  },
  deps: {
    readonly db: RuntimeDb["db"];
    readonly gdelt: CollectGdeltDeps;
    readonly embeddingClient: EmbeddingClient;
  },
): Promise<GdeltStageReport> {
  const { db } = deps;
  const stories = await loadGdeltStories(db, input.storyIds);
  const registry = await loadSourceRegistry(db);
  const collected = await collectGdelt(
    {
      stories,
      batchStartedAt: input.batchStartedAt,
      registry,
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
    },
    deps.gdelt,
  );

  const storyById = new Map<string, Story>();
  const store: LinkOnlyStore = {
    findArticleIdsByUrl: (urls) => findArticleIdsByNormalizedUrl(db, urls),
    recordObservations: (items) => recordArticleObservations(db, items),
    findCandidates: (embedding, options) => findCandidateStories(db, embedding, options),
    saveLinkOnlyArticle: ({ articleId, storyId, source, link }) =>
      saveLinkOnlyArticle(db, {
        articleId,
        storyId,
        source,
        url: link.url,
        normalizedUrl: link.normalizedUrl,
        title: link.title,
        observedAt: link.observedAt,
      }),
    loadRevisionToExtend: async (storyId) => {
      const found = await loadRevisionToExtend(db, storyId);
      if (found === undefined) return undefined;
      storyById.set(storyId, found.story);
      return found.revision;
    },
    publishRevision: async (revision) => {
      const story = storyById.get(revision.storyId);
      if (story === undefined) throw new Error(`사건 없음: ${revision.storyId}`);
      await publishRevision(db, {
        story,
        revision,
        articles: [],
        articleVersions: [],
        sources: [],
      });
    },
  };
  const attached = await attachLinkOnlyArticles(
    { linksByStory: collected.linksByStory, sources: collected.sources, now: input.now },
    { embeddingClient: deps.embeddingClient, store },
  );

  const count = (kind: string) => attached.outcomes.filter((o) => o.kind === kind).length;
  return {
    requestCount: collected.requestCount,
    candidateStories: stories.length,
    skippedNoQuery: collected.skippedNoQuery,
    skippedOverCap: collected.skippedOverCap,
    skippedDeadline: collected.skippedDeadline,
    skippedAfterFailures: collected.skippedAfterFailures,
    results: collected.linksByStory.reduce((sum, s) => sum + s.links.length, 0),
    dropped: collected.dropped,
    observed: count("observed"),
    attached: count("attached"),
    discarded: count("discarded"),
    revisedStoryIds: attached.revisedStoryIds,
    failures: collected.failures,
    usage: attached.usage,
  };
}
