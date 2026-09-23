/**
 * 근거 구간(Evidence span)의 오프셋 단위는 유니코드 코드 포인트이며, 반개구간
 * `[start, end)`로 표현한다. UTF-16 인덱스가 아니다(#21 Global Constraints:
 * "근거 오프셋은 정규화된 기사 버전 본문 기준 유니코드 코드 포인트 반개구간").
 * 화면 렌더링(문자열 `slice`)이 UTF-16 인덱스를 요구하는 자리에서만
 * `toUtf16Range`로 변환한다.
 */
export interface CodePointSpan {
  readonly start: number;
  readonly end: number;
}

/** `[...body]`로 본문을 코드 포인트 배열로 만든다. 보조 평면 문자를 쪼개지 않는다. */
function toCodePoints(body: string): string[] {
  return [...body];
}

function assertWithinBounds(span: CodePointSpan, length: number): void {
  if (span.start < 0 || span.end < span.start || span.end > length) {
    throw new RangeError(
      `구간이 본문 범위를 벗어났다: start=${span.start}, end=${span.end}, length=${length}`,
    );
  }
}

/** 본문의 코드 포인트 길이. */
export function spanLength(body: string): number {
  return toCodePoints(body).length;
}

/** 구간의 원문을 코드 포인트 반개구간으로 자른다. 범위를 벗어나면 `RangeError`. */
export function spanText(body: string, span: CodePointSpan): string {
  const codePoints = toCodePoints(body);
  assertWithinBounds(span, codePoints.length);
  return codePoints.slice(span.start, span.end).join("");
}

/**
 * 코드 포인트 구간을 UTF-16 인덱스 구간으로 옮긴다(화면 렌더링 전용 변환,
 * #21 Global Constraints). 앞부분 코드 포인트들의 UTF-16 길이를 누적해 계산한다.
 */
export function toUtf16Range(body: string, span: CodePointSpan): { start: number; end: number } {
  const codePoints = toCodePoints(body);
  assertWithinBounds(span, codePoints.length);

  let start = 0;
  for (const codePoint of codePoints.slice(0, span.start)) {
    start += codePoint.length;
  }

  let end = start;
  for (const codePoint of codePoints.slice(span.start, span.end)) {
    end += codePoint.length;
  }

  return { start, end };
}

/** UTF-16 인덱스를 코드 포인트 인덱스로 되돌린다. */
function utf16IndexToCodePointIndex(codePoints: readonly string[], utf16Index: number): number {
  let utf16Cursor = 0;
  let index = 0;
  for (const codePoint of codePoints) {
    if (utf16Cursor >= utf16Index) return index;
    utf16Cursor += codePoint.length;
    index++;
  }
  return codePoints.length;
}

/** 본문에서 `quote`의 첫 일치를 찾아 코드 포인트 구간으로 돌려준다. 없으면 `undefined`. */
export function findSpan(body: string, quote: string): CodePointSpan | undefined {
  const utf16Start = body.indexOf(quote);
  if (utf16Start === -1) return undefined;
  const utf16End = utf16Start + quote.length;

  const codePoints = toCodePoints(body);
  const start = utf16IndexToCodePointIndex(codePoints, utf16Start);
  const end = utf16IndexToCodePointIndex(codePoints, utf16End);

  return { start, end };
}
