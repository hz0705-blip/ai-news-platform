ALTER TABLE "evidence" ADD COLUMN "differs_in" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "wire_id" text;--> statement-breakpoint
ALTER TABLE "story_revisions" ADD COLUMN "checked_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "articles_story_id_idx" ON "articles" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "evidence_claim_revision_id_idx" ON "evidence" USING btree ("claim_revision_id");--> statement-breakpoint
CREATE INDEX "story_revisions_story_id_idx" ON "story_revisions" USING btree ("story_id");