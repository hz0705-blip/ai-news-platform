import { createMigrationSql } from "./migration-connection.ts";

/**
 * pgvector·HNSW 게이트(스펙 M0 운영 인수). 확장 버전 조회 → 임시 테이블에 소차원 벡터 열과
 * HNSW 인덱스 생성 → 최근접 질의 → 트랜잭션 종료로 삭제 → JSON 출력.
 * 차원 3은 게이트 전용이며 실제 임베딩 차원(리서치 대기 #7)과 무관하다.
 */
const DIMENSIONS = 3;

interface GateResult {
  readonly pgvectorVersion: string;
  readonly hnswIndexCreated: true;
  readonly dimensions: number;
  readonly nearest: string | null;
}

const sql = createMigrationSql(process.env);

try {
  const result = await sql.begin(async (tx): Promise<GateResult> => {
    const extensions = await tx<{ extversion: string }[]>`
      select extversion from pg_extension where extname = 'vector'
    `;
    const extension = extensions[0];
    if (extension === undefined) {
      throw new Error("vector 확장이 활성화되어 있지 않다. 먼저 pnpm db:migrate를 실행한다.");
    }
    await tx`create temp table pgvector_gate (embedding vector(3)) on commit drop`;
    await tx`create index pgvector_gate_hnsw on pgvector_gate using hnsw (embedding vector_cosine_ops)`;
    await tx`insert into pgvector_gate (embedding) values ('[1,0,0]'), ('[0,1,0]'), ('[0,0,1]')`;
    const nearestRows = await tx<{ embedding: string }[]>`
      select embedding::text as embedding
      from pgvector_gate
      order by embedding <=> '[0.9,0.1,0]'
      limit 1
    `;
    return {
      pgvectorVersion: extension.extversion,
      hnswIndexCreated: true,
      dimensions: DIMENSIONS,
      nearest: nearestRows[0]?.embedding ?? null,
    };
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ gate: "pgvector", error: String(error) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
