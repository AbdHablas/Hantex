CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"site_id" uuid,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "dashboard_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_drafts" (
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_drafts_site_id_kind_pk" PRIMARY KEY("site_id","kind"),
	CONSTRAINT "document_drafts_kind_check" CHECK ("document_drafts"."kind" in ('coming-soon', 'site-settings', 'theme'))
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_from" integer,
	CONSTRAINT "document_versions_kind_check" CHECK ("document_versions"."kind" in ('coming-soon', 'site-settings', 'theme'))
);
--> statement-breakpoint
CREATE TABLE "email_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrolment_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"ticket_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"invitation_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolment_tickets_ticket_hash_unique" UNIQUE("ticket_hash"),
	CONSTRAINT "enrolment_tickets_purpose_check" CHECK ("enrolment_tickets"."purpose" in ('invitation', 'recovery'))
);
--> statement-breakpoint
CREATE TABLE "form_rate_limits" (
	"site_id" uuid NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" bigint NOT NULL,
	CONSTRAINT "form_rate_limits_site_id_key_pk" PRIMARY KEY("site_id","key")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role_id" text NOT NULL,
	"site_id" uuid,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"aaguid" text,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"requested_by" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"detail" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "publish_jobs_status_check" CHECK ("publish_jobs"."status" in ('queued', 'dispatched', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"site_id" uuid,
	"assigned_by" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignments_user_site_unique" UNIQUE NULLS NOT DISTINCT("user_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"is_standard" boolean DEFAULT false NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "site_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_domains_hostname_check" CHECK ("site_domains"."hostname" ~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
	CONSTRAINT "site_domains_status_check" CHECK ("site_domains"."status" in ('pending', 'active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"locales" text[] NOT NULL,
	"default_locale" text NOT NULL,
	"mode" text DEFAULT 'coming-soon' NOT NULL,
	"template" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "sites_key_unique" UNIQUE("key"),
	CONSTRAINT "sites_key_check" CHECK ("sites"."key" ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,39}$'),
	CONSTRAINT "sites_mode_check" CHECK ("sites"."mode" in ('coming-soon', 'live', 'maintenance')),
	CONSTRAINT "sites_template_check" CHECK ("sites"."template" in ('coming-soon', 'product-showcase')),
	CONSTRAINT "sites_locales_check" CHECK (cardinality("sites"."locales") >= 1 and "sites"."locales" <@ array['ar', 'en']::text[]),
	CONSTRAINT "sites_default_locale_check" CHECK ("sites"."default_locale" = any("sites"."locales"))
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"contact_type" text NOT NULL,
	"contact_value" text NOT NULL,
	"locale" text NOT NULL,
	"consent_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_contact_type_check" CHECK ("subscribers"."contact_type" in ('email', 'whatsapp')),
	CONSTRAINT "subscribers_locale_check" CHECK ("subscribers"."locale" in ('ar', 'en'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"status" text DEFAULT 'active' NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled')),
	CONSTRAINT "users_locale_check" CHECK ("users"."locale" in ('ar', 'en'))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_challenges" ADD CONSTRAINT "email_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment_tickets" ADD CONSTRAINT "enrolment_tickets_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_rate_limits" ADD CONSTRAINT "form_rate_limits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_domains" ADD CONSTRAINT "site_domains_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_site_idx" ON "audit_log" USING btree ("site_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_site_kind_version_unique" ON "document_versions" USING btree ("site_id","kind","version");--> statement-breakpoint
CREATE INDEX "email_challenges_user_id_idx" ON "email_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "publish_jobs_site_idx" ON "publish_jobs" USING btree ("site_id","requested_at");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_assignments_role_id_idx" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_assignments_site_id_idx" ON "role_assignments" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_domains_hostname_unique" ON "site_domains" USING btree ("hostname") WHERE "site_domains"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "site_domains_primary_unique" ON "site_domains" USING btree ("site_id") WHERE "site_domains"."is_primary" and "site_domains"."status" <> 'removed';--> statement-breakpoint
CREATE INDEX "site_domains_site_id_idx" ON "site_domains" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_site_contact_unique" ON "subscribers" USING btree ("site_id","contact_type","contact_value");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");