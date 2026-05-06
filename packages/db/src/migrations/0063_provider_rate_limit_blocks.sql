CREATE TABLE IF NOT EXISTS "provider_rate_limit_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"adapter_type" text NOT NULL,
	"limit_kind" text NOT NULL,
	"model_family" text,
	"resets_at" timestamp with time zone NOT NULL,
	"source_run_id" uuid,
	"source_issue_id" uuid,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_rate_limit_blocks_company_id_companies_id_fk') THEN
  ALTER TABLE "provider_rate_limit_blocks" ADD CONSTRAINT "provider_rate_limit_blocks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_rate_limit_blocks_source_run_id_heartbeat_runs_id_fk') THEN
  ALTER TABLE "provider_rate_limit_blocks" ADD CONSTRAINT "provider_rate_limit_blocks_source_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_rate_limit_blocks_source_issue_id_issues_id_fk') THEN
  ALTER TABLE "provider_rate_limit_blocks" ADD CONSTRAINT "provider_rate_limit_blocks_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_rate_limit_blocks_company_active_idx" ON "provider_rate_limit_blocks" USING btree ("company_id","released_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_rate_limit_blocks_active_uq" ON "provider_rate_limit_blocks" USING btree ("company_id","provider","adapter_type","limit_kind",coalesce("model_family", '')) WHERE "released_at" IS NULL;
