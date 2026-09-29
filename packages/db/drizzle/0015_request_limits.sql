CREATE TABLE "request_budgets" (
	"kind" text NOT NULL,
	"kst_date" text NOT NULL,
	"reserved_usd" double precision DEFAULT 0 NOT NULL,
	"spent_usd" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "request_budgets_kind_kst_date_pk" PRIMARY KEY("kind","kst_date")
);
--> statement-breakpoint
ALTER TABLE "request_budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "request_counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "request_counters_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "request_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "request_leases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "request_counters_expires_at_idx" ON "request_counters" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "request_leases_key_idx" ON "request_leases" USING btree ("key");