// 사용: pnpm --filter @newstrail/pipeline eval:draft   (OPENAI_API_KEY·EVAL_DATA_DIR, #147)
// 패킷마다 상위(A)·하위(B) 모델이 golden-draft 프롬프트로 독립 라벨링한다. 이미 있는 초안은 건너뛴다(재개).
// 이어서 개발셋 기사 쌍 60개(eval/dev-set.json)를 golden-pair 프롬프트로 모델마다 한 번 호출해 라벨링한다.
// 호출 전 예약이 EVAL_DATA_DIR/spend.json의 누적 지출 + 진행 중 예약과 합쳐 $3을 넘으면 호출하지 않고 멈춘다.

import { GOLDEN_PAIR_PROMPT } from "../eval/prompts/golden-pair.ts";
import {
  callWithinCap,
  DRAFT_MODELS,
  DRAFT_SPEND_CAP_USD,
  type DraftJob,
  type DraftSide,
  runDrafts,
  SpendLedger,
} from "../src/eval/draft.ts";
import type { DevSet } from "../src/eval/packet.ts";
import { buildPairRequest, type PairDraftFile } from "../src/eval/pairs.ts";
import { createEvalStore, evalDataDir, REPO_EVAL_DIR, readJson } from "../src/eval/store.ts";

/** 쌍 라벨링 요청의 기사·쌍 순서를 섞는 고정 시드. */
const PAIR_REQUEST_SEED = "golden-pair@1";

import { createOpenAiModelClient } from "../src/openai/client.ts";

const apiKey = process.env.OPENAI_API_KEY;
if (apiKey === undefined || apiKey === "") {
  console.error("OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const store = createEvalStore(evalDataDir(process.env));
const packets = store.readPackets();
if (packets.length === 0) {
  console.error("패킷이 없다. 먼저 eval:export를 실행한다.");
  process.exit(1);
}

const sides = Object.keys(DRAFT_MODELS) as DraftSide[];
const jobs: DraftJob[] = packets.flatMap((packet) =>
  sides.filter((side) => !store.hasDraft(packet.packetId, side)).map((side) => ({ packet, side })),
);
const spentBefore = store.readSpend().reduce((sum, e) => sum + e.spentUsd, 0);
const ledger = new SpendLedger(DRAFT_SPEND_CAP_USD, spentBefore);
const clients = Object.fromEntries(
  sides.map((side) => [
    side,
    createOpenAiModelClient({ apiKey, model: DRAFT_MODELS[side], timeoutMs: 600_000 }),
  ]),
) as Record<DraftSide, ReturnType<typeof createOpenAiModelClient>>;

const result = await runDrafts(jobs, {
  clientFor: (side) => clients[side],
  ledger,
  saveDraft: (file) => {
    store.writeDraft(file);
    console.error(`${file.packetId}.${file.side} 완료 $${file.spendUsd.toFixed(4)}`);
  },
  recordSpend: (entry) => store.appendSpend(entry),
  concurrency: 4,
});

const devSet = readJson<DevSet>(`${REPO_EVAL_DIR}/dev-set.json`);
const pairResults: { side: DraftSide; outcome: string }[] = [];
for (const side of sides) {
  if (store.readPairDraft(side) !== undefined || result.notCalled.length > 0) continue;
  const request = buildPairRequest(packets, devSet.pairs.pairs, PAIR_REQUEST_SEED, side);
  const outcome = await callWithinCap("pairs", side, request, {
    clientFor: (s) => clients[s],
    ledger,
    recordSpend: (entry) => store.appendSpend(entry),
  });
  pairResults.push({ side, outcome: outcome.kind === "failed" ? outcome.detail : outcome.kind });
  if (outcome.kind !== "completed") continue;
  const decoded = outcome.output as Pick<PairDraftFile, "labels" | "dropped">;
  store.writePairDraft({
    side,
    model: DRAFT_MODELS[side],
    promptVersion: GOLDEN_PAIR_PROMPT.version,
    spendUsd: outcome.usage.spend,
    tokens: outcome.usage.tokens,
    ...decoded,
  });
  console.error(`pairs.${side} 완료 $${outcome.usage.spend.toFixed(4)}`);
}

const label = (j: DraftJob) => `${j.packet.packetId}.${j.side}`;
console.log(
  JSON.stringify({
    jobs: jobs.length,
    completed: result.completed.map(label),
    failed: result.failed.map((f) => ({ job: label(f), detail: f.detail })),
    notCalled: result.notCalled.map(label),
    pairs: pairResults,
    spentBeforeUsd: Number(spentBefore.toFixed(4)),
    spentTotalUsd: Number(ledger.spentUsd.toFixed(4)),
  }),
);
if (
  result.failed.length > 0 ||
  result.notCalled.length > 0 ||
  pairResults.some((r) => r.outcome !== "completed")
) {
  process.exitCode = 1;
}
