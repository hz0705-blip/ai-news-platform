import {
  createMigrationDb,
  readTestDbUrl,
  stories,
  storyRevisions,
  toStoryRow,
} from "@newsplatform/db/testing";
import type { Revision } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { applyBatchResult } from "./apply-batch-result.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const earlier = new Date("2026-09-27T00:00:00.000Z");
const at = new Date("2026-09-27T08:00:00.000Z");

function revision(storyId: string, revisionNumber: number, publishedAt: Date): Revision {
  return {
    id: `${storyId}:rev-${revisionNumber}`,
    storyId,
    revisionNumber,
    title: `${storyId} 제목`,
    publishedAt,
    contradictionStatus: "단일 출처",
    promptVersions: {
      evidenceExtract: "e",
      claimGenerate: "c",
      gate: "g",
      contradictionLabel: "l",
    },
    modelId: "m",
    claims: [],
    sources: [],
  };
}

maybe("applyBatchResult", () => {
  it("배치 결과 반영은 개정판을 커밋하고 확인을 기록하고 보류를 표시·해제한다", async () => {
    const { db, sql, cleanup } = await createMigrationDb(url as string);
    try {
      // 발행·확인·실패 사건은 이전 배치에서 미뤄져 있었다. 미룸 사건은 처음 미뤄진다.
      for (const id of ["published", "confirmed", "failed", "deferred"]) {
        await db.insert(stories).values({
          ...toStoryRow({
            id,
            slug: id,
            title: id,
            topics: [],
            isDemo: false,
            lifecycle: "활성",
          }),
          deferred_at: id === "deferred" ? null : earlier,
        });
      }
      const previous = revision("confirmed", 1, earlier);
      await db.insert(storyRevisions).values({
        id: previous.id,
        story_id: previous.storyId,
        revision_number: 1,
        title: previous.title,
        published_at: earlier,
        checked_at: earlier,
        contradiction_status: previous.contradictionStatus,
        prompt_evidence_extract: "e",
        prompt_claim_generate: "c",
        prompt_gate: "g",
        prompt_contradiction_label: "l",
        model_id: "m",
        source_article_ids: [],
      });

      const next = revision("published", 1, at);
      const applied = await applyBatchResult(
        db,
        {
          revisions: [next],
          changes: [{ storyId: "published", revisionId: next.id, changes: [] }],
          confirmed: [{ storyId: "confirmed", revisionId: previous.id, checkedAt: at }],
          report: {
            failures: [{ storyId: "failed", reason: "모델 응답 불량" }],
            deferredStories: ["deferred"],
          },
        },
        { deferredAt: at },
      );
      expect(applied).toEqual({
        published: [{ storyId: "published", inserted: true }],
        publishFailures: [],
      });

      const revisions = await sql<{ id: string; checked_at: Date }[]>`
        select id, checked_at from story_revisions order by id
      `;
      expect(revisions.map((r) => [r.id, new Date(r.checked_at).toISOString()])).toEqual([
        [previous.id, at.toISOString()],
        [next.id, at.toISOString()],
      ]);
      const deferred = await sql<{ id: string; deferred_at: Date | null }[]>`
        select id, deferred_at from stories order by id
      `;
      expect(
        deferred.map((s) => [
          s.id,
          s.deferred_at === null ? null : new Date(s.deferred_at).toISOString(),
        ]),
      ).toEqual([
        ["confirmed", null],
        ["deferred", at.toISOString()],
        ["failed", null],
        ["published", null],
      ]);

      // 같은 결과를 다시 반영하면 개정판을 새로 넣지 않는다(멱등). 사건 행이 없으면 그 사건만 실패로 돌려준다.
      const again = await applyBatchResult(
        db,
        {
          revisions: [next, revision("missing", 1, at)],
          changes: [],
          confirmed: [],
          report: { failures: [], deferredStories: [] },
        },
        { deferredAt: at },
      );
      expect(again.published).toEqual([{ storyId: "published", inserted: false }]);
      expect(again.publishFailures.map((f) => f.storyId)).toEqual(["missing"]);
    } finally {
      await cleanup();
    }
  });
});
