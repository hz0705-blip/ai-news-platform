import { sha256Hex, splitSentences } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import type { Label } from "./adjudicate.ts";
import type { Draft } from "./draft.ts";
import { buildJudgeRequest, JUDGE_MODEL, type JudgeMatch } from "./judge.ts";
import { createOfflineEmbeddingClient, createOfflineModelClient } from "./offline.ts";
import { assertNoArticleText, LEAK_WINDOW } from "./packet.ts";
import { type AgreementSummary, renderReport } from "./report.ts";
import { buildJudgeTasks, createScoreContext, type RunFile, scoreRun } from "./score.ts";
import { runArrivalStream } from "./stream.ts";
import { fakePacket, fakeSources } from "./testing.ts";

const packet = fakePacket();
const [first, second] = packet.articles;
const sentence = first === undefined ? undefined : splitSentences(first.body)[0];
const coordinates = {
  quoteKey: "a1s1",
  articleKey: "a1",
  bodyHash: sha256Hex(first?.body ?? ""),
  span: { start: sentence?.start ?? 0, end: sentence?.end ?? 0 },
};
const labels: Label[] = [
  {
    itemId: "pairs/pair:dev-01/a1|dev-01/a2",
    packetId: "pairs",
    kind: "pair",
    value: "같은 사건",
    labelSource: "모델 합의",
  },
  {
    itemId: "dev-01/claim:c1",
    packetId: "dev-01",
    kind: "claim",
    value: { claimType: "보도된 사실", modality: "단정", evidence: [coordinates] },
    labelSource: "운영자 판정",
  },
  {
    itemId: "dev-01/support:c1:a1s1",
    packetId: "dev-01",
    kind: "support",
    value: "뒷받침",
    labelSource: "모델 합의",
    quotes: [coordinates],
  },
  {
    itemId: "dev-01/status",
    packetId: "dev-01",
    kind: "status",
    value: "복수 출처 일치",
    labelSource: "운영자 감사",
  },
];
const draft: Draft = {
  pairs: [],
  claims: [
    {
      text: "기어턴에서 로봇 박람회가 열렸다.",
      claimType: "보도된 사실",
      modality: "단정",
      quotes: [
        {
          key: "a1s1",
          articleKey: "a1",
          sentenceIds: ["a1s1"],
          span: coordinates.span,
          support: "뒷받침",
        },
      ],
      relations: [],
    },
  ],
  storyStatus: "복수 출처 일치",
  dropped: [],
};
const agreement: AgreementSummary = {
  models: { A: "gpt-5-2025-08-07", B: "gpt-5-mini-2025-08-07" },
  byKind: {},
  overall: { items: 0, agreementRate: null, disagreementRate: null, abstentionRate: {} },
};

describe("평가 리포트", () => {
  it("리포트 산출물에 기사 본문 20자 부분 문자열이 없다", async () => {
    const stream = await runArrivalStream([packet], fakeSources([packet]), {
      modelClient: createOfflineModelClient("gpt-5-mini-2025-08-07"),
      embeddingClient: createOfflineEmbeddingClient(),
      remainingUsd: () => 10,
      onSpend: () => {},
    });
    const run: RunFile = {
      ...stream,
      runId: "offline-test",
      createdAt: "2026-09-30T00:00:00.000Z",
      offline: true,
      modelId: "gpt-5-mini-2025-08-07",
      embeddingModel: "offline",
      promptVersions: {},
      capUsd: 3,
      pipelineLimitUsd: 2,
      sources: fakeSources([packet]),
    };
    const ctx = createScoreContext({
      packets: [packet],
      labels,
      run,
      drafts: () => ({ A: draft, B: draft }),
    });
    const judge = createOfflineModelClient(JUDGE_MODEL);
    const judgments: Record<string, { original: JudgeMatch[] }> = {};
    for (const task of buildJudgeTasks(ctx)) {
      const { output } = await judge.complete(buildJudgeRequest(task, "original"));
      judgments[task.packetId] = { original: (output as { matches: JudgeMatch[] }).matches };
    }
    const score = scoreRun(ctx, judgments);
    const row = (name: string) => score.rows.find((r) => r.name === name);
    expect(row("사건 배정 정확도(판정된 기사 쌍)")?.value).toBe(1);
    expect(row("1단계 유효 구간율(발행 근거)")?.value).toBe(1);
    expect(row('2단계 정밀도("뒷받침")')?.denominator).toContain("1");
    expect(score.status.matrix["복수 출처 일치"]).toBeDefined();

    const report = renderReport(
      score,
      {
        runId: run.runId,
        createdAt: run.createdAt,
        modelId: run.modelId,
        embeddingModel: run.embeddingModel,
        promptVersions: run.promptVersions,
        judgeModel: JUDGE_MODEL,
        judgePromptVersion: "eval-judge@1",
        spend: { pipelineUsd: 0, judgeUsd: 0, totalUsd: 0, capUsd: 3 },
        unprocessed: {
          articles: 0,
          stories: [],
          judgeNotCalled: [],
          judgeFailed: [],
          packetsWithoutJudgeTask: [],
          stoppedByBudget: false,
        },
      },
      agreement,
      labels,
    );
    expect(report.split("\n")[2]).toContain("홀드아웃이 아니며");
    expect(report).toContain("모델 합의는 사람 검증이 아님");
    expect(() => assertNoArticleText(report, [packet])).not.toThrow();
    for (const article of [first, second]) {
      expect(report).not.toContain(article?.body.slice(0, LEAK_WINDOW));
      expect(report).not.toContain(article?.title.slice(0, LEAK_WINDOW));
    }
    expect(report).not.toContain(draft.claims[0]?.text);
    expect(() => assertNoArticleText(`${report}${first?.body}`, [packet])).toThrow();
  });
});
