import type { UnlinkResult } from "@newsplatform/domain";
import { describe, expect, it, vi } from "vitest";
import {
  type AccountDeletionPorts,
  type DeletionIdentity,
  deleteAccount,
  hasPendingDeletion,
  loadDeletionStatus,
  replayAccountDeletions,
  retryPendingUnlinks,
} from "./account-deletion.ts";
import type { RuntimeDb } from "./runtime.ts";
import {
  accountDeletionPending,
  accountDeletions,
  lastSeenRevisions,
  stories,
  storyFollows,
  storyRevisions,
  topicFollows,
} from "./schema/index.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const KEY = "00000000-0000-4000-8000-0000000000c1";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const now = new Date("2026-09-29T00:00:00.000Z");
const after = (ms: number) => new Date(now.getTime() + ms);

const KAKAO: DeletionIdentity = {
  provider: "kakao",
  providerSubject: "4242",
  revocationToken: null,
};
const GOOGLE: DeletionIdentity = {
  provider: "google",
  providerSubject: "1087",
  revocationToken: "refresh-token",
};

type Db = RuntimeDb["db"];

async function withDb(run: (db: Db, sql: RuntimeDb["sql"]) => Promise<void>) {
  const { db, sql, cleanup } = await createMigrationDb(url as string);
  try {
    await run(db, sql);
  } finally {
    await cleanup();
  }
}

/** 사건 하나와 두 사용자(A·B)의 팔로우·마지막으로 본 개정판을 심는다. */
async function seedAccounts(db: Db): Promise<void> {
  await db.insert(stories).values({
    id: "story-s1",
    slug: "s1",
    title: "s1",
    topics: ["국제 정치·외교·안보"],
    is_demo: false,
    lifecycle: "활성",
  });
  await db.insert(storyRevisions).values({
    id: "s1:rev-1",
    story_id: "story-s1",
    revision_number: 1,
    title: "s1 개정판 1",
    published_at: now,
    contradiction_status: "단일 출처",
    prompt_evidence_extract: "evidence-extract@1",
    prompt_claim_generate: "claim-generate@1",
    prompt_gate: "gate@1",
    prompt_contradiction_label: "contradiction-label@1",
    model_id: "test-model",
  });
  for (const user of [A, B]) {
    await db.insert(storyFollows).values({ user_id: user, story_id: "story-s1" });
    await db.insert(topicFollows).values({ user_id: user, topic: "기술·AI" });
    await db
      .insert(lastSeenRevisions)
      .values({ user_id: user, story_id: "story-s1", revision_id: "s1:rev-1" });
  }
}

async function accountRowsOf(db: Db): Promise<string[]> {
  const rows = [
    ...(await db.select({ u: storyFollows.user_id }).from(storyFollows)),
    ...(await db.select({ u: topicFollows.user_id }).from(topicFollows)),
    ...(await db.select({ u: lastSeenRevisions.user_id }).from(lastSeenRevisions)),
  ];
  return rows.map((row) => (row.u === A ? "A" : "B")).sort();
}

function ports(
  db: Db,
  unlinkResults: (target: DeletionIdentity) => UnlinkResult,
  observed: { pendingAtAuthDelete?: number; recordsAtAuthDelete?: number } = {},
) {
  const deleteAuthUser = vi.fn(async (_userId: string) => {
    observed.pendingAtAuthDelete = (await db.select().from(accountDeletionPending)).length;
    observed.recordsAtAuthDelete = (await db.select().from(accountDeletions)).length;
  });
  const unlink = vi.fn(async (target: DeletionIdentity) => unlinkResults(target));
  return { deleteAuthUser, unlink } satisfies AccountDeletionPorts;
}

const input = { userId: A, identities: [KAKAO, GOOGLE], requestKey: KEY, now };

