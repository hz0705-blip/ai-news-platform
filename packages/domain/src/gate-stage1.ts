import type { RightsTier } from "./rights.ts";
import { splitSentences } from "./sentence.ts";
import { type CodePointSpan, spanLength, spanText } from "./span.ts";
import { NORMALIZATION_VERSION } from "./text.ts";

/** 정합성 게이트 1단계가 근거 구간을 거부하는 사유 4종. */
export const GATE_FAILURES = [
  "구간 없음",
  "허용 발췌 창 초과",
  "링크만 등급",
  "정규화 버전 불일치",
] as const;

export type GateFailure = (typeof GATE_FAILURES)[number];

/** 허용 발췌 창이 담을 수 있는 최대 문장 수. */
const MAX_WINDOW_SENTENCES = 2;

export type GateStage1Result =
  | {
      readonly ok: true;
      readonly excerpt: string;
      readonly excerptSpan: CodePointSpan;
      readonly highlightInExcerpt: CodePointSpan;
    }
  | { readonly ok: false; readonly reason: GateFailure };

/**
 * 정합성 게이트 1단계: 근거 구간이 기사 버전 본문 안에 실재하고 허용 발췌 창에
 * 들어가는지 결정론적으로 확인한다. 검사 순서는 ① 정규화 버전 ② 권리 등급
 * ③ 구간 범위 ④ 발췌 창이다. 통과하면 구간을 완전히 포함하는 가장 짧은 연속
 * 문장 창의 원문(`excerpt`), 그 창의 본문 기준 구간(`excerptSpan`), 창 안의
 * 강조 지역 구간(`highlightInExcerpt`)을 돌려준다(#21 Ruling 11).
 */
export function checkEvidenceSpan(input: {
  body: string;
  span: CodePointSpan;
  rightsTier: RightsTier;
  normalizationVersion: number;
}): GateStage1Result {
  const { body, span } = input;

  if (input.normalizationVersion !== NORMALIZATION_VERSION) {
    return { ok: false, reason: "정규화 버전 불일치" };
  }

  if (input.rightsTier === "링크만") {
    return { ok: false, reason: "링크만 등급" };
  }

  // spanText는 범위를 벗어나면 던지므로 여기서 먼저 걸러 실패 사유로 돌려준다.
  if (span.start < 0 || span.start >= span.end || span.end > spanLength(body)) {
    return { ok: false, reason: "구간 없음" };
  }

  const window = findShortestWindow(splitSentences(body), span);
  if (window === undefined) {
    return { ok: false, reason: "구간 없음" };
  }
  if (window.sentenceCount > MAX_WINDOW_SENTENCES) {
    return { ok: false, reason: "허용 발췌 창 초과" };
  }

  const excerptSpan = window.span;
  return {
    ok: true,
    excerpt: spanText(body, excerptSpan),
    excerptSpan,
    highlightInExcerpt: {
      start: span.start - excerptSpan.start,
      end: span.end - excerptSpan.start,
    },
  };
}

/**
 * `span`을 완전히 포함하는 가장 짧은 연속 문장 창을 찾는다. 창의 첫 문장은 구간
 * 시작 이하에서 시작하는 마지막 문장, 끝 문장은 구간 끝 이상에서 끝나는 첫 문장이다.
 * 그런 문장이 없으면(구간이 문장 밖 공백에만 걸친 경우) `undefined`.
 */
function findShortestWindow(
  sentences: readonly CodePointSpan[],
  span: CodePointSpan,
): { span: CodePointSpan; sentenceCount: number } | undefined {
  let firstIndex = -1;
  for (const [index, sentence] of sentences.entries()) {
    if (sentence.start <= span.start) firstIndex = index;
  }
  const lastIndex = sentences.findIndex((sentence) => sentence.end >= span.end);

  const first = sentences[firstIndex];
  const last = sentences[lastIndex];
  if (first === undefined || last === undefined || lastIndex < firstIndex) return undefined;

  return {
    span: { start: first.start, end: last.end },
    sentenceCount: lastIndex - firstIndex + 1,
  };
}
