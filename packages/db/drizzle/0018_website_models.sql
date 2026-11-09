-- Website 3D models (D-057): the published "models" document (which approved model each product
-- shows), and when a model's files were copied to the public bucket.
ALTER TABLE "document_drafts" DROP CONSTRAINT "document_drafts_kind_check";--> statement-breakpoint
ALTER TABLE "document_versions" DROP CONSTRAINT "document_versions_kind_check";--> statement-breakpoint
ALTER TABLE "studio_models" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_kind_check" CHECK ("document_drafts"."kind" in ('coming-soon', 'site-settings', 'theme', 'page', 'pages', 'menus', 'layout', 'saved-sections', 'logo', 'catalogue', 'product', 'models'));--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_kind_check" CHECK ("document_versions"."kind" in ('coming-soon', 'site-settings', 'theme', 'page', 'pages', 'menus', 'layout', 'saved-sections', 'logo', 'catalogue', 'product', 'models'));