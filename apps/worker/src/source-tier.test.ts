import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSourceRegistry, SOURCES_FILE_PATH } from "@newsplatform/db/sources-file";
import { createMigrationDb, readTestDbUrl, sources } from "@newsplatform/db/testing";
import { describe, expect, it } from "vitest";
import type { CacheInvalidator } from "./revalidate.ts";
import {
  exitCodeOf,
  setSourceTier,
  setTierInRegistryText,
  syncSourcesFile,
} from "./source-tier.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const REGISTERED = "theguardian.com";
const UNREGISTERED = "gdelt:harbor-news.example";

describe("setTierInRegistryText", () => {
  it("출처 표 파일에서 그 행의 등급 한 줄만 바꾼다", () => {
    const text = readFileSync(SOURCES_FILE_PATH, "utf8");
    const next = setTierInRegistryText(text, REGISTERED, "링크만");
    const changed = next.split("\n").filter((line, i) => line !== text.split("\n")[i]);
    expect(changed).toEqual(['    "rightsTier": "링크만",']);
    expect(parseSourceRegistry(JSON.parse(next)).find((r) => r.id === REGISTERED)?.rightsTier).toBe(
      "링크만",
    );
    expect(() => setTierInRegistryText(text, "없는.example", "링크만")).toThrow();
  });
});

/** 사건 둘: s-1은 등록 출처·GDELT 출처 기사와 개정판 둘, s-2는 무관한 출처 기사와 개정판 하나. */
async function seed(sql: Awaited<ReturnType<typeof createMigrationDb>>["sql"]) {
  await sql`insert into sources (id, name, rights_tier, region, ownership, language, is_fictional) values
    (${REGISTERED}, 'The Guardian', '본문 처리 + 발췌 표시', 'gb', 'private', 'en', false),
    (${UNREGISTERED}, 'harbor-news.example', '링크만', '미확인', 'unknown', 'en', false),
    ('other.example', 'Other', '본문 처리 + 발췌 표시', '미확인', 'unknown', 'en', false)`;
  await sql`insert into stories (id, slug, title, topics, is_demo, lifecycle) values
    ('s-1', 's-1', '사건 1', '{}', false, '활성'), ('s-2', 's-2', '사건 2', '{}', false, '활성')`;
  await sql`insert into articles (id, source_id, story_id, url, normalized_url, title, published_at, topics, is_link_only) values
    ('a-1', ${REGISTERED}, 's-1', 'https://theguardian.com/a', 'theguardian.com/a', 'A', now(), '{}', false),
    ('a-2', ${UNREGISTERED}, 's-1', 'https://harbor-news.example/b', 'harbor-news.example/b', 'B', now(), '{}', true),
    ('a-3', 'other.example', 's-2', 'https://other.example/c', 'other.example/c', 'C', now(), '{}', false)`;
  await sql`insert into story_revisions (id, story_id, revision_number, title, published_at, contradiction_status,
      prompt_evidence_extract, prompt_claim_generate, prompt_gate, prompt_contradiction_label, model_id) values
    ('r-1', 's-1', 1, 't', now(), '단일 출처', 'p', 'p', 'p', 'p', 'm'),
    ('r-2', 's-1', 2, 't', now(), '단일 출처', 'p', 'p', 'p', 'p', 'm'),
    ('r-3', 's-2', 1, 't', now(), '단일 출처', 'p', 'p', 'p', 'p', 'm')`;
}

function recorder(): { invalidate: CacheInvalidator; calls: [string[], unknown][] } {
  const calls: [string[], unknown][] = [];
  return {
    calls,
    invalidate: async (tags, options) => {
      calls.push([[...tags], options]);
    },
  };
}

const S1_TAGS = ["story:s-1:latest", "story:s-1:rev:r-1:ko:v1", "story:s-1:rev:r-2:ko:v1"];

function registryCopy(): string {
  const path = join(mkdtempSync(join(tmpdir(), "sources-")), "sources.json");
  copyFileSync(SOURCES_FILE_PATH, path);
  return path;
}

