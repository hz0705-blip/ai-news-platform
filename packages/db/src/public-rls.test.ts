import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMigrationDb, readTestDbUrl } from "./test-db.ts";

const url = readTestDbUrl();
const maybe = url === undefined ? describe.skip : describe;
if (url === undefined) process.stderr.write("DATABASE_TEST_URL 없음 — 실 DB 테스트 건너뜀\n");

const migration = readFileSync(new URL("../drizzle/0013_public_rls.sql", import.meta.url), "utf8");

async function withSql(
  run: (sql: Awaited<ReturnType<typeof createMigrationDb>>["sql"]) => Promise<void>,
) {
  const { sql, cleanup } = await createMigrationDb(url as string);
  try {
    await run(sql);
  } finally {
    await cleanup();
  }
}

/** public의 테이블(일반·분할) 중 RLS가 꺼진 것. 목록을 하드코딩하지 않아 새 테이블도 잡는다. */
const RLS_OFF = `
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
  order by c.relname`;

/** anon·authenticated가 권한을 하나라도 가진 public의 테이블·뷰·시퀀스. */
const GRANTED_RELATIONS = `
  select r.rolname, c.relname, c.relkind from pg_class c
  cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
  where c.relnamespace = 'public'::regnamespace and (
    (c.relkind in ('r', 'p', 'v', 'm', 'f') and (
      has_table_privilege(r.rolname, c.oid, 'SELECT') or has_table_privilege(r.rolname, c.oid, 'INSERT')
      or has_table_privilege(r.rolname, c.oid, 'UPDATE') or has_table_privilege(r.rolname, c.oid, 'DELETE')))
    or (c.relkind = 'S' and (
      has_sequence_privilege(r.rolname, c.oid, 'USAGE') or has_sequence_privilege(r.rolname, c.oid, 'SELECT')
      or has_sequence_privilege(r.rolname, c.oid, 'UPDATE'))))
  order by 1, 2`;

maybe("public 스키마 Data API 차단(0013)", () => {
  it("마이그레이션 뒤 public의 모든 테이블은 RLS가 켜져 있다", async () => {
    await withSql(async (sql) => {
      const tables = await sql`
        select count(*)::int as n from pg_class
        where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')`;
      expect(tables[0]?.n).toBeGreaterThan(0);
      expect(await sql.unsafe(RLS_OFF)).toEqual([]);
    });
  });

  it("anon·authenticated가 없는 DB에서도 0013이 돌고, 다시 돌려도 안전하다", async () => {
    await withSql(async (sql) => {
      expect(
        await sql`select rolname from pg_roles where rolname in ('anon', 'authenticated')`,
      ).toEqual([]);
      const rollback = new Error("rollback");
      await expect(
        sql.begin(async (tx) => {
          await tx.unsafe(migration);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
  });

  it("Supabase 기본 권한을 흉내 낸 anon·authenticated는 0013 뒤 public 테이블·시퀀스·함수와 새 객체에 권한이 없다", async () => {
    await withSql(async (sql) => {
      const rollback = new Error("rollback");
      await expect(
        sql.begin(async (tx) => {
          // 역할·권한은 트랜잭션 안에서만 만들고 되돌린다(프로덕션 Supabase와 같은 기본 권한).
          await tx`create role anon nologin`;
          await tx`create role authenticated nologin`;
          await tx`create sequence public.rls_probe_seq`;
          await tx`create function public.rls_probe_fn() returns int language sql as 'select 1'`;
          for (const kind of ["tables", "sequences", "functions"]) {
            await tx.unsafe(`grant all on all ${kind} in schema public to anon, authenticated`);
            await tx.unsafe(
              `alter default privileges in schema public grant all on ${kind} to anon, authenticated`,
            );
          }
          expect((await tx.unsafe(GRANTED_RELATIONS)).length).toBeGreaterThan(0);

          await tx.unsafe(migration);
          await tx.unsafe(migration); // 다시 돌려도 안전하다

          expect(await tx.unsafe(RLS_OFF)).toEqual([]);
          expect(await tx.unsafe(GRANTED_RELATIONS)).toEqual([]);
          const fnGrants = await tx`
            select p.proname, a.grantee::regrole::text as grantee
            from pg_proc p cross join lateral aclexplode(p.proacl) a
            where p.pronamespace = 'public'::regnamespace
              and a.grantee in ('anon'::regrole, 'authenticated'::regrole)`;
          expect(fnGrants).toEqual([]);

          // 이후 만드는 객체에도 기본 권한이 붙지 않는다.
          await tx`create table public.rls_probe_after (id int)`;
          await tx`create sequence public.rls_probe_after_seq`;
          await tx`create function public.rls_probe_after_fn() returns int language sql as 'select 1'`;
          const after = await tx.unsafe(GRANTED_RELATIONS);
          expect(after).toEqual([]);
          const acl = await tx`
            select defaclacl::text as acl from pg_default_acl
            where defaclnamespace = 'public'::regnamespace
              and (defaclacl::text like '%anon=%' or defaclacl::text like '%authenticated=%')`;
          expect(acl).toEqual([]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);

      expect(
        await sql`select rolname from pg_roles where rolname in ('anon', 'authenticated')`,
      ).toEqual([]);
    });
  });
});
