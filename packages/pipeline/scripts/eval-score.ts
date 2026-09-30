// 사용: pnpm --filter @newsplatform/pipeline eval:score [<runId>] [--offline]   (EVAL_DATA_DIR·OPENAI_API_KEY, #149)
// eval:run 결과를 labels.json으로 채점해 docs/eval/report.md를 쓴다(runId를 비우면 가장 최근 실행).
// 유료 호출은 주장 매칭 판정자뿐이며 결과는 EVAL_DATA_DIR/runs/<runId>/judge.json에 두어 다시 실행하면 부르지 않는다.
// 판정 전 예약이 그 실행의 누적 지출(spend.json)과 합쳐 상한 $3을 넘으면 부르지 않고 미처리로 적는다.
// --offline: 가짜 판정자로 점검하고 리포트를 저장소가 아니라 runs/<runId>/report.md에 쓴다.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Label } from "../src/eval/adjudicate.ts";
import { SpendLedger } from "../src/eval/draft.ts";
import {
  buildJudgeRequest,
  flipSample,
  JUDGE_MODEL,
  JUDGE_PROMPT,
  type JudgeMatch,
  type JudgeOrder,
} from "../src/eval/judge.ts";
import { createOfflineModelClient } from "../src/eval/offline.ts";
import { assertNoArticleText } from "../src/eval/packet.ts";
import { type AgreementSummary, renderReport } from "../src/eval/report.ts";
import {
  buildJudgeTasks,
  createScoreContext,
  type JudgeResults,
  type RunFile,
  scoreRun,
} from "../src/eval/score.ts";
import {
  createEvalStore,
  evalDataDir,
  REPO_EVAL_DIR,
  readJson,
  writeJson,
} from "../src/eval/store.ts";
import { createOpenAiModelClient, requestReservationUsd } from "../src/openai/client.ts";
import { ModelResponseError, ModelTransportError } from "../src/types.ts";

const offline = process.argv.includes("--offline");
const store = createEvalStore(evalDataDir(process.env));
const runsDir = store.path("runs");
const runId =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
  (existsSync(runsDir) ? readdirSync(runsDir).sort().at(-1) : undefined);
