import {
  cosineSimilarity,
  countReportingOrigins,
  type Revision,
  type RevisionChange,
  type RevisionSource,
  type Source,
} from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import { runBatch } from "../batch-run.ts";
import { LIVE_REFERENCE_TIME, loadDemoStoryFixture } from "../fixtures.ts";
import { MODEL_ID } from "../openai/client.ts";
import { createRecordedModelClient } from "../recorded.ts";
import { collectGdelt } from "../sources/gdelt.ts";
import { createRecordedGdeltFetch } from "../sources/gdelt-recorded.ts";
import type { EmbeddingClient, ModelClient } from "../types.ts";
import { attachLinkOnlyArticles, type LinkOnlyStore } from "./link-only.ts";

const live = loadDemoStoryFixture("live-hormuz-proposal");
const now = LIVE_REFERENCE_TIME;
const STORY_AXIS = [1, 0, 0];

/**
 * 기록된 GKG 행 중 사건과 무관하게 임베딩할 제목(고유명사는 모두 들어 있지만 배정 임계값에 걸리는 경우를 흉내 낸다).
 * 기록된 행: "... and other regional news" 묶음 기사.
 */
const UNASSIGNABLE = /other regional news/;

/** 고정 벡터: `UNASSIGNABLE` 제목은 직교 축(배정 실패), 나머지는 사건 축. 입력은 제목만이어야 한다. */
const embeddingClient: EmbeddingClient = {
  async embed(texts) {
    for (const t of texts) if (t.includes("\n")) throw new Error(`제목만이 아니다: ${t}`);
    return {
      vectors: texts.map((t) => (UNASSIGNABLE.test(t) ? [0, 1, 0] : STORY_AXIS)),
      usage: { tokens: texts.length * 10, spend: 0 },
    };
  },
};

function countingModelClient() {
  const inner = createRecordedModelClient("live-hormuz-proposal", { modelId: MODEL_ID });
  const counter = { calls: 0 };
  const client: ModelClient = {
    modelId: inner.modelId,
    async complete(request) {
      counter.calls++;
      return inner.complete(request);
    },
  };
  return { client, counter };
}

/** 기록된 GKG 조각(실제 파일의 행)으로 링크를 만든다. */
async function gdeltLinks() {
  return collectGdelt(
    {
      stories: [
        {
          storyId: live.story.id,
          title: live.articles[0]?.meta.title ?? "",
          firstPublishedAt: live.articles[0]?.meta.publishedAt ?? now,
        },
      ],
      batchStartedAt: now,
    },
    { fetch: createRecordedGdeltFetch() },
  );
}

/** 메모리 저장소: 사건 하나(기사 둘, 개정판 하나). 링크를 저장하면 출처 구획에 들어온다. */
function memoryStore(revision: Revision, existingUrls: ReadonlyMap<string, string> = new Map()) {
  const saved: { articleId: string; storyId: string; source: Source; url: string }[] = [];
  const observed: { articleId: string; observedAt: Date }[] = [];
  const published: Revision[] = [];
  const publishedChanges: (readonly RevisionChange[])[] = [];
  const store: LinkOnlyStore = {
    async findArticleIdsByUrl(urls) {
      return new Map([...existingUrls].filter(([url]) => urls.includes(url)));
    },
    async recordObservations(items) {
      observed.push(...items);
    },
    async findCandidates(embedding) {
      return [
        {
          storyId: live.story.id,
          centroidSimilarity: cosineSimilarity(embedding, STORY_AXIS),
          representativeSimilarity: cosineSimilarity(embedding, STORY_AXIS),
          lastNewReportAt: now,
        },
      ];
    },
    async saveLinkOnlyArticle({ articleId, storyId, source, link }) {
      saved.push({ articleId, storyId, source, url: link.url });
    },
    async loadRevisionToExtend() {
      // 발행된 개정판 그대로(방금 붙은 링크는 그 개정판의 출처 구획에 없다).
      return revision;
    },
    async publishRevision(next, changes) {
      published.push(next);
      publishedChanges.push(changes);
    },
  };
  return { store, saved, observed, published, publishedChanges };
}

