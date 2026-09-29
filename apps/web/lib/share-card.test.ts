import { describe, expect, it } from "vitest";
import { storyMetadata, storyOgImagePath } from "./share-card.ts";
import type { StoryView } from "./story-view.ts";

const view = (revisionId: string, isDemo: boolean) =>
  ({
    slug: "demo-1-agreement",
    revisionId,
    header: { title: "제목", isDemo, updatedAt: new Date(0), status: "단일 출처" },
    claims: [{ text: "첫 주장." }],
  }) as unknown as StoryView;

describe("share card", () => {
  it("og image url changes per revision", () => {
    const first = storyOgImagePath("demo-1-agreement", "demo-1:r1");
    const second = storyOgImagePath("demo-1-agreement", "demo-1:r2");
    expect(first).toBe("/og/story/demo-1-agreement/demo-1%3Ar1/ko-t1-f1.3.9.png");
    expect(second).not.toBe(first);
  });

  it("story metadata carries the revision card and keeps the demo label", () => {
    const metadata = storyMetadata(view("demo-1:r2", true));
    expect(metadata.title).toBe("[데모 사건] 제목");
    expect(metadata.description).toBe("기능 설명을 위해 만든 데모 사건입니다. 첫 주장.");
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "/og/story/demo-1-agreement/demo-1%3Ar2/ko-t1-f1.3.9.png",
        width: 1200,
        height: 600,
        alt: "[데모 사건] 제목",
      },
    ]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(storyMetadata(view("r", false)).title).toBe("제목");
  });
});
