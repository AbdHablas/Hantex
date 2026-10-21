-- Role-assignment rules (D-025), enforced by the database as a second line behind the API
-- (checkAssignmentScope in @hantex/shared):
--   * locked roles (Owner) are always all-sites (site_id null);
--   * a person holds either one all-sites assignment or per-site assignments, never both.
-- One role per site per person is the unique constraint role_assignments_user_site_unique.
CREATE FUNCTION enforce_role_assignment_scope() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Serialise changes per person so two concurrent inserts cannot both pass the checks below.
  PERFORM pg_advisory_xact_lock(hashtext('role_assignments:' || NEW.user_id));

  IF NEW.site_id IS NOT NULL AND EXISTS (SELECT 1 FROM roles WHERE id = NEW.role_id AND locked) THEN
    RAISE EXCEPTION 'The % role always covers all sites', NEW.role_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'role_assignments_owner_all_sites';
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_assignments
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND (site_id IS NULL) <> (NEW.site_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'A person has either one all-sites role or per-site roles, not both'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'role_assignments_single_scope';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER role_assignments_scope
BEFORE INSERT OR UPDATE OF user_id, role_id, site_id ON role_assignments
FOR EACH ROW EXECUTE FUNCTION enforce_role_assignment_scope();
--> statement-breakpoint
-- Invitations follow the same rule for locked roles, so an accepted invitation can never
-- create a per-site Owner.
CREATE FUNCTION enforce_invitation_scope() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.site_id IS NOT NULL AND EXISTS (SELECT 1 FROM roles WHERE id = NEW.role_id AND locked) THEN
    RAISE EXCEPTION 'The % role always covers all sites', NEW.role_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invitations_owner_all_sites';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invitations_scope
BEFORE INSERT OR UPDATE OF role_id, site_id ON invitations
FOR EACH ROW EXECUTE FUNCTION enforce_invitation_scope();
