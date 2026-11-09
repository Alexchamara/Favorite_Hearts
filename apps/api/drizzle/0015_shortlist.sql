-- The shortlist (owner, 6 Nov 2026, audit N03): a profile saves published profiles to look at again later. Without an
-- active plan it holds up to 20 (SHORTLIST_LIMIT in packages/shared/src/requests.ts); with a plan there is no limit.
-- Saved ones above the limit stay when a plan ends, but none are added until it is under the limit again.
--
-- Adding goes through this function so the limit holds when two saves arrive at once: it locks the owner profile,
-- then counts. Row-level security still applies (it runs as the caller): shortlist_insert checks that the caller
-- operates the owner profile and may browse the target. Listing and removing use the table's own policies.
CREATE FUNCTION app.shortlist_add(p_owner uuid, p_target uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF NOT app.operates_profile(p_owner) THEN
      RAISE EXCEPTION 'shortlist_not_allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_owner = p_target OR app.operates_profile(p_target) OR NOT app.can_browse(p_target) THEN
      RAISE EXCEPTION 'shortlist_target_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app.lock_profiles(p_owner);
    IF EXISTS (SELECT 1 FROM shortlist WHERE owner_profile_id = p_owner AND target_profile_id = p_target) THEN
      RETURN;
    END IF;
    IF NOT app.has_active_entitlement(p_owner)
       AND (SELECT count(*) FROM shortlist WHERE owner_profile_id = p_owner) >= 20 THEN
      RAISE EXCEPTION 'shortlist_full' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO shortlist (owner_profile_id, target_profile_id) VALUES (p_owner, p_target);
  END
  $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.shortlist_add(uuid, uuid) TO fh_app;
