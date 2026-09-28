import {
  createRecordedModelClient,
  DEMO_REFERENCE_TIME,
  loadDemoStoryFixture,
  requestReservationUsd,
  runBatch,
} from "@newsplatform/pipeline";
import { describe, expect, it } from "vitest";
import {
  DAILY_PIPELINE_BUDGET_TOKENS,
  DAILY_PIPELINE_BUDGET_USD,
  pipelineDailyBudget,
} from "./budget.ts";

describe("budget env", () => {
  it("unset → 1.20", () => {
    expect(pipelineDailyBudget({})).toEqual({
      spend: DAILY_PIPELINE_BUDGET_USD,
      tokens: DAILY_PIPELINE_BUDGET_TOKENS,
    });
    expect(pipelineDailyBudget({ PIPELINE_DAILY_BUDGET_USD: "" }).spend).toBe(1.2);
  });

  it("valid value → applied, token cap scaled proportionally", () => {
    expect(pipelineDailyBudget({ PIPELINE_DAILY_BUDGET_USD: "0.06" })).toEqual({
      spend: 0.06,
      tokens: 100_000,
    });
    expect(pipelineDailyBudget({ PIPELINE_DAILY_BUDGET_USD: "2.4" }).tokens).toBe(4_000_000);
  });

  it.each(["0", "-1", "abc", "1.2usd", "NaN", "Infinity", "0x10"])(
    "invalid (%s) → startup error",
    (value) => {
      expect(() => pipelineDailyBudget({ PIPELINE_DAILY_BUDGET_USD: value })).toThrow(
        /PIPELINE_DAILY_BUDGET_USD/,
      );
    },
  );
});

describe("출시 전 개발 예산(스펙 개발 중 결정 항목)", () => {
  const slugs = ["demo-1-agreement", "demo-2-conflict", "live-hormuz-proposal"] as const;
  const fixtures = slugs.map((slug) => loadDemoStoryFixture(slug));
  /** 실측 지출 ÷ 예약 비: 63사건 $1.177(사건당 약 $0.019) ÷ 사건당 예약 합 약 $0.12. */
  const ACTUAL_PER_RESERVED = 0.16;

  it("small budget processes one story then defers the rest", async () => {
    const inner = createRecordedModelClient([...slugs]);
    const budget = pipelineDailyBudget({ PIPELINE_DAILY_BUDGET_USD: "0.06" });
    const result = await runBatch(
      {
        articles: fixtures.flatMap((f) =>
          f.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
        ),
        now: DEMO_REFERENCE_TIME,
        dailyBudget: budget,
        sources: [...new Map(fixtures.flatMap((f) => f.sources).map((s) => [s.id, s])).values()],
        existingStories: fixtures.map((f) => ({ story: f.story })),
      },
      {
        // 기록된 응답에 실측 비율의 지출을 붙인다. 예약은 실제 계산(`requestReservationUsd`), 동시성은 기본 4.
        modelClient: {
          modelId: inner.modelId,
          async complete(request) {
            const response = await inner.complete(request);
            return {
              output: response.output,
              usage: { tokens: 1_000, spend: requestReservationUsd(request) * ACTUAL_PER_RESERVED },
            };
          },
        },
        embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
        clock: () => DEMO_REFERENCE_TIME,
      },
    );
    expect(result.report).toMatchObject({
      processed: 1,
      deferred: 2,
      failed: 0,
      budgetReached: true,
    });
    expect(result.report.usage.reduce((sum, u) => sum + u.spend, 0)).toBeLessThanOrEqual(0.06);
  });
});
