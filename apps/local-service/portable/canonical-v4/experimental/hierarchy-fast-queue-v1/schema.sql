-- Explicit in-memory opt-in only; no migration, runtime registration or role grants.
CREATE SCHEMA hierarchy_fast_queue_v1;
CREATE TABLE hierarchy_fast_queue_v1.jobs (
 operation_id text PRIMARY KEY, actor_id text NOT NULL, command_hash text NOT NULL,
 generation text NOT NULL, source_url text, parameters jsonb,
 state text NOT NULL CHECK(state IN('pending','leased','complete','cancelled','expired','erased')),
 deadline timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 worker_id text, lease_token text, lease_until timestamptz,
 result_source_id text REFERENCES canonical_v4.sources(id) ON DELETE SET NULL,
 receipt jsonb, completed_lease_hash text,
 CHECK((state='leased')=(worker_id IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK((state IN('pending','leased'))=(parameters IS NOT NULL)),
 CHECK((state IN('pending','leased'))=(source_url IS NOT NULL)),
 CHECK((state='complete')=(receipt IS NOT NULL AND result_source_id IS NOT NULL))
);
CREATE UNIQUE INDEX fast_queue_live_url ON hierarchy_fast_queue_v1.jobs(source_url) WHERE state IN('pending','leased');
CREATE FUNCTION hierarchy_fast_queue_v1.guard_legacy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 -- Only INSERT introduces a reservation. Existing009 new enqueue takes this
 -- exact growth lock first. Its replay/claim/apply/forget paths already own
 -- lane/runtime locks: NEVER acquire growth from those UPDATE paths.
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(914092008,1);
 ELSE
  -- Do not let owner table updates introduce an un-serialized reservation.
  -- Canonical checked paths keep identity/active URL and never revive terminal
  -- jobs; completion/failure/forget may scrub an active URL to NULL.
  IF NEW.operation_id IS DISTINCT FROM OLD.operation_id OR
     (OLD.state NOT IN('pending','leased') AND NEW.state IN('pending','leased')) OR
     (OLD.state IN('pending','leased') AND NEW.state IN('pending','leased') AND
      NEW.source_url IS DISTINCT FROM OLD.source_url) THEN
   RAISE EXCEPTION 'Legacy queue reservation changed' USING ERRCODE='P2202';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_fast_queue_v1.jobs q WHERE q.operation_id=NEW.operation_id OR
   q.source_url=NEW.source_url AND q.state IN('pending','leased') AND NEW.state IN('pending','leased')) THEN
  RAISE EXCEPTION 'Fast queue policy crossover' USING ERRCODE='P2202';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_queue_no_legacy BEFORE INSERT OR UPDATE ON canonical_v4.ingestion_jobs
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_queue_v1.guard_legacy();
CREATE FUNCTION hierarchy_fast_queue_v1.scrub_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE hierarchy_fast_queue_v1.jobs SET state='erased',receipt=NULL,result_source_id=NULL,completed_lease_hash=NULL,
 parameters=NULL,source_url=NULL,worker_id=NULL,lease_token=NULL,lease_until=NULL WHERE result_source_id=OLD.id;
 RETURN OLD;
END $$;
CREATE TRIGGER fast_queue_origin_forget BEFORE DELETE ON canonical_v4.sources
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_queue_v1.scrub_origin();
REVOKE ALL ON SCHEMA hierarchy_fast_queue_v1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_fast_queue_v1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_fast_queue_v1 FROM PUBLIC;
