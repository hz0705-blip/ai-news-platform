// 사용: pnpm --filter @newsplatform/pipeline eval:compare   (EVAL_DATA_DIR, #147)
// 두 초안을 항목별로 대조한다. 항목·검토 대상은 EVAL_DATA_DIR/review.json, 불일치 항목은 disagreements.json에,
// 합의율·불일치율·기권율·카파(문장 없음)는 저장소 eval/agreement.json에 쓴다. 두 초안이 다 있는 패킷만 대조한다.
import { GOLDEN_DRAFT_PROMPT } from "../eval/prompts/golden-draft.ts";
import {
  AUDIT_RATE,
  type CompareItem,
  compareDrafts,
  ITEM_KINDS,
  kindStats,
  REVIEW_REASONS,
  selectReview,
} from "../src/eval/compare.ts";
import { DRAFT_MODELS } from "../src/eval/draft.ts";
import { assertNoArticleText } from "../src/eval/packet.ts";
import { createEvalStore, evalDataDir, REPO_EVAL_DIR, writeJson } from "../src/eval/store.ts";

const store = createEvalStore(evalDataDir(process.env));
const packets = store.readPackets();
const items: CompareItem[] = [];
const unprocessed: string[] = [];
const dropped = { A: 0, B: 0 };
for (const packet of packets) {
  const a = store.readDraft(packet.packetId, "A");
  const b = store.readDraft(packet.packetId, "B");
  if (a === undefined || b === undefined) {
    unprocessed.push(packet.packetId);
    continue;
  }
  dropped.A += a.draft.dropped.length;
  dropped.B += b.draft.dropped.length;
  items.push(...compareDrafts(packet, a.draft, b.draft));
}
const review = selectReview(items);
writeJson(store.path("review.json"), { items, review });
writeJson(
  store.path("disagreements.json"),
  items.filter((item) => !item.agreed),
);

const spend = store.readSpend();
const agreement = {
  note: "동일 계열 두 모델 교차 검증, 단일 어노테이터. 모델 합의는 라벨 구성 방법이지 사람 검증이 아니다.",
  promptVersion: GOLDEN_DRAFT_PROMPT.version,
  models: DRAFT_MODELS,
  packets: {
    total: packets.length,
    compared: packets.length - unprocessed.length,
    unprocessed,
  },
  spendUsd: {
    total: Number(spend.reduce((sum, e) => sum + e.spentUsd, 0).toFixed(4)),
    A: Number(
      spend
        .filter((e) => e.side === "A")
        .reduce((s, e) => s + e.spentUsd, 0)
        .toFixed(4),
    ),
    B: Number(
      spend
        .filter((e) => e.side === "B")
        .reduce((s, e) => s + e.spentUsd, 0)
        .toFixed(4),
    ),
    calls: spend.length,
    failedCalls: spend.filter((e) => e.outcome === "실패").length,
  },
  droppedResponseFragments: dropped,
  // 카파는 종류마다 범주가 달라 종류별로만 낸다.
  overall: (({ kappa: _kappa, kappaItems: _kappaItems, ...rest }) => rest)(kindStats(items)),
  byKind: Object.fromEntries(
    ITEM_KINDS.map((kind) => [kind, kindStats(items.filter((item) => item.kind === kind))]),
  ),
  review: {
    auditRate: AUDIT_RATE,
    total: review.length,
    byReason: Object.fromEntries(
      REVIEW_REASONS.map((reason) => [
        reason,
        review.filter((r) => r.reasons.includes(reason)).length,
      ]),
    ),
  },
};
const output = `${JSON.stringify(agreement, null, 2)}\n`;
assertNoArticleText(output, packets);
writeJson(`${REPO_EVAL_DIR}/agreement.json`, agreement);
console.log(output);
