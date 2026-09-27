import { describe, expect, it } from "vitest";
import {
  type AssignmentCandidate,
  cosineSimilarity,
  decideAssignment,
  embeddingInputFor,
  isActiveStory,
  orderForAssignment,
} from "./story-assignment.ts";

const now = new Date("2026-09-27T05:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

function candidate(overrides: Partial<AssignmentCandidate>): AssignmentCandidate {
  return {
    storyId: "story-a",
    centroidSimilarity: 0.9,
    representativeSimilarity: 0.85,
    lastNewReportAt: hoursAgo(1),
    ...overrides,
  };
}

describe("decideAssignment", () => {
  it("assigns an article to the active story when centroid, representative and margin all pass", () => {
    const decision = decideAssignment({
      now,
      candidates: [
        candidate({ storyId: "story-b", centroidSimilarity: 0.7 }),
        candidate({ storyId: "story-a", centroidSimilarity: 0.9 }),
      ],
    });
    expect(decision).toEqual({ kind: "assign", storyId: "story-a" });
  });

  it("creates a new story when the margin to the runner-up is too small", () => {
    const decision = decideAssignment({
      now,
      candidates: [
        candidate({ storyId: "story-a", centroidSimilarity: 0.9 }),
        candidate({ storyId: "story-b", centroidSimilarity: 0.88 }),
      ],
    });
    expect(decision).toEqual({ kind: "new-story", reason: "차순위 마진 부족" });
  });

  it("creates a new story when centroid or representative similarity is below threshold", () => {
    expect(
      decideAssignment({ now, candidates: [candidate({ centroidSimilarity: 0.79 })] }),
    ).toEqual({ kind: "new-story", reason: "중심 유사도 미달" });
    expect(
      decideAssignment({ now, candidates: [candidate({ representativeSimilarity: 0.74 })] }),
    ).toEqual({ kind: "new-story", reason: "대표 기사 유사도 미달" });
  });

  it("does not assign to a story whose last new report is older than 72 hours", () => {
    const dormant = candidate({ storyId: "story-old", lastNewReportAt: hoursAgo(72.01) });
    expect(decideAssignment({ now, candidates: [dormant] })).toEqual({
      kind: "new-story",
      reason: "활성 후보 없음",
    });
    // 휴면 사건은 차순위 마진 계산에도 끼지 않는다.
    expect(
      decideAssignment({ now, candidates: [dormant, candidate({ storyId: "story-a" })] }),
    ).toEqual({ kind: "assign", storyId: "story-a" });
    expect(isActiveStory(hoursAgo(72), now)).toBe(true);
    expect(isActiveStory(undefined, now)).toBe(false);
  });

  it("lets the candidate-rejection hook veto a story without creating identity", () => {
    const decision = decideAssignment({
      now,
      candidates: [candidate({ storyId: "story-a" })],
      rejectCandidate: (c) => c.storyId === "story-a",
    });
    expect(decision).toEqual({ kind: "new-story", reason: "활성 후보 없음" });
  });
});

describe("orderForAssignment", () => {
  it("processes articles in published-at then article-id order", () => {
    const ordered = orderForAssignment([
      { id: "a-2", publishedAt: hoursAgo(1) },
      { id: "a-1", publishedAt: hoursAgo(1) },
      { id: "a-9", publishedAt: hoursAgo(3) },
    ]);
    expect(ordered.map((a) => a.id)).toEqual(["a-9", "a-1", "a-2"]);
  });
});

describe("embeddingInputFor", () => {
  it("uses title + description, falling back to the first 500 characters of the body", () => {
    expect(embeddingInputFor({ title: "T", description: "D", body: "B" })).toBe("T\nD");
    const body = "x".repeat(600);
    expect(embeddingInputFor({ title: "T", description: "", body })).toBe(`T\n${"x".repeat(500)}`);
    expect(embeddingInputFor({ title: "T", description: undefined, body: "short" })).toBe(
      "T\nshort",
    );
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for parallel vectors, 0 for orthogonal or zero vectors", () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
