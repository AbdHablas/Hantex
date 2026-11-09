-- 3D Studio (D-056): a job's finishes are catalogue finish ids, which also name the model's
-- material variants, so a renamed finish still matches.
ALTER TABLE "studio_jobs" RENAME COLUMN "finish_names" TO "finish_ids";