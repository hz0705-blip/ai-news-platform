import { describe, expect, it } from "vitest";
import { buildLabels, type Progress, parseDirectInput, runAdjudication } from "./adjudicate.ts";
import { compareDrafts, selectReview } from "./compare.ts";
import { type Draft, resolveDraft } from "./draft.ts";
import { fakePacket } from "./testing.ts";

const packet = fakePacket();
const base = {
  pairs: [{ a: "a1", b: "a2", label: "같은 사건" as const }],
  storyStatus: "복수 출처 일치" as const,
};
const A: Draft = resolveDraft(packet)({
  ...base,
  claims: [
    {
      text: "가상 주장",
      claimType: "보도된 사실",
      modality: "단정",
      quotes: [{ sentenceIds: ["a1s2"], support: "뒷받침" }],
      relations: [],
    },
  ],
});
const B: Draft = resolveDraft(packet)({
  ...base,
  storyStatus: "단일 출처",
  claims: [
    {
      text: "가상 주장",
      claimType: "보도된 사실",
      modality: "예상",
      quotes: [{ sentenceIds: ["a1s2"], support: "부분 뒷받침" }],
      relations: [],
    },
  ],
});

describe("판정 CLI", () => {
  it("판정 CLI는 중단 뒤 이어서 한다", async () => {
    const items = compareDrafts(packet, A, B);
    const review = selectReview(items);
    expect(review.length).toBeGreaterThanOrEqual(3);
    let saved: Progress = { decisions: {} };
    const shown: string[] = [];
    const deps = (answers: string[]) => ({
      ask: async () => answers.shift() ?? "q",
      print: () => undefined,
      save: (p: Progress) => {
        saved = p;
      },
      render: (item: { itemId: string }) => {
        shown.push(item.itemId);
        return item.itemId;
      },
      isQuoteKey: () => true,
    });

    // 첫 항목 A, 둘째 항목 직접 입력(잘못된 입력 한 번 뒤), 그리고 중단.
    const first = await runAdjudication(
      review,
      saved,
      deps(["1", "3", "9 9", "3", directFor(review[1]?.kind), "q"]),
    );
    expect(first.finished).toBe(false);
    expect(Object.keys(saved.decisions)).toEqual([review[0]?.itemId, review[1]?.itemId]);
    expect(saved.decisions[review[1]?.itemId ?? ""]?.choice).toBe("직접 입력");
    expect(() => buildLabels(items, review, saved, [packet])).toThrow(/판정이 남은/);

    // 다시 실행하면 셋째 항목부터 보여 준다.
    shown.length = 0;
    const rest = review.slice(2).map(() => "2");
    const second = await runAdjudication(review, saved, deps([...rest.slice(0, -1), "4"]));
    expect(second.finished).toBe(true);
    expect(shown[0]).toBe(review[2]?.itemId);

    const labels = buildLabels(items, review, second.progress, [packet]);
    expect(labels).toHaveLength(items.length);
    const sources = new Map(labels.map((l) => [l.itemId, l.labelSource]));
    for (const item of items) {
      const reviewed = review.find((r) => r.itemId === item.itemId);
      expect(sources.get(item.itemId)).toBe(
        reviewed === undefined
          ? "모델 합의"
          : reviewed.reasons.includes("불일치")
            ? "운영자 판정"
            : "운영자 감사",
      );
    }
    const claimLabel = labels.find((l) => l.kind === "claim");
    expect(claimLabel?.value).toMatchObject({ evidence: [{ quoteKey: "a1s2", articleKey: "a1" }] });
    expect(labels.at(-1)).toMatchObject({ value: null, unresolvable: true });
  });

  it("직접 입력은 클래스 번호와 인용 키로 읽는다", () => {
    expect(parseDirectInput("status", "3", () => true)).toBe("보도 상충");
    expect(parseDirectInput("status", "6", () => true)).toBeNull();
    expect(parseDirectInput("claim", "2 4 a2s1 a1s1", () => true)).toEqual({
      claimType: "귀속 입장",
      modality: "예상",
      quotes: ["a1s1", "a2s1"],
    });
    expect(parseDirectInput("claim", "2 4 a9s1", (key) => key !== "a9s1")).toBeNull();
  });
});

function directFor(kind: string | undefined): string {
  return kind === "claim" ? "1 1 a1s2" : "1";
}
