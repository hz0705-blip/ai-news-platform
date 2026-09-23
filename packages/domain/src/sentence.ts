import type { CodePointSpan } from "./span.ts";

/**
 * 문장 경계 판정에서 예외로 취급하는 약어 목록(#21 Ruling 1). 대소문자를 구분한다.
 * 각 항목은 마침표를 포함한 표기 그대로 둔다("Dr." 처럼).
 */
const ABBREVIATIONS: readonly string[] = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "St.",
  "Jr.",
  "Sr.",
  "vs.",
  "etc.",
  "U.S.",
  "U.K.",
  "U.N.",
  "a.m.",
  "p.m.",
];

const SENTENCE_END_MARKS = new Set([".", "?", "!"]);
/** 문장 경계 판정 전에 문장에 포함하는 닫는 따옴표·괄호(#21 Ruling 1). */
const CLOSING_MARKS = new Set(['"', "'", "”", "’", ")", "]", "}"]);

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function isDigit(char: string): boolean {
  return /[0-9]/.test(char);
}

function isLetter(char: string): boolean {
  return /[A-Za-z]/.test(char);
}

/** 호출부가 이미 범위를 확인한 인덱스에서만 쓴다(`noUncheckedIndexedAccess` 우회). */
function at(codePoints: readonly string[], index: number): string {
  const value = codePoints[index];
  if (value === undefined) {
    throw new RangeError(`코드 포인트 인덱스가 범위를 벗어났다: ${index}`);
  }
  return value;
}

/** 코드 포인트 인덱스 `dotIndex`의 마침표가 약어 목록의 끝 마침표인지 본다. */
function endsWithAbbreviation(codePoints: readonly string[], dotIndex: number): boolean {
  for (const abbreviation of ABBREVIATIONS) {
    const length = abbreviation.length;
    const windowStart = dotIndex - length + 1;
    if (windowStart < 0) continue;

    const window = codePoints.slice(windowStart, dotIndex + 1).join("");
    if (window !== abbreviation) continue;

    const beforeChar = windowStart > 0 ? codePoints[windowStart - 1] : undefined;
    if (beforeChar === undefined || !isLetter(beforeChar)) return true;
  }
  return false;
}

/** `숫자.숫자`(소수점)는 경계가 아니다(#21 Ruling 1). */
function isDecimalPoint(codePoints: readonly string[], dotIndex: number): boolean {
  const before = codePoints[dotIndex - 1];
  const after = codePoints[dotIndex + 1];
  return before !== undefined && after !== undefined && isDigit(before) && isDigit(after);
}

function trimSpan(codePoints: readonly string[], start: number, end: number): CodePointSpan {
  let trimmedStart = start;
  while (trimmedStart < end && isWhitespace(at(codePoints, trimmedStart))) trimmedStart++;

  let trimmedEnd = end;
  while (trimmedEnd > trimmedStart && isWhitespace(at(codePoints, trimmedEnd - 1))) trimmedEnd--;

  return { start: trimmedStart, end: trimmedEnd };
}

/**
 * 결정론적 규칙 기반 문장 분할(#21 Ruling 1). 영어 본문만 대상이며 모델·확률·
 * 외부 라이브러리를 쓰지 않는다. `.`·`?`·`!` 뒤에 공백 또는 문자열 끝이 오면
 * 경계로 보되, 약어 예외 목록과 `숫자.숫자`(소수점)는 경계가 아니다. 닫는
 * 따옴표·괄호는 경계 판정 전에 문장에 포함한다. 반환 구간은 앞뒤 공백을 제외한다.
 */
export function splitSentences(body: string): readonly CodePointSpan[] {
  const codePoints = [...body];
  const length = codePoints.length;
  const spans: CodePointSpan[] = [];

  let sentenceStart = 0;
  let i = 0;

  while (i < length) {
    const char = at(codePoints, i);

    if (!SENTENCE_END_MARKS.has(char)) {
      i++;
      continue;
    }

    if (char === "." && (endsWithAbbreviation(codePoints, i) || isDecimalPoint(codePoints, i))) {
      i++;
      continue;
    }

    let boundary = i + 1;
    while (boundary < length && CLOSING_MARKS.has(at(codePoints, boundary))) {
      boundary++;
    }

    const isEndOfBody = boundary >= length;
    const isFollowedByWhitespace = !isEndOfBody && isWhitespace(at(codePoints, boundary));

    if (!isEndOfBody && !isFollowedByWhitespace) {
      i++;
      continue;
    }

    spans.push(trimSpan(codePoints, sentenceStart, boundary));
    sentenceStart = boundary;
    i = boundary;
  }

  if (sentenceStart < length) {
    const trailing = trimSpan(codePoints, sentenceStart, length);
    if (trailing.end > trailing.start) spans.push(trailing);
  }

  return spans;
}
