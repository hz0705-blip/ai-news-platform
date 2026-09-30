import { spanText, splitSentences } from "@newsplatform/domain";
import {
  GOLDEN_PAIR_PROMPT,
  PAIR_LEAD_SENTENCES,
  type PairWire,
  renderPairs,
} from "../../eval/prompts/golden-pair.ts";
import { buildRequest } from "../prompts/prompt.ts";
import type { ModelRequest } from "../types.ts";
import type { CompareItem } from "./compare.ts";
import type { DraftSide, SameStoryLabel } from "./draft.ts";
import { type LocalPacket, seededRank } from "./packet.ts";

/**
 * 개발셋 기사 쌍(스펙 "골든셋과 평가": 쌍 60개, 같은 사건 절반·어려운 부정 절반, #147).
 * - 사건 안 30: 패킷 안 기사 쌍 전부에서 시드 순위로 고른다.
 * - 어려운 부정 30: 같은 토픽의 서로 다른 패킷 기사 쌍을 기사 임베딩 코사인 유사도 순으로(임베딩이 하나라도
 *   없으면 제목 낱말 Jaccard 순으로) 높은 것부터. 동률은 쌍 식별자 순.
 * 기사는 `<packetId>/<기사 키>`로 가리키고, 쌍 식별자는 두 참조를 정렬해 `|`로 잇는다.
 */

export const WITHIN_STORY_PAIRS = 30;
export const HARD_NEGATIVE_PAIRS = 30;
/** 기사 쌍 대조 항목의 패킷 자리 값(쌍은 여러 패킷에 걸친다). */
export const PAIR_SET_ID = "pairs";

export const PAIR_SETS = ["사건 안", "어려운 부정"] as const;
export type PairSet = (typeof PAIR_SETS)[number];

export interface DevPair {
  readonly pairId: string;
  readonly a: string;
  readonly b: string;
  readonly set: PairSet;
  /** 어려운 부정의 순위 점수(소수 넷째 자리). */
  readonly similarity?: number;
}

export type SimilarityMethod = "임베딩 코사인" | "제목 낱말 겹침";

export interface DevPairs {
  readonly method: SimilarityMethod;
  readonly pairs: readonly DevPair[];
}

const ref = (packet: LocalPacket, key: string) => `${packet.packetId}/${key}`;

function pairOf(x: string, y: string, set: PairSet, similarity?: number): DevPair {
  const [a, b] = x < y ? [x, y] : [y, x];
  return {
    pairId: `${a}|${b}`,
    a,
    b,
    set,
    ...(similarity === undefined ? {} : { similarity: Math.round(similarity * 10_000) / 10_000 }),
  };
}

function cosine(x: readonly number[], y: readonly number[]): number {
  let dot = 0;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < x.length; i += 1) {
    const u = x[i] ?? 0;
    const v = y[i] ?? 0;
    dot += u * v;
    nx += u * u;
    ny += v * v;
  }
  return nx === 0 || ny === 0 ? 0 : dot / Math.sqrt(nx * ny);
}

