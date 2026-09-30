import {
  type ClaimType,
  type CodePointSpan,
  type ContradictionStatus,
  type Modality,
  type RelationLabel,
  spanText,
  splitSentences,
} from "@newsplatform/domain";
import {
  type DraftWire,
  GOLDEN_DRAFT_PROMPT,
  MAX_RENDERED_SENTENCES,
  renderPacket,
  type SAME_STORY_LABELS,
} from "../../eval/prompts/golden-draft.ts";
import { requestReservationUsd } from "../openai/client.ts";
import type { PricedModel } from "../openai/pricing.ts";
import { buildRequest } from "../prompts/prompt.ts";
import type { GateSupportLabel } from "../schemas.ts";
import {
  type ModelClient,
  type ModelRequest,
  ModelResponseError,
  ModelTransportError,
  type ModelUsage,
} from "../types.ts";
import type { LocalPacket } from "./packet.ts";

/** 초안 두 모델: 상위(A)·하위(B). 날짜 스냅샷 ID다. */
export const DRAFT_MODELS = {
  A: "gpt-5-2025-08-07",
  B: "gpt-5-mini-2025-08-07",
} as const satisfies Record<string, PricedModel>;
export type DraftSide = keyof typeof DRAFT_MODELS;

/** 이 티켓(#147) 실제 호출 합계 상한(USD). */
export const DRAFT_SPEND_CAP_USD = 3;

export type SameStoryLabel = (typeof SAME_STORY_LABELS)[number];

export interface DraftQuote {
  /** 문장 식별자를 `+`로 이은 것(`a1s3+a1s4`). 두 모델의 같은 인용을 잇는 키다. */
  readonly key: string;
  readonly articleKey: string;
  readonly sentenceIds: readonly string[];
  /** 기사 버전 본문의 코드 포인트 반개구간. */
  readonly span: CodePointSpan;
  readonly support: GateSupportLabel;
}

export interface DraftClaim {
  readonly text: string;
  readonly claimType: ClaimType;
  readonly modality: Modality;
  readonly quotes: readonly DraftQuote[];
  /** 인용 키 쌍(`a` < `b`). */
  readonly relations: readonly {
    readonly a: string;
    readonly b: string;
    readonly label: RelationLabel;
  }[];
}

export interface Draft {
  /** 기사 키 쌍(`a` < `b`). */
  readonly pairs: readonly {
    readonly a: string;
    readonly b: string;
    readonly label: SameStoryLabel;
  }[];
  readonly claims: readonly DraftClaim[];
  readonly storyStatus: ContradictionStatus;
  /** 버린 응답 조각(없는 식별자·연속하지 않는 문장 등)의 사유. */
  readonly dropped: readonly string[];
}

/** `EVAL_DATA_DIR/drafts/<packetId>.<A|B>.json`. */
export interface DraftFile {
  readonly packetId: string;
  readonly side: DraftSide;
  readonly model: string;
  readonly promptVersion: string;
  readonly spendUsd: number;
  readonly tokens: number;
  readonly draft: Draft;
}

const SENTENCE_ID = /^(a[1-9][0-9]*)s([1-9][0-9]*)$/;

function orderedPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** 패킷 기사별 문장 구간(모델에 보인 앞 `MAX_RENDERED_SENTENCES`개). */
function sentenceTable(packet: LocalPacket): Map<string, { body: string; spans: CodePointSpan[] }> {
  return new Map(
    packet.articles.map((a) => [
      a.key,
      { body: a.body, spans: splitSentences(a.body).slice(0, MAX_RENDERED_SENTENCES) },
    ]),
  );
}

export function renderDraftInput(packet: LocalPacket): string {
  const table = sentenceTable(packet);
  return renderPacket(
    packet.articles.map((a) => {
      const entry = table.get(a.key);
      return {
        key: a.key,
        sourceId: a.sourceId,
        publishedAt: a.publishedAt,
        title: a.title,
        sentences: (entry?.spans ?? []).map((span) => spanText(a.body, span)),
      };
    }),
  );
}

/**
 * 모델 출력(문장 식별자)을 초안(구간 좌표)으로 바꾼다. 스키마를 지킨 응답의 잘못된 조각은 던지지 않고
 * 버리며 사유를 `dropped`에 남긴다 — 유료 응답 하나를 통째로 잃지 않기 위해서다.
 */
