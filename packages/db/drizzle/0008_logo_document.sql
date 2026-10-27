-- Uploaded logos, one document per website (D-027).
ALTER TABLE "document_drafts" DROP CONSTRAINT "document_drafts_kind_check";--> statement-breakpoint
ALTER TABLE "document_versions" DROP CONSTRAINT "document_versions_kind_check";--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_kind_check" CHECK ("document_drafts"."kind" in ('coming-soon', 'site-settings', 'theme', 'page', 'pages', 'menus', 'layout', 'saved-sections', 'logo'));--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_kind_check" CHECK ("document_versions"."kind" in ('coming-soon', 'site-settings', 'theme', 'page', 'pages', 'menus', 'layout', 'saved-sections', 'logo'));