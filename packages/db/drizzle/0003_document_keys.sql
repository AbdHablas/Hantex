-- Documents get a key: '' for one-per-site kinds, the page id for pages (D-035).
ALTER TABLE "document_drafts" ADD COLUMN "key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_drafts" DROP CONSTRAINT "document_drafts_kind_check";--> statement-breakpoint
ALTER TABLE "document_versions" DROP CONSTRAINT "document_versions_kind_check";--> statement-breakpoint
DROP INDEX "document_versions_site_kind_version_unique";--> statement-breakpoint
ALTER TABLE "document_drafts" DROP CONSTRAINT "document_drafts_site_id_kind_pk";--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_site_id_kind_key_pk" PRIMARY KEY("site_id","kind","key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_site_kind_key_version_unique" ON "document_versions" USING btree ("site_id","kind","key","version");--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_kind_check" CHECK ("document_drafts"."kind" in ('coming-soon', 'site-settings', 'theme', 'page', 'pages', 'menus', 'layout'));--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_kind_check" CHECK ("document_versions"."kind" in ('coming-soon', 'site-settings', 'theme', 'page', 'pages', 'menus', 'layout'));