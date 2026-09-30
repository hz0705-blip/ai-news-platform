import {
  articles,
  articleVersions,
  createMigrationDb,
  readTestDbUrl,
  sources,
  stories,
} from "@newsplatform/db/testing";
import { describe, expect, it, vi } from "vitest";
import { RETENTION_CRON, RETENTION_QUEUE, runRetention, scheduleRetention } from "./retention.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-30T03:00:00.000Z");
const embedding = Array.from({ length: 1536 }, () => 0.01);

type Db = Awaited<ReturnType<typeof createMigrationDb>>["db"];

async function seed(
  db: Db,
  input: {
    readonly lifecycle?: "활성" | "종료";
    readonly versions: readonly { readonly id: string; readonly expiresAt: Date }[];
  },
) {
  await db.insert(sources).values({
    id: "gnews:src",
    name: "Src",
    rights_tier: "본문 처리 + 발췌 표시",
    region: "us",
    ownership: "불명",
    language: "영어",
    is_fictional: false,
    wire_id: null,
    external_id: "src",
  });
  await db.insert(stories).values({
    id: "story-r",
    slug: "story-r",
    title: "R",
    topics: ["기술·AI"],
    is_demo: false,
    lifecycle: input.lifecycle ?? "활성",
    centroid: null,
    last_new_report_at: now,
    last_processed_at: now,
    deferred_at: null,
  });
  await db.insert(articles).values(
    input.versions.map((v) => ({
      id: `a-${v.id}`,
      source_id: "gnews:src",
      story_id: "story-r",
      url: `https://example.com/${v.id}`,
      normalized_url: `https://example.com/${v.id}`,
      external_id: null,
      title: v.id,
      description: null,
      published_at: new Date(v.expiresAt.getTime() - 30 * 24 * HOUR),
      topics: ["기술·AI" as const],
      embedding,
    })),
  );
  await db.insert(articleVersions).values(
    input.versions.map((v) => ({
      id: v.id,
      article_id: `a-${v.id}`,
      body: `body of ${v.id}`,
      normalization_version: 1,
      body_hash: `hash-${v.id}`,
      captured_at: new Date(v.expiresAt.getTime() - 30 * 24 * HOUR),
      body_expires_at: v.expiresAt,
    })),
  );
}

const versionRows = async (db: Db) =>
  (
    await db
      .select({
        id: articleVersions.id,
        body: articleVersions.body,
        body_hash: articleVersions.body_hash,
        body_expires_at: articleVersions.body_expires_at,
      })
      .from(articleVersions)
  ).sort((a, b) => a.id.localeCompare(b.id));

maybe("보존 정책 잡(실 DB)", () => {
  it("만료된 기사 버전 본문만 지우고 해시·기한은 남기며, 만료 전 본문과 활성 사건 임베딩은 그대로 둔다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(db, {
        versions: [
          { id: "v-expired", expiresAt: new Date(now.getTime() - HOUR) },
          { id: "v-edge", expiresAt: now },
          { id: "v-fresh", expiresAt: new Date(now.getTime() + HOUR) },
        ],
      });
      const log = vi.fn();
      const report = await runRetention({ db, clock: () => now, log });
      expect(report).toEqual({ bodiesDeleted: 2, embeddingsCleared: 0 });
      expect(log).toHaveBeenCalledWith({
        stage: "retention",
        result: "ok",
        bodiesDeleted: 2,
        embeddingsCleared: 0,
      });
      expect(await versionRows(db)).toEqual([
        { id: "v-edge", body: null, body_hash: "hash-v-edge", body_expires_at: now },
        {
          id: "v-expired",
          body: null,
          body_hash: "hash-v-expired",
          body_expires_at: new Date(now.getTime() - HOUR),
        },
        {
          id: "v-fresh",
          body: "body of v-fresh",
          body_hash: "hash-v-fresh",
          body_expires_at: new Date(now.getTime() + HOUR),
        },
      ]);
      const kept = await db.select({ embedding: articles.embedding }).from(articles);
      expect(kept.every((a) => a.embedding !== null)).toBe(true);

      // 지울 것이 없으면 로그를 남기지 않는다.
      log.mockClear();
      expect(await runRetention({ db, clock: () => now, log })).toEqual({
        bodiesDeleted: 0,
        embeddingsCleared: 0,
      });
      expect(log).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("한 번에 상한만큼 지우고 다음 실행이 나머지를 지운다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(db, {
        versions: [1, 2, 3].map((n) => ({
          id: `v-${n}`,
          expiresAt: new Date(now.getTime() - n * HOUR),
        })),
      });
      const deps = { db, clock: () => now, log: () => {}, limit: 2 };
      expect((await runRetention(deps)).bodiesDeleted).toBe(2);
      // 기한이 오래된 것부터 지운다.
      expect((await versionRows(db)).map((r) => [r.id, r.body === null])).toEqual([
        ["v-1", false],
        ["v-2", true],
        ["v-3", true],
      ]);
      expect((await runRetention(deps)).bodiesDeleted).toBe(1);
      expect((await versionRows(db)).every((r) => r.body === null)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("종료 사건 기사의 임베딩을 지운다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(db, {
        lifecycle: "종료",
        versions: [{ id: "v-closed", expiresAt: new Date(now.getTime() + HOUR) }],
      });
      expect(await runRetention({ db, clock: () => now, log: () => {} })).toEqual({
        bodiesDeleted: 0,
        embeddingsCleared: 1,
      });
      const [row] = await db.select({ embedding: articles.embedding }).from(articles);
      expect(row?.embedding).toBeNull();
    } finally {
      await cleanup();
    }
  });
});

describe("보존 정책 스케줄", () => {
  it("스케줄은 retention 큐를 exclusive로 등록한다", async () => {
    const boss = {
      getQueue: vi.fn(async () => null),
      createQueue: vi.fn(async () => {}),
      schedule: vi.fn(async () => {}),
      work: vi.fn(async (_name: string, _options: unknown, handler: () => Promise<void>) => {
        await handler();
        return "worker-id";
      }),
    };
    const run = vi.fn(async () => {});
    await scheduleRetention(boss as unknown as Parameters<typeof scheduleRetention>[0], run);
    expect(RETENTION_QUEUE).toBe("retention");
    expect(RETENTION_CRON).toBe("23 * * * *");
    expect(boss.createQueue).toHaveBeenCalledWith("retention", {
      policy: "exclusive",
      retryLimit: 0,
    });
    expect(boss.schedule).toHaveBeenCalledWith("retention", "23 * * * *", {}, { missed: "skip" });
    expect(boss.work).toHaveBeenCalledWith("retention", { batchSize: 1 }, expect.any(Function));
    expect(run).toHaveBeenCalledOnce();
  });
});
