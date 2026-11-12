-- Admin panel, phase admin-1 (docs/ADMIN-PANEL-PLAN.md, layers 4 and 9).
--
-- 1. The new tables are for the server only: row-level security on, and no grant to fh_app (member and staff
--    requests), so nothing reaches them through the API's database role.
-- 2. The audit trail becomes tamper-evident: every new row carries the hash of the row before it, so an edited row
--    no longer matches its hash and a removed row leaves the next one pointing at nothing. app.audit_chain_check()
--    reports both. Existing rows are chained here, in their order.
-- 3. Deleting audit rows is refused, except inside the 6-month retention sweep (OWNER-DECISIONS section 8), which
--    leaves a tombstone (place and hash only) for every row it removes so the chain still checks across the gap.

ALTER TABLE auth_passkey ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_invite ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_device ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_tombstone ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- The hash of one audit row, from the hash before it and every field. Times are written in UTC to the microsecond,
-- and metadata as Postgres's own jsonb text, so the same row always gives the same hash.
CREATE FUNCTION app.audit_row_hash(prev text, r audit_event) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog
  AS $$
    SELECT encode(sha256(convert_to(concat_ws(E'\x1f',
      coalesce(prev, ''), r.seq::text, r.id::text, coalesce(r.actor_user_id, ''), coalesce(r.actor_role, ''),
      r.action, r.entity_type, coalesce(r.entity_id, ''), coalesce(r.reason, ''), coalesce(r.correlation_id, ''),
      coalesce(r.metadata::text, ''), coalesce(r.session_id, ''), coalesce(r.ip, ''), coalesce(r.user_agent, ''),
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8')), 'hex')
  $$;
--> statement-breakpoint

-- The newest hash in the chain. Its single row is locked while a row is added, so two writers never both link to
-- the same row (the chain is ordered by link, not by seq, which can be taken out of order).
CREATE TABLE app.audit_chain_head (
  only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  row_hash text
);
--> statement-breakpoint
ALTER TABLE app.audit_chain_head ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Existing rows are chained once, in seq order (nothing else writes during a migration).
ALTER TABLE audit_event DISABLE TRIGGER audit_event_append_only;
--> statement-breakpoint
DO $$
  DECLARE
    r audit_event;
    last_hash text := NULL;
    this_hash text;
  BEGIN
    FOR r IN SELECT * FROM audit_event ORDER BY seq LOOP
      this_hash := app.audit_row_hash(last_hash, r);
      UPDATE audit_event SET prev_hash = last_hash, row_hash = this_hash WHERE id = r.id;
      last_hash := this_hash;
    END LOOP;
    INSERT INTO app.audit_chain_head (only_row, row_hash) VALUES (true, last_hash);
  END $$;
--> statement-breakpoint
ALTER TABLE audit_event ENABLE TRIGGER audit_event_append_only;
--> statement-breakpoint

CREATE FUNCTION app.audit_chain() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    last_hash text;
  BEGIN
    SELECT row_hash INTO last_hash FROM app.audit_chain_head WHERE only_row FOR UPDATE;
    NEW.prev_hash := last_hash;
    NEW.row_hash := app.audit_row_hash(last_hash, NEW);
    UPDATE app.audit_chain_head SET row_hash = NEW.row_hash WHERE only_row;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER audit_event_chain BEFORE INSERT ON audit_event
  FOR EACH ROW EXECUTE FUNCTION app.audit_chain();
--> statement-breakpoint
CREATE INDEX audit_event_row_hash_idx ON audit_event (row_hash);
--> statement-breakpoint
CREATE INDEX audit_event_prev_hash_idx ON audit_event (prev_hash);
--> statement-breakpoint

-- Deletes: only the retention sweep (which runs with app.retention = on, set on the function below), and each one
-- leaves a tombstone. TRUNCATE is never allowed.
CREATE FUNCTION app.audit_delete_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  BEGIN
    IF coalesce(current_setting('app.retention', true), '') <> 'on' THEN
      RAISE EXCEPTION 'audit_event is append-only' USING ERRCODE = '42501';
    END IF;
    INSERT INTO audit_tombstone (seq, row_hash) VALUES (OLD.seq, OLD.row_hash) ON CONFLICT (seq) DO NOTHING;
    RETURN OLD;
  END $$;
--> statement-breakpoint
CREATE TRIGGER audit_event_delete_guard BEFORE DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION app.audit_delete_guard();
--> statement-breakpoint
CREATE FUNCTION app.audit_truncate_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'audit_event is append-only' USING ERRCODE = '42501'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_event_truncate_guard BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION app.audit_truncate_guard();
--> statement-breakpoint
ALTER FUNCTION app.retention_purge(integer) SET app.retention = 'on';
--> statement-breakpoint

-- The chain check: rows whose hash no longer matches (edited), rows pointing at a hash that is neither a row nor a
-- tombstone (a row removed outside the sweep), two rows pointing at the same one (a fork), and whether the newest
-- hash still exists. The server calls it after its own permission check; members and staff cannot call it directly.
CREATE FUNCTION app.audit_chain_check() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
  AS $$
  DECLARE
    edited bigint[];
    broken bigint[];
    forked bigint[];
    starts integer;
    head text;
    head_ok boolean;
    total integer;
  BEGIN
    SELECT count(*) INTO total FROM audit_event;
    SELECT coalesce(array_agg(seq ORDER BY seq), '{}') INTO edited FROM audit_event e
      WHERE e.row_hash IS DISTINCT FROM app.audit_row_hash(e.prev_hash, e);
    SELECT coalesce(array_agg(seq ORDER BY seq), '{}') INTO broken FROM audit_event e
      WHERE e.prev_hash IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM audit_event p WHERE p.row_hash = e.prev_hash)
        AND NOT EXISTS (SELECT 1 FROM audit_tombstone t WHERE t.row_hash = e.prev_hash);
    SELECT coalesce(array_agg(seq ORDER BY seq), '{}') INTO forked FROM audit_event e
      WHERE e.prev_hash IS NOT NULL
        AND EXISTS (SELECT 1 FROM audit_event o WHERE o.prev_hash = e.prev_hash AND o.id <> e.id);
    SELECT count(*) INTO starts FROM audit_event WHERE prev_hash IS NULL;
    SELECT row_hash INTO head FROM app.audit_chain_head WHERE only_row;
    head_ok := head IS NULL
      OR EXISTS (SELECT 1 FROM audit_event WHERE row_hash = head)
      OR EXISTS (SELECT 1 FROM audit_tombstone WHERE row_hash = head);
    RETURN jsonb_build_object(
      'ok', cardinality(edited) = 0 AND cardinality(broken) = 0 AND cardinality(forked) = 0 AND starts <= 1 AND head_ok,
      'rows', total, 'edited', to_jsonb(edited), 'broken', to_jsonb(broken), 'forked', to_jsonb(forked),
      'starts', starts, 'headFound', head_ok);
  END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.audit_chain_check() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.audit_chain() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.audit_delete_guard() FROM PUBLIC;
