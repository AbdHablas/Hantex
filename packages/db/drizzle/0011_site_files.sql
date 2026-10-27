-- A website's files (D-045): PDF datasheets, guides and certificates that catalogue products and series attach.
CREATE TABLE "site_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text DEFAULT 'pdf' NOT NULL,
	"name" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "site_files_kind_check" CHECK ("site_files"."kind" in ('pdf'))
);
--> statement-breakpoint
ALTER TABLE "site_files" ADD CONSTRAINT "site_files_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_files" ADD CONSTRAINT "site_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_files_site_idx" ON "site_files" USING btree ("site_id","created_at");