export function resolveDraft(packet: LocalPacket): (wire: DraftWire) => Draft {
  const table = sentenceTable(packet);
  const keys = packet.articles.map((a) => a.key);
  return (wire) => {
    const dropped: string[] = [];
    const pairs = new Map<string, { a: string; b: string; label: SameStoryLabel }>();
    for (const pair of wire.pairs) {
      if (!keys.includes(pair.a) || !keys.includes(pair.b) || pair.a === pair.b) {
        dropped.push(`없는 기사 쌍: ${pair.a}-${pair.b}`);
        continue;
      }
      const [a, b] = orderedPair(pair.a, pair.b);
      if (!pairs.has(`${a}|${b}`)) pairs.set(`${a}|${b}`, { a, b, label: pair.label });
    }

    const claims = wire.claims.map((claim, claimIndex): DraftClaim => {
      const quotes: DraftQuote[] = [];
      for (const quote of claim.quotes) {
        const parsed = quote.sentenceIds.map((id) => SENTENCE_ID.exec(id));
        const first = parsed[0];
        const last = parsed[parsed.length - 1];
        const article = first?.[1];
        const entry = article === undefined ? undefined : table.get(article);
        const positions = parsed.map((m) => (m === null ? -1 : Number(m[2]) - 1));
        const valid =
          first !== undefined &&
          first !== null &&
          last !== undefined &&
          last !== null &&
          entry !== undefined &&
          parsed.length <= 2 &&
          parsed.every((m) => m !== null && m[1] === article) &&
          positions.every((p) => p >= 0 && p < entry.spans.length) &&
          (positions.length === 1 || positions[1] === (positions[0] ?? -2) + 1);
        const key = quote.sentenceIds.join("+");
        if (!valid || article === undefined || entry === undefined) {
          dropped.push(`주장 ${claimIndex + 1}의 잘못된 인용: ${key}`);
          continue;
        }
        if (quotes.some((q) => q.key === key)) continue;
        const start = entry.spans[positions[0] ?? 0];
        const end = entry.spans[positions[positions.length - 1] ?? 0];
        if (start === undefined || end === undefined) continue;
        quotes.push({
          key,
          articleKey: article,
          sentenceIds: [...quote.sentenceIds],
          span: { start: start.start, end: end.end },
          support: quote.support,
        });
      }
      const byFirst = new Map(quotes.map((q) => [q.sentenceIds[0], q.key]));
      const relations = new Map<string, { a: string; b: string; label: RelationLabel }>();
      for (const relation of claim.relations) {
        const x = byFirst.get(relation.a);
        const y = byFirst.get(relation.b);
        if (x === undefined || y === undefined || x === y) {
          dropped.push(`주장 ${claimIndex + 1}의 잘못된 관계: ${relation.a}-${relation.b}`);
          continue;
        }
        const [a, b] = orderedPair(x, y);
        if (!relations.has(`${a}|${b}`))
          relations.set(`${a}|${b}`, { a, b, label: relation.label });
      }
      return {
        text: claim.text,
        claimType: claim.claimType,
        modality: claim.modality,
        quotes,
        relations: [...relations.values()],
      };
    });

    return {
      pairs: [...pairs.values()],
      claims: claims.filter((c) => c.quotes.length > 0),
      storyStatus: wire.storyStatus,
      dropped,
    };
  };
}

/**
 * 비용 상한 원장. 이전 실행의 지출(`spentUsd`) + 진행 중 호출의 예약 + 새 예약이 상한을 넘으면 예약하지 않는다
 * (스펙 "개발 중 결정 항목" 토큰 계량과 같은 방식).
 */
export class SpendLedger {
  readonly capUsd: number;
  private spent: number;
  private reserved = 0;

  constructor(capUsd: number, spentUsd: number) {
    this.capUsd = capUsd;
    this.spent = spentUsd;
  }

  get spentUsd(): number {
    return this.spent;
  }

  tryReserve(amount: number): boolean {
    if (this.spent + this.reserved + amount > this.capUsd) return false;
    this.reserved += amount;
    return true;
  }

  settle(reservation: number, actual: number): void {
    this.reserved -= reservation;
    this.spent += actual;
  }
}

export interface DraftJob {
  readonly packet: LocalPacket;
  readonly side: DraftSide;
}

/** 호출 한 번의 지출 기록(`EVAL_DATA_DIR/spend.json`에 쌓인다). */
export interface SpendEntry {
  /** 패킷 식별자, 기사 쌍 라벨링이면 `pairs`. */
  readonly packetId: string;
  readonly side: DraftSide;
  readonly model: string;
  readonly reservedUsd: number;
  readonly spentUsd: number;
  readonly outcome: "완료" | "실패";
  readonly detail?: string;
}

