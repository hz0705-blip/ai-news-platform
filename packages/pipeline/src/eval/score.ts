import {
  CONTRADICTION_STATUSES,
  checkEvidenceSpan,
  createArticleVersion,
  findSpan,
  RELATION_LABELS,
  type Revision,
  type Source,
  spanText,
  splitSentences,
} from "@newstrail/domain";
import type { GateSupportLabel } from "../schemas.ts";
import type { Label } from "./adjudicate.ts";
import { alignClaims } from "./compare.ts";
import type { Draft } from "./draft.ts";
import { flipCounts, type JudgeClaim, type JudgeMatch, type JudgeTask } from "./judge.ts";
import {
  adjustedRandIndex,
  bCubed,
  bootstrapInterval,
  type ClassScore,
  confusionMatrix,
  type Interval,
  type LabeledPair,
  type LabeledPoint,
  normalizedMutualInformation,
  perClassScores,
  percentile,
  type Ratio,
  ratio,
  UNIT_WEIGHTS,
  type Weights,
} from "./metrics.ts";
import type { LocalPacket } from "./packet.ts";
import type { StreamResult } from "./stream.ts";

/**
 * 채점(#149). 실행 파일(`runs/<runId>/run.json`)·정답(`labels.json`)·패킷·초안(정답 주장 문장)·판정 결과로 지표를 낸다.
 * 결정론이며 유료 호출이 없다(판정자 호출은 `eval-score` 스크립트가 먼저 하고 결과를 넘긴다).
 *
 * 채점 규칙(Ruling, 스펙 "골든셋과 평가"):
 * - 사건의 최종 처리 = 그 사건이 마지막으로 새 개정판을 낸 슬롯. 주장·게이트 라벨·상충 라벨은 그 슬롯의 응답에서 읽는다.
 * - 패킷의 예측 사건 = 패킷 기사가 가장 많이 배정된 사건(동수면 먼저 발행된 기사의 사건).
 * - 정답 분할 = 패킷 소속. 판정된 기사 쌍 라벨이 다른 패킷 기사를 "같은 사건"이라 하면 두 패킷을 합친다.
 * - 인용 대응: 파이프라인 인용과 정답 인용은 같은 기사에서 문장(`splitSentences`)을 하나라도 공유하면 대응한다.
 */

export interface RunFile extends StreamResult {
  readonly runId: string;
  readonly createdAt: string;
  readonly offline: boolean;
  readonly modelId: string;
  readonly embeddingModel: string;
  readonly promptVersions: Readonly<Record<string, string>>;
  readonly capUsd: number;
  readonly pipelineLimitUsd: number;
  readonly sources: readonly Source[];
}

export interface ScoreInput {
  readonly packets: readonly LocalPacket[];
  readonly labels: readonly Label[];
  readonly drafts: (packetId: string) => { readonly A: Draft; readonly B: Draft };
  readonly run: RunFile;
}

interface QuoteView {
  readonly quoteId: string;
  readonly packetId: string;
  /** `<packetId>/<기사 키>s<문장 번호>`. */
  readonly sentences: ReadonlySet<string>;
  readonly text: string;
}

interface PipelineClaim {
  readonly claimKey: string;
  readonly text: string;
  readonly quotes: readonly QuoteView[];
  readonly gate: Readonly<Record<string, GateSupportLabel>> | undefined;
  readonly relations: readonly { readonly a: string; readonly b: string; readonly label: string }[];
}

interface GoldClaim {
  readonly itemId: string;
  readonly text: string;
  readonly evidence: readonly { readonly sentences: ReadonlySet<string>; readonly text: string }[];
  readonly supports: readonly { readonly sentences: ReadonlySet<string>; readonly value: string }[];
  readonly relations: readonly {
    readonly x: ReadonlySet<string>;
    readonly y: ReadonlySet<string>;
    readonly value: string;
  }[];
}

const overlaps = (x: ReadonlySet<string>, y: ReadonlySet<string>) => [...x].some((s) => y.has(s));

