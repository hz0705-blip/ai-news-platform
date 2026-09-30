// 사용: pnpm --filter @newsplatform/pipeline eval:adjudicate   (EVAL_DATA_DIR, #147, 터미널 대화형)
// eval:compare의 검토 대상을 하나씩 보여 주고 A·B·직접 입력·판정 불가 중 고르게 한다. 결정마다
// EVAL_DATA_DIR/adjudication.json에 저장하므로 q로 멈추고 다시 실행하면 남은 항목부터 잇는다.
// 모두 끝나면 저장소 eval/labels.json(문장 없음, 라벨 출처 모델 합의 / 운영자 판정 / 운영자 감사)을 쓴다.
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { GOLDEN_DRAFT_PROMPT } from "../eval/prompts/golden-draft.ts";
import {
  buildLabels,
  isPacketQuoteKey,
  type Progress,
  renderItem,
  runAdjudication,
} from "../src/eval/adjudicate.ts";
import type { CompareItem, ReviewItem } from "../src/eval/compare.ts";
import { DRAFT_MODELS, type Draft } from "../src/eval/draft.ts";
import { assertNoArticleText } from "../src/eval/packet.ts";
import {
  createEvalStore,
  evalDataDir,
  REPO_EVAL_DIR,
  readJson,
  writeJson,
} from "../src/eval/store.ts";

const store = createEvalStore(evalDataDir(process.env));
if (!existsSync(store.path("review.json"))) {
  console.error("검토 대상이 없다. 먼저 eval:compare를 실행한다.");
  process.exit(1);
}
const { items, review } = readJson<{ items: CompareItem[]; review: ReviewItem[] }>(
  store.path("review.json"),
);
const packets = store.readPackets();
const packetOf = (id: string) => {
  const packet = packets.find((p) => p.packetId === id);
  if (packet === undefined) throw new Error(`없는 패킷: ${id}`);
  return packet;
};
const draftsOf = (id: string): { A: Draft; B: Draft } => {
  const a = store.readDraft(id, "A");
  const b = store.readDraft(id, "B");
  if (a === undefined || b === undefined) throw new Error(`초안이 없다: ${id}`);
  return { A: a.draft, B: b.draft };
};
const progressPath = store.path("adjudication.json");
const progress: Progress = existsSync(progressPath)
  ? readJson<Progress>(progressPath)
  : { decisions: {} };

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(
  `검토 대상 ${review.length}개 중 ${Object.keys(progress.decisions).length}개 판정됨. A·B는 두 초안이며 원문으로 판정한다.`,
);
const result = await runAdjudication(review, progress, {
  ask: (question) => rl.question(question),
  print: (text) => console.log(text),
  save: (next) => writeJson(progressPath, next),
  render: (item, position, total) => renderItem(item, position, total, packetOf, draftsOf),
  isQuoteKey: (item, key) => isPacketQuoteKey(packetOf(item.packetId), key),
});
rl.close();

if (!result.finished) {
  console.log("멈췄다. 다시 실행하면 남은 항목부터 잇는다.");
  process.exit(0);
}
const labels = {
  note: "동일 계열 두 모델 교차 검증, 단일 어노테이터. 모델 합의는 라벨 구성 방법이지 사람 검증이 아니다.",
  promptVersion: GOLDEN_DRAFT_PROMPT.version,
  models: DRAFT_MODELS,
  labels: buildLabels(items, review, result.progress, packets),
};
const output = `${JSON.stringify(labels, null, 2)}\n`;
assertNoArticleText(output, packets);
writeJson(`${REPO_EVAL_DIR}/labels.json`, labels);
console.log(`판정 완료. ${labels.labels.length}개 라벨을 eval/labels.json에 썼다.`);
