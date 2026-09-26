// 사용: node packages/pipeline/scripts/write-golden.ts <slug>
// 픽스처를 기록된 응답으로 돌려 golden/revision.json을 다시 쓴다. 결과는 사람이 읽어 확인한 뒤 커밋한다(Global Constraints "골든셋", Ruling 22-14).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createRecordedModelClient,
  DEMO_REFERENCE_TIME,
  loadDemoStoryInputs,
  runBatch,
} from "../src/index.ts";

const slug = process.argv[2];
if (!slug) {
  console.error("사용: node packages/pipeline/scripts/write-golden.ts <slug>");
  process.exit(2);
}
const fixture = loadDemoStoryInputs(slug);
const result = await runBatch(
  {
    articles: fixture.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: DEMO_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend: 10 },
    sources: fixture.sources,
    existingStories: [{ story: fixture.story }],
  },
  {
    modelClient: createRecordedModelClient(slug),
    embeddingClient: { embed: async () => [] },
    clock: () => DEMO_REFERENCE_TIME,
  },
);
const revision = result.revisions[0];
if (!revision) {
  console.error(`발행 실패: ${JSON.stringify(result.report.failures)}`);
  process.exit(1);
}
const out = resolve(import.meta.dirname, "../fixtures", slug, "golden/revision.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(revision, null, 2)}\n`);
console.log(
  `wrote ${out} (claims ${revision.claims.length}, status ${revision.contradictionStatus})`,
);
