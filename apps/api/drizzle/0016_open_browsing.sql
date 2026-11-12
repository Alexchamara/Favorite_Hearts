-- Owner decision, 12 Nov 2026 (replaces "verified members only", 29 Oct 2026): every active member may browse
-- Discover and open published profiles; verification is no longer needed to see others. What stays behind it:
-- publishing (a profile needs its publisher's approved document and SMS-verified phone), so sending requests (the
-- sender's profile must be published, app.send_interest) and filing reports (app.file_report checks
-- app.is_verified_member itself). Photos stay blurred and contacts private until both accept, as before; blocks
-- and the report thresholds still hide profiles.
CREATE OR REPLACE FUNCTION app.can_browse(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
    SELECT app.is_active_member()
       AND EXISTS (SELECT 1 FROM profile WHERE id = target AND status = 'published' AND moderation_hidden_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM app.operated_profiles() AS v(id) WHERE app.is_blocked(v.id, target))
  $$;
