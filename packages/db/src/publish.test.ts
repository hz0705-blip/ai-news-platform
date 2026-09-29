import { readFileSync } from "node:fs";
import { type Revision, type RevisionChange, revisionWithSources } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { commitRevision, confirmRevision, saveDemoStoryRecords } from "./publish.ts";
import {
  loadLatestRevision,
  loadOpenEpisodeClaims,
  loadRevisionChanges,
} from "./queries/revision.ts";
import { loadPublishedStory } from "./queries/story.ts";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts"; // DATABASE_TEST_URL로 연결하고 테스트 끝에 truncate
// revision·story·articles·articleVersions·sources 픽스처는 mappers.test.ts와 같은 값을 공유한다.
import { fixture, publishFixture, UNPUBLISHED_BODY_SENTENCE } from "./test-fixtures.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
// Vitest는 테스트가 전부 건너뛰어진 파일의 console 출력을 보고하지 않으므로 stderr에 직접 쓴다.
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

maybe("commitRevision", () => {
  it("같은 개정판을 두 번 발행하면 두 번째는 아무것도 쓰지 않는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const first = await publishFixture(db, fixture);
      const second = await publishFixture(db, fixture);
      expect(first.inserted).toBe(true);
      expect(second).toEqual({ inserted: false, revisionId: first.revisionId });
    } finally {
      await cleanup();
    }
  });

  it("근거 삽입이 실패하면 개정판·주장도 남지 않는다(원자성)", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      const broken = {
        ...fixture,
        revision: {
          ...fixture.revision,
          claims: fixture.revision.claims.map((c) => ({
            ...c,
            evidence: c.evidence.map((e) => ({ ...e, articleVersionId: "없는-버전" })),
          })),
        },
      };
      await expect(publishFixture(db, broken)).rejects.toThrow();
      const rows = await sql<
        { count: number }[]
      >`select count(*)::int as count from story_revisions`;
      expect(rows[0]?.count).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("개정판 커밋은 사건 행 없이 개정판의 사건 식별자로 발행한다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await saveDemoStoryRecords(db, { ...fixture });
      const committed = await commitRevision(db, { revision: fixture.revision });
      expect(committed).toEqual({ inserted: true, revisionId: fixture.revision.id });
      const rows = await sql<{ story_id: string }[]>`
        select story_id from story_revisions where id = ${fixture.revision.id}
      `;
      expect(rows.map((r) => r.story_id)).toEqual([fixture.revision.storyId]);
      const page = await loadPublishedStory(db, { slug: fixture.story.slug });
      expect(page?.revision.id).toBe(fixture.revision.id);
      expect(await commitRevision(db, { revision: fixture.revision })).toEqual({
        inserted: false,
        revisionId: fixture.revision.id,
      });
    } finally {
      await cleanup();
    }
  });
});

