import {
  DELETION_RECORD_RETENTION_MS,
  isUnlinkDone,
  isUnlinkOverdue,
  nextUnlinkAttemptAt,
  UNLINK_PROVIDERS,
  type UnlinkProvider,
  type UnlinkResult,
} from "@newstrail/domain";
import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { z } from "zod";
import {
  accountDeletionPending,
  accountDeletions,
  lastSeenRevisions,
  storyFollows,
  topicFollows,
} from "./schema/index.ts";

/**
 * 계정 삭제(스펙 "계정" 계정 삭제·"데이터 보존", #106). 순서: 삭제 대기 행 → 인증 사용자 하드 삭제 → 삭제 기록 →
 * 제공자 연결 해제 → 성공하면 대기 행 삭제. 인증 사용자 삭제와 연결 해제는 호출자가 포트로 넘긴다(웹: Supabase 관리자 API·
 * 제공자 HTTP, 테스트: 스텁). 계정 데이터(팔로우·마지막으로 본 개정판)는 프로덕션에서 `auth.users` FK 연쇄로 지워지지만,
 * FK가 없는 앱 DB(테스트·E2E)에서도 같게 되도록 삭제 기록을 쓰는 트랜잭션에서 직접 지운다.
 */

// 트랜잭션 안에서도 부를 수 있게(복원 재적용 테스트) Drizzle PG DB·트랜잭션을 모두 받는다.
type Db = PgDatabase<PostgresJsQueryResultHKT>;

export interface DeletionIdentity {
  readonly provider: UnlinkProvider;
  readonly providerSubject: string;
  /** Google 해제용 토큰. Kakao는 관리자 키로 해제하므로 null. */
  readonly revocationToken: string | null;
}

export interface AccountDeletionPorts {
  /** 인증 사용자 하드 삭제. 이미 없으면 성공으로 끝나고, 끝내 지우지 못하면 던진다. */
  readonly deleteAuthUser: (userId: string) => Promise<void>;
  readonly unlink: (target: DeletionIdentity) => Promise<UnlinkResult>;
}

/** 인증 사용자 삭제 뒤 삭제 기록 트랜잭션을 시도하는 횟수. */
const RECORD_ATTEMPTS = 3;

export interface DeleteAccountInput {
  /** 현재 사용자 헬퍼로 검증한 인증 사용자 ID. */
  readonly userId: string;
  /** 연결 해제할 제공자 계정(Kakao·Google). 없으면(이메일 사용자 등) 연결 해제 없이 끝난다. */
  readonly identities: readonly DeletionIdentity[];
  /** 멱등 키(요청마다 무작위). */
  readonly requestKey: string;
  readonly now: Date;
}

/** 삭제 결과. `pending`이면 연결 해제가 남아 워커가 다시 시도한다 — 사용자에게는 "처리 중"이다. */
export type AccountDeletionStatus = "completed" | "pending";

const identityMatch = (
  identities: readonly Pick<DeletionIdentity, "provider" | "providerSubject">[],
) =>
  or(
    ...identities.map((identity) =>
      and(
        eq(accountDeletionPending.provider, identity.provider),
        eq(accountDeletionPending.provider_subject, identity.providerSubject),
      ),
    ),
  );

/** 이 제공자 계정 중 하나라도 삭제 대기 중인가(재가입 차단). */
export async function hasPendingDeletion(
  db: Db,
  identities: readonly Pick<DeletionIdentity, "provider" | "providerSubject">[],
): Promise<boolean> {
  if (identities.length === 0) return false;
  const rows = await db
    .select({ provider: accountDeletionPending.provider })
    .from(accountDeletionPending)
    .where(identityMatch(identities))
    .limit(1);
  return rows.length > 0;
}

/** 요청 키의 삭제 결과. 그 요청의 대기 행이 남아 있으면 처리 중이다. */
export async function loadDeletionStatus(
  db: Db,
  requestKey: string,
): Promise<AccountDeletionStatus> {
  const rows = await db
    .select({ provider: accountDeletionPending.provider })
    .from(accountDeletionPending)
    .where(eq(accountDeletionPending.request_key, requestKey))
    .limit(1);
  return rows.length > 0 ? "pending" : "completed";
}