/** 채점 문맥: 패킷·정답·실행을 한 번 읽어 둔다. */
export function createScoreContext(input: ScoreInput) {
  const { packets, labels, run } = input;
  const articleById = new Map(
    packets.flatMap((p) => p.articles.map((a) => [a.articleId, { packet: p, article: a }])),
  );
  const articleByVersion = new Map(
    packets.flatMap((p) => p.articles.map((a) => [a.articleVersionId, { packet: p, article: a }])),
  );
  const bodyOf = (versionId: string): string | undefined => {
    const found = articleByVersion.get(versionId);
    if (found === undefined) return undefined;
    return createArticleVersion({
      id: versionId,
      articleId: found.article.articleId,
      rawBody: found.article.body,
      capturedAt: new Date(0),
    }).body;
  };
  const sentencesOf = (versionId: string, span: { start: number; end: number }) => {
    const found = articleByVersion.get(versionId);
    const body = bodyOf(versionId);
    if (found === undefined || body === undefined) return new Set<string>();
    return new Set(
      splitSentences(body).flatMap((s, i) =>
        s.start < span.end && span.start < s.end
          ? [`${found.packet.packetId}/${found.article.key}s${i + 1}`]
          : [],
      ),
    );
  };

  // 사건의 최종 처리 슬롯과 개정판.
  const final = new Map<string, { slotKey: string; revision: Revision }>();
  for (const slot of run.slots) {
    for (const revision of slot.revisions) {
      final.set(revision.storyId, { slotKey: slot.slotKey, revision });
    }
  }

  const packetStory = new Map<string, string | undefined>();
  for (const packet of packets) {
    const counts = new Map<string, number>();
    for (const a of packet.articles) {
      const storyId = run.assignments[a.articleId];
      if (storyId !== undefined) counts.set(storyId, (counts.get(storyId) ?? 0) + 1);
    }
    let best: string | undefined;
    for (const a of packet.articles) {
      const storyId = run.assignments[a.articleId];
      if (storyId === undefined) continue;
      if (best === undefined || (counts.get(storyId) ?? 0) > (counts.get(best) ?? 0))
        best = storyId;
    }
    packetStory.set(packet.packetId, best);
  }

  const pipelineClaims = (storyId: string | undefined): PipelineClaim[] => {
    const done = storyId === undefined ? undefined : final.get(storyId);
    if (storyId === undefined || done === undefined) return [];
    const inSlot = run.responses.filter((r) => r.slotKey === done.slotKey);
    const quotes = new Map<string, QuoteView>();
    for (const r of inSlot) {
      if (r.stage !== "evidence-extract") continue;
      const found = articleByVersion.get(r.key);
      const body = bodyOf(r.key);
      if (found === undefined || body === undefined) continue;
      for (const q of (r.output as { quotes: { quoteId: string; quote: string }[] }).quotes) {
        const span = findSpan(body, q.quote);
        if (span === undefined) continue;
        quotes.set(q.quoteId, {
          quoteId: q.quoteId,
          packetId: found.packet.packetId,
          sentences: sentencesOf(r.key, span),
          text: q.quote,
        });
      }
    }
    const generated = inSlot.find(
      (r) => r.stage === "claim-generate" && r.key.startsWith(`${storyId}:`),
    )?.output as { claims: { claimKey: string; text: string; quoteIds: string[] }[] } | undefined;
    return (generated?.claims ?? []).map((claim) => {
      const gate = inSlot.find(
        (r) => r.stage === "gate" && r.key === `${storyId}:gate:${claim.claimKey}`,
      )?.output as { judgments: { quoteId: string; label: GateSupportLabel }[] } | undefined;
      const contradiction = inSlot.find(
        (r) => r.stage === "contradiction-label" && r.key === `${storyId}:${claim.claimKey}`,
      )?.output as { pairs: { a: string; b: string; label: string }[] } | undefined;
      return {
        claimKey: claim.claimKey,
        text: claim.text,
        quotes: claim.quoteIds.flatMap((id) => {
          const q = quotes.get(id);
          return q === undefined ? [] : [q];
        }),
        gate:
          gate === undefined
            ? undefined
            : Object.fromEntries(gate.judgments.map((j) => [j.quoteId, j.label])),
        relations: contradiction?.pairs ?? [],
      };
    });
  };

  const labelsOf = (packetId: string, kind: Label["kind"]) =>
    labels.filter((l) => l.packetId === packetId && l.kind === kind);
  const keySentences = (packetId: string, quoteKey: string) =>
    new Set(quoteKey.split("+").map((id) => `${packetId}/${id}`));

  const goldClaims = (packet: LocalPacket): GoldClaim[] => {
    const drafts = input.drafts(packet.packetId);
    const rows = alignClaims(drafts.A.claims, drafts.B.claims);
    const supports = labelsOf(packet.packetId, "support");
    const relations = labelsOf(packet.packetId, "relation");
    return labelsOf(packet.packetId, "claim").flatMap((label): GoldClaim[] => {
      const value = label.value;
      if (value === null || typeof value === "string") return [];
      const claimId = label.itemId.split("claim:")[1] ?? "";
      const [i, j] = rows[Number(claimId.slice(1)) - 1] ?? [null, null];
      const text =
        (i === null ? undefined : drafts.A.claims[i]?.text) ??
        (j === null ? undefined : drafts.B.claims[j]?.text) ??
        "";
      const bodyByKey = new Map(packet.articles.map((a) => [a.key, a.body]));
      const resolved = (v: Label["value"]): v is string =>
        typeof v === "string" && v !== "판정 불가";
      return [
        {
          itemId: label.itemId,
          text,
          evidence: value.evidence.map((e) => ({
            sentences: keySentences(packet.packetId, e.quoteKey),
            text: spanText(bodyByKey.get(e.articleKey) ?? "", e.span),
          })),
          supports: supports
            .filter((s) => s.itemId.includes(`/support:${claimId}:`) && resolved(s.value))
            .map((s) => ({
              sentences: keySentences(packet.packetId, s.itemId.split(":").at(-1) ?? ""),
              value: s.value as string,
            })),
          relations: relations
            .filter((r) => r.itemId.includes(`/relation:${claimId}:`) && resolved(r.value))
            .map((r) => {
              const [x, y] = (r.itemId.split(":").at(-1) ?? "").split("|");
              return {
                x: keySentences(packet.packetId, x ?? ""),
                y: keySentences(packet.packetId, y ?? ""),
                value: r.value as string,
              };
            }),
        },
      ];
    });
  };

  return {
    input,
    articleById,
    articleByVersion,
    bodyOf,
    final,
    packetStory,
    pipelineClaims,
    goldClaims,
    labelsOf,
  };
}

