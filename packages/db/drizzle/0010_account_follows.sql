CREATE TABLE "last_seen_revisions" (
	"user_id" uuid NOT NULL,
	"story_id" text NOT NULL,
	"revision_id" text NOT NULL,
	CONSTRAINT "last_seen_revisions_user_id_story_id_pk" PRIMARY KEY("user_id","story_id")
);
--> statement-breakpoint
ALTER TABLE "last_seen_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "story_follows" (
	"user_id" uuid NOT NULL,
	"story_id" text NOT NULL,
	CONSTRAINT "story_follows_user_id_story_id_pk" PRIMARY KEY("user_id","story_id")
);
--> statement-breakpoint
ALTER TABLE "story_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "topic_follows" (
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	CONSTRAINT "topic_follows_user_id_topic_pk" PRIMARY KEY("user_id","topic")
);
--> statement-breakpoint
ALTER TABLE "topic_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "last_seen_revisions" ADD CONSTRAINT "last_seen_revisions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_seen_revisions" ADD CONSTRAINT "last_seen_revisions_revision_id_story_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."story_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_follows" ADD CONSTRAINT "story_follows_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;