import { spanText } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import type { DraftWire } from "../../eval/prompts/golden-draft.ts";
import type { ModelClient, ModelRequest } from "../types.ts";
import { type Draft, type DraftJob, resolveDraft, runDrafts, SpendLedger } from "./draft.ts";
import { fakePacket } from "./testing.ts";

const wire: DraftWire = {
  pairs: [{ a: "a2", b: "a1", label: "같은 사건" }],
  claims: [
    {
      text: "기어턴에서 로봇 박람회가 열렸다.",
      claimType: "보도된 사실",
      modality: "단정",
      quotes: [
        { sentenceIds: ["a1s1"], support: "뒷받침" },
        { sentenceIds: ["a2s1", "a2s2"], support: "부분 뒷받침" },
        { sentenceIds: ["a1s9"], support: "뒷받침" },
        { sentenceIds: ["a1s1", "a1s3"], support: "뒷받침" },
      ],
      relations: [{ a: "a2s1", b: "a1s1", label: "뒷받침 일치" }],
    },
  ],
  storyStatus: "복수 출처 일치",
};

describe("골든셋 초안", () => {
  it("문장 식별자를 기사 버전 좌표로 바꾸고 잘못된 인용은 버린다", () => {
    const packet = fakePacket();
    const draft = resolveDraft(packet)(wire);
    expect(draft.pairs).toEqual([{ a: "a1", b: "a2", label: "같은 사건" }]);
    const quotes = draft.claims[0]?.quotes ?? [];
    expect(quotes.map((q) => q.key)).toEqual(["a1s1", "a2s1+a2s2"]);
    const second = packet.articles[1];
    expect(second && quotes[1] && spanText(second.body, quotes[1].span)).toBe(
      "Gearton hosted a robot fair this week. Attendance was high.",
    );
    expect(draft.claims[0]?.relations).toEqual([
      { a: "a1s1", b: "a2s1+a2s2", label: "뒷받침 일치" },
    ]);
    expect(draft.dropped).toHaveLength(2);
  });

  it("예약 누계가 상한을 넘으면 호출하지 않는다", async () => {
    const calls: string[] = [];
    const client: ModelClient = {
      modelId: "fake",
      async complete(request: ModelRequest) {
        calls.push(request.key);
        return { output: request.decode(wire) as Draft, usage: { tokens: 10, spend: 0.1 } };
      },
    };
    const packet = fakePacket();
    const jobs: DraftJob[] = ["dev-01", "dev-02", "dev-03"].flatMap((packetId) => [
      { packet: { ...packet, packetId }, side: "A" as const },
    ]);
    // gpt-5 예약은 최대 출력 16,000 × $10/1M = $0.16 + 입력 추정. 이전 지출 $2.75 + 첫 예약은 $3 아래,
    // 첫 호출 지출 $0.10을 더한 뒤의 둘째 예약은 $3 위.
    const ledger = new SpendLedger(3, 2.75);
    const spends: number[] = [];
    const result = await runDrafts(jobs, {
      clientFor: () => client,
      ledger,
      saveDraft: () => undefined,
      recordSpend: (entry) => spends.push(entry.spentUsd),
    });
    expect(calls).toEqual(["dev-01:A"]);
    expect(result.completed.map((j) => j.packet.packetId)).toEqual(["dev-01"]);
    expect(result.notCalled.map((j) => j.packet.packetId)).toEqual(["dev-02", "dev-03"]);
    expect(ledger.spentUsd).toBeCloseTo(2.85, 10);
    expect(spends).toEqual([0.1]);

    // 이미 상한을 넘을 지출이면 한 번도 부르지 않는다.
    calls.length = 0;
    await runDrafts(jobs, {
      clientFor: () => client,
      ledger: new SpendLedger(3, 2.9),
      saveDraft: () => undefined,
      recordSpend: () => undefined,
    });
    expect(calls).toEqual([]);
  });
});
