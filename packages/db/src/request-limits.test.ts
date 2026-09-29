import { describe, expect, it } from "vitest";
import {
  type AdmitInput,
  admitAnonymousRequest,
  kstDateOf,
  purgeRequestCounters,
  settleAnonymousRequest,
} from "./request-limits.ts";
import type { RuntimeDb } from "./runtime.ts";
import { requestBudgets, requestCounters, requestLeases } from "./schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

async function withDb(run: (db: RuntimeDb["db"]) => Promise<void>) {
  const { db, cleanup } = await createMigrationDb(url as string);
  try {
    await run(db);
  } finally {
    await cleanup();
  }
}

// 2026-09-30 12:00:30 KST
const NOW = new Date("2026-09-30T03:00:30Z");

function input(
  overrides: {
    readonly now?: Date;
    readonly cookie?: string;
    readonly ip?: string;
    readonly cookiePerMinute?: number;
    readonly ipPerMinute?: number;
    readonly concurrent?: number;
    readonly capUsd?: number;
    readonly reserveUsd?: number;
  } = {},
): AdmitInput {
  const cookie = overrides.cookie ?? "search:cookie:c1";
  return {
    now: overrides.now ?? NOW,
    counters: [
      {
        key: cookie,
        limits: [
          { window: "minute", max: overrides.cookiePerMinute ?? 10 },
          { window: "day", max: 100 },
        ],
      },
      {
        key: overrides.ip ?? "search:ip:i1",
        limits: [
          { window: "minute", max: overrides.ipPerMinute ?? 60 },
          { window: "day", max: 5000 },
        ],
      },
    ],
    concurrency: { key: cookie, max: overrides.concurrent ?? 100, leaseMs: 30_000 },
    budget: {
      kind: "search",
      capUsd: overrides.capUsd ?? 0.1,
      reserveUsd: overrides.reserveUsd ?? 0.001,
    },
  };
}

async function admitted(db: RuntimeDb["db"], i: AdmitInput) {
  const result = await admitAnonymousRequest(db, i);
  if (!result.admitted) throw new Error(`거부됨: ${result.reason}`);
  return result;
}

