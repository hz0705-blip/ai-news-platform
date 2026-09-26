import type { StoryPageData } from "@newsplatform/db";
import type { ContradictionStatus } from "@newsplatform/domain";
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

/** 기본 데이터를 바탕으로 주장·근거·출처를 옵션만큼 다시 만든다. 주장 i의 저장 순서는 i(0부터). */
function dataWith(options: {
  readonly revisionTitle?: string;
  readonly statuses: readonly ContradictionStatus[];
  readonly evidenceTimes?: readonly string[];
  readonly sourceNames?: readonly string[];
  readonly differsIn?: readonly string[];
}): StoryPageData {
  const count = Math.max(
    options.evidenceTimes?.length ?? 0,
    options.sourceNames?.length ?? 0,
    options.differsIn?.length ?? 0,
    1,
  );
  const indexes = Array.from({ length: count }, (_, j) => j);
  const timeAt = (j: number) =>
    new Date(options.evidenceTimes?.[j] ?? `2026-09-16T0${j}:00:00.000Z`);
  const baseEvidence = data.claims[0]?.evidence[0];
  if (baseEvidence === undefined) throw new Error("기본 근거가 없다");
  return {
    ...data,
    revision: { ...data.revision, title: options.revisionTitle ?? data.revision.title },
    claims: options.statuses.map((status, i) => ({
      id: `claim-${i}`,
      order: i,
      text: `주장 ${i}`,
      contradictionStatus: status,
      evidence: indexes.map((j) => {
        const differsIn = options.differsIn?.[j];
        return {
          ...baseEvidence,
          sourceId: `src-${j}`,
          publishedAt: timeAt(j),
          sourceUrl: `https://src-${j}.invalid/${i}`,
          ...(differsIn === undefined ? {} : { differsIn }),
        };
      }),
    })),
    sources: indexes.map((j) => ({
      id: `src-${j}`,
      name: options.sourceNames?.[j] ?? `Source ${j}`,
      isFictional: true,
      rightsTier: "본문 처리 + 발췌 표시",
      region: "가상",
      ownership: "가상",
      language: "en",
      articleTitle: `Article ${j}`,
      articleUrl: `https://src-${j}.invalid/article`,
      publishedAt: timeAt(j),
    })),
  };
}

describe("buildStoryView", () => {
  it("근거는 발췌와 그 안의 UTF-16 강조 범위만 가진다", () => {
    const view = buildStoryView(data);
    const ev = view.claims[0]?.evidence[0];
    if (ev?.display !== "발췌") throw new Error("발췌 근거가 아니다");
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
  it("헤더 제목은 개정판 제목이고 상태별 개수는 0을 빼고 상태 순서대로 주장 번호를 단다", () => {
    const view = buildStoryView(
      dataWith({
        revisionTitle: "개정판 제목",
        statuses: ["복수 출처 일치", "보도 상충", "복수 출처 일치"],
      }),
    );
    expect(view.header.title).toBe("개정판 제목");
    expect(view.header.statusCounts).toEqual([
      { status: "복수 출처 일치", count: 2, claimOrders: [1, 3] },
      { status: "보도 상충", count: 1, claimOrders: [2] },
    ]);
  });

  it("근거는 발행 시각 순, 같으면 출처명 순이고 상충 주장만 isComparison", () => {
    const view = buildStoryView(
      dataWith({
        statuses: ["보도 상충", "복수 출처 일치"],
        evidenceTimes: ["2026-09-16T08:40:00Z", "2026-09-16T07:15:00Z"],
      }),
    );
    expect(view.claims[0]?.isComparison).toBe(true);
    expect(view.claims[1]?.isComparison).toBe(false);
    expect(view.claims[0]?.evidence.map((e) => e.publishedAt.toISOString())).toEqual([
      "2026-09-16T07:15:00.000Z",
      "2026-09-16T08:40:00.000Z",
    ]);
  });

  it("발행 시각이 같으면 출처명 오름차순", () => {
    const view = buildStoryView(
      dataWith({
        statuses: ["보도 상충"],
        evidenceTimes: ["2026-09-16T07:15:00Z", "2026-09-16T07:15:00Z"],
        sourceNames: ["Harbor Ledger (가상 출처)", "Atlas Dispatch (가상 출처)"],
      }),
    );
    expect(view.claims[0]?.evidence.map((e) => e.sourceName)).toEqual([
      "Atlas Dispatch (가상 출처)",
      "Harbor Ledger (가상 출처)",
    ]);
  });

  it("differsIn은 있는 그대로 전달된다", () => {
    const view = buildStoryView(
      dataWith({ statuses: ["보도 상충"], differsIn: ["모두 중단", "일부 계속"] }),
    );
    expect(view.claims[0]?.evidence.map((e) => e.differsIn)).toEqual(["모두 중단", "일부 계속"]);
  });

  it("발췌 가능 근거는 display 발췌이며 발췌와 강조를 가진다", () => {
    const ev = buildStoryView(data).claims[0]?.evidence[0];
    expect(ev?.display).toBe("발췌");
  });

  it("출처의 현재 권리 등급이 링크만이면 근거는 발췌 불가이고 구간 텍스트가 뷰 어디에도 없다", () => {
    const base = data.claims[0]?.evidence[0];
    if (base === undefined) throw new Error("기본 근거가 없다");
    const downgraded: StoryPageData = {
      ...data,
      claims: [
        {
          ...(data.claims[0] as StoryPageData["claims"][number]),
          evidence: [
            base,
            {
              ...base,
              sourceId: "src-atlas",
              sourceUrl: "https://atlas.invalid/ports",
              articleTitle: "Port deal reached",
              publishedAt: new Date("2026-09-16T23:00:00.000Z"),
              excerpt: "The berth allocation was suspended pending review.",
              highlightInExcerpt: { start: 4, end: 20 },
            },
          ],
        },
      ],
    };
    const view = buildStoryView(downgraded);
    const rows = view.claims[0]?.evidence ?? [];
    expect(rows.map((r) => r.display)).toEqual(["발췌", "발췌 불가"]);
    const unavailable = rows[1];
    expect(unavailable?.sourceName).toBe("Atlas Dispatch");
    expect(unavailable?.sourceUrl).toBe("https://atlas.invalid/ports");
    expect(JSON.stringify(view)).not.toContain("berth allocation");
    expect(JSON.stringify(view)).not.toContain("highlightInExcerpt");
  });

  it("발췌 불가 근거도 발행 시각 순서에 그대로 참여한다", () => {
    const base = data.claims[0]?.evidence[0];
    if (base === undefined) throw new Error("기본 근거가 없다");
    const view = buildStoryView({
      ...data,
      claims: [
        {
          ...(data.claims[0] as StoryPageData["claims"][number]),
          evidence: [
            base, // 22:00 발췌
            { ...base, sourceId: "src-atlas", publishedAt: new Date("2026-09-16T21:00:00.000Z") },
          ],
        },
      ],
    });
    expect(view.claims[0]?.evidence.map((r) => r.display)).toEqual(["발췌 불가", "발췌"]);
  });
});
