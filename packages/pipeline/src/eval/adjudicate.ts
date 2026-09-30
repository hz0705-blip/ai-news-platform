import {
  CLAIM_TYPES,
  CONTRADICTION_STATUSES,
  type CodePointSpan,
  MODALITIES,
  RELATION_LABELS,
  sha256Hex,
  spanText,
  splitSentences,
} from "@newsplatform/domain";
import { SAME_STORY_LABELS } from "../../eval/prompts/golden-draft.ts";
import { GATE_SUPPORT_LABELS } from "../schemas.ts";
import type { CompareItem, ItemKind, ItemValue, ReviewItem } from "./compare.ts";
import type { Draft } from "./draft.ts";
import type { LocalPacket } from "./packet.ts";

/**
 * 운영자 판정(#147). 검토 항목을 하나씩 보여 주고 A·B·직접 입력·판정 불가 중 고르게 한다. 결정은 하나마다
 * 진행 파일(`EVAL_DATA_DIR/adjudication.json`)에 저장하므로 중단해도 다음 실행이 남은 항목부터 잇는다.
 * 모두 끝나면 저장소 `labels.json`을 만든다(라벨 출처 모델 합의 / 운영자 판정 / 운영자 감사).
 */

export const CHOICES = ["A", "B", "직접 입력", "판정 불가"] as const;
export type Choice = (typeof CHOICES)[number];

export interface Decision {
  readonly choice: Choice;
  /** 판정 불가, 또는 값이 없는 쪽(한 초안에만 있는 주장)을 골라 항목을 정답에서 뺄 때 null. */
  readonly value: ItemValue;
}

export interface Progress {
  readonly decisions: Readonly<Record<string, Decision>>;
}

export const LABEL_SOURCES = ["모델 합의", "운영자 판정", "운영자 감사"] as const;
export type LabelSource = (typeof LABEL_SOURCES)[number];

/** 범주 항목의 클래스 목록(직접 입력 번호). */
const CLASSES: Readonly<Record<Exclude<ItemKind, "claim">, readonly string[]>> = {
  pair: SAME_STORY_LABELS,
  support: GATE_SUPPORT_LABELS,
  relation: RELATION_LABELS,
  status: CONTRADICTION_STATUSES,
};

const numbered = (values: readonly string[]) =>
  values.map((value, index) => `${index + 1}) ${value}`).join("  ");

export function directInputHint(kind: ItemKind): string {
  if (kind === "claim") {
    return `유형 번호, 양상 번호, 인용 키(공백 구분, 연속 두 문장은 +)를 공백으로 입력. 예: 1 1 a1s3 a2s5+a2s6\n유형: ${numbered(CLAIM_TYPES)}\n양상: ${numbered(MODALITIES)}`;
  }
  return `번호 입력: ${numbered(CLASSES[kind])}`;
}

/** 직접 입력을 항목 값으로 읽는다. 읽을 수 없으면 null. */
export function parseDirectInput(
  kind: ItemKind,
  input: string,
  isQuoteKey: (key: string) => boolean,
): ItemValue {
  const tokens = input.trim().split(/\s+/);
  const pick = (values: readonly string[], token: string | undefined) => {
    const index = Number(token) - 1;
    return Number.isInteger(index) && index >= 0 && index < values.length
      ? values[index]
      : undefined;
  };
  if (kind !== "claim")
    return tokens.length === 1 ? (pick(CLASSES[kind], tokens[0]) ?? null) : null;
  const claimType = pick(CLAIM_TYPES, tokens[0]);
  const modality = pick(MODALITIES, tokens[1]);
  const quotes = tokens.slice(2);
  if (claimType === undefined || modality === undefined || quotes.length === 0) return null;
  if (!quotes.every(isQuoteKey)) return null;
  return { claimType, modality, quotes: [...new Set(quotes)].sort() };
}

export interface AdjudicationDeps {
  readonly ask: (question: string) => Promise<string>;
  readonly print: (text: string) => void;
  readonly save: (progress: Progress) => void;
  /** 항목 화면(기사 원문은 여기서만 보인다). */
  readonly render: (item: ReviewItem, position: number, total: number) => string;
  readonly isQuoteKey: (item: ReviewItem, key: string) => boolean;
}

/**
 * 결정이 없는 검토 항목을 차례로 묻는다. `q`면 저장된 진행을 두고 멈춘다(`finished: false`).
 * 결정할 때마다 `save`를 부른다.
 */