maybe("loadPublishedStory", () => {
  it("사건 slug로 최신 개정판을 읽고, 근거는 허용 발췌와 발췌 안 강조 구간만 담는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const { revisionId } = await publishFixture(db, fixture);
      const page = await loadPublishedStory(db, { slug: fixture.story.slug });

      expect(page?.story).toEqual({
        id: fixture.story.id,
        slug: fixture.story.slug,
        title: fixture.story.title,
        topics: fixture.story.topics,
        isDemo: true,
      });
      expect(page?.revision).toEqual({
        id: revisionId,
        revisionNumber: 1,
        title: fixture.revision.title,
        publishedAt: fixture.revision.publishedAt,
        checkedAt: fixture.revision.publishedAt,
        contradictionStatus: "복수 출처 일치",
      });
      expect(page?.claims.map((c) => c.id)).toEqual(fixture.revision.claims.map((c) => c.id));
      expect(page?.claims[0]?.evidence[0]).toEqual({
        sourceId: "src-meridian",
        articleTitle: "Three governments agree on port framework",
        publishedAt: fixture.revision.publishedAt,
        sourceUrl: "https://meridian.invalid/ports",
        excerpt: "Ministers agreed on the framework. The deal covers three ports.",
        highlightInExcerpt: { start: 0, end: 34 },
        differsIn: "모두 중단",
      });
      // 링크만 기사는 근거가 없어도 출처 구획에 남는다. 순서는 기사 발행 시각, 같으면 기사 식별자 순.
      expect(page?.sources.map((s) => s.id)).toEqual(["src-atlas", "src-harbor", "src-meridian"]);
      expect(page?.sources[0]).toMatchObject({
        rightsTier: "링크만",
        isFictional: true,
        articleTitle: "Port deal reached",
        articleUrl: "https://atlas.invalid/ports",
      });
      // 기사 본문은 어떤 필드에도 담기지 않는다.
      expect(JSON.stringify(page)).not.toContain(UNPUBLISHED_BODY_SENTENCE);
    } finally {
      await cleanup();
    }
  });

  it("revisionId를 주면 그 개정판을, 모르는 slug면 undefined를 준다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const { revisionId } = await publishFixture(db, fixture);
      const page = await loadPublishedStory(db, { slug: fixture.story.slug, revisionId });
      expect(page?.revision.id).toBe(revisionId);
      expect(
        await loadPublishedStory(db, { slug: fixture.story.slug, revisionId: "없는-개정판" }),
      ).toBeUndefined();
      expect(await loadPublishedStory(db, { slug: "없는-사건" })).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("사건 페이지 데이터의 제목은 개정판 제목이고 근거는 differsIn을 실어 오며 loadLatestRevision이 도메인 개정판을 복원한다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const titled = { ...fixture, revision: { ...fixture.revision, title: "개정판 제목" } };
      await publishFixture(db, titled);
      const page = await loadPublishedStory(db, { slug: fixture.story.slug });
      expect(page?.revision.title).toBe("개정판 제목");
      expect(page?.claims.flatMap((c) => c.evidence).map((e) => e.differsIn)).toEqual(
        expect.arrayContaining(["모두 중단", undefined]),
      );
      const latest = await loadLatestRevision(db, { slug: fixture.story.slug });
      expect(latest).toEqual(titled.revision);
      expect(await loadLatestRevision(db, { slug: "없는-사건" })).toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});

maybe("confirmRevision", () => {
  it("confirmRevision은 확인 시각만 갱신하고 개정판 수는 그대로", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      const checkedAt = new Date("2026-09-18T00:30:00.000Z");
      expect(await confirmRevision(db, { revisionId: fixture.revision.id, checkedAt })).toEqual({
        updated: true,
      });
      const page = await loadPublishedStory(db, { slug: fixture.story.slug });
      expect(page?.revision.checkedAt).toEqual(checkedAt);
      expect(page?.revision.publishedAt).toEqual(fixture.revision.publishedAt);
      const rows = await sql<
        { count: number }[]
      >`select count(*)::int as count from story_revisions`;
      expect(rows[0]?.count).toBe(1);
      expect(await confirmRevision(db, { revisionId: "없는-개정판", checkedAt })).toEqual({
        updated: false,
      });
    } finally {
      await cleanup();
    }
  });
});

