-- One-click unsubscribe from announcement emails (D-040). The public site's database user can't
-- read or delete sign-ups; this function lets it remove exactly one sign-up of its own site,
-- after the site Worker has checked the signed link. Granted in sql/grants.sql.
CREATE OR REPLACE FUNCTION public.unsubscribe(p_site_id uuid, p_subscriber_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH removed AS (
    DELETE FROM subscribers WHERE id = p_subscriber_id AND site_id = p_site_id RETURNING 1
  )
  SELECT count(*) > 0 FROM removed
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.unsubscribe(uuid, uuid) FROM PUBLIC;
