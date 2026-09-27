import { describe, expect, it } from "vitest";
import {
  kstDayRange,
  latestSlotAtOrBefore,
  missedSlots,
  slotAtOf,
  slotKeyOf,
  slotsBetween,
} from "./slot.ts";

describe("배치 슬롯(KST 05:00·17:00)", () => {
  it("배치 키는 의도한 KST 슬롯이고 시각은 UTC다", () => {
    const at = new Date("2026-09-27T08:00:00.000Z");
    expect(slotKeyOf(at)).toBe("2026-09-27T17:00+09:00");
    expect(slotAtOf("2026-09-27T17:00+09:00")).toEqual(at);
    expect(slotAtOf("2026-09-27T05:00+09:00")).toEqual(new Date("2026-09-26T20:00:00.000Z"));
    expect(slotAtOf("2026-09-27T06:00+09:00")).toBeUndefined();
    expect(slotAtOf("nonsense")).toBeUndefined();
  });

  it("크론이 늦게 만든 잡도 직전 슬롯으로 간다", () => {
    expect(latestSlotAtOrBefore(new Date("2026-09-27T08:00:00.000Z"))).toEqual(
      new Date("2026-09-27T08:00:00.000Z"),
    );
    expect(latestSlotAtOrBefore(new Date("2026-09-27T09:30:00.000Z"))).toEqual(
      new Date("2026-09-27T08:00:00.000Z"),
    );
    // KST 04:00 → 어제 17:00
    expect(latestSlotAtOrBefore(new Date("2026-09-26T19:00:00.000Z"))).toEqual(
      new Date("2026-09-26T08:00:00.000Z"),
    );
  });

  it("KST 날짜 범위는 UTC 15:00에 시작한다", () => {
    expect(kstDayRange(new Date("2026-09-27T08:00:00.000Z"))).toEqual({
      from: new Date("2026-09-26T15:00:00.000Z"),
      to: new Date("2026-09-27T15:00:00.000Z"),
    });
    // KST 00:30은 이미 다음 날이다.
    expect(kstDayRange(new Date("2026-09-27T15:30:00.000Z")).from).toEqual(
      new Date("2026-09-27T15:00:00.000Z"),
    );
  });

  it("누락 슬롯은 되돌아보는 기간 안에서 원장에 완료로 없는 슬롯이다", () => {
    expect(
      slotsBetween(new Date("2026-09-26T09:00:00.000Z"), new Date("2026-09-27T09:00:00.000Z")),
    ).toEqual([new Date("2026-09-26T20:00:00.000Z"), new Date("2026-09-27T08:00:00.000Z")]);
    expect(
      missedSlots({
        now: new Date("2026-09-27T09:00:00.000Z"),
        lookbackMs: 24 * 60 * 60 * 1000,
        completedSlotKeys: new Set(["2026-09-27T05:00+09:00"]),
      }),
    ).toEqual(["2026-09-27T17:00+09:00"]);
  });
});
