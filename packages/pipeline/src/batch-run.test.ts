import type { Source } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { runBatch } from "./batch-run.ts";
import { DEMO_REFERENCE_TIME, loadDemoStoryFixture } from "./fixtures.ts";
import { createRecordedModelClient, type RecordedModelClientOptions } from "./recorded.ts";
import { BatchReportSchema } from "./schemas.ts";

const fixture = loadDemoStoryFixture("demo-1-agreement");

function deps() {
  return {
    modelClient: createRecordedModelClient("demo-1-agreement"),
    embeddingClient: { embed: async () => [] },
    clock: () => DEMO_REFERENCE_TIME,
  };
}

function input() {
  return {
    articles: fixture.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: DEMO_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend: 10 },
    sources: fixture.sources,
    existingStories: [{ story: fixture.story }],
  };
}

/** 기록된 응답으로 첫 개정판을 발행해 돌려준다(이전 개정판이 있는 경우의 준비용). */
async function publishFirst() {
  const [latest] = (await runBatch(input(), deps())).revisions;
  if (latest === undefined) throw new Error("첫 개정판이 발행되지 않았다");
  return latest;
}

describe("배치 실행", () => {
  it("데모 사건 ①의 정답 개정판을 통째로 만든다(골든셋 첫 항목)", async () => {
    const result = await runBatch(input(), deps());

    expect(result.revisions).toHaveLength(1);
    // 정답 파일은 Revision과 같은 모양이다. 근거 구간 원문·해시·발췌·유형·양상·주장 상태·출처 구획까지 전부 비교한다.
    expect(result.revisions[0]).toEqual(fixture.golden);
  });

  it("링크만 기사는 근거를 주지 않지만 출처 구획에는 남는다", async () => {
    const result = await runBatch(input(), deps());
    const revision = result.revisions[0];
    const atlas = fixture.sources.find((s) => s.rightsTier === "링크만");
    expect(revision?.sources.map((s) => s.sourceId)).toContain(atlas?.id);
    expect(revision?.claims.flatMap((c) => c.evidence).some((e) => e.sourceId === atlas?.id)).toBe(
      false,
    );
  });

  it("같은 입력은 같은 개정판을 만든다(리플레이)", async () => {
    const first = await runBatch(input(), deps());
    const second = await runBatch(input(), deps());
    expect(JSON.stringify(second.revisions)).toBe(JSON.stringify(first.revisions));
  });

  it("첫 개정판이므로 변화는 없다", async () => {
    const result = await runBatch(input(), deps());
    expect(result.changes).toEqual([]);
  });

  it("근거가 게이트 1단계를 통과하지 못하면 그 사건을 발행하지 않는다", async () => {
    const broken = input();
    broken.articles = broken.articles.map((a) => ({
      ...a,
      rawBody: a.rawBody.replace(/agreed/g, "denied"),
    }));

    const result = await runBatch(broken, deps());

    expect(result.revisions).toEqual([]);
    expect(result.report.failed).toBe(1);
    expect(result.report.failures[0]?.reason).toMatch(/구간 없음/);
  });

  it("배치 리포트는 스키마를 통과하고 단계별 사용량과 상한 도달 여부를 담는다", async () => {
    const result = await runBatch(input(), deps());
    expect(BatchReportSchema.safeParse(result.report).success).toBe(true);
    expect(result.report.processed).toBe(1);
    expect(result.report.deferred).toBe(0);
    expect(result.report.budgetReached).toBe(false);
    expect(result.report.droppedClaims).toEqual([]);
    expect(result.report.usage.map((u) => u.stage)).toEqual([
      "evidence-extract",
      "claim-generate",
      "gate",
      "contradiction-label",
      "revision",
    ]);
  });

  it("판정 불가 주장은 그 주장만 빼고 나머지로 발행한다(Ruling 22-4)", async () => {
    const result = await runBatch(input(), {
      ...deps(),
      modelClient: createRecordedModelClient("demo-1-agreement", {
        override: {
          "contradiction-label": {
            "story-demo-1-agreement:c-1": {
              pairs: [{ a: "q-m-1", b: "q-h-1", label: "판정 불가" }],
            },
          },
        },
      }),
    });
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]?.claims.map((c) => c.id)).toEqual([
      "demo-1-agreement:c-2",
      "demo-1-agreement:c-3",
      "demo-1-agreement:c-4",
    ]);
    expect(result.report.droppedClaims).toEqual([
      {
        storyId: "story-demo-1-agreement",
        claimKey: "c-1",
        reason: expect.stringMatching(/판정 불가/),
      },
    ]);
  });
  it("모든 주장이 판정 불가면 사건을 발행하지 않는다", async () => {
    const pairs = (m: string, h: string) => ({ pairs: [{ a: m, b: h, label: "판정 불가" }] });
    const result = await runBatch(input(), {
      ...deps(),
      modelClient: createRecordedModelClient("demo-1-agreement", {
        override: {
          "contradiction-label": {
            "story-demo-1-agreement:c-1": pairs("q-m-1", "q-h-1"),
            "story-demo-1-agreement:c-2": pairs("q-m-2", "q-h-2"),
            "story-demo-1-agreement:c-3": pairs("q-m-3", "q-h-3"),
            "story-demo-1-agreement:c-4": pairs("q-m-4", "q-h-4"),
          },
        },
      }),
    });
    expect(result.revisions).toEqual([]);
    expect(result.report.failures[0]?.reason).toMatch(/표시할 주장이 없다/);
    expect(result.report.droppedClaims).toHaveLength(4);
  });

  it("이전 개정판과 출처·주장·상태가 같으면 개정판을 만들지 않고 확인만 남긴다(스펙 134행)", async () => {
    const latest = await publishFirst();
    const again = await runBatch(
      {
        ...input(),
        now: new Date("2026-09-18T00:30:00.000Z"),
        existingStories: [{ story: fixture.story, latestRevision: latest }],
      },
      deps(),
    );
    expect(again.revisions).toEqual([]);
    expect(again.confirmed).toEqual([
      {
        storyId: fixture.story.id,
        revisionId: latest.id,
        checkedAt: new Date("2026-09-18T00:30:00.000Z"),
      },
    ]);
    expect(again.report.processed).toBe(1);
  });
  it("이전 개정판에서 보도 상충이던 주장이 이번에 빠져도 열린 에피소드로 사건은 보도 상충(스펙 133행)", async () => {
    const latest = await publishFirst();
    const conflicted = {
      ...latest,
      contradictionStatus: "보도 상충" as const,
      claims: latest.claims.map((c, i) =>
        i === 0 ? { ...c, contradictionStatus: "보도 상충" as const } : c,
      ),
    };
    const result = await runBatch(
      { ...input(), existingStories: [{ story: fixture.story, latestRevision: conflicted }] },
      {
        ...deps(),
        modelClient: createRecordedModelClient("demo-1-agreement", {
          override: {
            "contradiction-label": {
              "story-demo-1-agreement:c-1": {
                pairs: [{ a: "q-m-1", b: "q-h-1", label: "판정 불가" }],
              },
            },
          },
        }),
      },
    );
    expect(result.revisions[0]?.claims.map((c) => c.id)).not.toContain("demo-1-agreement:c-1");
    expect(result.revisions[0]?.contradictionStatus).toBe("보도 상충");
  });
  it("이전 개정판이 있고 내용이 다르면 개정판 번호가 하나 오르고 근거 id에 개정판이 들어간다", async () => {
    const latest = await publishFirst();
    const changed = await runBatch(
      {
        ...input(),
        existingStories: [
          { story: fixture.story, latestRevision: { ...latest, contradictionStatus: "단일 출처" } },
        ],
      },
      deps(),
    );
    expect(changed.revisions[0]?.revisionNumber).toBe(2);
    expect(changed.revisions[0]?.id).toBe("demo-1-agreement:rev-2");
    expect(changed.revisions[0]?.claims[0]?.evidence[0]?.id).toMatch(
      /^demo-1-agreement:rev-2\/demo-1-agreement:c-1:q-/,
    );
  });

  it("이전 개정판의 사건이 다르면 그 사건을 실패로 리포트한다", async () => {
    const latest = await publishFirst();
    const result = await runBatch(
      {
        ...input(),
        existingStories: [
          { story: fixture.story, latestRevision: { ...latest, storyId: "story-other" } },
        ],
      },
      deps(),
    );
    expect(result.revisions).toEqual([]);
    expect(result.confirmed).toEqual([]);
    expect(result.report.failures[0]?.reason).toMatch(/이전 개정판의 사건이 다르다/);
  });

  it("양립 불가 쌍의 다른 점은 그 주장 근거의 differsIn으로 개정판에 남는다(Ruling 22-6)", async () => {
    const result = await runBatch(input(), {
      ...deps(),
      modelClient: createRecordedModelClient("demo-1-agreement", {
        override: {
          "contradiction-label": {
            "story-demo-1-agreement:c-1": {
              pairs: [
                {
                  a: "q-m-1",
                  b: "q-h-1",
                  label: "양립 불가",
                  differsIn: { "q-m-1": "모두 중단", "q-h-1": "일부 계속" },
                },
              ],
            },
          },
        },
      }),
    });
    const claim = result.revisions[0]?.claims.find((c) => c.id === "demo-1-agreement:c-1");
    expect(claim?.contradictionStatus).toBe("보도 상충");
    expect(claim?.evidence.map((e) => e.differsIn)).toEqual(["모두 중단", "일부 계속"]);
    expect(result.revisions[0]?.contradictionStatus).toBe("보도 상충");
  });

  it("아는 사건에 배정되지 않은 기사의 사건은 사건 미배정으로 실패한다", async () => {
    const result = await runBatch({ ...input(), existingStories: [] }, deps());
    expect(result.revisions).toEqual([]);
    expect(result.report.failures).toEqual([
      { storyId: fixture.story.id, reason: "실패: 사건 미배정" },
    ]);
  });

  it("출처가 등록되지 않은 기사의 사건은 출처 미등록으로 실패한다", async () => {
    const result = await runBatch({ ...input(), sources: [] }, deps());
    expect(result.revisions).toEqual([]);
    expect(result.report.failures).toEqual([
      { storyId: fixture.story.id, reason: "실패: 출처 미등록" },
    ]);
  });

  it("기록된 응답이 없으면 배치는 던지지 않고 그 사건을 실패로 리포트한다", async () => {
    const onlyMeridian = input();
    onlyMeridian.articles = onlyMeridian.articles.slice(0, 1);
    const result = await runBatch(onlyMeridian, deps());
    expect(result.revisions).toEqual([]);
    expect(result.report.failed).toBe(1);
    expect(result.report.failures[0]?.reason).toMatch(/기록된 응답 없음: claim-generate/);
  });

  it("실제 네트워크를 타지 않는다", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("네트워크 호출이 일어났다");
    }) as typeof fetch;
    try {
      await expect(runBatch(input(), deps())).resolves.toBeDefined();
    } finally {
      globalThis.fetch = original;
    }
  });
});

