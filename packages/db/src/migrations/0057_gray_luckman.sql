ALTER TABLE "cost_events" DROP CONSTRAINT "cost_events_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "cost_events" DROP CONSTRAINT "cost_events_heartbeat_run_id_heartbeat_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "cost_events" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_heartbeat_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("heartbeat_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;