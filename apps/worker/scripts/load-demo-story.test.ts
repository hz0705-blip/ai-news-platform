import { loadPublishedStory } from "@newstrail/db";
import { createMigrationDb, readTestDbUrl } from "@newstrail/db/testing";
import { DEMO_REFERENCE_TIME, loadDemoStepGolden } from "@newstrail/pipeline";
import { describe, expect, it } from "vitest";
import { loadAllDemoStories, loadDemoStory } from "./load-demo-story.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
// Vitest는 테스트가 전부 건너뛰어진 파일의 console 출력을 보고하지 않으므로 stderr에 직접 쓴다.
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

maybe("데모 사건 적재", () => {
  // 테스트마다 빈 DB에서 시작하고 끝나면 비운다(공유 beforeAll 없음 — 앞 테스트의 적재가 남으면
  // `inserted: true` 기대가 깨진다). 잠금으로 packages/db의 실 DB 테스트와 겹치지 않는다.

  it("재실행은 개정판을 만들지 않고 확인 시각만 갱신한다(스펙 134행)", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const first = await loadDemoStory({ url: url as string, slug: "demo-1-agreement" });
      expect(first).toMatchObject({
        inserted: true,
        confirmed: false,
        revisionCount: 1,
        storyIsDemo: true,
      });
      const later = new Date("2026-09-18T00:30:00.000Z");
      const second = await loadDemoStory({
        url: url as string,
        slug: "demo-1-agreement",
        now: later,
      });
      expect(second).toMatchObject({
        inserted: false,
        confirmed: true,
        revisionCount: 1,
        checkedAt: later,
      });
      const page = await loadPublishedStory(db, { slug: "demo-1-agreement" });
      expect(page?.revision.checkedAt).toEqual(later);
      expect(page?.revision.publishedAt).toEqual(DEMO_REFERENCE_TIME);
    } finally {
      await cleanup();
    }
  });

  it("인자 없는 적재는 골든셋 네 사건을 모두 넣고 데모 ②는 보도 상충으로 적재된다", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const results = await loadAllDemoStories({ url: url as string });
      expect(results.map((r) => [r.slug, r.inserted, r.revisionCount])).toEqual([
        ["demo-1-agreement", true, 1],
        ["demo-2-conflict", true, 1],
        ["demo-3-correction", true, 2],
        ["demo-4-figures", true, 2],
      ]);
      const page = await loadPublishedStory(db, { slug: "demo-2-conflict" });
      expect(page?.revision.contradictionStatus).toBe("보도 상충");
      const conflictClaim = page?.claims.find((c) => c.contradictionStatus === "보도 상충");
      expect(conflictClaim?.evidence.map((e) => e.differsIn)).toEqual([
        expect.stringContaining("중단"),
        expect.stringContaining("계속"),
      ]);
    } finally {
      await cleanup();
    }
  });
  it("단계 픽스처는 단계를 순서대로 적용해 개정판 2개와 변화를 적재하고, 재실행은 개정판을 늘리지 않는다(#88)", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      const first = await loadDemoStory({ url: url as string, slug: "demo-3-correction" });
      expect(first).toMatchObject({ inserted: true, revisionCount: 2, storyIsDemo: true });
      const golden = loadDemoStepGolden("demo-3-correction", 2);
      const page = await loadPublishedStory(db, { slug: "demo-3-correction" });
      expect(page?.revision.revisionNumber).toBe(2);
      expect(page?.revision.contradictionStatus).toBe("정정됨");
      expect(page?.changes).toEqual(golden.changes);
      const firstRevision = await loadPublishedStory(db, {
        slug: "demo-3-correction",
        revisionId: "demo-3-correction:rev-1",
      });
      expect(firstRevision?.revision.contradictionStatus).toBe("보도 상충");

      const again = await loadDemoStory({ url: url as string, slug: "demo-3-correction" });
      expect(again).toMatchObject({ inserted: false, confirmed: true, revisionCount: 2 });
    } finally {
      await cleanup();
    }
  });
});
