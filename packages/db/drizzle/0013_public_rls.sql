-- 공개 스키마 Data API 차단(#110): public의 모든 테이블은 RLS를 켜고 정책을 두지 않으며, anon·authenticated는 public에 권한이 없다.
-- 앱 연결(테이블 소유자 postgres)은 RLS를 거치지 않으므로 영향이 없다. 아래 ENABLE은 drizzle-kit이 스키마의 enableRLS()에서 만든 것이다.
ALTER TABLE "article_rechecks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "article_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "articles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "batch_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claim_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gnews_request_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revision_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "story_revisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Supabase 기본 권한이 anon·authenticated에 준 public의 테이블·시퀀스·함수 권한을 회수하고, 이후 만들 객체의 기본 권한도 회수한다.
-- 두 역할은 Supabase에만 있으므로 테스트·CI의 앱 DB(pgvector 컨테이너)에서는 건너뛴다. service_role·auth·storage·pgboss는 건드리지 않는다.
-- 함수 중 소유자가 다른 것(Supabase의 pgvector 함수, 소유자 supabase_admin)은 postgres가 회수할 수 없어 경고만 남는다.
-- supabase_admin의 기본 권한은 postgres가 바꿀 수 없으므로(권한 없음) 그 경우 건너뛴다. 다시 실행해도 안전하다.
DO $$
DECLARE
  grantee text;
  creator text;
BEGIN
  FOREACH grantee IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = grantee) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', grantee);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', grantee);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', grantee);
      FOREACH creator IN ARRAY ARRAY[current_user::text, 'postgres', 'supabase_admin'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = creator) THEN
          BEGIN
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', creator, grantee);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', creator, grantee);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', creator, grantee);
          EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'default privileges of % not changed (insufficient privilege)', creator;
          END;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