/** 여러 사건의 출처 목록을 합칠 때 같은 id가 두 번 들어가지 않게 한다. */
function dedupeById(sources: readonly Source[]): Source[] {
  return [...new Map(sources.map((s) => [s.id, s])).values()];
}

describe("두 사건 배치", () => {
  const one = loadDemoStoryFixture("demo-1-agreement");
  const two = loadDemoStoryFixture("demo-2-conflict");
  const both = () => ({
    articles: [...one.articles, ...two.articles].map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: DEMO_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend: 10 },
    sources: dedupeById([...one.sources, ...two.sources]),
    existingStories: [{ story: one.story }, { story: two.story }],
  });
  const bothDeps = (override?: RecordedModelClientOptions["override"]) => ({
    modelClient: createRecordedModelClient(
      ["demo-1-agreement", "demo-2-conflict"],
      override === undefined ? {} : { override },
    ),
    embeddingClient: { embed: async () => [] },
    clock: () => DEMO_REFERENCE_TIME,
  });
  it("데모 ①·② 리플레이가 둘 다 골든과 같다", async () => {
    const result = await runBatch(both(), bothDeps());
    expect(result.revisions).toEqual([one.golden, two.golden]);
    const again = await runBatch(both(), bothDeps());
    expect(JSON.stringify(again.revisions)).toBe(JSON.stringify(result.revisions));
  });
  it("한 사건의 게이트 실패는 그 사건만 미발행이고 다른 사건은 발행된다(스펙 159행)", async () => {
    const broken = one.recorded.evidenceExtract["av-meridian"];
    if (broken === undefined) throw new Error("데모 ① 근거 추출 기록이 없다");
    const result = await runBatch(
      both(),
      bothDeps({
        "evidence-extract": {
          "av-meridian": {
            quotes: broken.quotes.map((q, i) =>
              i === 0 ? { ...q, quote: "이 문장은 기사에 없다" } : q,
            ),
          },
        },
      }),
    );
    expect(result.revisions.map((r) => r.storyId)).toEqual([two.story.id]);
    expect(result.report.failed).toBe(1);
    expect(result.report.failures[0]).toMatchObject({
      storyId: one.story.id,
      reason: expect.stringMatching(/구간 없음/),
    });
  });
});
