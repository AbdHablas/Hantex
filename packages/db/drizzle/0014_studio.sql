-- AI 3D Product Studio (D-029, D-030, D-056): captures, jobs, models, reviews, provider settings and spend, per site.
CREATE TABLE "studio_capture_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"view" text,
	"storage_key" text NOT NULL,
	"bytes" integer NOT NULL,
	"width_px" integer,
	"height_px" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_capture_files_kind_check" CHECK ("studio_capture_files"."kind" in ('photo', 'cad', 'model')),
	CONSTRAINT "studio_capture_files_view_check" CHECK ("studio_capture_files"."view" is null or "studio_capture_files"."view" in ('front', 'left', 'right', 'rear', 'top', 'detail'))
);
--> statement-breakpoint
CREATE TABLE "studio_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"width_mm" integer,
	"height_mm" integer,
	"depth_mm" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"actual_cost_cents" integer,
	"detail" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "studio_jobs_status_check" CHECK ("studio_jobs"."status" in ('queued', 'running', 'done', 'failed')),
	CONSTRAINT "studio_jobs_method_check" CHECK ("studio_jobs"."method" in ('cad', 'photogrammetry', 'splat', 'artist', 'generative'))
);
--> statement-breakpoint
CREATE TABLE "studio_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"label" text NOT NULL,
	"files" jsonb NOT NULL,
	"measurements" jsonb NOT NULL,
	"validator_report" jsonb NOT NULL,
	"within_scale" boolean,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_models_label_check" CHECK ("studio_models"."label" in ('exact-cad', 'measured', 'artist-modelled', 'captured-view', 'ai-estimated')),
	CONSTRAINT "studio_models_review_status_check" CHECK ("studio_models"."review_status" in ('pending', 'ready-for-approval', 'needs-better-photos', 'needs-manual-correction'))
);
--> statement-breakpoint
CREATE TABLE "studio_provider_settings" (
	"site_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"data_policy_accepted_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_provider_settings_site_id_provider_id_pk" PRIMARY KEY("site_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "studio_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"reviewer_id" text,
	"checklist" jsonb NOT NULL,
	"decision" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_reviews_decision_check" CHECK ("studio_reviews"."decision" in ('ready-for-approval', 'needs-better-photos', 'needs-manual-correction'))
);
--> statement-breakpoint
CREATE TABLE "studio_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"job_id" uuid,
	"cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_capture_files" ADD CONSTRAINT "studio_capture_files_capture_id_studio_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."studio_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_captures" ADD CONSTRAINT "studio_captures_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_captures" ADD CONSTRAINT "studio_captures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_capture_id_studio_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."studio_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_models" ADD CONSTRAINT "studio_models_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_models" ADD CONSTRAINT "studio_models_capture_id_studio_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."studio_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_models" ADD CONSTRAINT "studio_models_job_id_studio_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."studio_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_models" ADD CONSTRAINT "studio_models_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_provider_settings" ADD CONSTRAINT "studio_provider_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_provider_settings" ADD CONSTRAINT "studio_provider_settings_data_policy_accepted_by_users_id_fk" FOREIGN KEY ("data_policy_accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_reviews" ADD CONSTRAINT "studio_reviews_model_id_studio_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."studio_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_reviews" ADD CONSTRAINT "studio_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_spend" ADD CONSTRAINT "studio_spend_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_spend" ADD CONSTRAINT "studio_spend_job_id_studio_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."studio_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_capture_files_capture_idx" ON "studio_capture_files" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "studio_captures_site_idx" ON "studio_captures" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_jobs_site_idx" ON "studio_jobs" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_jobs_status_idx" ON "studio_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studio_models_site_idx" ON "studio_models" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_reviews_model_idx" ON "studio_reviews" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "studio_spend_site_idx" ON "studio_spend" USING btree ("site_id","provider_id","created_at");