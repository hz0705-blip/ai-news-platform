import {
  accountDeletionPending,
  accountDeletions,
  createMigrationDb,
  readTestDbUrl,
} from "@newstrail/db/testing";
import { describe, expect, it, vi } from "vitest";
import { runAccountUnlinkSweep } from "./account-unlink.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-02T01:00:00.000Z");

maybe("연결 해제 재시도 잡", () => {
  it("72시간이 지나도 남은 대기 행은 리포트·로그에 경고로 남고, 보관 기간이 지난 삭제 기록은 지운다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await db.insert(accountDeletionPending).values({
        provider: "kakao",
        provider_subject: "4242",
        revocation_token: null,
        request_key: "00000000-0000-4000-8000-0000000000c1",
        requested_at: new Date(now.getTime() - 73 * HOUR),
        attempts: 40,
        next_attempt_at: now,
      });
      await db.insert(accountDeletions).values([
        {
          user_id: "00000000-0000-4000-8000-00000000000a",
          deleted_at: new Date(now.getTime() - HOUR),
        },
        {
          user_id: "00000000-0000-4000-8000-00000000000d",
          deleted_at: new Date(now.getTime() - 91 * 24 * HOUR),
        },
      ]);
      const log = vi.fn();
      const report = await runAccountUnlinkSweep({
        db,
        unlink: async () => ({ outcome: "rejected", reason: "kakao-admin-key-missing" }),
        clock: () => now,
        log,
      });
      expect(report).toEqual({
        attempted: 1,
        completed: 0,
        failures: { "kakao-admin-key-missing": 1 },
        remaining: 1,
        overdue: 1,
        purgedRecords: 1,
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ stage: "account-unlink", result: "warning", overdue: 1 }),
      );
      const [row] = await db.select().from(accountDeletionPending);
      expect(row?.next_attempt_at).toEqual(new Date(now.getTime() + HOUR));
    } finally {
      await cleanup();
    }
  });
});
