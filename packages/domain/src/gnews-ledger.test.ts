import { describe, expect, it } from "vitest";
import { canStartRecheck, gnewsLedgerDate, gnewsLedgerRemaining } from "./gnews-ledger.ts";

describe("GNews 요청 원장", () => {
  it("UTC 자정에 원장이 새 날짜로 넘어간다", () => {
    // KST 08:59:59 = UTC 23:59:59 전날, KST 09:00 = UTC 00:00 새 날.
    expect(gnewsLedgerDate(new Date("2026-09-29T08:59:59+09:00"))).toBe("2026-09-28");
    expect(gnewsLedgerDate(new Date("2026-09-29T09:00:00+09:00"))).toBe("2026-09-29");
    // 05시 배치(KST)는 전날 UTC 날짜, 17시 배치는 같은 UTC 날짜에 센다.
    expect(gnewsLedgerDate(new Date("2026-09-29T05:00:00+09:00"))).toBe("2026-09-28");
    expect(gnewsLedgerDate(new Date("2026-09-29T17:00:00+09:00"))).toBe("2026-09-29");
  });

  it("재수집 몫 600을 다 쓰면 그날 재수집을 멈춘다", () => {
    const day = { utcDate: "2026-09-29", discovery: 16, recheck: 0 };
    expect(canStartRecheck(day)).toBe(true);
    // 재시도 1회까지 600을 넘지 않아야 시작한다.
    expect(canStartRecheck({ ...day, recheck: 598 })).toBe(true);
    expect(canStartRecheck({ ...day, recheck: 599 })).toBe(false);
    expect(canStartRecheck({ ...day, recheck: 600 })).toBe(false);
    // 발견이 한도를 먹어도 일 1,000회를 넘기지 않는다.
    expect(canStartRecheck({ ...day, discovery: 999, recheck: 0 })).toBe(false);
    expect(gnewsLedgerRemaining({ ...day, recheck: 600 })).toBe(384);
  });
});