/** 한 사용자의 계정 데이터(팔로우·마지막으로 본 개정판)를 지운다. 지운 행 수. */
async function deleteAccountData(db: Db, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const [story, topic, seen] = await Promise.all([
    db
      .delete(storyFollows)
      .where(inArray(storyFollows.user_id, [...userIds]))
      .returning(),
    db
      .delete(topicFollows)
      .where(inArray(topicFollows.user_id, [...userIds]))
      .returning(),
    db
      .delete(lastSeenRevisions)
      .where(inArray(lastSeenRevisions.user_id, [...userIds]))
      .returning(),
  ]);
  return story.length + topic.length + seen.length;
}

/** 대기 행 하나의 연결 해제를 한 번 시도하고 결과대로 행을 지우거나 다음 시도를 잡는다. */
async function attemptUnlink(
  db: Db,
  row: DeletionIdentity & { readonly attempts: number },
  unlink: AccountDeletionPorts["unlink"],
  clock: () => Date,
): Promise<UnlinkResult> {
  const result = await unlink({
    provider: row.provider,
    providerSubject: row.providerSubject,
    revocationToken: row.revocationToken,
  });
  const where = and(
    eq(accountDeletionPending.provider, row.provider),
    eq(accountDeletionPending.provider_subject, row.providerSubject),
  );
  if (isUnlinkDone(result)) {
    await db.delete(accountDeletionPending).where(where);
  } else {
    const attempts = row.attempts + 1;
    await db
      .update(accountDeletionPending)
      .set({ attempts, next_attempt_at: nextUnlinkAttemptAt(attempts, clock()) })
      .where(where);
  }
  return result;
}

/**
 * 계정을 삭제한다. 같은 사용자의 삭제 기록이 이미 있으면 다시 하지 않고 지금 상태만 돌려준다(멱등).
 * 인증 사용자 삭제가 실패하면 이 요청이 만든 대기 행을 지우고 던진다 — 계정과 데이터는 그대로다.
 */
export async function deleteAccount(
  db: Db,
  input: DeleteAccountInput,
  ports: AccountDeletionPorts,
  clock: () => Date = () => new Date(),
): Promise<AccountDeletionStatus> {
  const done = await db
    .select({ userId: accountDeletions.user_id })
    .from(accountDeletions)
    .where(eq(accountDeletions.user_id, input.userId))
    .limit(1);
  if (done.length > 0) {
    return (await hasPendingDeletion(db, input.identities)) ? "pending" : "completed";
  }

  // 1) 삭제 대기 행. 첫 시도는 아래에서 바로 하므로 워커의 다음 시도는 1분 뒤다.
  if (input.identities.length > 0) {
    await db
      .insert(accountDeletionPending)
      .values(
        input.identities.map((identity) => ({
          provider: identity.provider,
          provider_subject: identity.providerSubject,
          revocation_token: identity.revocationToken,
          request_key: input.requestKey,
          requested_at: input.now,
          next_attempt_at: nextUnlinkAttemptAt(1, input.now),
        })),
      )
      .onConflictDoUpdate({
        target: [accountDeletionPending.provider, accountDeletionPending.provider_subject],
        set: {
          revocation_token: sql`coalesce(excluded.revocation_token, ${accountDeletionPending.revocation_token})`,
          request_key: sql`excluded.request_key`,
        },
      });
  }

  // 2) 인증 사용자 하드 삭제.
  try {
    await ports.deleteAuthUser(input.userId);
  } catch (error) {
    if (input.identities.length > 0) {
      await db
        .delete(accountDeletionPending)
        .where(
          and(
            identityMatch(input.identities),
            eq(accountDeletionPending.request_key, input.requestKey),
          ),
        );
    }
    throw error;
  }

  // 3) 계정 데이터와 삭제 기록(인증 사용자 ID만). 인증 사용자는 이미 지워졌으므로 여기서 던지지 않는다 —
  //    몇 번 다시 해도 쓰지 못하면 사용자에게는 "처리 중"으로 보이고, 연결 해제는 그대로 진행한다.
  let recorded = false;
  for (let attempt = 0; attempt < RECORD_ATTEMPTS && !recorded; attempt += 1) {
    recorded = await db
      .transaction(async (tx) => {
        await deleteAccountData(tx, [input.userId]);
        await tx
          .insert(accountDeletions)
          .values({ user_id: input.userId, deleted_at: input.now })
          .onConflictDoNothing();
      })
      .then(
        () => true,
        () => false,
      );
  }

  // 4) 제공자 연결 해제. 실패한 행은 남아 워커가 일정대로 다시 한다.
  const rows = input.identities.length === 0 ? [] : await loadPendingRows(db, input.identities);
  let pending = !recorded;
  for (const row of rows) {
    if (!isUnlinkDone(await attemptUnlink(db, row, ports.unlink, clock))) pending = true;
  }
  return pending ? "pending" : "completed";
}

