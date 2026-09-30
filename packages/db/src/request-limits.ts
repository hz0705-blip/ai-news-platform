import { randomUUID } from "node:crypto";
import { kstDayRange } from "@newstrail/domain/batch-slot";
import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import type { RuntimeDb } from "./runtime.ts";
import { requestBudgets, requestCounters, requestLeases } from "./schema/index.ts";

/**
 * 익명 요청(번역·검색) 남용 방지 카운터와 일일 예산(#125, 스펙 "배치와 비용" 익명 요청 남용 방지·"개발 중 결정 항목"
 * 익명 요청 한도 숫자). 한 요청의 입장(`admitAnonymousRequest`)은 트랜잭션 하나다: 고정 창 카운터를 올리고, 동시 한도를
 * 세고, 예산에서 최대 비용을 예약한다. 하나라도 걸리면 트랜잭션 전체를 되돌려 아무것도 세지 않는다. 트랜잭션 전체를
 * 연결 획득 포함 기본 200ms로 끊고(`CounterTimeoutError`) 그 밖의 오류와 함께 호출자에게 던진다 — 호출자는 503으로 새 유료 작업을 거부한다.
 * 끝나면 `settleAnonymousRequest`가 동시 행을 지우고 예약을 실제 비용으로 정산한다.
 */

export type RateWindow = "minute" | "day";

export interface RateLimit {
  readonly window: RateWindow;
  readonly max: number;
}

/** 카운터 키 하나(쿠키 HMAC 또는 IP HMAC)와 그 한도들. `key`는 원시 값이 아니어야 한다. */
export interface CounterLimits {
  readonly key: string;
  readonly limits: readonly RateLimit[];
}

export interface AdmitInput {
  readonly now: Date;
  readonly counters: readonly CounterLimits[];
  readonly concurrency: { readonly key: string; readonly max: number; readonly leaseMs: number };
  readonly budget: { readonly kind: string; readonly capUsd: number; readonly reserveUsd: number };
  /** 카운터 트랜잭션 제한(ms). 기본 200(스펙 "개발 중 결정 항목"). */
  readonly timeoutMs?: number;
}

export type AdmitResult =
  | {
      readonly admitted: true;
      readonly leaseId: string;
      readonly budgetKind: string;
      readonly kstDate: string;
      readonly reservedUsd: number;
    }
  | {
      readonly admitted: false;
      readonly reason: "rate-limited" | "concurrency" | "budget-exhausted";
      readonly retryAfterSeconds: number;
    };

const MINUTE_MS = 60_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function windowRange(window: RateWindow, now: Date): { readonly from: Date; readonly to: Date } {
  if (window === "day") return kstDayRange(now);
  const from = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  return { from: new Date(from), to: new Date(from + MINUTE_MS) };
}

/** KST 날짜 `YYYY-MM-DD`(예산 원장 키). */
export function kstDateOf(now: Date): string {
  return new Date(kstDayRange(now).from.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function secondsUntil(to: Date, now: Date): number {
  return Math.max(1, Math.ceil((to.getTime() - now.getTime()) / 1000));
}

class Rejected extends Error {
  readonly result: AdmitResult & { admitted: false };
  constructor(result: AdmitResult & { admitted: false }) {
    super("rejected");
    this.result = result;
  }
}

/** 입장 트랜잭션이 제한 시간(연결 획득 포함)을 넘겼다. 호출자는 503으로 새 유료 작업을 거부한다. */
export class CounterTimeoutError extends Error {
  constructor() {
    super("카운터 트랜잭션 제한 시간 초과");
    this.name = "CounterTimeoutError";
  }
}

/**
 * 입장 트랜잭션 전체(연결 획득·모든 문장·커밋)를 `timeoutMs`로 끊는다. 타이머가 먼저 끝나면 `CounterTimeoutError`로
 * 바로 거부하고, 늦게 도는 트랜잭션은 커밋 전 기한 검사에서 스스로 되돌린다(각 문장도 `statement_timeout`으로 남은 시간 안에
 * 끝난다). 검사 뒤 커밋만 늦어 입장이 기록된 드문 경우에는 그 입장을 곧바로 정산(동시 행 삭제·예약 반환)한다.
 */
export async function admitAnonymousRequest(
  db: RuntimeDb["db"],
  input: AdmitInput,
): Promise<AdmitResult> {
  const timeoutMs = input.timeoutMs ?? 200;
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = admitWithin(db, input, deadline);
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new CounterTimeoutError());
    }, timeoutMs);
  });
  work.then(
    (result) => {
      if (timedOut && result.admitted) void settleAnonymousRequest(db, result, 0).catch(() => {});
    },
    () => {},
  );
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

