ALTER TABLE "articles" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "centroid" vector(1536);--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "last_new_report_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "last_processed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "articles_embedding_hnsw_idx" ON "articles" USING hnsw ("embedding" vector_cosine_ops);