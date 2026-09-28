import type { Source } from "@newsplatform/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { sources } from "./schema/index.ts";
import { loadSourceRegistry, syncSourceRegistry } from "./sources-registry.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const yonhap: Source = {
  id: "yna.co.kr",
  name: "Yonhap News Agency",
  rightsTier: "본문 처리 + 발췌 표시",
  region: "kr",
  ownership: "public-service",
  language: "ko",
  isFictional: false,
  domains: ["yna.co.kr"],
  isWire: true,
  isExcluded: true,
};

maybe("출처 표 동기화", () => {
  it("sources:sync upsert is idempotent", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      // 수집이 먼저 만든 GNews 출처 행 — 표는 `external_id`를 모르지만 upsert가 지우지 않아야 한다.
      await sql`insert into sources (id, name, rights_tier, region, ownership, language, is_fictional, external_id)
        values ('reuters.com', 'Reuters', '본문 처리 + 발췌 표시', '미확인', 'unknown', 'en', false, 'ext-reuters')`;
      const reuters: Source = {
        ...yonhap,
        id: "reuters.com",
        name: "Reuters",
        region: "gb",
        ownership: "private",
        language: "en",
        domains: ["reuters.com"],
        isExcluded: false,
      };

      expect(await syncSourceRegistry(db, [yonhap, reuters])).toEqual({ synced: 2 });
      const first = await db.select().from(sources).orderBy(sources.id);
      expect(await syncSourceRegistry(db, [yonhap, reuters])).toEqual({ synced: 2 });
      expect(await db.select().from(sources).orderBy(sources.id)).toEqual(first);

      expect(first).toHaveLength(2);
      expect(first[0]).toMatchObject({
        id: "reuters.com",
        region: "gb",
        ownership: "private",
        domains: ["reuters.com"],
        is_wire: true,
        is_excluded: false,
        external_id: "ext-reuters",
      });

      // 표의 값이 바뀌면 그 열만 덮어쓴다.
      await syncSourceRegistry(db, [{ ...yonhap, name: "연합뉴스", isWire: false }]);
      const [updated] = await db.select().from(sources).where(eq(sources.id, yonhap.id));
      expect(updated).toMatchObject({ name: "연합뉴스", is_wire: false, is_excluded: true });

      const registry = await loadSourceRegistry(db);
      expect(registry.map((s) => s.id).sort()).toEqual(["reuters.com", "yna.co.kr"]);
      expect(registry.find((s) => s.id === "yna.co.kr")).toMatchObject({
        isExcluded: true,
        domains: ["yna.co.kr"],
      });
    } finally {
      await cleanup();
    }
  });

  it("migration preserves existing sources rows", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      // 마이그레이션 전 모양의 행(새 열 없음)은 기본값을 받고 등록 출처로 잡히지 않는다.
      await sql`insert into sources (id, name, rights_tier, region, ownership, language, is_fictional, external_id)
        values ('gnews:abc', 'Legacy', '본문 처리 + 발췌 표시', 'us', 'unknown', 'en', false, 'abc')`;
      const [row] = await db.select().from(sources).where(eq(sources.id, "gnews:abc"));
      expect(row).toMatchObject({
        name: "Legacy",
        external_id: "abc",
        domains: [],
        is_wire: false,
        is_excluded: false,
      });
      expect(await loadSourceRegistry(db)).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
