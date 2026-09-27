// 사용: node --env-file=../../.env scripts/record-model-responses.ts <slug>   (packages/pipeline에서)
// 픽스처 `fixtures/<slug>/`의 기사로 배치를 실제 모델(OPENAI_API_KEY)로 한 번 돌린다(#54).
// PIPELINE_RECORD=1이면 기록 모드: 응답을 `recorded/<stage>.json`에(이전 기록은 지운다), 그 결과 개정판을
// `golden/revision.json`에, 첫 Responses API 응답 원문 하나(추론 암호문 제외)를 `fixtures/openai/response.json`에 쓴다.
// 키는 요청 헤더에만 있고 기록에는 남지 않는다. 끝에 단계별 사용량과 실제 지출(USD)을 출력한다.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createOpenAiModelClient,
  createRecordingModelClient,
  LIVE_REFERENCE_TIME,
  loadDemoStoryInputs,
  RECORDED_STAGES,
  runBatch,
} from "../src/index.ts";

const slug = process.argv[2];
if (!slug) {
  console.error("사용: node --env-file=../../.env scripts/record-model-responses.ts <slug>");
  process.exit(2);
}
const apiKey = process.env.OPENAI_API_KEY;
if (apiKey === undefined || apiKey === "") {
  console.error("OPENAI_API_KEY이(가) 설정되지 않았다. .env.example을 참고해 설정한다.");
  process.exit(1);
}
const record = process.env.PIPELINE_RECORD === "1";
const fixtureDir = resolve(import.meta.dirname, "../fixtures", slug);

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

if (record) {
  // 기록 모드는 빈 표에서 시작한다(`loadDemoStoryInputs`가 기록 파일을 읽으므로 먼저 비운다).
  for (const stage of RECORDED_STAGES) writeJson(`${fixtureDir}/recorded/${stage}.json`, {});
}

let sampleSaved = false;
const sampleFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const text = await response.text();
  if (record && !sampleSaved && response.ok) {
    sampleSaved = true;
    // 추론 항목의 암호화 본문은 리플레이에 쓰지 않고 크기만 커서 뺀다.
    const body = JSON.parse(text, (key, value) =>
      key === "encrypted_content" ? undefined : value,
    );
    writeJson(resolve(import.meta.dirname, "../fixtures/openai/response.json"), {
      status: response.status,
      body,
    });
  }
  return new Response(text, { status: response.status, headers: response.headers });
};

const live = createOpenAiModelClient({ apiKey, fetch: sampleFetch });
const fixture = loadDemoStoryInputs(slug);
const result = await runBatch(
  {
    articles: fixture.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: LIVE_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend: 1 },
    sources: fixture.sources,
    existingStories: [{ story: fixture.story }],
  },
  {
    modelClient: record ? createRecordingModelClient(live, slug) : live,
    embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
    clock: () => LIVE_REFERENCE_TIME,
  },
);

const revision = result.revisions[0];
if (record && revision) writeJson(`${fixtureDir}/golden/revision.json`, revision);
const spend = result.report.usage.reduce((sum, u) => sum + u.spend, 0);
console.log(
  JSON.stringify(
    {
      published: revision !== undefined,
      claims: revision?.claims.map((c) => [c.text, c.contradictionStatus]),
      failures: result.report.failures,
      droppedClaims: result.report.droppedClaims,
      usage: result.report.usage,
      spendUsd: spend,
    },
    null,
    2,
  ),
);
