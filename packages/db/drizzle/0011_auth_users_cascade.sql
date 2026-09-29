-- 계정 데이터의 소유자 FK(#105, 스펙 "계정" 계정 삭제): user_id → auth.users(id) ON DELETE CASCADE.
-- auth.users는 Supabase Auth가 소유하는 테이블이라 Drizzle 스키마에 두지 않는다. 프로덕션(Supabase)에는 늘 있고,
-- 테스트·CI의 앱 DB(pgvector 컨테이너)에는 auth 스키마가 없으므로 auth.users가 있을 때만 FK를 건다(docs/agents/project.md).
-- 이미 걸려 있으면 건너뛴다(다시 실행해도 안전하다).
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_follows_user_id_auth_users_fk') THEN
      ALTER TABLE "story_follows" ADD CONSTRAINT "story_follows_user_id_auth_users_fk"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topic_follows_user_id_auth_users_fk') THEN
      ALTER TABLE "topic_follows" ADD CONSTRAINT "topic_follows_user_id_auth_users_fk"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'last_seen_revisions_user_id_auth_users_fk') THEN
      ALTER TABLE "last_seen_revisions" ADD CONSTRAINT "last_seen_revisions_user_id_auth_users_fk"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
