import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPublishedStory, buildStoryView, cacheTag } = vi.hoisted(() => ({
  loadPublishedStory: vi.fn(),
  buildStoryView: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@newstrail/db", () => ({ loadPublishedStory }));
vi.mock("next/cache", () => ({ cacheTag }));
vi.mock("./db.ts", () => ({ getRuntimeDb: () => ({ db: {} }) }));
vi.mock("./story-view.ts", () => ({ buildStoryView }));

import { getLatestRevisionPointer, getStoryRevisionView } from "./story-cache.ts";

beforeEach(() => vi.clearAllMocks());

describe("공개 사건 캐시", () => {
  it("데모의 최신·고정 개정판을 반환하지 않아 상세와 OG에서 차단한다", async () => {
    loadPublishedStory.mockResolvedValue({
      story: { id: "demo-1", isDemo: true },
      revision: { id: "demo-1:rev-1" },
    });
    expect(await getLatestRevisionPointer("demo-1")).toBeUndefined();
    expect(await getStoryRevisionView("demo-1", "demo-1:rev-1", "ko", 1, "demo-1")).toBeUndefined();
    expect(buildStoryView).not.toHaveBeenCalled();
  });
  it("실제 발행 사건의 포인터와 고정 개정판은 유지한다", async () => {
    const data = { story: { id: "s1", isDemo: false }, revision: { id: "r1" } };
    const view = { slug: "s1" };
    loadPublishedStory.mockResolvedValue(data);
    buildStoryView.mockReturnValue(view);
    expect(await getLatestRevisionPointer("s1")).toEqual({ storyId: "s1", revisionId: "r1" });
    expect(await getStoryRevisionView("s1", "r1", "ko", 1, "s1")).toBe(view);
    expect(buildStoryView).toHaveBeenCalledWith(data);
  });
});
