import type { StoryLifecycle } from "@newstrail/domain";
import { describe, expect, it } from "vitest";
import type { RuntimeDb } from "./runtime.ts";
import {
  claimEmbeddings,
  claimRevisions,
  claims,
  stories,
  storyEmbeddings,
  storyRevisions,
} from "./schema/index.ts";
import { searchStoriesByEmbedding } from "./search.ts";
import { createMigrationDb, EMBEDDING_DIMENSIONS, readTestDbUrl } from "./test-db.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

/** 고정 벡터: 축 `axis`에 `1`, 축 `axis + 1`에 `tilt`(질의와의 각도를 조절). */
function vec(axis: number, tilt = 0): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  v[axis] = 1;
  v[axis + 1] = tilt;
  return v;
}

const baseRevision = {
  contradiction_status: "단일 출처" as const,
  prompt_evidence_extract: "evidence-extract@1",
  prompt_claim_generate: "claim-generate@1",
  prompt_gate: "gate@1",
  prompt_contradiction_label: "contradiction-label@1",
  model_id: "test-model",
};

/** 사건 하나(개정판 1..n)와 최신 개정판의 주장들. 주장 `stale`은 첫 개정판에만 있다(최신에서 빠진 주장). */
async function seedStory(
  db: RuntimeDb["db"],
  slug: string,
  options: {
    readonly title: number[];
    readonly claims: readonly { readonly id: string; readonly embedding: number[] }[];
    readonly stale?: { readonly id: string; readonly embedding: number[] };
    readonly isDemo?: boolean;
    readonly lifecycle?: StoryLifecycle;
  },
): Promise<void> {
  const storyId = `story-${slug}`;
  await db.insert(stories).values({
    id: storyId,
    slug,
    title: slug,
    topics: ["국제 정치·외교·안보"],
    is_demo: options.isDemo ?? false,
    lifecycle: options.lifecycle ?? "활성",
  });
  const revisions = options.stale === undefined ? 1 : 2;
  for (let n = 1; n <= revisions; n += 1) {
    await db.insert(storyRevisions).values({
      ...baseRevision,
      id: `${slug}:rev-${n}`,
      story_id: storyId,
      revision_number: n,
      title: `${slug} 제목 ${n}`,
      published_at: new Date(Date.UTC(2026, 8, 20, n)),
    });
  }
  await db.insert(storyEmbeddings).values({
    story_id: storyId,
    text: `${slug} 제목 ${revisions}`,
    embedding: options.title,
  });
  if (options.stale !== undefined) {
    await db.insert(claims).values({ id: options.stale.id, story_id: storyId });
    await db.insert(claimRevisions).values({
      id: `${slug}:rev-1/${options.stale.id}`,
      story_revision_id: `${slug}:rev-1`,
      claim_id: options.stale.id,
      display_order: 0,
      text: `${options.stale.id} 문장`,
      claim_type: "보도된 사실",
      modality: "단정",
      contradiction_status: "단일 출처",
    });
    await db.insert(claimEmbeddings).values({
      claim_id: options.stale.id,
      text: `${options.stale.id} 문장`,
      embedding: options.stale.embedding,
    });
  }
  for (const [i, claim] of options.claims.entries()) {
    await db.insert(claims).values({ id: claim.id, story_id: storyId });
    await db.insert(claimRevisions).values({
      id: `${slug}:rev-${revisions}/${claim.id}`,
      story_revision_id: `${slug}:rev-${revisions}`,
      claim_id: claim.id,
      display_order: i,
      text: `${claim.id} 문장`,
      claim_type: "보도된 사실",
      modality: "단정",
      contradiction_status: "단일 출처",
    });
    await db.insert(claimEmbeddings).values({
      claim_id: claim.id,
      text: `${claim.id} 문장`,
      embedding: claim.embedding,
    });
  }
}

async function withDb(run: (db: RuntimeDb["db"]) => Promise<void>) {
  const { db, cleanup } = await createMigrationDb(url as string);
  try {
    await run(db);
  } finally {
    await cleanup();
  }
}

maybe("의미 검색(사건 제목·주장 임베딩)", () => {
  it("search returns nearest stories first without duplicates", async () => {
    await withDb(async (db) => {
      // near: 제목과 주장 둘 다 질의(축 0)에 가깝다 — 사건 하나로만 나와야 한다.
      await seedStory(db, "near", {
        title: vec(0, 0.1),
        claims: [
          { id: "near-c1", embedding: vec(0, 0.05) },
          { id: "near-c2", embedding: vec(0, 0.3) },
        ],
      });
      // mid: 제목은 멀고 주장 하나만 가깝다 — 점수는 주장 유사도.
      await seedStory(db, "mid", {
        title: vec(10),
        claims: [{ id: "mid-c1", embedding: vec(0, 1) }],
        lifecycle: "종료",
      });
      await seedStory(db, "far", {
        title: vec(20),
        claims: [{ id: "far-c1", embedding: vec(30) }],
      });

      await seedStory(db, "demo-nearest", { title: vec(0), claims: [], isDemo: true });
      const hits = await searchStoriesByEmbedding(db, { embedding: vec(0), limit: 20 });
      expect(hits.map((h) => h.slug)).toEqual(["near", "mid", "far"]);
      expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);
      expect(hits[0]?.title).toBe("near 제목 1");
      // 종료된 실제 사건은 계속 검색된다.
      expect(hits[1]).toMatchObject({ isDemo: false, lifecycle: "종료" });

      const top = await searchStoriesByEmbedding(db, { embedding: vec(0), limit: 1 });
      expect(top.map((h) => h.slug)).toEqual(["near"]);
    });
  });

  it("search result includes closest claims", async () => {
    await withDb(async (db) => {
      await seedStory(db, "s", {
        title: vec(5),
        claims: [
          { id: "c-far", embedding: vec(40) },
          { id: "c-near", embedding: vec(0, 0.1) },
          { id: "c-mid", embedding: vec(0, 1) },
          { id: "c-mid2", embedding: vec(0, 2) },
        ],
        // 최신 개정판에서 빠진 주장은 질의에 가장 가까워도 싣지 않는다.
        stale: { id: "c-stale", embedding: vec(0) },
      });
      const [hit] = await searchStoriesByEmbedding(db, { embedding: vec(0), limit: 20 });
      expect(hit?.title).toBe("s 제목 2");
      expect(hit?.updatedAt).toEqual(new Date(Date.UTC(2026, 8, 20, 2)));
      expect(hit?.claims.map((c) => c.claimId)).toEqual(["c-near", "c-mid", "c-mid2"]);
      expect(hit?.claims[0]?.text).toBe("c-near 문장");
    });
  });
});
