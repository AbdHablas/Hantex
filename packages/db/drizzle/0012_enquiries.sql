-- Enquiries and quotation requests (D-051): added by the public site, answered from the dashboard.
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"product_id" text,
	"product_name" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"contact_type" text NOT NULL,
	"contact_value" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"quantity" integer,
	"message" text NOT NULL,
	"locale" text NOT NULL,
	"consent_version" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_kind_check" CHECK ("enquiries"."kind" in ('enquiry', 'quote')),
	CONSTRAINT "enquiries_contact_type_check" CHECK ("enquiries"."contact_type" in ('email', 'whatsapp')),
	CONSTRAINT "enquiries_locale_check" CHECK ("enquiries"."locale" in ('ar', 'en')),
	CONSTRAINT "enquiries_status_check" CHECK ("enquiries"."status" in ('new', 'replied', 'closed')),
	CONSTRAINT "enquiries_lengths_check" CHECK (char_length("enquiries"."name") <= 100 and char_length("enquiries"."company") <= 120 and char_length("enquiries"."message") <= 2000 and char_length("enquiries"."product_name") <= 120 and char_length("enquiries"."contact_value") <= 254),
	CONSTRAINT "enquiries_quantity_check" CHECK ("enquiries"."quantity" is null or ("enquiries"."quantity" between 1 and 1000000))
);
--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiries_site_idx" ON "enquiries" USING btree ("site_id","created_at");