export type ScoreContext = ReturnType<typeof createScoreContext>;

/** 판정 과제: 예측 사건에 개정판이 있고 정답 주장이 있는 패킷만. 근거에는 문장만 넣고 출처를 넣지 않는다. */
export function buildJudgeTasks(ctx: ScoreContext): JudgeTask[] {
  return ctx.input.packets.flatMap((packet): JudgeTask[] => {
    const pipeline: JudgeClaim[] = ctx
      .pipelineClaims(ctx.packetStory.get(packet.packetId))
      .map((c) => ({ id: c.claimKey, text: c.text, evidence: c.quotes.map((q) => q.text) }));
    const gold: JudgeClaim[] = ctx
      .goldClaims(packet)
      .map((c) => ({ id: c.itemId, text: c.text, evidence: c.evidence.map((e) => e.text) }));
    return pipeline.length === 0 || gold.length === 0
      ? []
      : [{ packetId: packet.packetId, pipeline, gold }];
  });
}

// ── 지표 ─────────────────────────────────────────────────────────

export interface MetricRow {
  readonly group: string;
  readonly name: string;
  readonly value: number | null;
  /** 분모 설명과 수(예 "판정된 기사 쌍 44"). */
  readonly denominator: string;
  readonly interval: Interval | null;
}

export interface JudgeResults {
  readonly [packetId: string]: {
    readonly original?: readonly JudgeMatch[];
    readonly reversed?: readonly JudgeMatch[];
  };
}

export interface Score {
  readonly runId: string;
  readonly packets: number;
  readonly articles: number;
  readonly assignedArticles: number;
  readonly goldStories: number;
  readonly predictedStories: number;
  readonly rows: readonly MetricRow[];
  readonly status: {
    readonly goldClasses: readonly string[];
    readonly predClasses: readonly string[];
    readonly matrix: Readonly<Record<string, Readonly<Record<string, number>>>>;
  };
  readonly relation: Readonly<Record<string, ClassScore>>;
  readonly relationUnaligned: number;
  readonly judge: {
    readonly tasks: number;
    readonly judged: number;
    readonly flipPackets: number;
    readonly flipped: number;
    readonly flipUnion: number;
  };
  readonly cost: {
    readonly embeddingUsd: number;
    readonly modelUsd: number;
    readonly pipelineUsd: number;
    readonly perStoryUsd: number | null;
    readonly perArticleUsd: number | null;
  };
  readonly time: {
    readonly slots: number;
    readonly p50Ms: number | null;
    readonly p95Ms: number | null;
  };
  readonly failuresByStage: Readonly<Record<string, number>>;
}

const weightOf = (w: Weights, packets: readonly string[]) =>
  packets.reduce((product, id) => product * w(id), 1);

