-- Scheduled publishing (D-054): one waiting schedule per site, published by the dashboard Worker's cron.
CREATE TABLE "scheduled_publishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"items" jsonb NOT NULL,
	"confirm_logo_change" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "scheduled_publishes_status_check" CHECK ("scheduled_publishes"."status" in ('scheduled', 'running', 'published', 'cancelled', 'blocked', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "scheduled_publishes" ADD CONSTRAINT "scheduled_publishes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_publishes" ADD CONSTRAINT "scheduled_publishes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_publishes_one_waiting" ON "scheduled_publishes" USING btree ("site_id") WHERE "scheduled_publishes"."status" in ('scheduled', 'running');--> statement-breakpoint
CREATE INDEX "scheduled_publishes_due_idx" ON "scheduled_publishes" USING btree ("status","run_at");