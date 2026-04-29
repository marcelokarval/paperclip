ALTER TABLE "labels" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "issue_system_guidance" jsonb;
