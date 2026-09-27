import { describe, expect, it } from "vitest";
import type { ModelClient } from "../types.ts";
import { runGateSupport } from "./gate.ts";

const client = (response: unknown): ModelClient => ({
  modelId: "test",
  complete: async () => ({ output: response, usage: { tokens: 0, spend: 0 } }),
});
const input = {
  storyId: "story-x",
  claimKey: "c-1",
  claim: { text: "주장 문장", claimType: "보도된 사실" as const, modality: "단정" as const },
  evidence: [
    { quoteId: "q-a", spanText: "A said it." },
    { quoteId: "q-b", spanText: "B said it." },
  ],
};
const judge = (quoteId: string, label: string) => ({ quoteId, label, reason: "이유" });

describe("게이트 2단계", () => {
  it.each([
    ["뒷받침", true],
    ["부분 뒷받침", false],
    ["뒷받침 안 됨", false],
    ["상충", false],
    ["판정 불가", false],
  ] as const)("근거 하나의 라벨 %s → 발행 %s", async (label, publish) => {
    const single = { ...input, evidence: input.evidence.slice(0, 1) };
    const out = await runGateSupport(single, client({ judgments: [judge("q-a", label)] }));
    expect(out.publish).toBe(publish);
    expect(out.reason).toBe(publish ? "" : `게이트 2단계 미통과: q-a=${label}`);
  });

  it("뒷받침과 함께 온 상충 인용은 반대 쪽 근거로 남고, 나머지 라벨의 인용은 버린다", async () => {
    const three = { ...input, evidence: [...input.evidence, { quoteId: "q-c", spanText: "C." }] };
    const out = await runGateSupport(
      three,
      client({
        judgments: [judge("q-a", "뒷받침"), judge("q-b", "상충"), judge("q-c", "부분 뒷받침")],
      }),
    );
    expect(out.publish).toBe(true);
    expect(out.kept).toEqual(["q-a", "q-b"]);
  });

  it("라벨이 빠지거나 모르는 인용·중복 라벨이면 응답 스키마 불일치로 실패한다", async () => {
    for (const judgments of [
      [judge("q-a", "뒷받침")],
      [judge("q-a", "뒷받침"), judge("q-b", "뒷받침"), judge("q-z", "뒷받침")],
      [judge("q-a", "뒷받침"), judge("q-a", "뒷받침"), judge("q-b", "뒷받침")],
      [judge("q-a", "확실함"), judge("q-b", "뒷받침")],
    ]) {
      await expect(runGateSupport(input, client({ judgments }))).rejects.toThrow(
        /응답 스키마 불일치/,
      );
    }
  });
});
