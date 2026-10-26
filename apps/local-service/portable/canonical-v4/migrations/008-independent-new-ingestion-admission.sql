-- New-operation admission must not wait for another Source's exact Ridge scan.
-- The independent advisory namespace serializes all queue growth. Existing
-- replay, lease/authority repair and canonical apply remain lane-serialized.
-- A raced replay can still wait while holding admission; no replay latency
-- guarantee or additional write authority is introduced.
CREATE OR REPLACE FUNCTION canonical_v4.ingest_enqueue_job(
  p_operation_id text,
  p_operation_digest text,
  p_request_material text,
  p_generation text,
  p_expected_revision bigint,
  p_job_class text,
  p_authority_token text,
  p_authority_seconds integer
)
RETURNS TABLE(
  operation_id text,
  operation_digest text,
  job_class text,
  state text,
  ordinal bigint,
  attempts integer,
  replayed boolean,
  result_source_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_enqueue_job$
DECLARE
  v_source_url text;
  runtime canonical_v4.runtime_state%ROWTYPE;
  existing canonical_v4.ingestion_jobs%ROWTYPE;
  receipt canonical_v4.operation_receipts%ROWTYPE;
  source canonical_v4.sources%ROWTYPE;
  source_catalog canonical_v4.runtime_source_stamps%ROWTYPE;
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  next_ordinal bigint;
  live_count integer;
  source_present boolean := false;
  now_at timestamptz := clock_timestamp();
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_generation,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_authority_token,128,false)
      OR p_expected_revision IS NULL OR p_expected_revision < 0
      OR p_job_class NOT IN ('interactive','crawler')
      OR p_authority_seconds IS NULL OR p_authority_seconds < 1 OR p_authority_seconds > 30 THEN
    RAISE EXCEPTION 'Invalid ingestion enqueue request' USING ERRCODE = 'P1203';
  END IF;
  v_source_url := canonical_v4.ingest_validate_material(p_request_material,p_operation_digest);
  -- Only new admissions use this independent two-int lock namespace. Existing
  -- replay/repair keeps the original lane -> job order. Never acquire this
  -- advisory lock after the lane: a raced fresh caller may hold it while
  -- falling through to the legacy replay path below.
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.operation_receipts AS stored_receipt
      WHERE stored_receipt.operation_id=p_operation_id)
      AND NOT EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS queued
        WHERE queued.operation_id=p_operation_id) THEN
    PERFORM pg_advisory_xact_lock(914092008,1);
    -- A concurrent admission may have won while this transaction waited.
    IF NOT EXISTS(SELECT 1 FROM canonical_v4.operation_receipts AS stored_receipt
        WHERE stored_receipt.operation_id=p_operation_id)
        AND NOT EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS queued
          WHERE queued.operation_id=p_operation_id) THEN
      -- One statement snapshot proves the lane and leased row together. A
      -- running apply may hold the lane for exact matching; new admission
      -- neither locks nor changes that lane or its lease.
      IF NOT EXISTS(
        SELECT 1 FROM canonical_v4.catalog_ingest_lane AS current_lane
        WHERE current_lane.singleton=true AND (
          current_lane.active_operation_id IS NULL AND NOT EXISTS(
            SELECT 1 FROM canonical_v4.ingestion_jobs AS leased WHERE leased.state='leased'
          )
          OR current_lane.active_operation_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM canonical_v4.ingestion_jobs AS leased
            WHERE leased.operation_id=current_lane.active_operation_id AND leased.state='leased'
              AND leased.lease_token IS NOT DISTINCT FROM current_lane.active_lease_token
              AND leased.lease_until IS NOT DISTINCT FROM current_lane.active_lease_until
          )
        )
      ) THEN
        RAISE EXCEPTION 'Invalid active ingestion lease' USING ERRCODE = 'P1204';
      END IF;
      SELECT * INTO runtime FROM canonical_v4.runtime_state WHERE singleton=true;
      IF NOT FOUND OR runtime.generation <> p_generation THEN
        RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
      END IF;
      IF p_expected_revision > runtime.revision THEN
        RAISE EXCEPTION 'State revision changed' USING ERRCODE = 'P1201';
      END IF;
      SELECT * INTO source FROM canonical_v4.sources AS candidate
        WHERE candidate.url COLLATE "C"=v_source_url COLLATE "C"
        ORDER BY candidate.id COLLATE "C" LIMIT 1 FOR SHARE;
      source_present := FOUND;
      IF source_present AND source.provenance<>'owner-local-page-embedding/v1' THEN
        RAISE EXCEPTION 'Source URL is not available for ingestion' USING ERRCODE = 'P1205';
      END IF;
      IF source_present THEN
        SELECT * INTO source_catalog FROM canonical_v4.runtime_source_stamps AS protected
          WHERE protected.source_id=source.id FOR SHARE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Invalid Source admission witness' USING ERRCODE = 'P1204';
        END IF;
        IF source_catalog.catalog_revision>p_expected_revision THEN
          RAISE EXCEPTION 'Source changed' USING ERRCODE = 'P1201';
        END IF;
      END IF;
      -- Preserve erasure/absence authority until the bounded admission commits.
      -- Source/stamp precede runtime publication in the shared lock order.
      -- This never waits for an apply's expensive lane-locked Ridge scan.
      SELECT * INTO runtime FROM canonical_v4.runtime_state
        WHERE singleton=true FOR SHARE;
      IF NOT FOUND OR runtime.generation <> p_generation
          OR p_expected_revision > runtime.revision THEN
        RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
      END IF;
      IF NOT source_present AND runtime.source_absence_revision>p_expected_revision THEN
        RAISE EXCEPTION 'Source absence changed' USING ERRCODE = 'P1201';
      END IF;
      IF EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS job
        WHERE job.source_url=v_source_url AND job.state IN ('pending','leased')) THEN
        RAISE EXCEPTION 'Source URL already queued' USING ERRCODE = 'P1201';
      END IF;
      SELECT count(*) INTO live_count FROM canonical_v4.ingestion_jobs AS job
        WHERE job.job_class=p_job_class AND job.state IN ('pending','leased');
      IF live_count >= 8 THEN
        RAISE EXCEPTION 'Ingestion queue capacity reached' USING ERRCODE = 'P1202';
      END IF;
      SELECT nextval('canonical_v4.ingestion_job_ordinal_sequence') INTO next_ordinal;
      INSERT INTO canonical_v4.ingestion_jobs(
        operation_id,operation_digest,generation,expected_revision,job_class,ordinal,
        state,request_material,source_url,authority_token,authority_until,
        source_witness_present,source_witness_id,source_witness_version
      ) VALUES(
        p_operation_id,p_operation_digest,p_generation,p_expected_revision,p_job_class,next_ordinal,
        'pending',p_request_material,v_source_url,p_authority_token,
        now_at+p_authority_seconds*interval '1 second',source_present,
        CASE WHEN source_present THEN source.id ELSE NULL END,
        CASE WHEN source_present THEN source.write_version ELSE NULL END
      ) RETURNING * INTO existing;
      RETURN QUERY SELECT existing.operation_id,existing.operation_digest,existing.job_class,
        existing.state,existing.ordinal,existing.attempts,false,existing.result_source_id;
      RETURN;
    END IF;
  END IF;
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane
    WHERE singleton=true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid ingestion lane' USING ERRCODE = 'P1204';
  END IF;
  IF lane.active_operation_id IS NULL AND
      EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS leased WHERE leased.state='leased')
      OR lane.active_operation_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM canonical_v4.ingestion_jobs AS leased
        WHERE leased.operation_id=lane.active_operation_id AND leased.state='leased'
          AND leased.lease_token IS NOT DISTINCT FROM lane.active_lease_token
          AND leased.lease_until IS NOT DISTINCT FROM lane.active_lease_until
      ) THEN
    RAISE EXCEPTION 'Invalid active ingestion lease' USING ERRCODE = 'P1204';
  END IF;
  SELECT * INTO runtime FROM canonical_v4.runtime_state WHERE singleton=true;
  IF NOT FOUND OR runtime.generation <> p_generation THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;

  SELECT * INTO receipt FROM canonical_v4.operation_receipts AS stored_receipt
    WHERE stored_receipt.operation_id=p_operation_id;
  IF FOUND THEN
    IF receipt.operation_digest <> p_operation_digest THEN
      RAISE EXCEPTION 'Operation ID already used' USING ERRCODE = 'P1201';
    END IF;
    RETURN QUERY SELECT p_operation_id,p_operation_digest,p_job_class,'complete'::text,
      NULL::bigint,0,true,receipt.source_id;
    RETURN;
  END IF;

  SELECT * INTO existing FROM canonical_v4.ingestion_jobs AS job
    WHERE job.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF existing.operation_digest <> p_operation_digest
        OR existing.generation <> p_generation OR existing.job_class <> p_job_class
        OR existing.state IN ('pending','leased') AND (
          existing.request_material <> p_request_material OR existing.source_url <> v_source_url
        ) THEN
      RAISE EXCEPTION 'Operation ID already used' USING ERRCODE = 'P1201';
    END IF;
    IF existing.state IN ('pending','leased') THEN
      IF existing.authority_until <= now_at AND existing.attempts >= 3 THEN
        IF lane.active_operation_id=existing.operation_id THEN
          UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
            active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
        END IF;
        UPDATE canonical_v4.ingestion_jobs AS job SET state='failed',request_material=NULL,
          source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
          lease_token=NULL,lease_until=NULL,source_witness_present=NULL,
          source_witness_id=NULL,source_witness_version=NULL,terminal_code='lease-exhausted',
          terminal_at=now_at,updated_at=now_at
          WHERE job.operation_id=p_operation_id RETURNING * INTO existing;
      ELSIF existing.authority_until <= now_at THEN
        IF lane.active_operation_id=existing.operation_id THEN
          UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
            active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
        END IF;
        UPDATE canonical_v4.ingestion_jobs AS job SET state='pending',worker_id=NULL,
          lease_token=NULL,lease_until=NULL,authority_token=p_authority_token,
          authority_until=now_at+p_authority_seconds*interval '1 second',updated_at=now_at
          WHERE job.operation_id=p_operation_id RETURNING * INTO existing;
      ELSE
        UPDATE canonical_v4.ingestion_jobs AS job SET authority_token=p_authority_token,
          authority_until=now_at+p_authority_seconds*interval '1 second',
          lease_until=CASE WHEN job.state='leased' THEN least(job.lease_until,
            now_at+p_authority_seconds*interval '1 second') ELSE job.lease_until END,
          updated_at=now_at
          WHERE job.operation_id=p_operation_id RETURNING * INTO existing;
        IF existing.state='leased' THEN
          UPDATE canonical_v4.catalog_ingest_lane SET
            active_lease_until=least(existing.lease_until,existing.authority_until)
            WHERE singleton=true AND active_operation_id=existing.operation_id;
        END IF;
      END IF;
    END IF;
    RETURN QUERY SELECT existing.operation_id,existing.operation_digest,existing.job_class,
      existing.state,existing.ordinal,existing.attempts,true,existing.result_source_id;
    RETURN;
  END IF;

  -- A previously observed operation was erased while this caller waited.
  -- Do not resurrect its intent or invert lane -> advisory lock ordering.
  RAISE EXCEPTION 'Operation changed' USING ERRCODE = 'P1201';
END
$ingest_enqueue_job$;

-- CREATE OR REPLACE retains the execute-only wrappers and original ownership.
REVOKE ALL ON FUNCTION canonical_v4.ingest_enqueue_job(text,text,text,text,bigint,text,text,integer) FROM PUBLIC;

