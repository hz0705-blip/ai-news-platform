import type { StoryPageData } from "@newsplatform/db";
import { describe, expect, it } from "vitest";
import { buildStoryView } from "./story-view.ts";

// 발췌 안에 보조 평면 문자(🇰🇷)를 넣어 UTF-16 변환을 시험한다.
const excerpt = "Officials in 🇰🇷 Seoul agreed on the framework. The deal covers three ports.";
const highlightText = "agreed on the framework";

const data: StoryPageData = {
  story: {
    id: "story-1",
    slug: "demo-1-agreement",
    title: "가상 항만 협정에 세 나라가 서명했다",
    topics: ["국제 정치·외교·안보"],
    isDemo: true,
  },
  revision: {
    id: "rev-1",
    revisionNumber: 1,
    title: "가상 항만 협정에 세 나라가 서명했다",
    publishedAt: new Date("2026-09-17T00:30:00.000Z"),
    checkedAt: new Date("2026-09-17T00:30:00.000Z"),
    contradictionStatus: "복수 출처 일치",
  },
  claims: [
    {
      id: "claim-1",
      order: 1,
      text: "세 나라 장관들이 가상 항만 협정의 틀에 합의했다고 두 출처가 독립적으로 보도했다.",
      contradictionStatus: "복수 출처 일치",
      evidence: [
        {
          sourceId: "src-meridian",
          articleTitle: "Three governments sign port framework",
          publishedAt: new Date("2026-09-16T22:00:00.000Z"),
          sourceUrl: "https://meridian.invalid/ports",
          excerpt,
          highlightInExcerpt: {
            start: [...excerpt].indexOf("a", 20),
            end: [...excerpt].indexOf("a", 20) + [...highlightText].length,
          },
        },
      ],
    },
  ],
  sources: [
    {
      id: "src-meridian",
      name: "Meridian Wire",
      isFictional: true,
      rightsTier: "본문 처리 + 발췌 표시",
      region: "가상",
      ownership: "가상",
      language: "en",
      articleTitle: "Three governments sign port framework",
      articleUrl: "https://meridian.invalid/ports",
      publishedAt: new Date("2026-09-16T22:00:00.000Z"),
    },
    {
      id: "src-atlas",
      name: "Atlas Dispatch",
      isFictional: true,
      rightsTier: "링크만",
      region: "가상",
      ownership: "가상",
      language: "en",
      articleTitle: "Port deal reached",
      articleUrl: "https://atlas.invalid/ports",
      publishedAt: new Date("2026-09-16T23:00:00.000Z"),
    },
  ],
};

describe("buildStoryView", () => {
  it("근거는 발췌와 그 안의 UTF-16 강조 범위만 가진다", () => {
    const view = buildStoryView(data);
    const ev = view.claims[0]?.evidence[0];
    expect(ev?.excerpt).toBe(excerpt);
    expect(ev?.excerpt.slice(ev.highlight.start, ev.highlight.end)).toBe(highlightText);
    expect(JSON.stringify(view)).not.toContain("highlightInExcerpt");
  });

  it("링크만 등급 출처는 근거 없이 출처 구획에만 나온다", () => {
    const view = buildStoryView(data);
    expect(view.sources.map((s) => s.name)).toEqual(["Meridian Wire", "Atlas Dispatch"]);
    expect(view.sources[1]?.rightsTier).toBe("링크만");
    expect(
      view.claims.flatMap((c) => c.evidence).some((e) => e.sourceName === "Atlas Dispatch"),
    ).toBe(false);
  });

  it("헤더 출처 개수는 출처 구획의 수와 같다", () => {
    expect(buildStoryView(data).header.sourceCount).toBe(2);
  });
});