maybe("계정 삭제", () => {
  it("삭제 대기 행 → 인증 사용자 삭제 → 삭제 기록 순서로, 그 사용자의 팔로우·마지막으로 본 개정판 0, 삭제 기록 1, 해제 성공이면 대기 행 0", async () => {
    await withDb(async (db) => {
      await seedAccounts(db);
      const observed: { pendingAtAuthDelete?: number; recordsAtAuthDelete?: number } = {};
      const p = ports(db, () => ({ outcome: "unlinked" }), observed);

      expect(await deleteAccount(db, input, p, () => now)).toBe("completed");

      expect(p.deleteAuthUser).toHaveBeenCalledWith(A);
      expect(observed).toEqual({ pendingAtAuthDelete: 2, recordsAtAuthDelete: 0 });
      expect(p.unlink.mock.calls.map(([t]) => t)).toEqual(expect.arrayContaining([KAKAO, GOOGLE]));
      expect(await accountRowsOf(db)).toEqual(["B", "B", "B"]);
      expect(await db.select().from(accountDeletions)).toEqual([{ user_id: A, deleted_at: now }]);
      expect(await db.select().from(accountDeletionPending)).toEqual([]);
      expect(await loadDeletionStatus(db, KEY)).toBe("completed");
    });
  });

  it("해제가 실패하면 대기 행이 남아 처리 중·재가입 차단이고, 워커 재시도가 1분·5분 일정 뒤 끝낸다", async () => {
    await withDb(async (db) => {
      await seedAccounts(db);
      const p = ports(db, (t) =>
        t.provider === "kakao"
          ? { outcome: "retry", reason: "kakao-http-503" }
          : { outcome: "unlinked" },
      );
      expect(await deleteAccount(db, input, p, () => now)).toBe("pending");
      expect(await accountRowsOf(db)).toEqual(["B", "B", "B"]);
      expect(await db.select().from(accountDeletions)).toHaveLength(1);
      const [row] = await db.select().from(accountDeletionPending);
      expect(row).toMatchObject({
        provider: "kakao",
        provider_subject: "4242",
        attempts: 1,
        next_attempt_at: after(MINUTE),
      });
      expect(await loadDeletionStatus(db, KEY)).toBe("pending");
      expect(await hasPendingDeletion(db, [{ provider: "kakao", providerSubject: "4242" }])).toBe(
        true,
      );
      expect(await hasPendingDeletion(db, [{ provider: "google", providerSubject: "1087" }])).toBe(
        false,
      );

      const failing = vi.fn(
        async (): Promise<UnlinkResult> => ({
          outcome: "rejected",
          reason: "kakao-admin-key",
        }),
      );
      // 1분이 되기 전에는 시도하지 않는다.
      expect(await retryPendingUnlinks(db, { now: after(30_000), unlink: failing })).toMatchObject({
        attempted: 0,
        remaining: 1,
      });
      expect(
        await retryPendingUnlinks(db, {
          now: after(MINUTE),
          unlink: failing,
          clock: () => after(MINUTE),
        }),
      ).toEqual({
        attempted: 1,
        completed: 0,
        failures: { "kakao-admin-key": 1 },
        remaining: 1,
        overdue: 0,
      });
      const [second] = await db.select().from(accountDeletionPending);
      expect(second).toMatchObject({ attempts: 2, next_attempt_at: after(6 * MINUTE) });

      const ok = vi.fn(async (): Promise<UnlinkResult> => ({ outcome: "already-unlinked" }));
      expect(await retryPendingUnlinks(db, { now: after(6 * MINUTE), unlink: ok })).toEqual({
        attempted: 1,
        completed: 1,
        failures: {},
        remaining: 0,
        overdue: 0,
      });
      expect(await loadDeletionStatus(db, KEY)).toBe("completed");
      expect(await hasPendingDeletion(db, [KAKAO])).toBe(false);
    });
  });

  it("요청 뒤 72시간이 지나도 남은 대기 행은 경고 대상으로 센다", async () => {
    await withDb(async (db) => {
      const p = ports(db, () => ({ outcome: "retry", reason: "kakao-timeout" }));
      await deleteAccount(db, { ...input, identities: [KAKAO] }, p, () => now);
      const report = await retryPendingUnlinks(db, {
        now: after(73 * HOUR),
        unlink: p.unlink,
      });
      expect(report).toMatchObject({ attempted: 1, remaining: 1, overdue: 1 });
    });
  });

  it("같은 요청을 두 번 해도 인증 사용자 삭제·연결 해제는 한 번이고 삭제 기록은 하나다", async () => {
    await withDb(async (db) => {
      await seedAccounts(db);
      const p = ports(db, () => ({ outcome: "unlinked" }));
      expect(await deleteAccount(db, input, p, () => now)).toBe("completed");
      expect(await deleteAccount(db, input, p, () => now)).toBe("completed");
      expect(p.deleteAuthUser).toHaveBeenCalledTimes(1);
      expect(p.unlink).toHaveBeenCalledTimes(2); // 첫 요청의 Kakao·Google 한 번씩
      expect(await db.select().from(accountDeletions)).toHaveLength(1);
      expect(await db.select().from(accountDeletionPending)).toEqual([]);
    });
  });

  it("인증 사용자 삭제가 실패하면 이 요청의 대기 행을 지우고 계정 데이터·삭제 기록은 그대로다", async () => {
    await withDb(async (db) => {
      await seedAccounts(db);
      const p = {
        deleteAuthUser: vi.fn(async () => {
          throw new Error("auth unavailable");
        }),
        unlink: vi.fn(async (): Promise<UnlinkResult> => ({ outcome: "unlinked" })),
      };
      await expect(deleteAccount(db, input, p, () => now)).rejects.toThrow("auth unavailable");
      expect(await db.select().from(accountDeletionPending)).toEqual([]);
      expect(await db.select().from(accountDeletions)).toEqual([]);
      expect(await accountRowsOf(db)).toEqual(["A", "A", "A", "B", "B", "B"]);
      expect(p.unlink).not.toHaveBeenCalled();
    });
  });

  it("연결 해제할 제공자가 없는 사용자(이메일)는 대기 행 없이 바로 완료다", async () => {
    await withDb(async (db) => {
      await seedAccounts(db);
      const p = ports(db, () => ({ outcome: "unlinked" }));
      expect(await deleteAccount(db, { ...input, identities: [] }, p, () => now)).toBe("completed");
      expect(p.unlink).not.toHaveBeenCalled();
      expect(await accountRowsOf(db)).toEqual(["B", "B", "B"]);
    });
  });
});