export async function runAdjudication(
  review: readonly ReviewItem[],
  progress: Progress,
  deps: AdjudicationDeps,
): Promise<{ readonly progress: Progress; readonly finished: boolean }> {
  const decisions: Record<string, Decision> = { ...progress.decisions };
  const pending = review.filter((item) => decisions[item.itemId] === undefined);
  const done = review.length - pending.length;
  for (const [index, item] of pending.entries()) {
    deps.print(deps.render(item, done + index + 1, review.length));
    let decision: Decision | undefined;
    while (decision === undefined) {
      const answer = (
        await deps.ask("선택 — 1) A  2) B  3) 직접 입력  4) 판정 불가  q) 중단: ")
      ).trim();
      if (answer === "q") return { progress: { decisions }, finished: false };
      if (answer === "1") decision = { choice: "A", value: item.a };
      else if (answer === "2") decision = { choice: "B", value: item.b };
      else if (answer === "4") decision = { choice: "판정 불가", value: null };
      else if (answer === "3") {
        deps.print(directInputHint(item.kind));
        const value = parseDirectInput(item.kind, await deps.ask("입력: "), (key) =>
          deps.isQuoteKey(item, key),
        );
        if (value === null) deps.print("읽을 수 없는 입력입니다. 다시 고르세요.");
        else decision = { choice: "직접 입력", value };
      } else deps.print("1·2·3·4·q 중 하나를 입력하세요.");
    }
    decisions[item.itemId] = decision;
    deps.save({ decisions });
  }
  return { progress: { decisions }, finished: true };
}

// ── 좌표 ─────────────────────────────────────────────────────────

export interface QuoteCoordinates {
  readonly articleKey: string;
  readonly bodyHash: string;
  readonly span: CodePointSpan;
}

/** 인용 키(`a1s3` 또는 `a1s3+a1s4`)를 기사 버전 본문 해시 + 코드 포인트 구간으로 바꾼다. 잘못되면 null. */
export function quoteCoordinates(packet: LocalPacket, key: string): QuoteCoordinates | null {
  const ids = key.split("+");
  const parsed = ids.map((id) => /^(a[1-9][0-9]*)s([1-9][0-9]*)$/.exec(id));
  const articleKey = parsed[0]?.[1];
  const article = packet.articles.find((a) => a.key === articleKey);
  if (article === undefined || ids.length > 2 || parsed.some((m) => m?.[1] !== articleKey)) {
    return null;
  }
  const positions = parsed.map((m) => Number(m?.[2]) - 1);
  if (positions.length === 2 && positions[1] !== (positions[0] ?? -2) + 1) return null;
  const spans = splitSentences(article.body);
  const start = spans[positions[0] ?? -1];
  const end = spans[positions[positions.length - 1] ?? -1];
  if (start === undefined || end === undefined) return null;
  return {
    articleKey: article.key,
    bodyHash: sha256Hex(article.body),
    span: { start: start.start, end: end.end },
  };
}

// ── labels.json ───────────────────────────────────────────────────

export type LabelValue =
  | string
  | {
      readonly claimType: string;
      readonly modality: string;
      readonly evidence: readonly (QuoteCoordinates & { readonly quoteKey: string })[];
    };

export interface Label {
  readonly itemId: string;
  readonly packetId: string;
  readonly kind: ItemKind;
  /** 정답에 없는 항목(판정 불가·빼기로 판정)이면 null. 주장은 문장 없이 유형·양상·근거 좌표만. */
  readonly value: LabelValue | null;
  /** 운영자가 판정 불가를 골랐다. */
  readonly unresolvable?: true;
  readonly labelSource: LabelSource;
  /** 뒷받침·상충 관계 항목의 인용 좌표(항목 키의 인용). */
  readonly quotes?: readonly (QuoteCoordinates & { readonly quoteKey: string })[];
}

function toLabelValue(packet: LocalPacket, value: ItemValue): LabelValue | null {
  if (value === null || typeof value === "string") return value;
  return {
    claimType: value.claimType,
    modality: value.modality,
    evidence: value.quotes.map((quoteKey) => {
      const coordinates = quoteCoordinates(packet, quoteKey);
      if (coordinates === null) throw new Error(`잘못된 인용 키: ${quoteKey}`);
      return { quoteKey, ...coordinates };
    }),
  };
}

function itemQuotes(item: CompareItem): string[] {
  const key = item.itemId.slice(item.packetId.length + 1);
  if (item.kind === "support") return [key.split(":")[2] ?? ""];
  if (item.kind === "relation") return (key.split(":")[2] ?? "").split("|");
  return [];
}

/**
 * 모든 항목의 정답. 검토하지 않은 일치 항목은 모델 합의, 검토한 불일치 항목은 운영자 판정, 검토한 일치 항목은
 * 운영자 감사. 결정이 없는 검토 항목이 있으면 던진다.
 */
