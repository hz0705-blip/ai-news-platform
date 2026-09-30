import { syncSourceRegistry } from "@newstrail/db";
import { articles, createMigrationDb, readTestDbUrl } from "@newstrail/db/testing";
import type { Source } from "@newstrail/domain";
import { createRecordedGnewsFetch } from "@newstrail/pipeline";
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
      // 기록된 응답 21건 중 lakeview-times.example 1건(korea 1페이지). harbor-post.example 1건은 등록 출처에 맞춘다.
      await syncSourceRegistry(db, [
        registered("lakeview-times.example", true),
        registered("harbor-post.example", false),
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
      expect(rows.some((r) => r.url.includes("lakeview-times.example"))).toBe(false);
      expect(rows.filter((r) => r.source_id === "harbor-post.example")).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
