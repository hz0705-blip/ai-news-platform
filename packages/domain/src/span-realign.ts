import type { CodePointSpan } from "./span.ts";

/**
 * 근거 구간 좌표 정렬(docs/spec/v1.md "주장 매칭": 기사 버전이 바뀌면 결정론적 텍스트 차이로 좌표를 정렬, #86).
 *
 * 차이 알고리즘(#86 Ruling): 두 정규화 본문의 코드 포인트 배열에서 공통 접두·접미를 떼고, 가운데를 Myers O(ND)
 * 최단 편집 스크립트로 비교한다. 결과는 "그대로 남은 구간(같은 문자열의 연속)" 목록이다. 근거 구간 하나는 그 구간
 * 전체가 남은 구간 하나 안에 있을 때만 새 좌표로 옮긴다(길이·원문이 같다). 구간 안이 조금이라도 바뀌었거나 지워졌으면
 * 앵커가 남지 않은 것으로 보고 정렬 실패다 — 흩어진 공통 글자로 가짜 앵커를 만들지 않기 위해서다.
 * 편집 거리가 `SPAN_REALIGN_MAX_EDITS`를 넘으면 가운데 비교를 포기하고 접두·접미만 남은 구간으로 쓴다.
 */
export const SPAN_REALIGN_MAX_EDITS = 2000;

/** 정렬 실패 사유: 구간이 바뀌었거나 지워졌다 / 이전 버전 본문이 없다(보존 기한 삭제 등). */
export type SpanRealignFailure = "근거 구간 변경" | "이전 본문 없음";

export type SpanRealignResult =
  | { readonly ok: true; readonly span: CodePointSpan }
  | { readonly ok: false; readonly reason: SpanRealignFailure };

/** 이전 본문 `[previousStart, previousStart + length)`이 새 본문 `[nextStart, …)`로 그대로 남았다. */
interface KeptRun {
  readonly previousStart: number;
  readonly nextStart: number;
  readonly length: number;
}

/**
 * 이전·새 본문 한 쌍의 정렬기. 차이는 만들 때 한 번만 계산하고, 돌려준 함수가 구간마다 옮긴다.
 * 오프셋은 정규화 본문 기준 코드 포인트 반개구간이다(보조 평면 문자를 쪼개지 않는다).
 */
export function createSpanAligner(
  previousBody: string,
  nextBody: string,
  maxEdits: number = SPAN_REALIGN_MAX_EDITS,
): (span: CodePointSpan) => SpanRealignResult {
  const runs = keptRuns([...previousBody], [...nextBody], maxEdits);
  return (span) => {
    const run = runs.find(
      (r) => r.previousStart <= span.start && span.end <= r.previousStart + r.length,
    );
    if (run === undefined) return { ok: false, reason: "근거 구간 변경" };
    const shift = run.nextStart - run.previousStart;
    return { ok: true, span: { start: span.start + shift, end: span.end + shift } };
  };
}

function keptRuns(a: readonly string[], b: readonly string[], maxEdits: number): KeptRun[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  const middle = myersRuns(
    a.slice(prefix, a.length - suffix),
    b.slice(prefix, b.length - suffix),
    maxEdits,
  );
  const runs: KeptRun[] = [];
  if (prefix > 0) runs.push({ previousStart: 0, nextStart: 0, length: prefix });
  for (const run of middle ?? []) {
    runs.push({
      previousStart: run.previousStart + prefix,
      nextStart: run.nextStart + prefix,
      length: run.length,
    });
  }
  if (suffix > 0) {
    runs.push({ previousStart: a.length - suffix, nextStart: b.length - suffix, length: suffix });
  }
  return runs;
}

/**
 * Myers 최단 편집 스크립트의 대각선(같은 글자 연속)들. 편집 거리가 `maxEdits`를 넘으면 `undefined`.
 * 라운드 d마다 k ∈ [-d, d]의 끝점을 저장해 두고 끝에서부터 되짚는다.
 */
function myersRuns(
  a: readonly string[],
  b: readonly string[],
  maxEdits: number,
): KeptRun[] | undefined {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];
  const limit = Math.min(maxEdits, n + m);
  const offset = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  let edits = -1;
  for (let d = 0; d <= limit && edits < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && (v[offset + k - 1] as number) < (v[offset + k + 1] as number))
          ? (v[offset + k + 1] as number)
          : (v[offset + k - 1] as number) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        edits = d;
        break;
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  if (edits < 0) return undefined;

  const runs: KeptRun[] = [];
  let x = n;
  let y = m;
  for (let d = edits; d > 0; d--) {
    const previous = trace[d - 1] as Int32Array;
    const at = (k: number) => previous[k + d - 1] as number;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const previousK = down ? k + 1 : k - 1;
    const previousX = at(previousK);
    const snakeX = down ? previousX : previousX + 1;
    if (x > snakeX) runs.push({ previousStart: snakeX, nextStart: snakeX - k, length: x - snakeX });
    x = previousX;
    y = previousX - previousK;
  }
  if (x > 0) runs.push({ previousStart: 0, nextStart: 0, length: x });
  return runs.reverse();
}
