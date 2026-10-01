import { randomUUID } from "node:crypto";
import { createRuntimeDb } from "@newstrail/db";

/** 팔로우한 뒤에 두 번째 개정판을 발행하는 실제 DB 사건. 테스트마다 식별자를 분리한다. */
export async function stageFollowStory() {
  const url = process.env.DATABASE_E2E_URL;
  if (!url) throw new Error("DATABASE_E2E_URL is required for follow publication E2E");
  const target = new URL(url);
  if (
    target.search ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    !/(?:test|e2e|_ci$)/.test(target.pathname)
  ) {
    throw new Error("Follow E2E only writes to a local test database without query options");
  }
  const { sql } = createRuntimeDb({ DATABASE_URL: url });
  const slug = `fixture-follow-${randomUUID()}`;
  const original = "select id from stories where slug = 'fixture-3-correction'";
  const articles = `select id from articles where story_id in (${original})`;
  const revisions = `select id from story_revisions where story_id in (${original})`;
  const claims = `select id from claim_revisions where story_revision_id in (${revisions})`;
  const tables = [
    ["stories", `id in (${original})`],
    ["articles", `story_id in (${original})`],
    ["article_versions", `article_id in (${articles})`],
    ["story_revisions", `story_id in (${original})`],
    ["claims", `story_id in (${original})`],
    ["claim_revisions", `story_revision_id in (${revisions})`],
    ["evidence", `claim_revision_id in (${claims})`],
    ["revision_changes", `story_revision_id in (${revisions})`],
  ] as const;
  try {
    const snapshots: { table: string; rows: Record<string, unknown>[] }[] = [];
    const ids = new Map<string, string>();
    for (const [table, predicate] of tables) {
      const rows = await sql.unsafe<{ row: Record<string, unknown> }[]>(
        `select row_to_json(t) as row from ${table} t where ${predicate}`,
      );
      snapshots.push({ table, rows: rows.map(({ row }) => row) });
      for (const { row } of rows) ids.set(String(row.id), `${slug}:${row.id}`);
    }
    if (snapshots[0]?.rows.length !== 1) throw new Error("Follow fixture is not seeded");
    const second = new Set<string>();
    for (const snapshot of snapshots) {
      snapshot.rows = snapshot.rows.map((row) => {
        const copy: Record<string, unknown> = JSON.parse(JSON.stringify(row), (_key, value) =>
          typeof value === "string" ? (ids.get(value) ?? value) : value,
        );
        if (snapshot.table === "stories") copy.slug = slug;
        if (snapshot.table === "articles") copy.normalized_url += `&follow-test=${slug}`;
        if (
          copy.revision_number === 2 ||
          second.has(String(copy.story_revision_id)) ||
          second.has(String(copy.claim_revision_id))
        )
          second.add(String(copy.id));
        return copy;
      });
    }
    const publish = async (next: boolean) => {
      await sql.begin(async (tx) => {
        for (const { table, rows } of snapshots) {
          const selected = rows.filter((row) => second.has(String(row.id)) === next);
          if (selected.length > 0)
            await tx.unsafe(
              `insert into ${table} select * from json_populate_recordset(null::${table}, $1::json)`,
              [JSON.stringify(selected)],
            );
        }
      });
    };
    await publish(false);
    return {
      slug,
      storyId: String(snapshots[0]?.rows[0]?.id),
      revision1: ids.get("fixture-3-correction:rev-1") ?? "",
      revision2: ids.get("fixture-3-correction:rev-2") ?? "",
      publishNext: () => publish(true),
      async close() {
        try {
          const storyId = String(snapshots[0]?.rows[0]?.id);
          await sql.begin(async (tx) => {
            await tx`delete from last_seen_revisions where story_id = ${storyId}`;
            await tx`delete from story_follows where story_id = ${storyId}`;
            for (const { table, rows } of [...snapshots].reverse()) {
              await tx.unsafe(`delete from ${table} where id = any($1::text[])`, [
                rows.map((row) => String(row.id)),
              ]);
            }
          });
        } finally {
          await sql.end();
        }
      },
    };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
