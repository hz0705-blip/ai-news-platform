CREATE TABLE "revision_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"story_revision_id" text NOT NULL,
	"display_order" integer NOT NULL,
	"kind" text NOT NULL,
	"claim_change" text,
	"claim_id" text,
	"lineage_claim_id" text,
	"previous_text" text,
	"current_text" text,
	"previous_status" text,
	"current_status" text,
	"article_id" text,
	"article_version_id" text
);
--> statement-breakpoint
ALTER TABLE "story_revisions" ADD COLUMN "source_article_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "revision_changes" ADD CONSTRAINT "revision_changes_story_revision_id_story_revisions_id_fk" FOREIGN KEY ("story_revision_id") REFERENCES "public"."story_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_changes" ADD CONSTRAINT "revision_changes_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_changes" ADD CONSTRAINT "revision_changes_lineage_claim_id_claims_id_fk" FOREIGN KEY ("lineage_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_changes" ADD CONSTRAINT "revision_changes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_changes" ADD CONSTRAINT "revision_changes_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revision_changes_story_revision_id_idx" ON "revision_changes" USING btree ("story_revision_id");--> statement-breakpoint
-- 기존 개정판의 출처 구획은 지금까지 읽기 때 그 사건의 기사 전부로 만들었다. 같은 값을 고정해 둔다(#85). 기존 개정판에는 변화 행을 만들지 않는다.
UPDATE "story_revisions" SET "source_article_ids" = coalesce((SELECT array_agg("articles"."id" ORDER BY "articles"."published_at", "articles"."id") FROM "articles" WHERE "articles"."story_id" = "story_revisions"."story_id"), '{}');