maybe("변화 저장(#85)", () => {
  it("changes persist and load", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      // 이번 개정판은 c-2가 빠지고 출처 구획에서 Atlas가 빠진 것으로 둔다(출처 구획은 개정판마다 저장된다).
      const withoutAtlas = fixture.revision.sources.filter((s) => s.articleId !== "a-atlas");
      const second = revisionWithSources(fixture.revision, withoutAtlas, {
        revisionNumber: 2,
        publishedAt: new Date("2026-09-18T00:30:00.000Z"),
      });
      const next = { ...second, claims: second.claims.slice(0, 1) };
      const changes: RevisionChange[] = [
        {
          kind: "주장 추가·삭제·수정",
          claimChange: "수정",
          claimId: "demo-1-agreement:c-1",
          previousText: "이전 문장",
          currentText: "현재 문장",
        },
        {
          kind: "주장 추가·삭제·수정",
          claimChange: "추가",
          claimId: "demo-1-agreement:c-1",
          currentText: "현재 문장",
          lineageClaimId: "demo-1-agreement:c-2",
        },
        {
          kind: "주장 추가·삭제·수정",
          claimChange: "삭제",
          claimId: "demo-1-agreement:c-2",
          previousText: "빠진 문장",
        },
        {
          kind: "상충 상태 변화",
          claimId: "demo-1-agreement:c-1",
          previousStatus: "보도 상충",
          currentStatus: "상충 해소",
        },
        { kind: "상충 상태 변화", previousStatus: "보도 상충", currentStatus: "복수 출처 일치" },
        { kind: "원문 변경", articleId: "a-meridian", articleVersionId: "av-meridian" },
        { kind: "출처 추가", articleId: "a-harbor" },
      ];
      await publishFixture(db, { ...fixture, revision: next, changes });

      expect(await loadRevisionChanges(db, { revisionId: next.id })).toEqual(changes);
      expect(await loadRevisionChanges(db, { revisionId: fixture.revision.id })).toEqual([]);
      const latest = await loadLatestRevision(db, { slug: fixture.story.slug });
      expect(latest?.id).toBe(next.id);
      expect(latest?.sources).toEqual(withoutAtlas);
    } finally {
      await cleanup();
    }
  });

  it("사건 페이지 데이터는 그 개정판의 변화와 그 개정판까지의 개정판별 변화 종류 개수를 싣는다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      const next = revisionWithSources(fixture.revision, fixture.revision.sources, {
        revisionNumber: 2,
        publishedAt: new Date("2026-09-18T00:30:00.000Z"),
      });
      const changes: RevisionChange[] = [
        {
          kind: "주장 추가·삭제·수정",
          claimChange: "수정",
          claimId: "demo-1-agreement:c-1",
          previousText: "이전 문장",
          currentText: "현재 문장",
        },
        { kind: "출처 추가", articleId: "a-meridian" },
        { kind: "출처 추가", articleId: "a-atlas" },
      ];
      await publishFixture(db, { ...fixture, revision: next, changes });

      const latest = await loadPublishedStory(db, { slug: fixture.story.slug });
      expect(latest?.changes).toEqual(changes);
      expect(latest?.revisions).toEqual([
        {
          id: fixture.revision.id,
          revisionNumber: 1,
          publishedAt: fixture.revision.publishedAt,
          changeCounts: {
            "주장 추가·삭제·수정": 0,
            "상충 상태 변화": 0,
            "원문 변경": 0,
            "출처 추가": 0,
          },
        },
        {
          id: next.id,
          revisionNumber: 2,
          publishedAt: next.publishedAt,
          changeCounts: {
            "주장 추가·삭제·수정": 1,
            "상충 상태 변화": 0,
            "원문 변경": 0,
            "출처 추가": 2,
          },
        },
      ]);
      expect(latest?.sources.map((s) => s.articleId)).toContain("a-meridian");

      const first = await loadPublishedStory(db, {
        slug: fixture.story.slug,
        revisionId: fixture.revision.id,
      });
      expect(first?.changes).toEqual([]);
      expect(first?.revisions.map((r) => r.id)).toEqual([fixture.revision.id]);
    } finally {
      await cleanup();
    }
  });

  it("옛 개정판의 보도량 추이는 발행 뒤 배정된 기사를 세지 않는다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      // 발행 뒤 같은 사건에 배정된 링크만 기사(GDELT 관측 등). 이 개정판의 출처 집합에는 없다.
      await sql`insert into articles (id, source_id, story_id, url, normalized_url, title, published_at, topics, is_link_only, observed_at)
        values ('a-late', 'src-meridian', ${fixture.story.id}, 'https://late.invalid/1', 'https://late.invalid/1', 'Late',
          '2026-09-20T00:00:00Z', '{}', true, '2026-09-20T00:00:00Z')`;
      const page = await loadPublishedStory(db, {
        slug: fixture.story.slug,
        revisionId: fixture.revision.id,
      });
      expect(page?.coverageArticles.map((a) => a.publishedAt)).toEqual(
        fixture.revision.sources
          .map((s) => s.publishedAt)
          .sort((a, b) => a.getTime() - b.getTime()),
      );
      expect(page?.coverageArticles.some((a) => a.isLinkOnly)).toBe(false);
      // 출처 구획도 같은 출처 집합이다(#98).
      expect(page?.sources.map((s) => s.articleId)).not.toContain("a-late");
    } finally {
      await cleanup();
    }
  });

  it("migration keeps existing revisions with no changes", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      const migration = readFileSync(
        new URL("../drizzle/0008_claim_matching_changes.sql", import.meta.url),
        "utf8",
      );
      expect(migration).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\b/i);
      await publishFixture(db, fixture);
      // 마이그레이션 전 모양(출처 목록 없음)으로 되돌린 뒤 마이그레이션의 UPDATE를 다시 적용한다.
      await sql`update story_revisions set source_article_ids = '{}'`;
      const updates = migration
        .split("--> statement-breakpoint")
        .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
        .filter((s) => s.startsWith("UPDATE"));
      expect(updates).toHaveLength(1);
      for (const statement of updates) await sql.unsafe(statement);

      const latest = await loadLatestRevision(db, { slug: fixture.story.slug });
      expect(latest).toEqual(fixture.revision);
      expect(await loadRevisionChanges(db, { revisionId: fixture.revision.id })).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});

