CREATE TABLE "article_rechecks" (
	"article_id" text NOT NULL,
	"slot" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"article_version_id" text,
	CONSTRAINT "article_rechecks_article_id_slot_pk" PRIMARY KEY("article_id","slot")
);
--> statement-breakpoint
CREATE TABLE "gnews_request_ledger" (
	"utc_date" text PRIMARY KEY NOT NULL,
	"discovery" integer DEFAULT 0 NOT NULL,
	"recheck" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_versions" ADD COLUMN "correction_candidate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "article_rechecks" ADD CONSTRAINT "article_rechecks_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_rechecks" ADD CONSTRAINT "article_rechecks_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_rechecks_checked_at_idx" ON "article_rechecks" USING btree ("checked_at");