async function loadPendingRows(
  db: Db,
  identities: readonly DeletionIdentity[],
): Promise<(DeletionIdentity & { readonly attempts: number })[]> {
  const rows = await db.select().from(accountDeletionPending).where(identityMatch(identities));
  return rows.map(toTarget);
}

function toTarget(
  row: typeof accountDeletionPending.$inferSelect,
): DeletionIdentity & { readonly attempts: number } {
  return {
    provider: row.provider,
    providerSubject: row.provider_subject,
    revocationToken: row.revocation_token,
    attempts: row.attempts,
  };
}

export interface UnlinkRetryReport {
  /** 이번에 시도한 대기 행 수. */
  readonly attempted: number;
  readonly completed: number;
  /** 시도 결과 사유별 개수(완료 아님). 토큰·ID는 담지 않는다. */
  readonly failures: Readonly<Record<string, number>>;
  /** 이번 시도 뒤 남은 대기 행 수. */
  readonly remaining: number;
  /** 요청 뒤 72시간이 지나도 남은 대기 행 수(경고). */
  readonly overdue: number;
}

/** 다음 시도 시각이 된 대기 행의 연결 해제를 다시 시도한다(워커 잡). */
export async function retryPendingUnlinks(
  db: Db,
  options: {
    readonly now: Date;
    readonly unlink: AccountDeletionPorts["unlink"];
    readonly clock?: () => Date;
    readonly limit?: number;
  },
): Promise<UnlinkRetryReport> {
  const clock = options.clock ?? (() => new Date());
  const due = await db
    .select()
    .from(accountDeletionPending)
    .where(lte(accountDeletionPending.next_attempt_at, options.now))
    .orderBy(asc(accountDeletionPending.next_attempt_at))
    .limit(options.limit ?? 100);
  let completed = 0;
  const failures: Record<string, number> = {};
  for (const row of due) {
    const result = await attemptUnlink(db, toTarget(row), options.unlink, clock);
    if (result.outcome === "retry" || result.outcome === "rejected") {
      failures[result.reason] = (failures[result.reason] ?? 0) + 1;
    } else {
      completed += 1;
    }
  }
  const left = await db
    .select({ requestedAt: accountDeletionPending.requested_at })
    .from(accountDeletionPending);
  return {
    attempted: due.length,
    completed,
    failures,
    remaining: left.length,
    overdue: left.filter((row) => isUnlinkOverdue(row.requestedAt, options.now)).length,
  };
}

/** 백업 보관 기간(90일)이 지난 삭제 기록을 지운다. 지운 수. */
export async function purgeDeletionRecords(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DELETION_RECORD_RETENTION_MS);
  const rows = await db
    .delete(accountDeletions)
    .where(lt(accountDeletions.deleted_at, cutoff))
    .returning();
  return rows.length;
}

/**
 * 복원 전에 떠 둔 삭제 기록·삭제 대기 행(`exportAccountDeletions`). 복원 대상 DB의 기록은 백업 시점까지만 있으므로
 * 백업 뒤에 삭제한 사용자와 그 뒤에 생긴 대기 행은 이 내보내기에서 온다. 대기 행은 Google 해제용 토큰을 담으므로
 * 파일은 시크릿처럼 다루고 쓰고 나면 지운다.
 */
export const AccountDeletionExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  deletions: z.array(z.object({ userId: z.uuid(), deletedAt: z.iso.datetime() })),
  pending: z.array(
    z.object({
      provider: z.enum(UNLINK_PROVIDERS),
      providerSubject: z.string().min(1),
      revocationToken: z.string().nullable(),
      requestKey: z.uuid(),
      requestedAt: z.iso.datetime(),
      attempts: z.number().int().nonnegative(),
      nextAttemptAt: z.iso.datetime(),
    }),
  ),
});
export type AccountDeletionExport = z.infer<typeof AccountDeletionExportSchema>;

