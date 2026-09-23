import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./index.ts";

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-23T03:00:00.000Z");

  it.each([
    [0, "방금"],
    [59_999, "방금"],
    [60_000, "1분 전"],
    [3_599_999, "59분 전"],
    [3_600_000, "1시간 전"],
    [86_399_999, "23시간 전"],
    [86_400_000, "9월 22일"],
  ])("발행 후 %i밀리초의 목록 카드 시각을 %s로 표시한다", (elapsed, expected) => {
    expect(formatRelativeTime(new Date(now.getTime() - elapsed), now)).toBe(expected);
  });

  it.each([
    ["2026-09-20T14:59:59.999Z", "2026-09-23T03:00:00Z", "9월 20일"],
    ["2026-09-20T15:00:00.000Z", "2026-09-23T03:00:00Z", "9월 21일"],
    ["2025-12-31T15:00:00.000Z", "2026-01-02T15:00:00Z", "1월 1일"],
    ["2026-12-30T15:00:00.000Z", "2026-12-31T15:00:00Z", "2026년 12월 31일"],
  ])("24시간 이후 %s를 KST 날짜·연도로 표시한다", (publishedAt, reference, expected) => {
    expect(formatRelativeTime(new Date(publishedAt), new Date(reference))).toBe(expected);
  });

  it.each([
    [new Date(Number.NaN), now],
    [now, new Date(Number.NaN)],
    [new Date(now.getTime() + 1), now],
  ])("유효하지 않거나 미래인 발행 시각을 거부한다", (publishedAt, reference) => {
    expect(() => formatRelativeTime(publishedAt, reference)).toThrow(RangeError);
  });
});
