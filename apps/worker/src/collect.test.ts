import { syncSourceRegistry } from "@newsplatform/db";
import { articles, createMigrationDb, readTestDbUrl } from "@newsplatform/db/testing";
import type { Source } from "@newsplatform/domain";
import { createRecordedGnewsFetch } from "@newsplatform/pipeline";
import { describe, expect, it } from "vitest";
import { collectFromGnews } from "./collect.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const registered = (id: string, isExcluded: boolean): Source => ({
  id,
  name: id,
  rightsTier: "본문 처리 + 발췌 표시",
  region: "kr",
  ownership: "private",
  language: "en",
  isFictional: false,
  domains: [id],
  isExcluded,
});

maybe("collectFromGnews", () => {
  it("collect drops articles from excluded sources and reports count", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      // 기록된 응답 21건 중 lokmattimes.com 1건(korea 1페이지). scmp.com 1건은 등록 출처에 맞춘다.
      await syncSourceRegistry(db, [
        registered("lokmattimes.com", true),
        registered("scmp.com", false),
      ]);
      const result = await collectFromGnews(
        {
          slotAt: new Date("2026-09-27T04:07:03.000Z"),
          previousTo: new Date("2026-09-26T16:07:03.000Z"),
        },
        { db, gnews: { fetch: createRecordedGnewsFetch(), apiKey: "k" } },
      );
      expect(result.excludedArticles).toBe(1);
      expect(result.newArticles).toBe(20);

      const rows = await db.select().from(articles);
      expect(rows).toHaveLength(20);
      expect(rows.some((r) => r.url.includes("lokmattimes.com"))).toBe(false);
      expect(rows.filter((r) => r.source_id === "scmp.com")).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