function weightedRatio<T extends { packets: readonly string[] }>(
  items: readonly T[],
  w: Weights,
  hit: (item: T) => boolean,
  inDenominator: (item: T) => boolean = () => true,
): Ratio {
  let numerator = 0;
  let denominator = 0;
  for (const item of items) {
    if (!inDenominator(item)) continue;
    const weight = weightOf(w, item.packets);
    denominator += weight;
    if (hit(item)) numerator += weight;
  }
  return ratio(numerator, denominator);
}

export function scoreRun(ctx: ScoreContext, judgments: JudgeResults): Score {
  const { packets, labels, run } = ctx.input;
  const packetIds = packets.map((p) => p.packetId);
  const rows: MetricRow[] = [];
  const addRow = (
    group: string,
    name: string,
    compute: (w: Weights) => Ratio | number | null,
    denominator: (point: Ratio | number | null) => string,
  ) => {
    const point = compute(UNIT_WEIGHTS);
    const value = (r: Ratio | number | null) => (r === null || typeof r === "number" ? r : r.value);
    rows.push({
      group,
      name,
      value: value(point),
      denominator: denominator(point),
      interval: bootstrapInterval(packetIds, (w) => value(compute(w))),
    });
  };
  const count = (r: Ratio | number | null) =>
    r !== null && typeof r !== "number" ? r.denominator : 0;

  // 1. 사건 배정
  const packetOfKey = (ref: string) => {
    const [packetId, key] = ref.split("/");
    const packet = packets.find((p) => p.packetId === packetId);
    return { packetId: packetId ?? "", article: packet?.articles.find((a) => a.key === key) };
  };
  const pairs = labels
    .filter((l) => l.kind === "pair" && (l.value === "같은 사건" || l.value === "다른 사건"))
    .map((l) => {
      const [x, y] = (l.itemId.split("pair:")[1] ?? "").split("|").map(packetOfKey);
      return { x, y, same: l.value === "같은 사건" };
    });
  const root = new Map(packetIds.map((id) => [id, id]));
  const find = (id: string): string => {
    const parent = root.get(id) ?? id;
    return parent === id ? id : find(parent);
  };
  for (const { x, y, same } of pairs) {
    if (same && x !== undefined && y !== undefined && x.packetId !== y.packetId) {
      root.set(find(y.packetId), find(x.packetId));
    }
  }
  const pairObs = pairs.flatMap(({ x, y, same }) => {
    const sx = x?.article === undefined ? undefined : run.assignments[x.article.articleId];
    const sy = y?.article === undefined ? undefined : run.assignments[y.article.articleId];
    if (x === undefined || y === undefined || sx === undefined || sy === undefined) return [];
    const packetsOfPair = x.packetId === y.packetId ? [x.packetId] : [x.packetId, y.packetId];
    return [{ packets: packetsOfPair, same, predSame: sx === sy }];
  });
  addRow(
    "사건 배정",
    "사건 배정 정확도(판정된 기사 쌍)",
    (w) => weightedRatio(pairObs, w, (o) => o.same === o.predSame),
    (r) => `판정된 기사 쌍 ${count(r)}`,
  );
  addRow(
    "사건 배정",
    "거짓 병합률",
    (w) =>
      weightedRatio(
        pairObs,
        w,
        (o) => o.predSame,
        (o) => !o.same,
      ),
    (r) => `정답 "다른 사건" 쌍 ${count(r)}`,
  );
  addRow(
    "사건 배정",
    "거짓 분리율",
    (w) =>
      weightedRatio(
        pairObs,
        w,
        (o) => !o.predSame,
        (o) => o.same,
      ),
    (r) => `정답 "같은 사건" 쌍 ${count(r)}`,
  );
  const points = (w: Weights): LabeledPoint[] =>
    packets.flatMap((p) =>
      p.articles.flatMap((a) => {
        const pred = run.assignments[a.articleId];
        return pred === undefined ? [] : [{ gold: find(p.packetId), pred, weight: w(p.packetId) }];
      }),
    );
  const assigned = points(UNIT_WEIGHTS).length;
  addRow(
    "사건 배정",
    "ARI",
    (w) => adjustedRandIndex(points(w)),
    () => `배정된 기사 ${assigned}`,
  );
  addRow(
    "사건 배정",
    "NMI",
    (w) => normalizedMutualInformation(points(w)),
    () => `배정된 기사 ${assigned}`,
  );
  for (const part of ["precision", "recall", "f1"] as const) {
    addRow(
      "사건 배정",
      `B-cubed ${part === "precision" ? "정밀도" : part === "recall" ? "재현율" : "F1"}`,
      (w) => bCubed(points(w))?.[part] ?? null,
      () => `배정된 기사 ${assigned}`,
    );
  }

  // 2. 근거 게이트 1단계: 발행된(최종 개정판의) 근거 구간을 패킷 본문으로 다시 검사한다.
  const evidenceObs = [...ctx.final.values()].flatMap(({ revision }) =>
    revision.claims.flatMap((claim) =>
      claim.evidence.flatMap((e) => {
        const found = ctx.articleByVersion.get(e.articleVersionId);
        const body = ctx.bodyOf(e.articleVersionId);
        if (found === undefined || body === undefined) return [];
        const check = checkEvidenceSpan({
          body,
          span: e.span,
          rightsTier:
            run.sources.find((s) => s.id === e.sourceId)?.rightsTier ?? "본문 처리 + 발췌 표시",
          normalizationVersion: e.normalizationVersion,
        });
        return [
          {
            packets: [found.packet.packetId],
            valid: check.ok && spanText(body, e.span) === e.spanText,
          },
        ];
      }),
    ),
  );
  addRow(
    "근거 게이트",
    "1단계 유효 구간율(발행 근거)",
    (w) => weightedRatio(evidenceObs, w, (o) => o.valid),
    (r) => `발행 근거 ${count(r)}`,
  );

  // 판정자 매칭: 패킷 → (파이프라인 주장, 정답 주장) 쌍.
  const matched = packets.flatMap((packet) => {
    const matches = judgments[packet.packetId]?.original ?? [];
    if (matches.length === 0) return [];
    const pipeline = new Map(
      ctx.pipelineClaims(ctx.packetStory.get(packet.packetId)).map((c) => [c.claimKey, c]),
    );
    const gold = new Map(ctx.goldClaims(packet).map((c) => [c.itemId, c]));
    return matches.flatMap((m) => {
      const p = pipeline.get(m.pipeline);
      const g = gold.get(m.gold);
      return p === undefined || g === undefined ? [] : [{ packetId: packet.packetId, p, g }];
    });
  });

  // 3. 근거 게이트 2단계: 매칭된 주장에서 정답 뒷받침 라벨과 대응하는 파이프라인 인용의 라벨.
  const gateObs = matched.flatMap(({ packetId, p, g }) =>
    p.quotes.flatMap((q) => {
      const pred = p.gate?.[q.quoteId];
      const gold = g.supports.find((s) => overlaps(s.sentences, q.sentences))?.value;
      return pred === undefined || gold === undefined ? [] : [{ packets: [packetId], gold, pred }];
    }),
  );
  addRow(
    "근거 게이트",
    '2단계 정밀도("뒷받침")',
    (w) =>
      weightedRatio(
        gateObs,
        w,
        (o) => o.gold === "뒷받침",
        (o) => o.pred === "뒷받침",
      ),
    (r) => `파이프라인 "뒷받침" 인용 중 정답 있는 것 ${count(r)}`,
  );
  addRow(
    "근거 게이트",
    '2단계 재현율("뒷받침")',
    (w) =>
      weightedRatio(
        gateObs,
        w,
        (o) => o.pred === "뒷받침",
        (o) => o.gold === "뒷받침",
      ),
    (r) => `정답 "뒷받침" 인용 중 파이프라인이 판정한 것 ${count(r)}`,
  );
  const allGate = packets.flatMap((packet) =>
    ctx.pipelineClaims(ctx.packetStory.get(packet.packetId)).flatMap((c) =>
      c.quotes.flatMap((q) => {
        const label = c.gate?.[q.quoteId];
        return label === undefined || q.packetId !== packet.packetId
          ? []
          : [{ packets: [packet.packetId], label }];
      }),
    ),
  );
  addRow(
    "근거 게이트",
    '2단계 기권율("판정 불가")',
    (w) => weightedRatio(allGate, w, (o) => o.label === "판정 불가"),
    (r) => `파이프라인 2단계 판정 ${count(r)}`,
  );

  // 4. 상충 관계: 매칭된 주장에서 정답 인용 쌍에 대응하는 파이프라인 인용 쌍의 라벨.
  let relationUnaligned = 0;
  const relationObs = matched.flatMap(({ packetId, p, g }) =>
    g.relations.flatMap((r) => {
      const quote = (id: string) => p.quotes.find((q) => q.quoteId === id);
      const pair = p.relations.find((rel) => {
        const a = quote(rel.a);
        const b = quote(rel.b);
        if (a === undefined || b === undefined) return false;
        return (
          (overlaps(a.sentences, r.x) && overlaps(b.sentences, r.y)) ||
          (overlaps(a.sentences, r.y) && overlaps(b.sentences, r.x))
        );
      });
      if (pair === undefined) {
        relationUnaligned += 1;
        return [];
      }
      return [{ packets: [packetId], gold: r.value, pred: pair.label }];
    }),
  );
  const relationPairs = (w: Weights): LabeledPair[] =>
    relationObs.map((o) => ({ gold: o.gold, pred: o.pred, weight: weightOf(w, o.packets) }));
  for (const label of RELATION_LABELS) {
    addRow(
      "상충 관계",
      `F1 "${label}"`,
      (w) => perClassScores(relationPairs(w), RELATION_LABELS)[label]?.f1 ?? null,
      () => {
        const s = perClassScores(relationPairs(UNIT_WEIGHTS), RELATION_LABELS)[label];
        return `정답 ${s?.recall.denominator ?? 0} · 예측 ${s?.precision.denominator ?? 0}`;
      },
    );
  }

  // 5. 상태 5클래스: 패킷 정답 상태 × 예측 사건의 최종 개정판 상태.
  const UNPROCESSED = "미처리";
  const statusObs = packets.flatMap((packet) => {
    const gold = ctx.labelsOf(packet.packetId, "status")[0]?.value;
    if (typeof gold !== "string") return [];
    const storyId = ctx.packetStory.get(packet.packetId);
    const pred =
      (storyId === undefined ? undefined : ctx.final.get(storyId)?.revision.contradictionStatus) ??
      UNPROCESSED;
    return [{ packets: [packet.packetId], gold, pred }];
  });
  addRow(
    "상태",
    "사건 상태 정확도(5클래스)",
    (w) => weightedRatio(statusObs, w, (o) => o.gold === o.pred),
    (r) => `정답 상태가 있는 패킷 ${count(r)}`,
  );
  const predClasses = [...CONTRADICTION_STATUSES, UNPROCESSED];

  // 판정자 위치 뒤집힘.
  let flipped = 0;
  let flipUnion = 0;
  let flipPackets = 0;
  for (const result of Object.values(judgments)) {
    if (result.original === undefined || result.reversed === undefined) continue;
    const c = flipCounts(result.original, result.reversed);
    flipped += c.flipped;
    flipUnion += c.union;
    flipPackets += 1;
  }

  const embeddingUsd = run.slots.reduce((sum, s) => sum + s.embeddingUsd, 0);
  const modelUsd = run.slots.reduce((sum, s) => sum + s.modelUsd, 0);
  const pipelineUsd = embeddingUsd + modelUsd;
  const articles = packets.reduce((sum, p) => sum + p.articles.length, 0);
  const durations = run.slots.map((s) => s.durationMs);
  const failuresByStage: Record<string, number> = {};
  for (const slot of run.slots) {
    for (const failure of slot.report.failures) {
      const stage = /^([a-z-]+) \[/.exec(failure.reason)?.[1] ?? "기타";
      failuresByStage[stage] = (failuresByStage[stage] ?? 0) + 1;
    }
  }

  return {
    runId: run.runId,
    packets: packets.length,
    articles,
    assignedArticles: assigned,
    goldStories: new Set(packetIds.map(find)).size,
    predictedStories: new Set(Object.values(run.assignments)).size,
    rows,
    status: {
      goldClasses: CONTRADICTION_STATUSES,
      predClasses,
      matrix: confusionMatrix(
        statusObs.map((o) => ({ gold: o.gold, pred: o.pred, weight: 1 })),
        CONTRADICTION_STATUSES,
        predClasses,
      ),
    },
    relation: perClassScores(relationPairs(UNIT_WEIGHTS), RELATION_LABELS),
    relationUnaligned,
    judge: {
      tasks: buildJudgeTasks(ctx).length,
      judged: Object.values(judgments).filter((j) => j.original !== undefined).length,
      flipPackets,
      flipped,
      flipUnion,
    },
    cost: {
      embeddingUsd,
      modelUsd,
      pipelineUsd,
      perStoryUsd: packets.length === 0 ? null : pipelineUsd / packets.length,
      perArticleUsd: articles === 0 ? null : pipelineUsd / articles,
    },
    time: {
      slots: durations.length,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
    },
    failuresByStage,
  };
}
