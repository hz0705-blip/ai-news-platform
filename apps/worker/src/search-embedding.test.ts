import { commitRevision } from "@newstrail/db";
import {
  claimEmbeddings,
  createMigrationDb,
  EMBEDDING_DIMENSIONS,
  readTestDbUrl,
  stories,
  storyEmbeddings,
  toStoryRow,
} from "@newstrail/db/testing";
import type { Revision } from "@newstrail/domain";
import type { EmbeddingClient } from "@newstrail/pipeline";
import { describe, expect, it } from "vitest";
import { fillSearchEmbeddings } from "./search-embedding.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const at = new Date("2026-09-27T08:00:00.000Z");

/** 받은 문장을 기록하고 문장마다 결정론 벡터를 돌려주는 스텁. */
function recordingEmbeddingClient(): EmbeddingClient & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts) {
      calls.push([...texts]);
      return {
        vectors: texts.map((text) =>
          Array.from({ length: EMBEDDING_DIMENSIONS }, (_, k) =>
            k === text.length % EMBEDDING_DIMENSIONS ? 1 : 0,
          ),
        ),
        usage: { tokens: texts.length, spend: texts.length * 1e-8 },
      };
    },
  };
}

function revision(
  storyId: string,
  revisionNumber: number,
  title: string,
  claims: readonly { readonly id: string; readonly text: string }[],
): Revision {
  return {
    id: `${storyId}:rev-${revisionNumber}`,
    storyId,
    revisionNumber,
    title,
    publishedAt: at,
    contradictionStatus: "단일 출처",
    promptVersions: {
      evidenceExtract: "e",
      claimGenerate: "c",
      gate: "g",
      contradictionLabel: "l",
    },
    modelId: "m",
    claims: claims.map((c, order) => ({
      id: c.id,
      text: c.text,
      claimType: "보도된 사실",
      modality: "단정",
      order,
      contradictionStatus: "단일 출처",
      evidence: [],
    })),
    sources: [],
  };
}

async function seedStory(db: Awaited<ReturnType<typeof createMigrationDb>>["db"], id: string) {
  await db.insert(stories).values(
    toStoryRow({
      id,
      slug: id,
      title: id,
      topics: [],
      isDemo: id.startsWith("demo"),
      lifecycle: "활성",
    }),
  );
}

async function storedTexts(db: Awaited<ReturnType<typeof createMigrationDb>>["db"]) {
  const storyRows = await db
    .select({ id: storyEmbeddings.story_id, text: storyEmbeddings.text })
    .from(storyEmbeddings);
  const claimRows = await db
    .select({ id: claimEmbeddings.claim_id, text: claimEmbeddings.text })
    .from(claimEmbeddings);
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  return { stories: storyRows.sort(byId), claims: claimRows.sort(byId) };
}

maybe("검색 임베딩 채우기", () => {
  it("reuses embeddings for unchanged claim text in a new revision", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedStory(db, "s");
      await commitRevision(db, {
        revision: revision("s", 1, "호르무즈 제안", [
          { id: "s:a", text: "이란이 제안했다" },
          { id: "s:b", text: "미국이 거절했다" },
        ]),
      });
      const client = recordingEmbeddingClient();
      const first = await fillSearchEmbeddings({ db, embeddingClient: client });
      expect(first).toMatchObject({ targets: 3, reused: 0, embedded: 3 });
      expect(client.calls).toEqual([["호르무즈 제안", "이란이 제안했다", "미국이 거절했다"]]);

      // 같은 제목·같은 문장의 새 개정판(주장 하나는 새 식별자, 문장은 같다) — 임베딩 호출 없음.
      await commitRevision(db, {
        revision: revision("s", 2, "호르무즈 제안", [
          { id: "s:a", text: "이란이 제안했다" },
          { id: "s:c", text: "미국이 거절했다" },
        ]),
      });
      client.calls.length = 0;
      const second = await fillSearchEmbeddings({ db, embeddingClient: client });
      expect(second).toMatchObject({ targets: 1, reused: 1, embedded: 0 });
      expect(client.calls).toEqual([]);

      // 바뀐 제목·바뀐 주장만 임베딩한다.
      await commitRevision(db, {
        revision: revision("s", 3, "호르무즈 제안 거절", [
          { id: "s:a", text: "이란이 수정 제안했다" },
          { id: "s:c", text: "미국이 거절했다" },
        ]),
      });
      client.calls.length = 0;
      await fillSearchEmbeddings({ db, embeddingClient: client });
      expect(client.calls).toEqual([["호르무즈 제안 거절", "이란이 수정 제안했다"]]);
      expect(await storedTexts(db)).toEqual({
        stories: [{ id: "s", text: "호르무즈 제안 거절" }],
        claims: [
          { id: "s:a", text: "이란이 수정 제안했다" },
          { id: "s:b", text: "미국이 거절했다" },
          { id: "s:c", text: "미국이 거절했다" },
        ],
      });
    } finally {
      await cleanup();
    }
  });

  it("backfill fills only missing embeddings and is idempotent", async () => {
    const { db, cleanup } = await createMigrationDb(url as string);
    try {
      await seedStory(db, "live");
      await seedStory(db, "demo-1");
      await seedStory(db, "unpublished");
      await commitRevision(db, {
        revision: revision("live", 1, "라이브 사건", [{ id: "live:a", text: "라이브 주장" }]),
      });
      const client = recordingEmbeddingClient();
      await fillSearchEmbeddings({ db, embeddingClient: client });
      // 뒤에 발행된 데모 사건만 비어 있다.
      await commitRevision(db, {
        revision: revision("demo-1", 1, "데모 사건", [{ id: "demo-1:a", text: "데모 주장" }]),
      });

      client.calls.length = 0;
      const filled = await fillSearchEmbeddings({ db, embeddingClient: client });
      expect(filled).toMatchObject({ targets: 2, embedded: 2 });
      expect(client.calls).toEqual([["데모 사건", "데모 주장"]]);

      client.calls.length = 0;
      const again = await fillSearchEmbeddings({ db, embeddingClient: client });
      expect(again).toMatchObject({ targets: 0, reused: 0, embedded: 0 });
      expect(client.calls).toEqual([]);
      expect((await storedTexts(db)).stories.map((s) => s.id)).toEqual(["demo-1", "live"]);
    } finally {
      await cleanup();
    }
  });
});
