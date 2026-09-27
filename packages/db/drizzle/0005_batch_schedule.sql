CREATE TABLE "batch_runs" (
	"slot_key" text PRIMARY KEY NOT NULL,
	"slot_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"attempt" integer NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"spend_usd" double precision NOT NULL,
	"report" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "deferred_at" timestamp with time zone;--> statement-breakpoint
-- 기존 개정판은 모두 게이트 2단계 프롬프트 gate@1로 만들어졌다(#54). 채운 뒤 기본값을 뗀다.
ALTER TABLE "story_revisions" ADD COLUMN "prompt_gate" text NOT NULL DEFAULT 'gate@1';--> statement-breakpoint
ALTER TABLE "story_revisions" ALTER COLUMN "prompt_gate" DROP DEFAULT;