export interface RunDraftsDeps {
  readonly clientFor: (side: DraftSide) => ModelClient;
  readonly ledger: SpendLedger;
  readonly saveDraft: (file: DraftFile) => void;
  readonly recordSpend: (entry: SpendEntry) => void;
  readonly concurrency?: number;
}

export interface RunDraftsResult {
  readonly completed: readonly DraftJob[];
  readonly failed: readonly (DraftJob & { readonly detail: string })[];
  /** 예약이 상한을 넘어 호출하지 않은 작업(그 뒤 작업 포함). */
  readonly notCalled: readonly DraftJob[];
}

export type CallOutcome =
  | { readonly kind: "completed"; readonly output: unknown; readonly usage: ModelUsage }
  | { readonly kind: "failed"; readonly detail: string }
  | { readonly kind: "notCalled" };

/**
 * 호출 하나를 상한 안에서 한다. 호출 전에 예약하고, 예약이 상한을 넘으면 호출하지 않는다(`notCalled`).
 * 실패한 호출은 응답 사용량(없으면 과금 가능한 전송 오류의 예약액)을 지출로 센다. 지출은 `recordSpend`로 남긴다.
 */
export async function callWithinCap(
  jobId: string,
  side: DraftSide,
  request: ModelRequest,
  deps: Pick<RunDraftsDeps, "clientFor" | "ledger" | "recordSpend">,
): Promise<CallOutcome> {
  const model = DRAFT_MODELS[side];
  const reservation = requestReservationUsd(request, model);
  if (!deps.ledger.tryReserve(reservation)) return { kind: "notCalled" };
  const base = { packetId: jobId, side, model, reservedUsd: reservation };
  try {
    const response = await deps.clientFor(side).complete(request);
    deps.ledger.settle(reservation, response.usage.spend);
    deps.recordSpend({ ...base, spentUsd: response.usage.spend, outcome: "완료" });
    return { kind: "completed", output: response.output, usage: response.usage };
  } catch (error) {
    const spent =
      error instanceof ModelResponseError
        ? error.usage.spend
        : error instanceof ModelTransportError && error.billable
          ? reservation
          : 0;
    const detail = error instanceof Error ? error.message : String(error);
    deps.ledger.settle(reservation, spent);
    deps.recordSpend({ ...base, spentUsd: spent, outcome: "실패", detail });
    return { kind: "failed", detail };
  }
}

/**
 * 초안 작업을 돈다. 각 호출 전에 예약하고, 예약이 상한을 넘으면 그 작업과 남은 작업을 호출하지 않고 멈춘다
 * (진행 중 호출은 끝낸다).
 */
export async function runDrafts(
  jobs: readonly DraftJob[],
  deps: RunDraftsDeps,
): Promise<RunDraftsResult> {
  const completed: DraftJob[] = [];
  const failed: (DraftJob & { detail: string })[] = [];
  const notCalled: DraftJob[] = [];
  const queue = [...jobs];
  let stopped = false;

  const runOne = async (job: DraftJob): Promise<void> => {
    const request = buildRequest(
      GOLDEN_DRAFT_PROMPT,
      "golden-draft",
      `${job.packet.packetId}:${job.side}`,
      renderDraftInput(job.packet),
      resolveDraft(job.packet),
    );
    if (stopped) {
      notCalled.push(job);
      return;
    }
    const outcome = await callWithinCap(job.packet.packetId, job.side, request, deps);
    if (outcome.kind === "notCalled") {
      stopped = true;
      notCalled.push(job);
    } else if (outcome.kind === "failed") {
      failed.push({ ...job, detail: outcome.detail });
    } else {
      deps.saveDraft({
        packetId: job.packet.packetId,
        side: job.side,
        model: DRAFT_MODELS[job.side],
        promptVersion: GOLDEN_DRAFT_PROMPT.version,
        spendUsd: outcome.usage.spend,
        tokens: outcome.usage.tokens,
        draft: outcome.output as Draft,
      });
      completed.push(job);
    }
  };

  const worker = async () => {
    for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
      if (stopped) {
        notCalled.push(job);
        continue;
      }
      await runOne(job);
    }
  };
  await Promise.all(Array.from({ length: deps.concurrency ?? 1 }, worker));
  return { completed, failed, notCalled };
}
