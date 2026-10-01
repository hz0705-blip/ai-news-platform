import { describe, expect, it } from "vitest";
import { dueSlotKeyOf } from "./batch-status.ts";

const SLOT_05 = "2026-09-28T05:00+09:00";
const at = (iso: string) => new Date(iso);

describe("기한 슬롯(약속 시각 06:00·18:00)", () => {
  it("06:00 전에는 전날 17:00, 06:00부터는 오늘 05:00, 18:00부터는 17:00이다", () => {
    expect(dueSlotKeyOf(at("2026-09-27T20:59:59.000Z"))).toBe("2026-09-27T17:00+09:00");
    expect(dueSlotKeyOf(at("2026-09-27T21:00:00.000Z"))).toBe(SLOT_05);
    expect(dueSlotKeyOf(at("2026-09-28T08:59:00.000Z"))).toBe(SLOT_05);
    expect(dueSlotKeyOf(at("2026-09-28T09:00:00.000Z"))).toBe("2026-09-28T17:00+09:00");
  });
});
