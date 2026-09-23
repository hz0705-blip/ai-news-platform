import { describe, expect, it } from "vitest";
import { runBatch } from "./batch-run.ts";
import { DEMO_REFERENCE_TIME, loadDemoStoryFixture } from "./fixtures.ts";
import { createRecordedModelClient } from "./recorded.ts";
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
    expect(result.report.usage.map((u) => u.stage)).toEqual([
      "evidence-extract",
      "claim-generate",
      "gate",
      "contradiction-label",
      "revision",
    ]);
  });

  it("판정 불가 라벨이 있으면 그 사건을 발행하지 않는다", async () => {
    const client = createRecordedModelClient("demo-1-agreement", {
      override: {
        "contradiction-label": {
          "c-1": { pairs: [{ a: "q-m-1", b: "q-h-1", label: "판정 불가" }] },
        },
      },
    });
    const result = await runBatch(input(), { ...deps(), modelClient: client });
    expect(result.revisions).toEqual([]);
    expect(result.report.failures[0]?.reason).toMatch(/판정 불가/);
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
