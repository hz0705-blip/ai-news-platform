import { createRuntimeDb } from "@newstrail/db";

/**
 * 브라우저 회귀 테스트 전용. demo:load 뒤 실행하며 원본 데모는 공개 차단 검사용으로 보존한다.
 * 복제본은 fixture-* 식별자로 로컬 테스트 DB에만 넣는다. 운영 데이터 또는 환경 파일을 읽지 않는다.
 */
const url = process.env.DATABASE_E2E_URL;
if (!url) throw new Error("DATABASE_E2E_URL is required");
const target = new URL(url);
// postgres.js는 query의 database/host 등으로 URL 대상을 덮어쓸 수 있어 허용하지 않는다.
if (
  target.search !== "" ||
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  !/(?:test|e2e|repair|_ci$)/.test(target.pathname)
) {
  throw new Error(
    "E2E seed only accepts a local test, e2e, repair, or CI database without query options",
  );
}
const { sql } = createRuntimeDb({ DATABASE_URL: url });
try {
  await sql.begin(async (tx) => {
    // 순서는 FK 의존 순서. sources는 공유하며 픽스처의 가상 출처 표기도 보존한다.
    const demoStories = "select id from stories where is_demo = true";
    const demoArticles = `select id from articles where story_id in (${demoStories})`;
    const demoRevisions = `select id from story_revisions where story_id in (${demoStories})`;
    const tables = [
      ["stories", "is_demo = true"],
      ["articles", `story_id in (${demoStories})`],
      ["article_versions", `article_id in (${demoArticles})`],
      ["story_revisions", `story_id in (${demoStories})`],
      ["claims", `story_id in (${demoStories})`],
      ["claim_revisions", `story_revision_id in (${demoRevisions})`],
      [
        "evidence",
        `claim_revision_id in (select id from claim_revisions where story_revision_id in (${demoRevisions}))`,
      ],
      ["revision_changes", `story_revision_id in (${demoRevisions})`],
    ] as const;
    const snapshots = [];
    const ids = new Map<string, string>();
    for (const [table, predicate] of tables) {
      const rows = await tx.unsafe<{ row: Record<string, unknown> }[]>(
        `select row_to_json(t) as row from ${table} t where ${predicate}`,
      );
      snapshots.push({ table, rows });
      for (const { row } of rows) {
        const id = String(row.id);
        ids.set(id, id.includes("demo-") ? id.replaceAll("demo-", "fixture-") : `fixture-${id}`);
      }
    }
    for (const { table, rows } of snapshots) {
      const copies = rows.map(({ row }) => {
        // 정확한 식별자 값만 치환한다. 본문·발췌·출처 URL은 변경하지 않는다.
        const copy = JSON.parse(JSON.stringify(row), (_key, value) =>
          typeof value === "string" ? (ids.get(value) ?? value) : value,
        );
        if (table === "stories") {
          copy.is_demo = false;
          copy.slug = String(row.slug).replaceAll("demo-", "fixture-");
        }
        if (table === "articles") copy.normalized_url += "?e2e-fixture=1";
        return copy;
      });
      if (copies.length > 0) {
        const updates = Object.keys(copies[0])
          .filter((column) => column !== "id")
          .map((column) => `${column} = excluded.${column}`)
          .join(", ");
        await tx.unsafe(
          `insert into ${table} select * from json_populate_recordset(null::${table}, $1::json) on conflict (id) do update set ${updates}`,
          [JSON.stringify(copies)],
        );
      }
    }
  });
  const counts = await sql`select is_demo, count(*)::int as count from stories group by is_demo`;
  console.log(JSON.stringify({ e2eFixtures: counts }));
} finally {
  await sql.end();
}
