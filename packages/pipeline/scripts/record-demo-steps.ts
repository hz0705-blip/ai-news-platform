// 사용: node --env-file=../../.env scripts/record-demo-steps.ts <slug> [시작 단계]   (packages/pipeline에서)
// 여러 개정판 데모 사건(#88) `fixtures/<slug>/steps/<n>/`을 실제 모델(OPENAI_API_KEY)로 단계 순서대로 한 번 돌려
// 단계마다 응답을 `recorded/<stage>.json`에(이전 기록은 지운다), 개정판과 변화를 `golden/revision.json`·`changes.json`에 쓴다.
// 앞 단계에서 이미 본 기사 버전의 근거 추출은 모델을 다시 부르지 않고 앞 단계 기록을 그대로 쓴다(같은 입력 → 같은 출력).
// 시작 단계를 주면 그 앞 단계는 다시 기록하지 않고 이미 있는 기록·정답을 이어받는다(모델 제한 시간 초과 뒤 재시도용).
// 키는 요청 헤더에만 있고 기록에는 남지 않는다. 끝에 단계별 호출 수·사용량·실제 지출(USD)을 출력한다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Revision } from "@newsplatform/domain";
import {
  createOpenAiModelClient,
  createRecordingModelClient,
  demoStepBatchInput,
  loadDemoStepGolden,
  loadDemoStorySteps,
  type ModelClient,
  RECORDED_STAGES,
  runBatch,
} from "../src/index.ts";

const slug = process.argv[2];
if (!slug) {
  console.error("사용: node --env-file=../../.env scripts/record-demo-steps.ts <slug>");
  process.exit(2);
}
const apiKey = process.env.OPENAI_API_KEY;
if (apiKey === undefined || apiKey === "") {
  console.error("OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const fixtureDir = resolve(import.meta.dirname, "../fixtures", slug);
const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const demo = loadDemoStorySteps(slug);
const live = createOpenAiModelClient({ apiKey });
const seenExtracts: Record<string, unknown> = {};
let latestRevision: Revision | undefined;
const summary: unknown[] = [];
const from = Number(process.argv[3] ?? "1");

for (const [index, step] of demo.steps.entries()) {
  const stepDir = `${fixtureDir}/steps/${step.number}`;
  const extractPath = `${stepDir}/recorded/evidence-extract.json`;
  if (step.number < from) {
    Object.assign(seenExtracts, JSON.parse(readFileSync(extractPath, "utf8")));
    latestRevision = loadDemoStepGolden(slug, step.number).revision;
    continue;
  }
  for (const stage of RECORDED_STAGES) writeJson(`${stepDir}/recorded/${stage}.json`, {});
  let calls = 0;
  const reusing: ModelClient = {
    modelId: live.modelId,
    async complete(request) {
      if (request.stage === "evidence-extract" && Object.hasOwn(seenExtracts, request.key)) {
        return { output: seenExtracts[request.key], usage: { tokens: 0, spend: 0 } };
      }
      calls++;
      return live.complete(request);
    },
  };
  const result = await runBatch(
    demoStepBatchInput(demo, index, latestRevision ? { latestRevision } : {}),
    {
      modelClient: createRecordingModelClient(reusing, `${slug}/steps/${step.number}`),
      embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
      clock: () => step.at,
    },
  );
  if (existsSync(extractPath))
    Object.assign(seenExtracts, JSON.parse(readFileSync(extractPath, "utf8")));

  const revision = result.revisions[0];
  if (revision !== undefined) {
    writeJson(`${stepDir}/golden/revision.json`, revision);
    writeJson(`${stepDir}/golden/changes.json`, result.changes[0]?.changes ?? []);
    latestRevision = revision;
  }
  summary.push({
    step: step.number,
    published: revision !== undefined,
    status: revision?.contradictionStatus,
    claims: revision?.claims.map((c) => [c.id, c.text, c.contradictionStatus]),
    changes: result.changes[0]?.changes,
    failures: result.report.failures,
    droppedClaims: result.report.droppedClaims,
    spanRealignment: result.report.spanRealignment,
    modelCalls: calls,
    spendUsd: result.report.usage.reduce((sum, u) => sum + u.spend, 0),
  });
  if (revision === undefined) break;
}
console.log(JSON.stringify(summary, null, 2));
