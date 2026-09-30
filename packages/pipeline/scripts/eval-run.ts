// 사용: pnpm --filter @newstrail/pipeline eval:run [--offline]   (EVAL_DATA_DIR·OPENAI_API_KEY, #149)
// 개발셋 패킷을 여러 사건이 섞인 도착 스트림으로 05·17시 KST 슬롯마다 운영과 같은 모델·프롬프트로 배정 → 배치한다.
// 결과(개정판·배정·게이트 라벨·상충 라벨·비용·시간)는 EVAL_DATA_DIR/runs/<runId>/run.json, 지출은 spend.json.
// 실행 + 판정자 합계 상한 $3 중 판정자 몫 $1을 남기고, 호출 전 예약이 남은 한도를 넘으면 그 사건부터 미처리로 멈춘다.
// --offline: 가짜 모델·임베딩으로 경로만 점검한다(유료 호출 없음, runId가 offline-로 시작).
import { resolve } from "node:path";
import type { Source } from "@newstrail/domain";
import { PROMPT_VERSIONS } from "../src/batch-run.ts";
import { createOfflineEmbeddingClient, createOfflineModelClient } from "../src/eval/offline.ts";
import type { RunFile } from "../src/eval/score.ts";
import { createEvalStore, evalDataDir, readJson, writeJson } from "../src/eval/store.ts";
import { EVAL_RUN_CAP_USD, JUDGE_RESERVE_USD, runArrivalStream } from "../src/eval/stream.ts";
import { createOpenAiModelClient, MODEL_ID } from "../src/openai/client.ts";
import { createOpenAiEmbeddingClient, EMBEDDING_MODEL } from "../src/openai/embedding.ts";

const offline = process.argv.includes("--offline");
const apiKey = process.env.OPENAI_API_KEY;
if (!offline && (apiKey === undefined || apiKey === "")) {
  console.error("OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const store = createEvalStore(evalDataDir(process.env));
const packets = store.readPackets();
if (packets.length === 0) {
  console.error("패킷이 없다. 먼저 eval:export를 실행한다.");
  process.exit(1);
}

// 출처: 저장소 출처 표(`packages/db/sources/sources.json`)의 행, 표에 없는 GNews 출처는 수집과 같은 기본값(#52).
const registry = readJson<Source[]>(resolve(import.meta.dirname, "../../db/sources/sources.json"));
const sources: Source[] = [
  ...new Map(
    packets.flatMap((p) =>
      p.articles.map((a): [string, Source] => {
        const row = registry.find((s) => s.id === a.sourceId);
        return [
          a.sourceId,
          row === undefined
            ? {
                id: a.sourceId,
                name: new URL(a.url).hostname.replace(/^www\./, ""),
                rightsTier: "본문 처리 + 발췌 표시",
                region: "미확인",
                ownership: "unknown",
                language: "en",
                isFictional: false,
              }
            : {
                id: row.id,
                name: row.name,
                rightsTier: row.rightsTier,
                region: row.region,
                ownership: row.ownership,
                language: row.language,
                isFictional: false,
                ...(row.isWire ? { isWire: true } : {}),
              },
        ];
      }),
    ),
  ).values(),
];

const runId = `${offline ? "offline-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}`;
const spendPath = store.path(`runs/${runId}/spend.json`);
const pipelineLimitUsd = EVAL_RUN_CAP_USD - JUDGE_RESERVE_USD;
const spendEntries: { step: "run"; stage: string; spentUsd: number }[] = [];
let spent = 0;

const result = await runArrivalStream(packets, sources, {
  modelClient: offline
    ? createOfflineModelClient(MODEL_ID)
    : createOpenAiModelClient({ apiKey: apiKey ?? "" }),
  embeddingClient: offline
    ? createOfflineEmbeddingClient()
    : createOpenAiEmbeddingClient({ apiKey: apiKey ?? "" }),
  remainingUsd: () => pipelineLimitUsd - spent,
  onSpend: ({ stage, spendUsd }) => {
    if (spendUsd === 0) return;
    spent += spendUsd;
    spendEntries.push({ step: "run", stage, spentUsd: spendUsd });
    writeJson(spendPath, spendEntries);
  },
  log: (line) => console.error(line),
});

const run: RunFile = {
  runId,
  createdAt: new Date().toISOString(),
  offline,
  modelId: MODEL_ID,
  embeddingModel: EMBEDDING_MODEL,
  promptVersions: PROMPT_VERSIONS,
  capUsd: EVAL_RUN_CAP_USD,
  pipelineLimitUsd,
  sources,
  ...result,
};
writeJson(store.path(`runs/${runId}/run.json`), run);
writeJson(spendPath, spendEntries);
console.log(
  JSON.stringify({
    runId,
    slots: result.slots.length,
    revisions: result.slots.reduce((sum, s) => sum + s.revisions.length, 0),
    unprocessed: {
      articles: result.unprocessed.articles.length,
      stories: result.unprocessed.stories.length,
    },
    stoppedByBudget: result.stoppedByBudget,
    spentUsd: Number(spent.toFixed(4)),
  }),
);
