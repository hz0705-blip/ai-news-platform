ALTER TABLE "articles" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "is_link_only" boolean DEFAULT false NOT NULL;