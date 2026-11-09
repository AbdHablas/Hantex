-- 3D Studio (D-056): each upload's declared format (checked against its bytes on upload), which
-- the processing runner reads. NOT NULL without a default: no Studio upload exists yet anywhere,
-- since the Studio has never been deployed.
ALTER TABLE "studio_capture_files" ADD COLUMN "format" text NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_capture_files" ADD CONSTRAINT "studio_capture_files_format_check" CHECK ("studio_capture_files"."format" in ('webp', 'glb', 'gltf', 'obj', 'usdz', 'fbx', 'step', 'iges'));