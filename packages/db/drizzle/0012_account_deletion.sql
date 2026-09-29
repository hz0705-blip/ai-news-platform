CREATE TABLE "account_deletion_pending" (
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"revocation_token" text,
	"request_key" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_deletion_pending_provider_provider_subject_pk" PRIMARY KEY("provider","provider_subject")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_pending" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "account_deletion_pending_next_attempt_at_idx" ON "account_deletion_pending" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "account_deletion_pending_request_key_idx" ON "account_deletion_pending" USING btree ("request_key");