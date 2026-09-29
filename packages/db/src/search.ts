import type { StoryLifecycle } from "@newsplatform/domain";
import { sql } from "drizzle-orm";
import type { RuntimeDb } from "./runtime.ts";

/** 검색 결과의 주장 발췌 하나(최신 발행 개정판의 주장 문장). `score`는 질의와의 코사인 유사도. */
export interface StorySearchClaim {
  readonly claimId: string;
  readonly text: string;
  readonly score: number;
}

/** 검색 결과 사건 하나(#125). 종료·데모 사건도 든다 — 화면이 `lifecycle`·`isDemo`로 배지를 붙인다. */
export interface StorySearchHit {
  readonly storyId: string;
  readonly slug: string;
  /** 최신 발행 개정판의 제목. */
  readonly title: string;
  /** 최신 발행 개정판의 발행 시각(사건 갱신). */
  readonly updatedAt: Date;
  readonly isDemo: boolean;
  readonly lifecycle: StoryLifecycle;
  /** 사건 점수 = max(제목 유사도, 가장 가까운 주장 유사도). */
  readonly score: number;
  /** 가장 가까운 주장 최대 3개(가까운 순). */
  readonly claims: readonly StorySearchClaim[];
}

/** 사건 제목·주장 각각의 HNSW 후보 수. `hnsw.ef_search`를 같이 올려 인덱스 스캔이 이만큼 돌려주게 한다. */
const CANDIDATES = 200;
const CLAIMS_PER_STORY = 3;

/**
 * 질의 임베딩으로 사건을 찾는다(스펙 "화면과 경험" 검색, #125). 사건 제목 임베딩과 주장 임베딩에서 각각 가까운 후보를 뽑고
 * 사건 단위로 묶어 점수(제목·주장 유사도의 최대값) 순으로 `limit`개를 돌려준다. 주장은 그 사건의 최신 발행 개정판에 있는
 * 주장만 센다(빠진 주장의 임베딩은 남아 있을 수 있다). 결과마다 최신 개정판의 가장 가까운 주장 최대 3개를 싣는다.
 */
export async function searchStoriesByEmbedding(
  db: RuntimeDb["db"],
  input: { readonly embedding: readonly number[]; readonly limit: number },
): Promise<StorySearchHit[]> {
  const vector = JSON.stringify(input.embedding);
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local hnsw.ef_search = ${CANDIDATES}`));
    const stories = await tx.execute<{
      story_id: string;
      slug: string;
      title: string;
      updated_at: Date | string;
      is_demo: boolean;
      lifecycle: StoryLifecycle;
      score: number;
    }>(sql`
      with latest as (
        select distinct on (story_id) id, story_id, title, published_at
        from story_revisions order by story_id, revision_number desc
      ),
      story_hits as (
        select story_id, 1 - (embedding <=> ${vector}::vector) as score
        from story_embeddings order by embedding <=> ${vector}::vector limit ${CANDIDATES}
      ),
      claim_hits as (
        select claim_id, 1 - (embedding <=> ${vector}::vector) as score
        from claim_embeddings order by embedding <=> ${vector}::vector limit ${CANDIDATES}
      ),
      hits as (
        select story_id, score from story_hits
        union all
        select l.story_id, ch.score from claim_hits ch
        join claim_revisions cr on cr.claim_id = ch.claim_id
        join latest l on l.id = cr.story_revision_id
      ),
      ranked as (select story_id, max(score) as score from hits group by story_id)
      select s.id as story_id, s.slug, l.title, l.published_at as updated_at, s.is_demo, s.lifecycle,
        r.score::float8 as score
      from ranked r
      join stories s on s.id = r.story_id
      join latest l on l.story_id = r.story_id
      order by r.score desc, s.id
      limit ${input.limit}
    `);
    if (stories.length === 0) return [];
    const ids = stories.map((s) => s.story_id);
    const claims = await tx.execute<{
      story_id: string;
      claim_id: string;
      text: string;
      score: number;
    }>(sql`
      with latest as (
        select distinct on (story_id) id, story_id
        from story_revisions
        where story_id = any(${`{${ids.map((id) => JSON.stringify(id)).join(",")}}`}::text[])
        order by story_id, revision_number desc
      ),
      scored as (
        select l.story_id, cr.claim_id, cr.text,
          (1 - (ce.embedding <=> ${vector}::vector))::float8 as score,
          row_number() over (partition by l.story_id order by ce.embedding <=> ${vector}::vector, cr.claim_id) as n
        from latest l
        join claim_revisions cr on cr.story_revision_id = l.id
        join claim_embeddings ce on ce.claim_id = cr.claim_id
      )
      select story_id, claim_id, text, score from scored where n <= ${CLAIMS_PER_STORY}
      order by story_id, n
    `);
    const byStory = new Map<string, StorySearchClaim[]>();
    for (const c of claims) {
      const list = byStory.get(c.story_id) ?? [];
      list.push({ claimId: c.claim_id, text: c.text, score: Number(c.score) });
      byStory.set(c.story_id, list);
    }
    return stories.map((s) => ({
      storyId: s.story_id,
      slug: s.slug,
      title: s.title,
      updatedAt: new Date(s.updated_at),
      isDemo: s.is_demo,
      lifecycle: s.lifecycle,
      score: Number(s.score),
      claims: byStory.get(s.story_id) ?? [],
    }));
  });
}