/** 복원하기 전에 지금(복원 전) DB의 삭제 기록과 삭제 대기 행을 모두 뜬다. */
export async function exportAccountDeletions(
  db: Db,
  options: { readonly now: Date },
): Promise<AccountDeletionExport> {
  const deletions = await db.select().from(accountDeletions).orderBy(asc(accountDeletions.user_id));
  const pending = await db.select().from(accountDeletionPending);
  return {
    exportedAt: options.now.toISOString(),
    deletions: deletions.map((row) => ({
      userId: row.user_id,
      deletedAt: row.deleted_at.toISOString(),
    })),
    pending: pending.map((row) => ({
      provider: row.provider,
      providerSubject: row.provider_subject,
      revocationToken: row.revocation_token,
      requestKey: row.request_key,
      requestedAt: row.requested_at.toISOString(),
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at.toISOString(),
    })),
  };
}

export interface ReplayDeletionsReport {
  /** 적용한 삭제 기록 수(내보내기 ∪ 복원된 DB). */
  readonly deletionRecords: number;
  /** 내보내기에서 복원된 DB로 되살린 삭제 기록 수(백업 뒤의 삭제). */
  readonly importedRecords: number;
  /** 복원 뒤 삭제 대기 행 수(= 내보내기의 대기 행). */
  readonly pendingRows: number;
  readonly accountRows: number;
  /** `auth.users`가 있는 DB(Supabase 전체 복원)에서 다시 지운 인증 사용자 수. 없으면 null. */
  readonly authUsers: number | null;
  readonly purgedRecords: number;
}

/**
 * 백업 복원 뒤 삭제 재적용(스펙 "데이터 보존": 복원하면 삭제 기록을 다시 적용한 뒤 서비스를 연다). 복원된 DB `db`에 대해
 * 1) 복원 전 내보내기의 삭제 기록을 되살리고(있는 것은 그대로), 2) 삭제 대기 행을 내보내기의 것으로 바꾼다(백업 뒤에 생긴 행은
 * 되살리고, 백업 뒤에 끝난 행은 지운다 — 복원 직전의 상태가 정본이다), 3) 삭제 기록의 사용자마다 계정 데이터를 지우고
 * `auth.users`가 있으면(Supabase 복원) 그 인증 사용자도 지운다(FK 연쇄), 4) 보관 기간이 지난 삭제 기록을 지운다.
 * 한 트랜잭션이며 다시 돌려도 안전하다.
 */
export async function replayAccountDeletions(
  db: Db,
  options: { readonly now: Date; readonly exported: AccountDeletionExport },
): Promise<ReplayDeletionsReport> {
  const exported = AccountDeletionExportSchema.parse(options.exported);
  return db.transaction(async (tx) => {
    let importedRecords = 0;
    // 보관 기간이 이미 지난 기록은 되살리지 않는다(아래 정리와 같은 기준).
    const cutoff = options.now.getTime() - DELETION_RECORD_RETENTION_MS;
    const live = exported.deletions.filter((row) => Date.parse(row.deletedAt) >= cutoff);
    if (live.length > 0) {
      const inserted = await tx
        .insert(accountDeletions)
        .values(
          live.map((row) => ({
            user_id: row.userId,
            deleted_at: new Date(row.deletedAt),
          })),
        )
        .onConflictDoNothing()
        .returning();
      importedRecords = inserted.length;
    }
    await tx.delete(accountDeletionPending);
    if (exported.pending.length > 0) {
      await tx.insert(accountDeletionPending).values(
        exported.pending.map((row) => ({
          provider: row.provider,
          provider_subject: row.providerSubject,
          revocation_token: row.revocationToken,
          request_key: row.requestKey,
          requested_at: new Date(row.requestedAt),
          attempts: row.attempts,
          next_attempt_at: new Date(row.nextAttemptAt),
        })),
      );
    }

    const records = await tx.select({ userId: accountDeletions.user_id }).from(accountDeletions);
    const userIds = records.map((row) => row.userId);
    const accountRows = await deleteAccountData(tx, userIds);
    let authUsers: number | null = null;
    const [auth] = await tx.execute<{ present: boolean }>(
      sql`select to_regclass('auth.users') is not null as present`,
    );
    if (auth?.present === true) {
      authUsers = 0;
      if (userIds.length > 0) {
        const deleted = await tx.execute(
          sql`delete from auth.users where id in (select user_id from account_deletions) returning id`,
        );
        authUsers = deleted.length;
      }
    }
    const purgedRecords = await purgeDeletionRecords(tx, options.now);
    return {
      deletionRecords: userIds.length,
      importedRecords,
      pendingRows: exported.pending.length,
      accountRows,
      authUsers,
      purgedRecords,
    };
  });
}
