CREATE TABLE "article_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"body" text NOT NULL,
	"normalization_version" integer NOT NULL,
	"body_hash" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"body_expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"story_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"topic" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"story_revision_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"display_order" integer NOT NULL,
	"text" text NOT NULL,
	"claim_type" text NOT NULL,
	"modality" text NOT NULL,
	"contradiction_status" text NOT NULL,
	CONSTRAINT "claim_revisions_story_revision_id_claim_id_unique" UNIQUE("story_revision_id","claim_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_revision_id" text NOT NULL,
	"display_order" integer NOT NULL,
	"article_id" text NOT NULL,
	"article_version_id" text NOT NULL,
	"source_id" text NOT NULL,
	"span_start" integer NOT NULL,
	"span_end" integer NOT NULL,
	"offset_unit" text NOT NULL,
	"normalization_version" integer NOT NULL,
	"span_text" text NOT NULL,
	"span_hash" text NOT NULL,
	"excerpt" text NOT NULL,
	"excerpt_start" integer NOT NULL,
	"excerpt_end" integer NOT NULL,
	"highlight_start" integer NOT NULL,
	"highlight_end" integer NOT NULL,
	"source_url" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rights_tier" text NOT NULL,
	"region" text NOT NULL,
	"ownership" text NOT NULL,
	"language" text NOT NULL,
	"is_fictional" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"topics" text[] NOT NULL,
	"is_demo" boolean NOT NULL,
	"lifecycle" text NOT NULL,
	CONSTRAINT "stories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "story_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"contradiction_status" text NOT NULL,
	"prompt_evidence_extract" text NOT NULL,
	"prompt_claim_generate" text NOT NULL,
	"prompt_contradiction_label" text NOT NULL,
	"model_id" text NOT NULL,
	CONSTRAINT "story_revisions_story_id_revision_number_unique" UNIQUE("story_id","revision_number")
);
--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_revisions" ADD CONSTRAINT "claim_revisions_story_revision_id_story_revisions_id_fk" FOREIGN KEY ("story_revision_id") REFERENCES "public"."story_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_revisions" ADD CONSTRAINT "claim_revisions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_revision_id_claim_revisions_id_fk" FOREIGN KEY ("claim_revision_id") REFERENCES "public"."claim_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_article_version_id_article_versions_id_fk" FOREIGN KEY ("article_version_id") REFERENCES "public"."article_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_revisions" ADD CONSTRAINT "story_revisions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;