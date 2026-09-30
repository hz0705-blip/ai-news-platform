import type { Topic } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import type { LocalPacket } from "./packet.ts";
import { buildPairRequest, comparePairs, selectDevPairs } from "./pairs.ts";
import { fakeArticle } from "./testing.ts";

/** 기사 `n`개짜리 가상 패킷. 임베딩은 [토픽 번호, 패킷 번호 × 0.1 + 기사 번호 × 0.01]. */
function packet(index: number, topic: Topic, n: number): LocalPacket {
  const packetId = `dev-${String(index).padStart(2, "0")}`;
  return {
    packetId,
    storyId: `story-${index}`,
    topic,
    sizeClass: n === 1 ? "단독" : n <= 4 ? "기사 2~4개" : "기사 5개 이상",
    storyArticleCount: n,
    articles: Array.from({ length: n }, (_, i) => ({
      ...fakeArticle(`${packetId}-${i + 1}`, `Sentence one of ${packetId}. Sentence two.`),
      key: `a${i + 1}`,
    })),
  };
}

const packets = [
  packet(1, "기술·AI", 4),
  packet(2, "기술·AI", 4),
  packet(3, "기술·AI", 3),
  packet(4, "세계 경제·금융", 4),
  packet(5, "세계 경제·금융", 4),
  packet(6, "세계 경제·금융", 1),
  packet(7, "국제 정치·외교·안보", 5),
];
const embeddings = new Map(
  packets.flatMap((p, pi) =>
    p.articles.map((a, ai) => [a.articleId, [1, pi * 0.1 + ai * 0.01]] as const),
  ),
);

describe("개발셋 기사 쌍", () => {
  it("어려운 부정은 같은 토픽의 다른 패킷 쌍에서 결정론으로 고르고 사건 안 30과 나눈다", () => {
    const selected = selectDevPairs(packets, embeddings, "seed");
    expect(selectDevPairs([...packets].reverse(), embeddings, "seed")).toEqual(selected);
    expect(selected.method).toBe("임베딩 코사인");

    const within = selected.pairs.filter((p) => p.set === "사건 안");
    const hard = selected.pairs.filter((p) => p.set === "어려운 부정");
    expect(within).toHaveLength(30);
    expect(hard).toHaveLength(30);

    const packetOf = (ref: string) => packets.find((p) => ref.startsWith(`${p.packetId}/`));
    for (const pair of within) expect(packetOf(pair.a)).toBe(packetOf(pair.b));
    for (const pair of hard) {
      expect(packetOf(pair.a)).not.toBe(packetOf(pair.b));
      expect(packetOf(pair.a)?.topic).toBe(packetOf(pair.b)?.topic);
    }
    // 가장 비슷한 교차 쌍 30개다: 뽑히지 않은 같은 토픽 교차 쌍의 유사도는 뽑힌 쌍의 최솟값 이하다.
    const vector = (ref: string) => {
      const p = packetOf(ref);
      const a = p?.articles.find((x) => ref.endsWith(`/${x.key}`));
      return embeddings.get(a?.articleId ?? "") ?? [];
    };
    const cos = (x: readonly number[], y: readonly number[]) =>
      ((x[0] ?? 0) * (y[0] ?? 0) + (x[1] ?? 0) * (y[1] ?? 0)) /
      Math.hypot(x[0] ?? 0, x[1] ?? 0) /
      Math.hypot(y[0] ?? 0, y[1] ?? 0);
    const refs = packets.flatMap((p) => p.articles.map((a) => `${p.packetId}/${a.key}`));
    const chosen = new Set(hard.map((p) => p.pairId));
    const lowest = Math.min(...hard.map((p) => p.similarity ?? 0));
    for (const x of refs) {
      for (const y of refs) {
        if (x >= y || packetOf(x) === packetOf(y) || packetOf(x)?.topic !== packetOf(y)?.topic)
          continue;
        if (!chosen.has(`${x}|${y}`))
          expect(cos(vector(x), vector(y))).toBeLessThanOrEqual(lowest + 1e-4);
      }
    }

    // 임베딩이 하나라도 없으면 제목 낱말 겹침으로 순위를 매긴다.
    const partial = new Map([...embeddings].slice(1));
    expect(selectDevPairs(packets, partial, "seed").method).toBe("제목 낱말 겹침");
  });

  it("쌍 요청은 패킷 소속을 가리고 응답을 실제 쌍으로 되돌린다", () => {
    const { pairs } = selectDevPairs(packets, embeddings, "seed");
    const request = buildPairRequest(packets, pairs, "shuffle", "A");
    expect(request.input).not.toMatch(/dev-\d+\/a\d/);
    expect(request.input).toMatch(/^p1: x\d+ - x\d+$/m);
    const first = pairs[0];
    // 요청 안 p1이 가리키는 실제 쌍을 찾아 라벨이 그 쌍에 붙는지 본다.
    const decoded = request.decode({
      pairs: pairs.map((_, i) => ({ pairId: `p${i + 1}`, label: "다른 사건" })),
    }) as { labels: Record<string, string>; dropped: string[] };
    expect(Object.keys(decoded.labels).sort()).toEqual(pairs.map((p) => p.pairId).sort());
    expect(decoded.dropped).toEqual([]);

    const file = (labels: Record<string, "같은 사건" | "다른 사건">) => ({
      side: "A" as const,
      model: "m",
      promptVersion: "golden-pair@1",
      spendUsd: 0,
      tokens: 0,
      labels,
      dropped: [],
    });
    const items = comparePairs(pairs, file({ [first?.pairId ?? ""]: "같은 사건" }), file({}));
    expect(items).toHaveLength(60);
    expect(items[0]).toMatchObject({
      kind: "pair",
      a: "같은 사건",
      b: null,
      agreed: false,
      sensitive: false,
    });
  });
});
