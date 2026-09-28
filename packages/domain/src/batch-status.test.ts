import { describe, expect, it } from "vitest";
import { type DueBatchRun, deriveBatchNotice, dueSlotKeyOf } from "./batch-status.ts";

const SLOT_05 = "2026-09-28T05:00+09:00";
const at = (iso: string) => new Date(iso);
const run = (overrides: Partial<DueBatchRun> = {}): DueBatchRun => ({
  slotKey: SLOT_05,
  status: "completed",
  leaseExpiresAt: null,
  budgetReached: false,
  deferred: 0,
  ...overrides,
});
// KST 06:30 = UTC 21:30 전날.
const now = at("2026-09-27T21:30:00.000Z");

describe("기한 슬롯(약속 시각 06:00·18:00)", () => {
  it("06:00 전에는 전날 17:00, 06:00부터는 오늘 05:00, 18:00부터는 17:00이다", () => {
    expect(dueSlotKeyOf(at("2026-09-27T20:59:59.000Z"))).toBe("2026-09-27T17:00+09:00");
    expect(dueSlotKeyOf(at("2026-09-27T21:00:00.000Z"))).toBe(SLOT_05);
    expect(dueSlotKeyOf(at("2026-09-28T08:59:00.000Z"))).toBe(SLOT_05);
    expect(dueSlotKeyOf(at("2026-09-28T09:00:00.000Z"))).toBe("2026-09-28T17:00+09:00");
  });
});

describe("latest batch status: running / cap-reached / failed / delayed", () => {
  const input = { dueSlotKey: SLOT_05, now };

  it("원장이 비었거나 정상 완료면 표시하지 않는다", () => {
    expect(deriveBatchNotice(undefined, input)).toEqual({ kind: "none" });
    expect(deriveBatchNotice(run(), input)).toEqual({ kind: "none" });
  });

  it("리스가 유효한 실행 중이면 진행 중, 리스가 끝났으면 지연", () => {
    const lease = at("2026-09-27T21:31:00.000Z");
    expect(deriveBatchNotice(run({ status: "running", leaseExpiresAt: lease }), input)).toEqual({
      kind: "running",
    });
    expect(
      deriveBatchNotice(
        run({ status: "running", leaseExpiresAt: at("2026-09-27T21:29:00.000Z") }),
        input,
      ),
    ).toEqual({ kind: "delayed" });
  });

  it("상한에 닿아 미룬 사건이 있으면 한도 도달과 N", () => {
    expect(deriveBatchNotice(run({ budgetReached: true, deferred: 7 }), input)).toEqual({
      kind: "cap-reached",
      deferred: 7,
    });
    expect(deriveBatchNotice(run({ budgetReached: true, deferred: 0 }), input)).toEqual({
      kind: "none",
    });
  });

  it("실패와 지연(기한 슬롯 행 없음)은 서로 다르다", () => {
    expect(deriveBatchNotice(run({ status: "failed" }), input)).toEqual({ kind: "failed" });
    expect(deriveBatchNotice(run({ slotKey: "2026-09-27T17:00+09:00" }), input)).toEqual({
      kind: "delayed",
    });
  });
});