if (runId === undefined) {
  console.error("실행이 없다. 먼저 eval:run을 실행한다.");
  process.exit(1);
}
const run = readJson<RunFile>(store.path(`runs/${runId}/run.json`));
const apiKey = process.env.OPENAI_API_KEY;
if (!offline && (apiKey === undefined || apiKey === "")) {
  console.error("OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}

const packets = store.readPackets();
const labels = readJson<{ labels: Label[] }>(`${REPO_EVAL_DIR}/labels.json`).labels;
const agreement = readJson<AgreementSummary>(`${REPO_EVAL_DIR}/agreement.json`);
const ctx = createScoreContext({
  packets,
  labels,
  run,
  drafts: (packetId) => {
    const a = store.readDraft(packetId, "A");
    const b = store.readDraft(packetId, "B");
    if (a === undefined || b === undefined) throw new Error(`초안이 없다: ${packetId}`);
    return { A: a.draft, B: b.draft };
  },
});

// 판정자: 원래 순서 전부 + 20% 표본 뒤집기. 캐시에 있는 것은 부르지 않는다.
type SpendEntry = {
  step: string;
  stage: string;
  key?: string;
  spentUsd: number;
  reservedUsd?: number;
  outcome?: string;
};
const spendPath = store.path(`runs/${runId}/spend.json`);
const spendEntries = existsSync(spendPath) ? readJson<SpendEntry[]>(spendPath) : [];
const judgePath = store.path(`runs/${runId}/judge.json`);
const judgments: Record<string, { original?: JudgeMatch[]; reversed?: JudgeMatch[] }> = existsSync(
  judgePath,
)
  ? readJson(judgePath)
  : {};
const tasks = buildJudgeTasks(ctx);
const flip = new Set(flipSample(tasks.map((t) => t.packetId)));
// 원래 순서(채점에 쓰는 것)를 모두 먼저, 뒤집기 표본을 뒤에 부른다.
const jobs = (["original", "reversed"] as JudgeOrder[]).flatMap((order) =>
  tasks
    .filter((task) => order === "original" || flip.has(task.packetId))
    .filter((task) => judgments[task.packetId]?.[order] === undefined)
    .map((task) => ({ task, order })),
);
const ledger = new SpendLedger(
  run.capUsd,
  spendEntries.reduce((sum, e) => sum + e.spentUsd, 0),
);
const client = offline
  ? createOfflineModelClient(JUDGE_MODEL)
  : createOpenAiModelClient({ apiKey: apiKey ?? "", model: JUDGE_MODEL, timeoutMs: 600_000 });
const notCalled: string[] = [];
const failed: string[] = [];
for (const { task, order } of jobs) {
  const label = `${task.packetId}:${order}`;
  const request = buildJudgeRequest(task, order);
  const reservation = offline ? 0 : requestReservationUsd(request, JUDGE_MODEL);
  if (notCalled.length > 0 || !ledger.tryReserve(reservation)) {
    notCalled.push(label);
    continue;
  }
  const entry = { step: "judge", stage: "eval-judge", key: label, reservedUsd: reservation };
  try {
    const response = await client.complete(request);
    ledger.settle(reservation, response.usage.spend);
    spendEntries.push({ ...entry, spentUsd: response.usage.spend, outcome: "완료" });
    const output = response.output as { matches: JudgeMatch[] };
    judgments[task.packetId] = { ...judgments[task.packetId], [order]: output.matches };
    writeJson(judgePath, judgments);
    console.error(`${label} 매칭 ${output.matches.length} $${response.usage.spend.toFixed(4)}`);
  } catch (error) {
    const spentUsd =
      error instanceof ModelResponseError
        ? error.usage.spend
        : error instanceof ModelTransportError && error.billable
          ? reservation
          : 0;
    ledger.settle(reservation, spentUsd);
    spendEntries.push({ ...entry, spentUsd, outcome: "실패" });
    failed.push(label);
    console.error(`${label} 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
  writeJson(spendPath, spendEntries);
}

const score = scoreRun(ctx, judgments as JudgeResults);
const sum = (step: string) =>
  spendEntries.filter((e) => e.step === step).reduce((total, e) => total + e.spentUsd, 0);
const judged = new Set(tasks.map((t) => t.packetId));
const report = renderReport(
  score,
  {
    runId: run.runId,
    createdAt: run.createdAt,
    modelId: run.modelId,
    embeddingModel: run.embeddingModel,
    promptVersions: run.promptVersions,
    judgeModel: JUDGE_MODEL,
    judgePromptVersion: JUDGE_PROMPT.version,
    spend: {
      pipelineUsd: sum("run"),
      judgeUsd: sum("judge"),
      totalUsd: sum("run") + sum("judge"),
      capUsd: run.capUsd,
    },
    unprocessed: {
      articles: run.unprocessed.articles.length,
      stories: run.unprocessed.stories,
      judgeNotCalled: notCalled,
      judgeFailed: failed,
      packetsWithoutJudgeTask: packets.map((p) => p.packetId).filter((id) => !judged.has(id)),
      stoppedByBudget: run.stoppedByBudget,
    },
  },
  agreement,
  labels,
);
assertNoArticleText(report, packets);
const reportPath = offline
  ? store.path(`runs/${runId}/report.md`)
  : resolve(import.meta.dirname, "../../../docs/eval/report.md");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report);
writeJson(store.path(`runs/${runId}/score.json`), score);
console.log(
  JSON.stringify({
    runId,
    report: reportPath,
    judgeCalls: jobs.length - notCalled.length,
    notCalled,
    failed,
    spentUsd: { run: sum("run"), judge: sum("judge") },
  }),
);
if (notCalled.length > 0 || failed.length > 0) process.exitCode = 1;