maybe("익명 요청 카운터·예산", () => {
  it("cookie per-minute limit returns 429 with Retry-After", async () => {
    await withDb(async (db) => {
      for (let n = 0; n < 2; n += 1) {
        await settleAnonymousRequest(db, await admitted(db, input({ cookiePerMinute: 2 })), 0);
      }
      const third = await admitAnonymousRequest(db, input({ cookiePerMinute: 2 }));
      // 분 창 끝(12:01:00 KST)까지 30초.
      expect(third).toEqual({ admitted: false, reason: "rate-limited", retryAfterSeconds: 30 });
      // 거부된 요청은 세지 않는다(트랜잭션 전체를 되돌린다).
      const rows = await db.select().from(requestCounters);
      expect(rows.find((r) => r.key === "search:cookie:c1:minute")?.count).toBe(2);
      // 다음 분 창이면 다시 들어온다.
      const later = new Date(NOW.getTime() + 30_000);
      expect(
        (await admitAnonymousRequest(db, input({ now: later, cookiePerMinute: 2 }))).admitted,
      ).toBe(true);
    });
  });

  it("ip emergency cap applies across cookies", async () => {
    await withDb(async (db) => {
      for (const cookie of ["search:cookie:a", "search:cookie:b", "search:cookie:c"]) {
        await settleAnonymousRequest(db, await admitted(db, input({ cookie, ipPerMinute: 3 })), 0);
      }
      const fourth = await admitAnonymousRequest(
        db,
        input({ cookie: "search:cookie:d", ipPerMinute: 3 }),
      );
      expect(fourth).toMatchObject({ admitted: false, reason: "rate-limited" });
      // 다른 IP는 영향이 없다.
      const other = await admitAnonymousRequest(
        db,
        input({ cookie: "search:cookie:d", ip: "search:ip:i2", ipPerMinute: 3 }),
      );
      expect(other.admitted).toBe(true);
    });
  });

  it("concurrent limit of 2 per cookie", async () => {
    await withDb(async (db) => {
      const first = await admitted(db, input({ concurrent: 2 }));
      await admitted(db, input({ concurrent: 2 }));
      expect(await admitAnonymousRequest(db, input({ concurrent: 2 }))).toEqual({
        admitted: false,
        reason: "concurrency",
        retryAfterSeconds: 1,
      });
      await settleAnonymousRequest(db, first, 0);
      expect((await admitAnonymousRequest(db, input({ concurrent: 2 }))).admitted).toBe(true);
      // 죽은 요청의 행은 만료(30초) 뒤 세지 않는다.
      const after = new Date(NOW.getTime() + 31_000);
      expect((await admitAnonymousRequest(db, input({ now: after, concurrent: 2 }))).admitted).toBe(
        true,
      );
    });
  });

  it("budget is reserved before the model call and settled after", async () => {
    await withDb(async (db) => {
      const a = await admitted(db, input({ reserveUsd: 0.004 }));
      const [reserved] = await db.select().from(requestBudgets);
      expect(reserved).toEqual({
        kind: "search",
        kst_date: "2026-09-30",
        reserved_usd: 0.004,
        spent_usd: 0,
      });
      await settleAnonymousRequest(db, a, 0.001);
      const [settled] = await db.select().from(requestBudgets);
      expect(settled?.reserved_usd).toBeCloseTo(0);
      expect(settled?.spent_usd).toBeCloseTo(0.001);
      expect(await db.select().from(requestLeases)).toEqual([]);
    });
  });

  it("search budget exhausted returns search-limit state", async () => {
    await withDb(async (db) => {
      const one = await admitted(db, input({ capUsd: 0.01, reserveUsd: 0.006 }));
      // 진행 중 예약 + 새 예약이 상한을 넘으면 거부한다. 다음 KST 자정(00:00)까지 12시간.
      expect(await admitAnonymousRequest(db, input({ capUsd: 0.01, reserveUsd: 0.006 }))).toEqual({
        admitted: false,
        reason: "budget-exhausted",
        retryAfterSeconds: 12 * 3600 - 30,
      });
      await settleAnonymousRequest(db, one, 0.005);
      expect(
        (await admitAnonymousRequest(db, input({ capUsd: 0.01, reserveUsd: 0.004 }))).admitted,
      ).toBe(true);
      // KST 날짜가 바뀌면 새 예산이다.
      const tomorrow = new Date("2026-09-30T15:00:00Z");
      expect(kstDateOf(tomorrow)).toBe("2026-10-01");
      expect(
        (await admitAnonymousRequest(db, input({ now: tomorrow, capUsd: 0.01, reserveUsd: 0.006 })))
          .admitted,
      ).toBe(true);
    });
  });

  it("counters older than 48 hours are deleted", async () => {
    await withDb(async (db) => {
      const old = new Date(NOW.getTime() - 49 * 3600_000);
      await admitted(db, input({ now: old, cookie: "search:cookie:old" }));
      await admitted(db, input());
      const report = await purgeRequestCounters(db, NOW);
      expect(report).toEqual({ counters: 4, leases: 1 });
      const keys = (await db.select().from(requestCounters)).map((r) => r.key).sort();
      expect(keys).toEqual([
        "search:cookie:c1:day",
        "search:cookie:c1:minute",
        "search:ip:i1:day",
        "search:ip:i1:minute",
      ]);
      // 지금 창의 분 카운터는 창이 끝나면 지워진다.
      await purgeRequestCounters(db, new Date(NOW.getTime() + 60_000));
      expect((await db.select().from(requestCounters)).map((r) => r.key).sort()).toEqual([
        "search:cookie:c1:day",
        "search:ip:i1:day",
      ]);
    });
  });
});