async function admitWithin(
  db: RuntimeDb["db"],
  input: AdmitInput,
  deadline: number,
): Promise<AdmitResult> {
  const { now } = input;
  const leaseId = randomUUID();
  const kstDate = kstDateOf(now);
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new CounterTimeoutError();
    return ms;
  };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local statement_timeout = ${Math.ceil(remaining())}`));
      // 같은 동시 키의 입장을 한 줄로 세운다(두 요청이 함께 1을 세고 둘 다 들어오는 경합 방지).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.concurrency.key}))`);

      let retryAfter = 0;
      for (const counter of input.counters) {
        for (const limit of counter.limits) {
          const range = windowRange(limit.window, now);
          const [row] = await tx
            .insert(requestCounters)
            .values({
              key: `${counter.key}:${limit.window}`,
              window_start: range.from,
              count: 1,
              expires_at: range.to,
            })
            .onConflictDoUpdate({
              target: [requestCounters.key, requestCounters.window_start],
              set: { count: sql`${requestCounters.count} + 1` },
            })
            .returning({ count: requestCounters.count });
          if ((row?.count ?? 0) > limit.max) {
            retryAfter = Math.max(retryAfter, secondsUntil(range.to, now));
          }
        }
      }
      if (retryAfter > 0) {
        throw new Rejected({
          admitted: false,
          reason: "rate-limited",
          retryAfterSeconds: retryAfter,
        });
      }

      const [active] = await tx
        .select({ n: count() })
        .from(requestLeases)
        .where(
          and(eq(requestLeases.key, input.concurrency.key), gt(requestLeases.expires_at, now)),
        );
      if ((active?.n ?? 0) >= input.concurrency.max) {
        throw new Rejected({ admitted: false, reason: "concurrency", retryAfterSeconds: 1 });
      }
      await tx.insert(requestLeases).values({
        id: leaseId,
        key: input.concurrency.key,
        expires_at: new Date(now.getTime() + input.concurrency.leaseMs),
      });

      const { kind, capUsd, reserveUsd } = input.budget;
      await tx.insert(requestBudgets).values({ kind, kst_date: kstDate }).onConflictDoNothing();
      const reserved = await tx
        .update(requestBudgets)
        .set({ reserved_usd: sql`${requestBudgets.reserved_usd} + ${reserveUsd}` })
        .where(
          and(
            eq(requestBudgets.kind, kind),
            eq(requestBudgets.kst_date, kstDate),
            sql`${requestBudgets.spent_usd} + ${requestBudgets.reserved_usd} + ${reserveUsd} <= ${capUsd}`,
          ),
        )
        .returning({ kind: requestBudgets.kind });
      if (reserved.length === 0) {
        throw new Rejected({
          admitted: false,
          reason: "budget-exhausted",
          retryAfterSeconds: secondsUntil(kstDayRange(now).to, now),
        });
      }
      // 기한을 넘겼으면 커밋하지 않고 되돌린다(호출자는 이미 503을 받았다).
      remaining();
    });
  } catch (error) {
    if (error instanceof Rejected) return error.result;
    throw error;
  }
  return {
    admitted: true,
    leaseId,
    budgetKind: input.budget.kind,
    kstDate,
    reservedUsd: input.budget.reserveUsd,
  };
}

/** 입장한 요청을 끝낸다: 동시 행을 지우고, 예약을 빼고 실제 비용(`spentUsd`)을 더한다. 한 트랜잭션. */
export async function settleAnonymousRequest(
  db: RuntimeDb["db"],
  admitted: AdmitResult & { admitted: true },
  spentUsd: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(requestLeases).where(eq(requestLeases.id, admitted.leaseId));
    await tx
      .update(requestBudgets)
      .set({
        reserved_usd: sql`greatest(0, ${requestBudgets.reserved_usd} - ${admitted.reservedUsd})`,
        spent_usd: sql`${requestBudgets.spent_usd} + ${spentUsd}`,
      })
      .where(
        and(
          eq(requestBudgets.kind, admitted.budgetKind),
          eq(requestBudgets.kst_date, admitted.kstDate),
        ),
      );
  });
}

/** 창이 끝난 카운터와 만료된 동시 행을 지운다(워커 정리 잡). 창은 24시간 이하라 카운터는 48시간 안에 지워진다. */
export async function purgeRequestCounters(
  db: RuntimeDb["db"],
  now: Date,
): Promise<{ readonly counters: number; readonly leases: number }> {
  const counters = await db
    .delete(requestCounters)
    .where(lte(requestCounters.expires_at, now))
    .returning({ key: requestCounters.key });
  const leases = await db
    .delete(requestLeases)
    .where(lte(requestLeases.expires_at, now))
    .returning({ id: requestLeases.id });
  return { counters: counters.length, leases: leases.length };
}