maybe("source:set-tier", () => {
  it("source:set-tier expires latest and all revision tags of affected stories", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(sql);
      const path = registryCopy();
      const { invalidate, calls } = recorder();

      // 등록 출처: 파일 행을 고치고 동기화한다. 영향받는 사건(s-1)의 최신·모든 개정판 태그를 즉시 만료한다.
      const result = await setSourceTier(
        db,
        { sourceId: REGISTERED, tier: "링크만", registryPath: path },
        invalidate,
      );
      expect(result).toMatchObject({
        registry: "file",
        tierChanges: [{ id: REGISTERED, from: "본문 처리 + 발췌 표시", to: "링크만" }],
        expiredTags: 3,
        cacheInvalidated: true,
      });
      expect(calls).toEqual([[S1_TAGS, { immediate: true }]]);
      const row = parseSourceRegistry(JSON.parse(readFileSync(path, "utf8"))).find(
        (r) => r.id === REGISTERED,
      );
      expect(row?.rightsTier).toBe("링크만");
      const tierOf = async (id: string) =>
        (await sql<{ tier: string }[]>`select rights_tier as tier from sources where id = ${id}`)[0]
          ?.tier;
      expect(await tierOf(REGISTERED)).toBe("링크만");

      // 파일이 정본: 다시 동기화해도 등급이 되돌아가지 않고 만료할 것도 없다.
      calls.length = 0;
      expect(await syncSourcesFile(db, path, invalidate)).toMatchObject({ tierChanges: [] });
      expect(await tierOf(REGISTERED)).toBe("링크만");
      expect(calls).toEqual([]);

      // 파일을 손으로 고치고 동기화해도 같은 결과(DB 등급 + 즉시 만료)가 난다.
      writeFileSync(
        path,
        setTierInRegistryText(readFileSync(path, "utf8"), REGISTERED, "본문 처리 + 발췌 표시"),
      );
      expect(await syncSourcesFile(db, path, invalidate)).toMatchObject({
        tierChanges: [{ id: REGISTERED, from: "링크만", to: "본문 처리 + 발췌 표시" }],
        cacheInvalidated: true,
      });
      expect(calls).toEqual([[S1_TAGS, { immediate: true }]]);

      // 표에 없는 출처: DB 행만 고치고, 동기화가 되돌리지 않는다.
      calls.length = 0;
      expect(
        await setSourceTier(
          db,
          { sourceId: UNREGISTERED, tier: "본문 처리 + 발췌 표시", registryPath: path },
          invalidate,
        ),
      ).toMatchObject({ registry: "db", expiredTags: 3 });
      expect(calls).toEqual([[S1_TAGS, { immediate: true }]]);
      await syncSourcesFile(db, path, invalidate);
      expect(await tierOf(UNREGISTERED)).toBe("본문 처리 + 발췌 표시");

      // 같은 등급으로 다시 돌려도 등급은 그대로 두고 영향받는 사건 캐시를 다시 만료한다(재시도 경로).
      calls.length = 0;
      expect(
        await setSourceTier(
          db,
          { sourceId: UNREGISTERED, tier: "본문 처리 + 발췌 표시", registryPath: path },
          invalidate,
        ),
      ).toMatchObject({ tierChanges: [], expiredTags: 3, cacheInvalidated: true });
      expect(calls).toEqual([[S1_TAGS, { immediate: true }]]);
      calls.length = 0;
      expect(
        await setSourceTier(
          db,
          { sourceId: REGISTERED, tier: "본문 처리 + 발췌 표시", registryPath: path },
          invalidate,
        ),
      ).toMatchObject({ registry: "file", tierChanges: [], expiredTags: 3 });
      expect(calls).toEqual([[S1_TAGS, { immediate: true }]]);
    } finally {
      await cleanup();
    }
  });

  it("source:set-tier rejects unknown source or tier", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(sql);
      const path = registryCopy();
      const original = readFileSync(path, "utf8");
      const { invalidate, calls } = recorder();
      await expect(
        setSourceTier(db, { sourceId: REGISTERED, tier: "발췌", registryPath: path }, invalidate),
      ).rejects.toThrow("알 수 없는 권리 등급");
      await expect(
        setSourceTier(
          db,
          { sourceId: "gdelt:none.example", tier: "링크만", registryPath: path },
          invalidate,
        ),
      ).rejects.toThrow("알 수 없는 출처");
      // 무효화 경로가 없으면 파일·DB 어디에도 쓰지 않고 거부한다.
      for (const sourceId of [REGISTERED, UNREGISTERED]) {
        await expect(
          setSourceTier(
            db,
            { sourceId, tier: "본문 처리 + 발췌 표시", registryPath: path },
            undefined,
          ),
        ).rejects.toThrow("캐시 무효화 경로");
      }
      await expect(
        setSourceTier(db, { sourceId: REGISTERED, tier: "링크만", registryPath: path }, undefined),
      ).rejects.toThrow("캐시 무효화 경로");
      expect(readFileSync(path, "utf8")).toBe(original);
      expect(calls).toEqual([]);
      expect((await db.select().from(sources)).map((s) => [s.id, s.rights_tier]).sort()).toEqual(
        [
          [UNREGISTERED, "링크만"],
          ["other.example", "본문 처리 + 발췌 표시"],
          [REGISTERED, "본문 처리 + 발췌 표시"],
        ].sort(),
      );
    } finally {
      await cleanup();
    }
  });

  it("만료가 중간에 실패해도 같은 명령을 다시 돌리면 모든 태그가 만료된다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(sql);
      const path = registryCopy();
      const failing: CacheInvalidator = async () => {
        throw new Error("캐시 무효화 실패: HTTP 502");
      };
      await expect(
        setSourceTier(db, { sourceId: REGISTERED, tier: "링크만", registryPath: path }, failing),
      ).rejects.toThrow("HTTP 502");
      // 등급은 이미 바뀌었다. 재시도는 변화가 없어도 만료한다.
      const { invalidate, calls } = recorder();
      expect(
        await setSourceTier(
          db,
          { sourceId: REGISTERED, tier: "링크만", registryPath: path },
          invalidate,
        ),
      ).toMatchObject({ tierChanges: [], expiredTags: 3, cacheInvalidated: true });
      expect(calls).toEqual([[S1_TAGS, { immediate: true }]]);
    } finally {
      await cleanup();
    }
  });

  it("sources:sync는 무효화 경로 없이 등급이 바뀌면 만료를 못 했다고 알리고 종료 코드 1이다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await seed(sql);
      const path = registryCopy();
      writeFileSync(path, setTierInRegistryText(readFileSync(path, "utf8"), REGISTERED, "링크만"));
      const result = await syncSourcesFile(db, path, undefined);
      expect(result).toMatchObject({ expiredTags: 3, cacheInvalidated: false });
      expect(exitCodeOf(result)).toBe(1);
      // 바뀐 등급이 없으면 만료할 것도 없어 0이다.
      const again = await syncSourcesFile(db, path, undefined);
      expect(again).toMatchObject({ tierChanges: [], cacheInvalidated: true });
      expect(exitCodeOf(again)).toBe(0);
    } finally {
      await cleanup();
    }
  });
});
