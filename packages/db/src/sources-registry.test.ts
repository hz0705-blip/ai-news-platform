import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Source } from "@newstrail/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadPublishedStory } from "./queries/story.ts";
import { articles, evidence, sources } from "./schema/index.ts";
import { loadSourceRegistry, syncSourceRegistry } from "./sources-registry.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";
import { fixture, publishFixture } from "./test-fixtures.ts";

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

      expect(await syncSourceRegistry(db, [yonhap, reuters])).toEqual({
        synced: 2,
        repointedArticles: 0,
        repointedEvidence: 0,
        repointedEvidenceStories: [],
        repointedEvidenceSources: [],
        tierChanges: [],
      });
      const first = await db.select().from(sources).orderBy(sources.id);
      expect(await syncSourceRegistry(db, [yonhap, reuters])).toMatchObject({ synced: 2 });
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

  it("sync re-points old gnews articles to the registered source once", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await sql`insert into sources (id, name, rights_tier, region, ownership, language, is_fictional, external_id) values
        ('gnews:r1', 'Reuters', '본문 처리 + 발췌 표시', 'us', 'unknown', 'en', false, 'r1'),
        ('gnews:k1', 'The Korea Times', '본문 처리 + 발췌 표시', 'kr', 'unknown', 'en', false, 'k1'),
        ('gnews:x1', 'Elsewhere', '본문 처리 + 발췌 표시', 'us', 'unknown', 'en', false, 'x1'),
        ('src-demo', 'Demo Wire', '본문 처리 + 발췌 표시', '가상', '가상', 'en', true, null)`;
      const article = (id: string, sourceId: string, host: string) => ({
        id,
        source_id: sourceId,
        story_id: null,
        url: `https://${host}/story/${id}`,
        normalized_url: `https://${host.replace(/^www\./, "")}/story/${id}`,
        external_id: null,
        title: id,
        description: null,
        published_at: new Date("2026-09-27T03:00:00.000Z"),
        topics: ["기술·AI" as const],
        embedding: null,
      });
      await db
        .insert(articles)
        .values([
          article("a-r", "gnews:r1", "www.reuters.com"),
          article("a-k", "gnews:k1", "koreatimes.co.kr"),
          article("a-x", "gnews:x1", "elsewhere.example"),
          article("a-demo", "src-demo", "demo.invalid"),
        ]);
      const koreaTimes: Source = {
        ...yonhap,
        id: "koreatimes.co.kr",
        domains: ["koreatimes.co.kr"],
      };
      const reuters: Source = {
        ...yonhap,
        id: "reuters.com",
        domains: ["reuters.com"],
        isExcluded: false,
      };

      // 등록·제외 출처 모두 옮기고, 도메인이 없는 출처와 데모 출처의 기사는 그대로다.
      expect(await syncSourceRegistry(db, [koreaTimes, reuters])).toEqual({
        synced: 2,
        repointedArticles: 2,
        repointedEvidence: 0,
        repointedEvidenceStories: [],
        repointedEvidenceSources: [],
        tierChanges: [],
      });
      const bySource = Object.fromEntries(
        (await db.select({ id: articles.id, s: articles.source_id }).from(articles)).map((r) => [
          r.id,
          r.s,
        ]),
      );
      expect(bySource).toEqual({
        "a-r": "reuters.com",
        "a-k": "koreatimes.co.kr",
        "a-x": "gnews:x1",
        "a-demo": "src-demo",
      });
      // 옛 출처 행은 남는다.
      expect((await db.select().from(sources)).map((s) => s.id).sort()).toContain("gnews:r1");

      expect(await syncSourceRegistry(db, [koreaTimes, reuters])).toEqual({
        synced: 2,
        repointedArticles: 0,
        repointedEvidence: 0,
        repointedEvidenceStories: [],
        repointedEvidenceSources: [],
        tierChanges: [],
      });
    } finally {
      await cleanup();
    }
  });

  it("sync moves evidence of remapped articles to the article source, including already-remapped articles", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      // 결함 상태 재현: a-harbor는 옛 GNews 출처(재지정 전), a-meridian은 이미 등록 출처로 옮겨졌는데 근거만 옛 출처.
      await sql`insert into sources (id, name, rights_tier, region, ownership, language, is_fictional, external_id, domains) values
        ('gnews:h1', 'Harbor', '본문 처리 + 발췌 표시', 'us', 'unknown', 'en', false, 'h1', '{}'),
        ('gnews:m1', 'Meridian', '본문 처리 + 발췌 표시', 'us', 'unknown', 'en', false, 'm1', '{}'),
        ('meridian.example', 'Meridian', '본문 처리 + 발췌 표시', 'us', 'private', 'en', false, null, '{meridian.example}')`;
      await sql`update articles set source_id = 'gnews:h1', url = 'https://www.harbor.example/ports' where id = 'a-harbor'`;
      await sql`update evidence set source_id = 'gnews:h1' where article_id = 'a-harbor'`;
      await sql`update articles set source_id = 'meridian.example' where id = 'a-meridian'`;
      await sql`update evidence set source_id = 'gnews:m1' where article_id = 'a-meridian'`;
      const snapshot = async () =>
        (await db.select().from(evidence).orderBy(evidence.id)).map(
          ({ source_id, ...rest }) => rest,
        );
      const before = await snapshot();
      const evidenceSourcesMissing = async () => {
        const page = await loadPublishedStory(db, { slug: fixture.story.slug });
        const ids = new Set(page?.sources.map((s) => s.id));
        return (page?.claims ?? []).flatMap((c) => c.evidence).filter((e) => !ids.has(e.sourceId));
      };
      expect(await evidenceSourcesMissing()).not.toEqual([]);

      const harbor: Source = {
        ...yonhap,
        id: "harbor.example",
        domains: ["harbor.example"],
        isExcluded: false,
      };
      const meridian: Source = {
        ...yonhap,
        id: "meridian.example",
        domains: ["meridian.example"],
        isExcluded: false,
      };
      const evidenceCount = before.length;
      const result = await syncSourceRegistry(db, [harbor, meridian]);
      expect(result).toMatchObject({
        repointedArticles: 1,
        repointedEvidence: evidenceCount,
        repointedEvidenceStories: [fixture.story.id],
        repointedEvidenceSources: ["harbor.example", "meridian.example"],
      });
      expect(evidenceCount).toBeGreaterThan(1);

      // 출처 식별자만 옮기고 나머지(구간·해시·URL)는 그대로다. 기사와 근거가 같은 출처를 가리킨다.
      expect(await snapshot()).toEqual(before);
      const mismatched =
        await sql`select e.id from evidence e join articles a on a.id = e.article_id
        where e.source_id is distinct from a.source_id`;
      expect(mismatched).toEqual([]);
      const bySource = Object.fromEntries(
        (await db.select({ a: evidence.article_id, s: evidence.source_id }).from(evidence)).map(
          (r) => [r.a, r.s],
        ),
      );
      expect(bySource).toEqual({ "a-harbor": "harbor.example", "a-meridian": "meridian.example" });

      // 사건 페이지의 모든 근거 출처가 출처 구획에 있다(사건 뷰가 그릴 수 있다).
      expect(await evidenceSourcesMissing()).toEqual([]);

      expect(await syncSourceRegistry(db, [harbor, meridian])).toMatchObject({
        repointedArticles: 0,
        repointedEvidence: 0,
        repointedEvidenceStories: [],
      });
    } finally {
      await cleanup();
    }
  });

  it("migration backfill rewrites old vocabulary on non-fictional rows only", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await sql`insert into sources (id, name, rights_tier, region, ownership, language, is_fictional, external_id) values
        ('gnews:old', 'Old', '본문 처리 + 발췌 표시', '불명', '불명', '영어', false, 'old'),
        ('src-demo', 'Demo', '본문 처리 + 발췌 표시', '불명', '불명', '영어', true, null)`;
      // 마이그레이션 파일의 UPDATE 문을 그대로 다시 적용한다(마이그레이션 자체는 빈 테이블에 이미 돌았다).
      const migration = readFileSync(
        fileURLToPath(new URL("../drizzle/0006_source_registry.sql", import.meta.url)),
        "utf8",
      );
      const updates = migration
        .split("--> statement-breakpoint")
        .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
        .filter((s) => s.startsWith("UPDATE"));
      expect(updates).toHaveLength(3);
      for (const statement of updates) await sql.unsafe(statement);

      const rows = await db.select().from(sources).orderBy(sources.id);
      expect(rows.map((r) => [r.id, r.region, r.ownership, r.language])).toEqual([
        ["gnews:old", "미확인", "unknown", "en"],
        ["src-demo", "불명", "불명", "영어"],
      ]);
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