maybe("개정판에 고정된 출처 구획(#98)", () => {
  /** 발행 뒤 같은 사건에 배정된 링크만 기사. 출처 추가 개정판을 기다리는 GDELT 관측 같은 것이다. */
  const lateArticle = (sql: Awaited<ReturnType<typeof createMigrationDb>>["sql"]) =>
    sql`insert into articles (id, source_id, story_id, url, normalized_url, title, published_at, topics, is_link_only, observed_at)
      values ('a-late', 'src-meridian', ${fixture.story.id}, 'https://late.invalid/1', 'https://late.invalid/1', 'Late',
        '2026-09-20T00:00:00Z', '{}', true, '2026-09-20T00:00:00Z')`;
  const fixtureArticleIds = [...fixture.revision.sources]
    .sort(
      (a, b) =>
        a.publishedAt.getTime() - b.publishedAt.getTime() || (a.articleId < b.articleId ? -1 : 1),
    )
    .map((s) => s.articleId);

  it("개정판 발행 뒤 배정된 기사는 그 개정판 페이지의 출처 구획에 나오지 않는다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      await lateArticle(sql);
      const latest = await loadPublishedStory(db, { slug: fixture.story.slug });
      const pinned = await loadPublishedStory(db, {
        slug: fixture.story.slug,
        revisionId: fixture.revision.id,
      });
      expect(latest?.sources.map((s) => s.articleId)).toEqual(fixtureArticleIds);
      expect(pinned?.sources.map((s) => s.articleId)).toEqual(fixtureArticleIds);
    } finally {
      await cleanup();
    }
  });

  it("과거 개정판 페이지는 그 개정판의 출처 집합만 보인다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      await lateArticle(sql);
      // 개정판 2는 늦게 온 링크만 기사를 출처 구획에 더한다("출처 추가").
      const next = revisionWithSources(
        fixture.revision,
        [
          ...fixture.revision.sources,
          {
            sourceId: "src-meridian",
            articleId: "a-late",
            articleTitle: "Late",
            articleUrl: "https://late.invalid/1",
            publishedAt: new Date("2026-09-20T00:00:00Z"),
            rightsTier: "본문 처리 + 발췌 표시",
          },
        ],
        { revisionNumber: 2, publishedAt: new Date("2026-09-20T01:00:00.000Z") },
      );
      await publishFixture(db, {
        ...fixture,
        revision: next,
        changes: [{ kind: "출처 추가", articleId: "a-late" }],
      });

      const first = await loadPublishedStory(db, {
        slug: fixture.story.slug,
        revisionId: fixture.revision.id,
      });
      expect(first?.sources.map((s) => s.articleId)).toEqual(fixtureArticleIds);
      expect(first?.coverageArticles).toHaveLength(fixtureArticleIds.length);

      const second = await loadPublishedStory(db, { slug: fixture.story.slug });
      expect(second?.revision.id).toBe(next.id);
      expect(second?.sources.map((s) => s.articleId)).toEqual([...fixtureArticleIds, "a-late"]);
      expect(second?.sources.at(-1)).toMatchObject({
        id: "src-meridian",
        isLinkOnly: true,
        observedAt: new Date("2026-09-20T00:00:00Z"),
      });
    } finally {
      await cleanup();
    }
  });

  it("loadLatestRevision과 사건 페이지 질의가 같은 출처 집합을 낸다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      await publishFixture(db, fixture);
      await lateArticle(sql);
      const latest = await loadLatestRevision(db, { slug: fixture.story.slug });
      const page = await loadPublishedStory(db, { slug: fixture.story.slug });
      expect(latest?.id).toBe(page?.revision.id);
      expect(
        page?.sources.map((s) => ({
          sourceId: s.id,
          articleId: s.articleId,
          articleTitle: s.articleTitle,
          articleUrl: s.articleUrl,
          publishedAt: s.publishedAt,
          rightsTier: s.rightsTier,
        })),
      ).toEqual(latest?.sources);
    } finally {
      await cleanup();
    }
  });
});

