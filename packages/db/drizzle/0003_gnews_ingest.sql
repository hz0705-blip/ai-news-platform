ALTER TABLE "articles" ALTER COLUMN "story_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "normalized_url" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "topics" text[];--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "external_id" text;--> statement-breakpoint
UPDATE "articles" SET "normalized_url" = regexp_replace(regexp_replace(regexp_replace("url", '[?#].*$', ''), '^(https?)://(www\.)?', '\1://'), '/+$', ''), "topics" = ARRAY["topic"];--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "normalized_url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "topics" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" DROP COLUMN "topic";--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_body_hash_unique" UNIQUE("article_id","body_hash");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_normalized_url_unique" UNIQUE("normalized_url");--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_external_id_unique" UNIQUE("external_id");
