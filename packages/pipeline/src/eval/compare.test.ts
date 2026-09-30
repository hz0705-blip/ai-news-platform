import { describe, expect, it } from "vitest";
import { type CompareItem, cohenKappa, compareDrafts, selectReview } from "./compare.ts";
import type { Draft, DraftClaim } from "./draft.ts";
import { fakePacket } from "./testing.ts";

// fakePacket 문장: a1s1 "The robot fair opened in Gearton." a1s2 "It drew large crowds."
// a1s3 "Organizers expect more visitors next year." a2s1·a2s2·a2s3.
function claim(keys: readonly string[], overrides: Partial<DraftClaim> = {}): DraftClaim {
  return {
    text: "가상 주장",
    claimType: "보도된 사실",
    modality: "단정",
    quotes: keys.map((key) => ({
      key,
      articleKey: key.slice(0, 2),
      sentenceIds: [key],
      span: { start: 0, end: 1 },
      support: "뒷받침" as const,
    })),
    relations: [],
    ...overrides,
  };
}

function draft(claims: DraftClaim[], overrides: Partial<Draft> = {}): Draft {
  return {
    pairs: [{ a: "a1", b: "a2", label: "같은 사건" }],
    claims,
    storyStatus: "복수 출처 일치",
    dropped: [],
    ...overrides,
  };
}

describe("두 초안 대조", () => {
  it("두 초안이 같으면 모델 합의로 채택한다", () => {
    const packet = fakePacket();
    const same = draft([claim(["a1s2", "a2s2"])]);
    const items = compareDrafts(packet, same, same);
    expect(items.map((i) => i.itemId)).toEqual([
      "dev-01/pair:a1-a2",
      "dev-01/claim:c1",
      "dev-01/support:c1:a1s2",
      "dev-01/support:c1:a2s2",
      "dev-01/status",
    ]);
    expect(items.every((i) => i.agreed && !i.sensitive)).toBe(true);
  });

  it("불일치 항목과 일치 항목 20% 감사 표본을 검토 대상으로 고른다", () => {
    const packet = fakePacket();
    const a = draft([claim(["a1s2", "a2s2"]), claim(["a2s3"])]);
    const b = draft([claim(["a1s2", "a2s2"], { modality: "예상" })], { storyStatus: "단일 출처" });
    const items = compareDrafts(packet, a, b);
    const disagreed = items.filter((i) => !i.agreed).map((i) => i.itemId);
    // 유형·양상이 다른 주장, B에 없는 주장, 사건 상태가 불일치.
    expect(disagreed).toEqual(["dev-01/claim:c1", "dev-01/claim:c2", "dev-01/status"]);

    const many: CompareItem[] = Array.from({ length: 50 }, (_, n) => ({
      itemId: `dev-02/pair:x${n}`,
      packetId: "dev-02",
      kind: "pair",
      a: "같은 사건",
      b: "같은 사건",
      agreed: true,
      sensitive: false,
    }));
    const review = selectReview([...items, ...many]);
    const audit = review.filter((r) => r.reasons.includes("감사 표본"));
    const agreedCount = items.filter((i) => i.agreed).length + many.length;
    expect(audit).toHaveLength(Math.ceil(agreedCount * 0.2));
    expect(audit.every((r) => !r.reasons.includes("불일치"))).toBe(true);
    for (const id of disagreed) {
      expect(review.find((r) => r.itemId === id)?.reasons).toContain("불일치");
    }
    expect(selectReview([...items, ...many])).toEqual(review);
  });

  it("수치·날짜·발언자 항목은 일치해도 검토 대상이다", () => {
    const packet = fakePacket();
    const withDate = {
      ...packet.articles[0],
      body: "The fair opened on Monday. Officials said 40 robots came.",
    };
    const p = { ...packet, articles: [withDate, packet.articles[1]] as typeof packet.articles };
    const number = draft([
      {
        ...claim(["a1s2"]),
        quotes: [{ ...claim(["a1s2"]).quotes[0], span: { start: 27, end: 57 } }],
      },
    ] as DraftClaim[]);
    const plain = draft([claim(["a2s3"])]);
    const speaker = draft([claim(["a2s3"], { claimType: "귀속 입장" })]);
    const sensitive = (d: Draft) =>
      selectReview(compareDrafts(p, d, d)).filter((r) => r.reasons.includes("수치·날짜·발언자"));
    expect(sensitive(number).map((r) => r.itemId)).toEqual([
      "dev-01/claim:c1",
      "dev-01/support:c1:a1s2",
    ]);
    expect(sensitive(speaker).map((r) => r.kind)).toEqual(["claim", "support"]);
    expect(sensitive(plain)).toEqual([]);
  });

  it("카파를 계산한다", () => {
    // 교과서 예: 50쌍, 관측 일치 0.7, 기대 일치 0.5 → κ = 0.4.
    const pairs: [string, string][] = [
      ...Array.from({ length: 20 }, () => ["예", "예"] as [string, string]),
      ...Array.from({ length: 5 }, () => ["예", "아니오"] as [string, string]),
      ...Array.from({ length: 10 }, () => ["아니오", "예"] as [string, string]),
      ...Array.from({ length: 15 }, () => ["아니오", "아니오"] as [string, string]),
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(0.4, 10);
    expect(cohenKappa([["예", "예"]])).toBeNull();
    expect(cohenKappa([])).toBeNull();
  });
});
