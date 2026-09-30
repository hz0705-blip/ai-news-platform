import { type AssignmentCandidate, cosineSimilarity, type Topic } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import type { EmbeddingClient } from "../types.ts";
import { type AssignmentArticle, type AssignmentStore, runAssignment } from "./assign.ts";

const now = new Date("2026-09-27T05:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

/** 고정 벡터: 텍스트 첫 줄(제목)로 방향을 정한다. 같은 사건의 기사는 같은 축에 가깝다. */
const VECTORS: Readonly<Record<string, readonly number[]>> = {
  "Fisheries pact signed": [1, 0, 0],
  "Fisheries pact ratified": [0.95, 0.05, 0],
  "Rates held steady": [0, 1, 0],
  "Rates held, ambiguous": [0.7, 0.7, 0],
};

const embeddingClient: EmbeddingClient = {
  async embed(texts) {
    return {
      vectors: texts.map((t) => {
        const v = VECTORS[t.split("\n")[0] ?? ""];
        if (v === undefined) throw new Error(`고정 벡터 없음: ${t}`);
        return v;
      }),
      usage: { tokens: texts.length * 10, spend: texts.length * 10 * (0.02 / 1_000_000) },
    };
  },
};

/** 메모리 저장소: 중심은 평균, 대표는 첫 기사, 활성은 72시간(도메인이 판정). */
function memoryStore() {
  const stories = new Map<
    string,
    { members: (readonly number[])[]; topics: Topic[]; lastNewReportAt: Date; processedAt: Date }
  >();
  const calls: string[] = [];
  const store: AssignmentStore = {
    async findCandidates(embedding, { k }) {
      const list: AssignmentCandidate[] = [...stories.entries()].map(([storyId, s]) => {
        const centroid = s.members[0]?.map(
          (_, i) => s.members.reduce((sum, m) => sum + (m[i] ?? 0), 0) / s.members.length,
        ) ?? [0];
        return {
          storyId,
          centroidSimilarity: cosineSimilarity(embedding, centroid),
          representativeSimilarity: cosineSimilarity(embedding, s.members[0] ?? [0]),
          lastNewReportAt: s.lastNewReportAt,
        };
      });
      return list.sort((a, b) => b.centroidSimilarity - a.centroidSimilarity).slice(0, k);
    },
    async assignToStory(input) {
      calls.push(`assign ${input.articleId} → ${input.storyId}`);
      const s = stories.get(input.storyId);
      if (s === undefined) throw new Error("사건 없음");
      s.members.push(input.embedding);
      s.topics = [...new Set([...s.topics, ...input.topics])];
      if (input.publishedAt > s.lastNewReportAt) s.lastNewReportAt = input.publishedAt;
      s.processedAt = input.processedAt;
    },
    async createStory(input) {
      calls.push(`create ${input.story.id} for ${input.articleId}`);
      stories.set(input.story.id, {
        members: [input.embedding],
        topics: [...input.story.topics],
        lastNewReportAt: input.publishedAt,
        processedAt: input.processedAt,
      });
    },
    async keepOnStory(input) {
      calls.push(`keep ${input.storyId}`);
      const s = stories.get(input.storyId);
      if (s !== undefined) s.processedAt = input.processedAt;
    },
  };
  return { store, stories, calls };
}

function article(overrides: Partial<AssignmentArticle> & { id: string }): AssignmentArticle {
  return {
    storyId: null,
    title: "Fisheries pact signed",
    description: "desc",
    body: "",
    publishedAt: hoursAgo(2),
    topics: ["국제 정치·외교·안보"],
    ...overrides,
  };
}

describe("runAssignment", () => {
  it("processes articles in published-at then article-id order", async () => {
    const { store, calls } = memoryStore();
    const result = await runAssignment(
      {
        now,
        articles: [
          article({ id: "a-b", title: "Rates held steady", publishedAt: hoursAgo(1) }),
          article({ id: "a-a", title: "Fisheries pact ratified", publishedAt: hoursAgo(1) }),
          article({ id: "a-c", title: "Fisheries pact signed", publishedAt: hoursAgo(3) }),
        ],
      },
      { embeddingClient, store },
    );
    expect(result.outcomes.map((o) => o.articleId)).toEqual(["a-c", "a-a", "a-b"]);
    // 앞 기사가 만든 사건이 곧바로 뒤 기사의 후보가 된다.
    expect(calls).toEqual([
      "create story-c for a-c",
      "assign a-a → story-c",
      "create story-b for a-b",
    ]);
    expect(result.outcomes[2]).toMatchObject({ kind: "new-story", reason: "중심 유사도 미달" });
    expect(result.usage).toEqual({ tokens: 30, spend: 30 * (0.02 / 1_000_000) });
  });

  it("keeps an updated article version on its existing story", async () => {
    const { store, stories, calls } = memoryStore();
    stories.set("story-x", {
      members: [[1, 0, 0]],
      topics: ["국제 정치·외교·안보"],
      lastNewReportAt: hoursAgo(50),
      processedAt: hoursAgo(50),
    });
    let embedCalls = 0;
    const counting: EmbeddingClient = {
      embed: async (texts) => {
        embedCalls++;
        return embeddingClient.embed(texts);
      },
    };
    const result = await runAssignment(
      { now, articles: [article({ id: "a-1", storyId: "story-x" })] },
      { embeddingClient: counting, store },
    );
    expect(result.outcomes).toEqual([{ articleId: "a-1", kind: "kept", storyId: "story-x" }]);
    expect(calls).toEqual(["keep story-x"]);
    expect(embedCalls).toBe(0);
    // 신규 보도 시계는 그대로, 처리 시각만 움직인다.
    expect(stories.get("story-x")).toMatchObject({
      lastNewReportAt: hoursAgo(50),
      processedAt: now,
    });
  });

  it("creates a new story when the margin to the runner-up is too small", async () => {
    const { store, calls } = memoryStore();
    await runAssignment(
      {
        now,
        articles: [
          article({ id: "a-1", title: "Fisheries pact signed", publishedAt: hoursAgo(3) }),
          article({ id: "a-2", title: "Rates held steady", publishedAt: hoursAgo(2) }),
          article({ id: "a-3", title: "Rates held, ambiguous", publishedAt: hoursAgo(1) }),
        ],
      },
      { embeddingClient, store },
    );
    expect(calls[2]).toBe("create story-3 for a-3");
  });
});