describe("링크만 기사(GDELT, 기록된 GKG 조각)", () => {
  it("link-only article adds a source-added revision with zero model calls", async () => {
    const model = countingModelClient();
    const batch = await runBatch(
      {
        articles: live.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
        now,
        dailyBudget: { tokens: 1_000_000, spend: 10 },
        sources: live.sources,
        existingStories: [{ story: live.story }],
      },
      {
        modelClient: model.client,
        embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
        clock: () => now,
      },
    );
    const first = batch.revisions[0];
    if (first === undefined) throw new Error("첫 개정판이 발행되지 않았다");
    const callsAfterBatch = model.counter.calls;

    const collected = await gdeltLinks();
    const memory = memoryStore(first);
    const later = new Date(now.getTime() + 60_000);
    const result = await attachLinkOnlyArticles(
      { linksByStory: collected.linksByStory, sources: collected.sources, now: later },
      { embeddingClient, store: memory.store },
    );

    expect(model.counter.calls).toBe(callsAfterBatch);
    expect(memory.saved.length).toBeGreaterThan(0);
    expect(memory.saved.every((s) => s.storyId === live.story.id)).toBe(true);
    expect(result.revisedStoryIds).toEqual([live.story.id]);
    const [next] = memory.published;
    expect(next).toMatchObject({
      id: `${live.story.slug}:rev-2`,
      revisionNumber: 2,
      publishedAt: later,
      contradictionStatus: first.contradictionStatus,
    });
    // 주장 동일(근거 식별자 접두사만 새 개정판), 출처만 늘었다.
    expect(next?.claims.map((c) => [c.id, c.text, c.contradictionStatus])).toEqual(
      first.claims.map((c) => [c.id, c.text, c.contradictionStatus]),
    );
    expect(next?.sources.length).toBe(first.sources.length + memory.saved.length);
  });

  it("link-only revision records source-added change", async () => {
    const collected = await gdeltLinks();
    const memory = memoryStore(live.golden);
    await attachLinkOnlyArticles(
      { linksByStory: collected.linksByStory, sources: collected.sources, now },
      { embeddingClient, store: memory.store },
    );
    expect(memory.saved.length).toBeGreaterThan(0);
    expect(memory.publishedChanges).toEqual([
      memory.saved.map((s) => ({ kind: "출처 추가", articleId: s.articleId })),
    ]);
  });

  it("same-content reprocess after a source-added revision only confirms", async () => {
    const liveInput = (latestRevision: Revision, linkOnlySources?: readonly RevisionSource[]) => ({
      articles: live.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
      now,
      dailyBudget: { tokens: 1_000_000, spend: 10 },
      sources: live.sources,
      existingStories: [
        {
          story: live.story,
          latestRevision,
          ...(linkOnlySources === undefined ? {} : { linkOnlySources }),
        },
      ],
    });
    const batchDeps = () => ({
      modelClient: createRecordedModelClient("live-hormuz-proposal", { modelId: MODEL_ID }),
      embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
      clock: () => now,
    });
    const collected = await gdeltLinks();
    const memory = memoryStore(live.golden);
    await attachLinkOnlyArticles(
      { linksByStory: collected.linksByStory, sources: collected.sources, now },
      { embeddingClient, store: memory.store },
    );
    const [sourceAdded] = memory.published;
    if (sourceAdded === undefined) throw new Error("출처 추가 개정판 없음");
    const linkOnlySources = sourceAdded.sources.filter((s) => s.rightsTier === "링크만");
    expect(linkOnlySources.length).toBe(memory.saved.length);

    // 주장·상태가 같은 재처리는 확인 시각만 갱신한다(새 개정판 없음).
    const again = await runBatch(liveInput(sourceAdded, linkOnlySources), batchDeps());
    expect(again.revisions).toEqual([]);
    expect(again.confirmed).toEqual([
      { storyId: live.story.id, revisionId: sourceAdded.id, checkedAt: now },
    ]);
  });

  it("unassignable link-only article is discarded (no new story)", async () => {
    const collected = await gdeltLinks();
    const memory = memoryStore(live.golden);
    const result = await attachLinkOnlyArticles(
      { linksByStory: collected.linksByStory, sources: collected.sources, now },
      { embeddingClient, store: memory.store },
    );
    const discarded = result.outcomes.filter((o) => o.kind === "discarded");
    const attached = result.outcomes.filter((o) => o.kind === "attached");
    // 고유명사가 모두 든 제목이라도 사건과 멀면(여기서는 묶음 기사) 배정 임계값이 거른다.
    expect(discarded.length).toBeGreaterThan(0);
    expect(attached.length + discarded.length).toBe(
      collected.linksByStory.flatMap((s) => s.links).length,
    );
    // 버린 링크는 저장되지 않고 사건도 만들지 않는다(저장소 포트에 사건 생성이 없다).
    expect(memory.saved.map((s) => s.url).sort()).toEqual(attached.map((o) => o.url).sort());
  });

  it("existing normalized URL becomes an observation not an article", async () => {
    const collected = await gdeltLinks();
    const known = collected.linksByStory[0]?.links[0];
    if (known === undefined) throw new Error("기록된 링크 없음");
    const memory = memoryStore(live.golden, new Map([[known.normalizedUrl, "article-known"]]));
    const result = await attachLinkOnlyArticles(
      { linksByStory: collected.linksByStory, sources: collected.sources, now },
      { embeddingClient, store: memory.store },
    );
    expect(result.outcomes[0]).toEqual({
      url: known.url,
      kind: "observed",
      articleId: "article-known",
    });
    expect(memory.observed).toEqual([{ articleId: "article-known", observedAt: known.observedAt }]);
    expect(memory.saved.some((s) => s.url === known.url)).toBe(false);
  });

  it("reporting origin count unchanged by link-only", async () => {
    const collected = await gdeltLinks();
    const memory = memoryStore(live.golden);
    await attachLinkOnlyArticles(
      { linksByStory: collected.linksByStory, sources: collected.sources, now },
      { embeddingClient, store: memory.store },
    );
    const [next] = memory.published;
    if (next === undefined) throw new Error("출처 추가 개정판 없음");
    const sourceById = new Map(
      [...live.sources, ...collected.sources].map((s) => [s.id, s] as const),
    );
    const origins = (revision: Revision) =>
      countReportingOrigins(
        revision.claims.flatMap((c) =>
          c.evidence.map((e) => ({
            sourceId: e.sourceId,
            rightsTier: sourceById.get(e.sourceId)?.rightsTier ?? "링크만",
          })),
        ),
      );
    expect(origins(next)).toBe(origins(live.golden));
    expect(origins(next)).toBeGreaterThan(0);
  });
});
