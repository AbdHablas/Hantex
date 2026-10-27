-- Fonts uploaded by the Owner, shared by every website (D-033).
CREATE TABLE "fonts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family" text NOT NULL,
	"scripts" text[] NOT NULL,
	"files" jsonb NOT NULL,
	"licence" jsonb NOT NULL,
	"licence_confirmed_by" text,
	"licence_confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fonts" ADD CONSTRAINT "fonts_licence_confirmed_by_users_id_fk" FOREIGN KEY ("licence_confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fonts_created_idx" ON "fonts" USING btree ("created_at");