export function buildLabels(
  items: readonly CompareItem[],
  review: readonly ReviewItem[],
  progress: Progress,
  packets: readonly LocalPacket[],
): Label[] {
  const reviewed = new Map(review.map((item) => [item.itemId, item]));
  return items.map((item) => {
    const packet = packets.find((p) => p.packetId === item.packetId);
    if (packet === undefined) throw new Error(`없는 패킷: ${item.packetId}`);
    const reviewItem = reviewed.get(item.itemId);
    let value: ItemValue;
    let unresolvable = false;
    let labelSource: LabelSource;
    if (reviewItem === undefined) {
      if (!item.agreed) throw new Error(`검토 대상이 아닌 불일치 항목: ${item.itemId}`);
      value = item.a;
      labelSource = "모델 합의";
    } else {
      const decision = progress.decisions[item.itemId];
      if (decision === undefined) throw new Error(`판정이 남은 항목: ${item.itemId}`);
      value = decision.value;
      unresolvable = decision.choice === "판정 불가";
      labelSource = reviewItem.reasons.includes("불일치") ? "운영자 판정" : "운영자 감사";
    }
    const quotes = itemQuotes(item).map((quoteKey) => {
      const coordinates = quoteCoordinates(packet, quoteKey);
      if (coordinates === null) throw new Error(`잘못된 인용 키: ${quoteKey}`);
      return { quoteKey, ...coordinates };
    });
    return {
      itemId: item.itemId,
      packetId: item.packetId,
      kind: item.kind,
      value: toLabelValue(packet, value),
      labelSource,
      ...(unresolvable ? { unresolvable: true as const } : {}),
      ...(quotes.length === 0 ? {} : { quotes }),
    };
  });
}

// ── 화면 ─────────────────────────────────────────────────────────

const KIND_NAMES: Readonly<Record<ItemKind, string>> = {
  pair: "기사 쌍 같은 사건 여부",
  claim: "주장(유형·양상·근거)",
  support: "근거 인용 뒷받침",
  relation: "인용 쌍 상충 관계",
  status: "사건 상태",
};

export function formatValue(value: ItemValue): string {
  if (value === null) return "(없음)";
  if (typeof value === "string") return value;
  return `${value.claimType} · ${value.modality} · [${value.quotes.join(", ")}]`;
}

function sentenceText(packet: LocalPacket, key: string): string {
  const coordinates = quoteCoordinates(packet, key);
  const article = packet.articles.find((a) => a.key === coordinates?.articleKey);
  if (coordinates === null || article === undefined) return "(없는 문장)";
  return spanText(article.body, coordinates.span).replace(/\s+/g, " ");
}

/** 항목 화면 문자열. 기사 원문·주장 문장은 `EVAL_DATA_DIR`에서 읽어 여기서만 보인다. */
export function renderItem(
  item: ReviewItem,
  position: number,
  total: number,
  packet: LocalPacket,
  drafts: { readonly A: Draft; readonly B: Draft },
): string {
  const lines = [
    "",
    `━━ [${position}/${total}] ${item.packetId} · ${KIND_NAMES[item.kind]} · 사유: ${item.reasons.join(", ")}`,
    `   항목 ${item.itemId}`,
  ];
  if (item.kind === "pair") {
    const [x, y] = (item.itemId.split("pair:")[1] ?? "").split("-");
    for (const key of [x, y]) {
      const article = packet.articles.find((a) => a.key === key);
      if (article === undefined) continue;
      lines.push(
        `── ${article.key} ${article.sourceId} ${article.publishedAt}`,
        `   제목: ${article.title}`,
      );
      splitSentences(article.body)
        .slice(0, 3)
        .forEach((span, index) => {
          lines.push(
            `   [${article.key}s${index + 1}] ${spanText(article.body, span).replace(/\s+/g, " ")}`,
          );
        });
    }
  } else if (item.kind === "status") {
    for (const side of ["A", "B"] as const) {
      lines.push(`── 초안 ${side}의 주장`);
      for (const claim of drafts[side].claims) {
        lines.push(
          `   · ${claim.text} (${claim.quotes.map((q) => `${q.key}:${q.support}`).join(", ")})`,
        );
      }
    }
  } else {
    const claimA = item.claimIndex?.a == null ? undefined : drafts.A.claims[item.claimIndex.a];
    const claimB = item.claimIndex?.b == null ? undefined : drafts.B.claims[item.claimIndex.b];
    lines.push(`   주장 A: ${claimA?.text ?? "(없음)"}`, `   주장 B: ${claimB?.text ?? "(없음)"}`);
    const keys = new Set(
      item.kind === "claim"
        ? [...(claimA?.quotes ?? []), ...(claimB?.quotes ?? [])].map((q) => q.key)
        : itemQuotes(item),
    );
    lines.push("── 근거 문장");
    for (const key of [...keys].sort()) lines.push(`   [${key}] ${sentenceText(packet, key)}`);
  }
  lines.push(`   A: ${formatValue(item.a)}`, `   B: ${formatValue(item.b)}`);
  if (item.a === null || item.b === null) lines.push("   (없음)을 고르면 이 항목을 정답에서 뺀다.");
  return lines.join("\n");
}

/** 판정 화면의 직접 입력 검사: 그 패킷에 있는 인용 키인가. */
export function isPacketQuoteKey(packet: LocalPacket, key: string): boolean {
  return quoteCoordinates(packet, key) !== null;
}