function titleTokens(title: string): Set<string> {
  return new Set(title.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

function tokenJaccard(x: Set<string>, y: Set<string>): number {
  let common = 0;
  for (const token of x) if (y.has(token)) common += 1;
  const union = x.size + y.size - common;
  return union === 0 ? 0 : common / union;
}

/** `embeddings`: 기사 식별자 → 임베딩. */
export function selectDevPairs(
  packets: readonly LocalPacket[],
  embeddings: ReadonlyMap<string, readonly number[]>,
  seed: string,
): DevPairs {
  const within = packets
    .flatMap((packet) =>
      packet.articles.flatMap((x, i) =>
        packet.articles
          .slice(i + 1)
          .map((y) => pairOf(ref(packet, x.key), ref(packet, y.key), "사건 안")),
      ),
    )
    .sort((p, q) => (seededRank(seed, p.pairId) < seededRank(seed, q.pairId) ? -1 : 1))
    .slice(0, WITHIN_STORY_PAIRS);

  const allArticles = packets.flatMap((packet) => packet.articles);
  const method: SimilarityMethod = allArticles.every((a) => embeddings.has(a.articleId))
    ? "임베딩 코사인"
    : "제목 낱말 겹침";
  const score = (x: LocalPacket["articles"][number], y: LocalPacket["articles"][number]) => {
    const ex = embeddings.get(x.articleId);
    const ey = embeddings.get(y.articleId);
    return method === "임베딩 코사인" && ex !== undefined && ey !== undefined
      ? cosine(ex, ey)
      : tokenJaccard(titleTokens(x.title), titleTokens(y.title));
  };
  const cross: DevPair[] = [];
  packets.forEach((p, i) => {
    for (const q of packets.slice(i + 1)) {
      if (p.topic !== q.topic) continue;
      for (const x of p.articles) {
        for (const y of q.articles) {
          cross.push(pairOf(ref(p, x.key), ref(q, y.key), "어려운 부정", score(x, y)));
        }
      }
    }
  });
  const hard = cross
    .sort((p, q) => (q.similarity ?? 0) - (p.similarity ?? 0) || (p.pairId < q.pairId ? -1 : 1))
    .slice(0, HARD_NEGATIVE_PAIRS);

  return { method, pairs: [...within, ...hard].sort((p, q) => (p.pairId < q.pairId ? -1 : 1)) };
}

/** `EVAL_DATA_DIR/drafts/pairs.<A|B>.json`. */
export interface PairDraftFile {
  readonly side: DraftSide;
  readonly model: string;
  readonly promptVersion: string;
  readonly spendUsd: number;
  readonly tokens: number;
  /** 쌍 식별자 → 라벨. 응답에 없는 쌍은 빠진다. */
  readonly labels: Readonly<Record<string, SameStoryLabel>>;
  readonly dropped: readonly string[];
}

/**
 * 기사 쌍 라벨링 요청. 기사와 쌍은 시드 순위로 섞고 중립 식별자(`x<n>`, `p<n>`)로 보여 패킷 소속·순서가
 * 드러나지 않게 한다. `decode`는 중립 쌍 식별자를 실제 쌍 식별자로 되돌린다.
 */
export function buildPairRequest(
  packets: readonly LocalPacket[],
  pairs: readonly DevPair[],
  seed: string,
  side: DraftSide,
): ModelRequest {
  const articleOf = new Map(
    packets.flatMap((packet) => packet.articles.map((a) => [ref(packet, a.key), a] as const)),
  );
  const refs = [...new Set(pairs.flatMap((p) => [p.a, p.b]))].sort((x, y) =>
    seededRank(seed, x) < seededRank(seed, y) ? -1 : 1,
  );
  const neutral = new Map(refs.map((r, i) => [r, `x${i + 1}`]));
  const shuffled = [...pairs].sort((p, q) =>
    seededRank(seed, p.pairId) < seededRank(seed, q.pairId) ? -1 : 1,
  );
  const pairIdOf = new Map(shuffled.map((p, i) => [`p${i + 1}`, p.pairId]));
  const input = renderPairs(
    refs.map((r) => {
      const article = articleOf.get(r);
      if (article === undefined) throw new Error(`없는 기사 참조: ${r}`);
      return {
        id: neutral.get(r) ?? r,
        sourceId: article.sourceId,
        publishedAt: article.publishedAt,
        title: article.title,
        lead: splitSentences(article.body)
          .slice(0, PAIR_LEAD_SENTENCES)
          .map((span) => spanText(article.body, span)),
      };
    }),
    shuffled.map((p, i) => ({
      pairId: `p${i + 1}`,
      a: neutral.get(p.a) ?? p.a,
      b: neutral.get(p.b) ?? p.b,
    })),
  );
  return buildRequest(
    GOLDEN_PAIR_PROMPT,
    "golden-pair",
    `pairs:${side}`,
    input,
    (wire: PairWire) => {
      const labels: Record<string, SameStoryLabel> = {};
      const dropped: string[] = [];
      for (const { pairId, label } of wire.pairs) {
        const real = pairIdOf.get(pairId);
        if (real === undefined || labels[real] !== undefined) dropped.push(`잘못된 쌍: ${pairId}`);
        else labels[real] = label;
      }
      return { labels, dropped };
    },
  );
}

/** 기사 쌍 대조 항목. 수치·날짜·발언자 규칙은 주장 항목에만 걸므로 `sensitive`는 거짓이다. */
export function comparePairs(
  pairs: readonly DevPair[],
  a: PairDraftFile,
  b: PairDraftFile,
): CompareItem[] {
  return pairs.map((pair) => {
    const x = a.labels[pair.pairId] ?? null;
    const y = b.labels[pair.pairId] ?? null;
    return {
      itemId: `${PAIR_SET_ID}/pair:${pair.pairId}`,
      packetId: PAIR_SET_ID,
      kind: "pair",
      a: x,
      b: y,
      agreed: x !== null && x === y,
      sensitive: false,
    };
  });
}
