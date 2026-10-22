-- Announcements to email sign-ups and their deliveries (D-040).
CREATE TABLE "announcement_deliveries" (
	"announcement_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_deliveries_announcement_id_subscriber_id_pk" PRIMARY KEY("announcement_id","subscriber_id"),
	CONSTRAINT "announcement_deliveries_status_check" CHECK ("announcement_deliveries"."status" in ('sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "announcements_status_check" CHECK ("announcements"."status" in ('sending', 'finished', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_deliveries_sent_idx" ON "announcement_deliveries" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "announcements_site_idx" ON "announcements" USING btree ("site_id","created_at");