maybe("열린 상충 에피소드(#90)", () => {
  it("마지막 기록이 보도 상충이고 마지막 개정판에 없는 주장만 그 기록으로 돌려준다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      // 개정판 1: c-1 보도 상충. 개정판 2·3: c-1이 요약에서 빠졌다(요약 제외로는 닫히지 않는다).
      const [c1, c2] = fixture.revision.claims;
      if (c1 === undefined || c2 === undefined) throw new Error("픽스처 주장이 둘이어야 한다");
      const disputed = { ...c1, contradictionStatus: "보도 상충" as const };
      const first: Revision = {
        ...fixture.revision,
        contradictionStatus: "보도 상충" as const,
        claims: [disputed, c2],
      };
      await publishFixture(db, { ...fixture, revision: first });
      let previous = first;
      for (const revisionNumber of [2, 3]) {
        const next = revisionWithSources(previous, previous.sources, {
          revisionNumber,
          publishedAt: new Date(`2026-09-18T0${revisionNumber}:00:00.000Z`),
        });
        previous = { ...next, claims: next.claims.filter((c) => c.id !== disputed.id) };
        await publishFixture(db, { ...fixture, revision: previous });
      }
      const storyId = fixture.story.id;
      expect(await loadOpenEpisodeClaims(db, { storyId, latestClaimIds: [c2.id] })).toEqual([
        disputed,
      ]);
      // 마지막 개정판에 있으면 그 주장의 상태가 정하므로 에피소드 목록에 없다.
      expect(
        await loadOpenEpisodeClaims(db, { storyId, latestClaimIds: [c2.id, disputed.id] }),
      ).toEqual([]);

      // 명시 정정으로 정정됨이 된 기록이 가장 늦으면 에피소드는 닫혀 있다.
      const corrected = revisionWithSources(previous, previous.sources, {
        revisionNumber: 4,
        publishedAt: new Date("2026-09-18T04:00:00.000Z"),
      });
      await publishFixture(db, {
        ...fixture,
        revision: {
          ...corrected,
          claims: [
            ...corrected.claims,
            {
              ...disputed,
              contradictionStatus: "정정됨",
              evidence: disputed.evidence.map((e) => ({
                ...e,
                id: e.id.replace(first.id, corrected.id),
              })),
            },
          ],
        },
      });
      expect(await loadOpenEpisodeClaims(db, { storyId, latestClaimIds: [c2.id] })).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
