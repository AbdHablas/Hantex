-- 3D Studio (D-056): the finishes a job adds as material variants, given by the dashboard so the
-- processing runner never needs to read the catalogue.
ALTER TABLE "studio_jobs" ADD COLUMN "finish_names" jsonb DEFAULT '[]'::jsonb NOT NULL;