maybe("복원 재적용", () => {
  it("복원된 DB에서 삭제 기록 사용자의 계정 데이터를 다시 지우고, 보관 기간(90일)이 지난 삭제 기록을 지운다", async () => {
    await withDb(async (db) => {
      // 백업 시점의 계정 데이터(A·B)가 복원되었고 A는 그 뒤 삭제되어 삭제 기록이 있다.
      await seedAccounts(db);
      const old = "00000000-0000-4000-8000-0000000000dd";
      await db.insert(accountDeletions).values([
        { user_id: A, deleted_at: after(-HOUR) },
        { user_id: old, deleted_at: after(-91 * 24 * HOUR) },
      ]);
      expect(await replayAccountDeletions(db, { now })).toEqual({
        deletionRecords: 2,
        accountRows: 3,
        authUsers: null,
        purgedRecords: 1,
      });
      expect(await accountRowsOf(db)).toEqual(["B", "B", "B"]);
      expect(await db.select({ u: accountDeletions.user_id }).from(accountDeletions)).toEqual([
        { u: A },
      ]);
      // 다시 돌려도 안전하다.
      expect(await replayAccountDeletions(db, { now })).toMatchObject({ accountRows: 0 });
    });
  });

  it("auth.users가 있는 DB(Supabase 전체 복원)에서는 삭제 기록의 인증 사용자도 다시 지운다", async () => {
    await withDb(async (db, sql) => {
      await db.insert(accountDeletions).values({ user_id: A, deleted_at: now });
      const rollback = new Error("rollback");
      await expect(
        db.transaction(async (tx) => {
          await tx.execute("create schema auth");
          await tx.execute("create table auth.users (id uuid primary key)");
          await tx.execute(`insert into auth.users (id) values ('${A}'), ('${B}')`);
          expect(await replayAccountDeletions(tx, { now })).toMatchObject({ authUsers: 1 });
          const left = await tx.execute<{ id: string }>("select id from auth.users");
          expect(left.map((row) => row.id)).toEqual([B]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await sql`select to_regclass('auth.users') as t`).toEqual([{ t: null }]);
    });
  });
});
