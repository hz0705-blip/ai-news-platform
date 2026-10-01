import {
  commitRevision,
  findArticleIdsByNormalizedUrl,
  findCandidateStories,
  loadGdeltStories,
  loadRevisionToExtend,
  loadSourceRegistry,
  type RuntimeDb,
  recordArticleObservations,
  saveLinkOnlyArticle,
} from "@newstrail/db";
import {
  attachLinkOnlyArticles,
  type CollectGdeltDeps,
  type CollectGdeltResult,
  collectGdelt,
  type EmbeddingClient,
  type LinkOnlyStore,
} from "@newstrail/pipeline";

export interface GdeltStageReport {
  /** 이번 배치에서 발행된 사건 중 대표 기사가 있는 것(상한 전). */
  readonly candidateStories: number;
  readonly skippedNoTerms: number;
  readonly skippedOverCap: number;
  /** 읽은 창(사건 창의 합집합). 매칭할 사건이 없으면 없다. */
  readonly window?: { readonly from: string; readonly to: string };
  /** GKG 15분 파일: 창 안·읽음·압축 바이트·행·상한/기한/연속 실패로 건너뜀. */
  readonly files: CollectGdeltResult["files"];
  /** GDELT 조회(목록·파일 읽기·매칭) 소요. */
  readonly collectMs: number;
  readonly results: number;
  readonly dropped: { readonly excluded: number; readonly invalid: number };
  readonly observed: number;
  readonly attached: number;
  readonly discarded: number;
  /** 출처 추가 개정판을 발행한 사건. */
  readonly revisedStoryIds: readonly string[];
  /** 실패한 파일(HTTP 오류·시간 초과·MD5 불일치·목록 실패). */
  readonly failures: readonly { readonly file: string; readonly reason: string }[];
  readonly usage: { readonly tokens: number; readonly spend: number };
}

/**
 * GDELT 단계(#77·#112, 배치의 발행 뒤): 이번 배치에서 발행된 사건(최대 20개)의 창 안 GKG 15분 파일(최근 것부터 최대 96개)을
 * 스트리밍으로 읽어 대표 기사 제목의 고유명사가 모두 든 행을 링크로 모으고(파일 실패는 그 파일만 건너뜀), 링크를
 * 관측·링크만 기사·버림으로 나눈 뒤, 링크가 붙은 사건에 출처 추가 개정판을 모델 호출 없이 발행한다.
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
  const clock = deps.gdelt.clock ?? (() => new Date());
  const collectStartedAt = clock().getTime();
  const collected = await collectGdelt(
    {
      stories,
      batchStartedAt: input.batchStartedAt,
      registry,
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
    },
    deps.gdelt,
  );
  const collectMs = clock().getTime() - collectStartedAt;

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
        imageUrl: link.imageUrl,
      }),
    loadRevisionToExtend: (storyId) => loadRevisionToExtend(db, storyId),
    publishRevision: async (revision, changes) => {
      await commitRevision(db, { revision, changes });
    },
  };
  const attached = await attachLinkOnlyArticles(
    { linksByStory: collected.linksByStory, sources: collected.sources, now: input.now },
    { embeddingClient: deps.embeddingClient, store },
  );

  const count = (kind: string) => attached.outcomes.filter((o) => o.kind === kind).length;
  return {
    candidateStories: stories.length,
    skippedNoTerms: collected.skippedNoTerms,
    skippedOverCap: collected.skippedOverCap,
    ...(collected.window === undefined
      ? {}
      : {
          window: {
            from: collected.window.from.toISOString(),
            to: collected.window.to.toISOString(),
          },
        }),
    files: collected.files,
    collectMs,
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
