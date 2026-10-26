-- Admission freshness is scoped to the addressed Source.  Existing Sources
-- carry their last catalog revision in the protected stamp mirror.  For an
-- absent URL, the last deletion revision is a conservative fence which avoids
-- retaining the forgotten URL itself.  Unrelated contribution/catalog writes
-- therefore do not create a global admission CAS.
ALTER TABLE canonical_v4.runtime_state
  ADD COLUMN source_absence_revision bigint NOT NULL DEFAULT 0
    CHECK (source_absence_revision>=0 AND source_absence_revision<=revision);
UPDATE canonical_v4.runtime_state SET source_absence_revision=revision;

ALTER TABLE canonical_v4.runtime_source_stamps
  ADD COLUMN catalog_revision bigint NOT NULL DEFAULT 0 CHECK (catalog_revision>=0);
UPDATE canonical_v4.runtime_source_stamps AS stamp
  SET catalog_revision=COALESCE(
    (SELECT runtime.revision FROM canonical_v4.runtime_state AS runtime WHERE runtime.singleton=true),
    (SELECT meta.revision FROM canonical_v4.meta AS meta WHERE meta.singleton=true),0
  );

CREATE FUNCTION canonical_v4.ingest_default_runtime_witness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $ingest_default_runtime_witness$
BEGIN
  NEW.source_absence_revision := NEW.revision;
  RETURN NEW;
END
$ingest_default_runtime_witness$;
CREATE TRIGGER runtime_state_default_source_absence
  BEFORE INSERT ON canonical_v4.runtime_state
  FOR EACH ROW EXECUTE FUNCTION canonical_v4.ingest_default_runtime_witness();

CREATE FUNCTION canonical_v4.ingest_default_source_catalog_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $ingest_default_source_catalog_revision$
BEGIN
  NEW.catalog_revision := COALESCE(
    (SELECT runtime.revision FROM canonical_v4.runtime_state AS runtime WHERE runtime.singleton=true),
    (SELECT meta.revision FROM canonical_v4.meta AS meta WHERE meta.singleton=true),0
  );
  RETURN NEW;
END
$ingest_default_source_catalog_revision$;
CREATE TRIGGER runtime_source_stamps_default_catalog_revision
  BEFORE INSERT ON canonical_v4.runtime_source_stamps
  FOR EACH ROW EXECUTE FUNCTION canonical_v4.ingest_default_source_catalog_revision();

-- Complete the durable ingestion job with a Source-scoped row witness.  The
-- compatibility revision remains an ordered watermark; it is deliberately not
-- the final compare-and-swap fence for an admitted Source operation.
ALTER TABLE canonical_v4.ingestion_jobs
  ADD COLUMN source_witness_present boolean,
  ADD COLUMN source_witness_id text COLLATE "C",
  ADD COLUMN source_witness_version bigint;

UPDATE canonical_v4.ingestion_jobs AS job
SET source_witness_present=true,
    source_witness_id=(
      SELECT candidate.id FROM canonical_v4.sources AS candidate
      WHERE candidate.url COLLATE "C"=job.source_url COLLATE "C"
      ORDER BY candidate.id COLLATE "C" LIMIT 1
    ),
    source_witness_version=(
      SELECT candidate.write_version FROM canonical_v4.sources AS candidate
      WHERE candidate.url COLLATE "C"=job.source_url COLLATE "C"
      ORDER BY candidate.id COLLATE "C" LIMIT 1
    )
WHERE job.state IN ('pending','leased') AND EXISTS(
  SELECT 1 FROM canonical_v4.sources AS candidate
  WHERE candidate.url COLLATE "C"=job.source_url COLLATE "C"
);

UPDATE canonical_v4.ingestion_jobs AS job
SET source_witness_present=false,source_witness_id=NULL,source_witness_version=NULL
WHERE job.state IN ('pending','leased') AND source_witness_present IS NULL;

ALTER TABLE canonical_v4.ingestion_jobs
  ADD CONSTRAINT ingestion_jobs_source_witness_shape CHECK (
    (state IN ('pending','leased') AND source_witness_present IS NOT NULL AND (
      (source_witness_present AND source_witness_id IS NOT NULL
        AND source_witness_version IS NOT NULL AND source_witness_version>=0)
      OR
      (NOT source_witness_present AND source_witness_id IS NULL
        AND source_witness_version IS NULL)
    ))
    OR
    (state IN ('complete','failed','cancelled') AND source_witness_present IS NULL
      AND source_witness_id IS NULL AND source_witness_version IS NULL)
  );

CREATE FUNCTION canonical_v4.ingest_wipe_terminal_witness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $ingest_wipe_terminal_witness$
BEGIN
  IF NEW.state IN ('complete','failed','cancelled') THEN
    NEW.source_witness_present := NULL;
    NEW.source_witness_id := NULL;
    NEW.source_witness_version := NULL;
  END IF;
  RETURN NEW;
END
$ingest_wipe_terminal_witness$;
CREATE TRIGGER ingestion_jobs_wipe_terminal_witness
  BEFORE INSERT OR UPDATE OF state ON canonical_v4.ingestion_jobs
  FOR EACH ROW EXECUTE FUNCTION canonical_v4.ingest_wipe_terminal_witness();

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
  ELSIF runtime.source_absence_revision>p_expected_revision THEN
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
END
$ingest_enqueue_job$;

-- Internal result construction validates the private relational mirrors before
-- returning the same strict v4 receipt shape used by the current HTTP client.
CREATE FUNCTION canonical_v4.ingest_source_response(p_source_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_source_response$
DECLARE
  source canonical_v4.sources%ROWTYPE;
  link canonical_v4.source_links%ROWTYPE;
  runtime canonical_v4.runtime_state%ROWTYPE;
  memberships text[];
  source_payload jsonb;
  link_payload jsonb;
BEGIN
  SELECT * INTO source FROM canonical_v4.sources WHERE id=p_source_id;
  SELECT * INTO link FROM canonical_v4.source_links WHERE source_id=p_source_id;
  SELECT * INTO runtime FROM canonical_v4.runtime_state WHERE singleton=true;
  SELECT array_agg(topic_id ORDER BY topic_id COLLATE "C") INTO memberships
    FROM canonical_v4.topic_memberships WHERE source_id=p_source_id;
  IF source.id IS NULL OR link.source_id IS NULL OR runtime.generation IS NULL
      OR source.provenance<>'owner-local-page-embedding/v1'
      OR memberships IS NULL OR cardinality(memberships)=0
      OR NOT link.topic_id=ANY(memberships) THEN
    RAISE EXCEPTION 'Invalid canonical ingestion result' USING ERRCODE = 'P1204';
  END IF;
  BEGIN
    source_payload := source.payload::jsonb;
    link_payload := link.payload::jsonb;
    IF source_payload->>'id' IS DISTINCT FROM source.id
        OR source_payload->>'url' IS DISTINCT FROM source.url
        OR source_payload->>'title' IS DISTINCT FROM source.title
        OR source_payload->>'provenance' IS DISTINCT FROM source.provenance
        OR source_payload->>'extractorVersion' IS DISTINCT FROM source.extractor_version
        OR source_payload->>'policyVersion' IS DISTINCT FROM source.policy_version
        OR source_payload->>'operationId' IS DISTINCT FROM source.operation_id
        OR ARRAY(SELECT jsonb_array_elements_text(source_payload->'topicIds')) IS DISTINCT FROM memberships
        OR link_payload->>'sourceId' IS DISTINCT FROM link.source_id
        OR link_payload->>'topicId' IS DISTINCT FROM link.topic_id
        OR link_payload->>'method' IS DISTINCT FROM link.method THEN
      RAISE EXCEPTION 'Invalid canonical ingestion result' USING ERRCODE = 'P1204';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P1204' THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid canonical ingestion result' USING ERRCODE = 'P1204';
  END;
  RETURN jsonb_build_object(
    'version',jsonb_build_object('generation',runtime.generation,'revision',runtime.revision),
    'sourceId',source.id,
    'topicId',link.topic_id,
    'topicIds',to_jsonb(memberships),
    'assignment',CASE WHEN link.method='manual-confirmed' THEN 'confirmed' ELSE 'provisional' END,
    'policyVersion',source.policy_version
  )::text;
END
$ingest_source_response$;

CREATE FUNCTION canonical_v4.ingest_receipt(
  p_operation_id text,p_operation_digest text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_receipt$
DECLARE
  receipt canonical_v4.operation_receipts%ROWTYPE;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR p_operation_digest IS NULL OR p_operation_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid ingestion receipt request' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO receipt FROM canonical_v4.operation_receipts
    WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingestion receipt unavailable' USING ERRCODE = 'P1206';
  END IF;
  IF receipt.operation_digest<>p_operation_digest THEN
    RAISE EXCEPTION 'Operation ID already used' USING ERRCODE = 'P1201';
  END IF;
  RETURN canonical_v4.ingest_source_response(receipt.source_id);
END
$ingest_receipt$;

CREATE FUNCTION canonical_v4.ingest_apply(
  p_operation_id text,
  p_operation_digest text,
  p_lease_token text,
  p_represented_values double precision[],
  p_parameter_sha256 text,
  p_new_source_id text,
  p_new_topic_id text,
  p_new_discussion_id text,
  p_created_at text,
  p_source_stamp text,
  p_postable boolean
)
RETURNS TABLE(response_text text,terminal_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_apply$
DECLARE
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  job canonical_v4.ingestion_jobs%ROWTYPE;
  source canonical_v4.sources%ROWTYPE;
  link canonical_v4.source_links%ROWTYPE;
  old_receipt canonical_v4.operation_receipts%ROWTYPE;
  stamp canonical_v4.runtime_source_stamps%ROWTYPE;
  material jsonb;
  embedding jsonb;
  embedding_values double precision[];
  v_source_url text;
  v_source_title text;
  v_extractor_version text;
  v_model_id text;
  topic_ids text[];
  primary_topic_id text;
  v_policy_version text;
  v_source_id text;
  accepted_revision bigint;
  now_at timestamptz := clock_timestamp();
  identical boolean := false;
  rematch boolean := false;
  new_topic boolean := false;
  source_payload jsonb;
  embedding_payload jsonb;
  link_payload jsonb;
  reference_payload jsonb;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR p_operation_digest IS NULL OR p_operation_digest !~ '^[a-f0-9]{64}$'
      OR NOT canonical_v4.runtime_safe_text(p_lease_token,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_parameter_sha256,64,false)
      OR p_parameter_sha256<>'593a52ba9a5495a49ef00f4dae38770684389632f961b60ec07067fd8784b3e4'
      OR NOT canonical_v4.runtime_safe_text(p_new_source_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_new_topic_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_new_discussion_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_created_at,64,false)
      OR p_source_stamp IS NULL OR p_source_stamp !~ '^[a-f0-9]{64}$'
      OR p_postable IS DISTINCT FROM true
      OR p_represented_values IS NOT NULL
        AND NOT canonical_v4.ingest_valid_unit_vector(p_represented_values) THEN
    RAISE EXCEPTION 'Invalid ingestion apply request' USING ERRCODE = 'P1203';
  END IF;

  -- All catalog ingestion and learned-data lifecycle changes take this row
  -- first.  Expensive transformation happened before this call; the complete
  -- exact scan and every canonical mutation remain inside this transaction.
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane
    WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR lane.active_operation_id<>p_operation_id
      OR lane.active_lease_token<>p_lease_token OR lane.active_lease_until<=now_at THEN
    RAISE EXCEPTION 'Ingestion lease unavailable' USING ERRCODE = 'P1201';
  END IF;
  SELECT * INTO job FROM canonical_v4.ingestion_jobs AS queued
    WHERE queued.operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR job.state<>'leased' OR job.operation_digest<>p_operation_digest
      OR job.lease_token<>p_lease_token OR job.lease_until<=now_at
      OR job.authority_until<=now_at
      OR job.generation IS DISTINCT FROM (
        SELECT generation FROM canonical_v4.runtime_state WHERE singleton=true
      ) THEN
    RAISE EXCEPTION 'Ingestion lease unavailable' USING ERRCODE = 'P1201';
  END IF;
  v_source_url := canonical_v4.ingest_validate_material(job.request_material,job.operation_digest);
  BEGIN
    material := job.request_material::jsonb;
    v_source_title := material->>'title';
    v_extractor_version := material->>'extractorVersion';
    embedding := material->'embedding';
    v_model_id := embedding->>'modelId';
    SELECT array_agg(item::double precision ORDER BY ordinal) INTO embedding_values
      FROM jsonb_array_elements_text(embedding->'values') WITH ORDINALITY AS value(item,ordinal);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid queued ingestion material' USING ERRCODE = 'P1204';
  END;

  -- Receipt precedes Source in the shared lock order.  The witness identifies
  -- the row without trusting a current URL lookup.
  IF job.source_witness_present THEN
    SELECT * INTO old_receipt FROM canonical_v4.operation_receipts
      WHERE source_id=job.source_witness_id FOR UPDATE;
    SELECT * INTO source FROM canonical_v4.sources
      WHERE id=job.source_witness_id FOR UPDATE;
    IF NOT FOUND OR source.write_version<>job.source_witness_version
        OR source.url COLLATE "C"<>v_source_url COLLATE "C"
        OR source.provenance<>'owner-local-page-embedding/v1' THEN
      UPDATE canonical_v4.ingestion_jobs AS queued SET state='failed',request_material=NULL,
        source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
        lease_token=NULL,lease_until=NULL,source_witness_present=NULL,
        source_witness_id=NULL,source_witness_version=NULL,terminal_code='source-changed',
        terminal_at=now_at,updated_at=now_at WHERE queued.operation_id=p_operation_id;
      UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
        active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
      RETURN QUERY SELECT NULL::text,'source-changed'::text;
      RETURN;
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM canonical_v4.sources AS candidate
      WHERE candidate.url COLLATE "C"=v_source_url COLLATE "C") THEN
      UPDATE canonical_v4.ingestion_jobs AS queued SET state='failed',request_material=NULL,
        source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
        lease_token=NULL,lease_until=NULL,source_witness_present=NULL,
        source_witness_id=NULL,source_witness_version=NULL,terminal_code='source-changed',
        terminal_at=now_at,updated_at=now_at WHERE queued.operation_id=p_operation_id;
      UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
        active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
      RETURN QUERY SELECT NULL::text,'source-changed'::text;
      RETURN;
    END IF;
  END IF;

  IF job.source_witness_present THEN
    v_source_id := source.id;
    SELECT * INTO link FROM canonical_v4.source_links
      WHERE source_id=source.id FOR UPDATE;
    SELECT * INTO stamp FROM canonical_v4.runtime_source_stamps
      WHERE source_id=source.id FOR UPDATE;
    IF link.source_id IS NULL OR stamp.source_id IS NULL
        OR old_receipt.source_id IS NULL
        OR old_receipt.operation_id IS DISTINCT FROM source.operation_id THEN
      RAISE EXCEPTION 'Invalid canonical Source mirrors' USING ERRCODE = 'P1204';
    END IF;
    -- This validates Source/link/membership typed mirrors before they are
    -- changed and also rejects a missing or malformed policy/primary route.
    PERFORM canonical_v4.ingest_source_response(source.id);
    identical := source.title=v_source_title AND stamp.stamp=p_source_stamp;
    rematch := NOT identical AND link.method<>'manual-confirmed';
    v_policy_version := CASE WHEN identical OR link.method='manual-confirmed'
      THEN source.policy_version ELSE 'ridge1-fixed-reference-radius/v1' END;
  ELSE
    v_source_id := p_new_source_id;
    rematch := true;
    v_policy_version := 'ridge1-fixed-reference-radius/v1';
  END IF;

  IF rematch THEN
    IF p_represented_values IS NULL THEN
      topic_ids := ARRAY[]::text[];
    ELSE
      SELECT COALESCE(array_agg(topic_id ORDER BY topic_id COLLATE "C"),ARRAY[]::text[])
        INTO topic_ids
        FROM canonical_v4.ingest_ridge_scan(p_represented_values,p_parameter_sha256);
    END IF;
    IF cardinality(topic_ids)=0 THEN
      topic_ids := ARRAY[p_new_topic_id];
      new_topic := true;
    END IF;
    primary_topic_id := CASE
      WHEN link.topic_id IS NOT NULL AND link.topic_id=ANY(topic_ids) THEN link.topic_id
      ELSE topic_ids[1]
    END;
  ELSE
    SELECT array_agg(topic_id ORDER BY topic_id COLLATE "C") INTO topic_ids
      FROM canonical_v4.topic_memberships AS membership
      WHERE membership.source_id=v_source_id;
    primary_topic_id := link.topic_id;
  END IF;
  IF topic_ids IS NULL OR cardinality(topic_ids)=0 OR primary_topic_id IS NULL
      OR NOT primary_topic_id=ANY(topic_ids) THEN
    RAISE EXCEPTION 'Invalid canonical ingestion membership' USING ERRCODE = 'P1204';
  END IF;

  -- Lock all affected destinations before contribution ancestry.  Reads used
  -- only to assemble the lock set do not confer authority.
  PERFORM 1 FROM canonical_v4.discussions AS discussion
    WHERE discussion.topic_id=ANY(topic_ids)
       OR discussion.id IN (
         SELECT root.discussion_id FROM canonical_v4.contributions AS root
         WHERE root.root_id IS NULL AND root.anchor_source_id=v_source_id
       )
    ORDER BY discussion.id COLLATE "C" FOR NO KEY UPDATE;
  PERFORM 1 FROM canonical_v4.topics AS topic
    WHERE topic.id=ANY(topic_ids)
       OR topic.id IN (
         SELECT discussion.topic_id FROM canonical_v4.discussions AS discussion
         JOIN canonical_v4.contributions AS root ON root.discussion_id=discussion.id
         WHERE root.root_id IS NULL AND root.anchor_source_id=v_source_id
       )
    ORDER BY topic.id COLLATE "C" FOR SHARE;
  PERFORM 1 FROM canonical_v4.contributions AS contribution
    WHERE contribution.root_id IS NULL AND contribution.anchor_source_id=v_source_id
    ORDER BY contribution.id COLLATE "C" FOR UPDATE;

  IF job.source_witness_present AND NOT identical THEN
    WITH pinned AS (
      UPDATE canonical_v4.contributions AS root
      SET anchor_source_id=NULL,
          payload=(root.payload::jsonb || jsonb_build_object(
            'anchor',jsonb_build_object('kind','topic','topicId',discussion.topic_id)
          ))::text,
          write_version=root.write_version+1
      FROM canonical_v4.discussions AS discussion
      WHERE root.discussion_id=discussion.id AND root.root_id IS NULL
        AND root.anchor_source_id=v_source_id
      RETURNING root.discussion_id
    )
    UPDATE canonical_v4.discussions AS discussion
      SET write_version=discussion.write_version+1
      WHERE discussion.id IN (SELECT pinned.discussion_id FROM pinned);
  END IF;

  IF new_topic THEN
    reference_payload := CASE WHEN p_represented_values IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('sourceId',v_source_id,'values',to_jsonb(p_represented_values),
        'parameterSha256',p_parameter_sha256) END;
    INSERT INTO canonical_v4.id_registry(id,kind) VALUES(p_new_topic_id,'topics');
    INSERT INTO canonical_v4.id_registry(id,kind) VALUES(p_new_discussion_id,'discussions');
    INSERT INTO canonical_v4.topics(
      id,ordinal,payload,kind,title,created_at,provenance,retain_tight,write_version
    ) VALUES(
      p_new_topic_id,nextval('canonical_v4.topic_ordinal_sequence'),
      jsonb_build_object('id',p_new_topic_id,'kind','general','title',v_source_title,
        'createdAt',p_created_at,'provenance','owner-local-learned-topic/v1',
        'retainTight',false,'reference',reference_payload)::text,
      'general',v_source_title,p_created_at,'owner-local-learned-topic/v1',false,1
    );
    INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload,write_version)
      VALUES(p_new_discussion_id,p_new_topic_id,
        nextval('canonical_v4.discussion_ordinal_sequence'),
        jsonb_build_object('id',p_new_discussion_id,'topicId',p_new_topic_id)::text,0);
    INSERT INTO canonical_v4.fixed_references(
      topic_id,payload,source_id,parameter_sha256,values_double,vector_mirror
    ) VALUES(
      p_new_topic_id,reference_payload::text,
      CASE WHEN p_represented_values IS NULL THEN NULL ELSE v_source_id END,
      CASE WHEN p_represented_values IS NULL THEN NULL ELSE p_parameter_sha256 END,
      p_represented_values,NULL
    );
  END IF;

  embedding_payload := jsonb_build_object('modelId',v_model_id,'values',to_jsonb(embedding_values));
  source_payload := jsonb_build_object(
    'id',v_source_id,'url',v_source_url,'title',v_source_title,
    'embedding',embedding_payload,'provenance','owner-local-page-embedding/v1',
    'extractorVersion',v_extractor_version,'operationId',p_operation_id,
    'operationDigest',p_operation_digest,'policyVersion',v_policy_version,
    'topicIds',to_jsonb(topic_ids)
  );
  IF job.source_witness_present THEN
    UPDATE canonical_v4.sources AS current SET
      payload=source_payload::text,title=v_source_title,
      extractor_version=v_extractor_version,policy_version=v_policy_version,
      operation_id=p_operation_id,has_embedding=true,
      write_version=current.write_version+1
      WHERE current.id=v_source_id;
    UPDATE canonical_v4.embeddings SET payload=embedding_payload::text,
      model_id=v_model_id,dimensions=384,values_double=embedding_values,vector_mirror=NULL
      WHERE embeddings.source_id=v_source_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid canonical Source embedding' USING ERRCODE = 'P1204';
    END IF;
    UPDATE canonical_v4.runtime_source_stamps SET stamp=p_source_stamp,postable=p_postable
      WHERE runtime_source_stamps.source_id=v_source_id;
    DELETE FROM canonical_v4.operation_receipts AS receipt WHERE receipt.source_id=v_source_id;
  ELSE
    INSERT INTO canonical_v4.id_registry(id,kind) VALUES(v_source_id,'sources');
    INSERT INTO canonical_v4.sources(
      id,ordinal,payload,url,title,provenance,extractor_version,policy_version,
      operation_id,has_embedding,write_version
    ) VALUES(
      v_source_id,nextval('canonical_v4.source_ordinal_sequence'),source_payload::text,
      v_source_url,v_source_title,'owner-local-page-embedding/v1',v_extractor_version,
      v_policy_version,p_operation_id,true,1
    );
    INSERT INTO canonical_v4.embeddings(
      source_id,payload,model_id,dimensions,values_double,vector_mirror
    ) VALUES(v_source_id,embedding_payload::text,v_model_id,384,embedding_values,NULL);
    INSERT INTO canonical_v4.runtime_source_stamps(source_id,stamp,postable)
      VALUES(v_source_id,p_source_stamp,p_postable);
  END IF;
  INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest)
    VALUES(v_source_id,p_operation_id,p_operation_digest);

  IF rematch THEN
    DELETE FROM canonical_v4.topic_memberships AS membership
      WHERE membership.source_id=v_source_id;
    INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT v_source_id,topic_id,(ordinal-1)::integer
      FROM unnest(topic_ids) WITH ORDINALITY AS membership(topic_id,ordinal);
    IF job.source_witness_present THEN
      UPDATE canonical_v4.source_links AS current SET topic_id=primary_topic_id,
        payload=jsonb_build_object('sourceId',v_source_id,'topicId',primary_topic_id,
          'method',current.method)::text
        WHERE current.source_id=v_source_id;
    ELSE
      INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
        VALUES(v_source_id,primary_topic_id,nextval('canonical_v4.source_link_ordinal_sequence'),
          jsonb_build_object('sourceId',v_source_id,'topicId',primary_topic_id,
            'method','learned-provisional')::text,'learned-provisional');
    END IF;
  END IF;

  -- The watermark is the last shared canonical row acquired.  It orders the
  -- accepted mutation but does not reject an unrelated intervening write.
  UPDATE canonical_v4.runtime_state SET revision=revision+1,
    catalog_version=catalog_version+1,
    matching_version=matching_version+CASE WHEN rematch THEN 1 ELSE 0 END
    WHERE singleton=true AND generation=job.generation
    RETURNING revision INTO accepted_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;
  UPDATE canonical_v4.runtime_source_stamps
    SET catalog_revision=accepted_revision
    WHERE source_id=v_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid Source admission witness' USING ERRCODE = 'P1204';
  END IF;
  UPDATE canonical_v4.ingestion_jobs AS queued SET state='complete',request_material=NULL,
    source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
    lease_token=NULL,lease_until=NULL,source_witness_present=NULL,
    source_witness_id=NULL,source_witness_version=NULL,result_source_id=v_source_id,
    terminal_code=NULL,terminal_at=now_at,updated_at=now_at
    WHERE queued.operation_id=p_operation_id;
  UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
    active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
  RETURN QUERY SELECT canonical_v4.ingest_source_response(v_source_id),NULL::text;
END
$ingest_apply$;

CREATE FUNCTION canonical_v4.ingest_status(
  p_operation_id text,p_operation_digest text
)
RETURNS TABLE(state text,terminal_code text,response_text text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_status$
DECLARE
  job canonical_v4.ingestion_jobs%ROWTYPE;
  receipt canonical_v4.operation_receipts%ROWTYPE;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR p_operation_digest IS NULL OR p_operation_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid ingestion status request' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO receipt FROM canonical_v4.operation_receipts
    WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF receipt.operation_digest<>p_operation_digest THEN
      RAISE EXCEPTION 'Operation ID already used' USING ERRCODE = 'P1201';
    END IF;
    RETURN QUERY SELECT 'complete'::text,NULL::text,
      canonical_v4.ingest_source_response(receipt.source_id);
    RETURN;
  END IF;
  SELECT * INTO job FROM canonical_v4.ingestion_jobs
    WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingestion operation unavailable' USING ERRCODE = 'P1206';
  END IF;
  IF job.operation_digest<>p_operation_digest THEN
    RAISE EXCEPTION 'Operation ID already used' USING ERRCODE = 'P1201';
  END IF;
  RETURN QUERY SELECT job.state,job.terminal_code,
    CASE WHEN job.state='complete' THEN canonical_v4.ingest_source_response(job.result_source_id)
      ELSE NULL::text END;
END
$ingest_status$;

CREATE FUNCTION canonical_v4.ingest_fail_claim(
  p_operation_id text,p_operation_digest text,p_lease_token text,p_terminal_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_fail_claim$
DECLARE
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  job canonical_v4.ingestion_jobs%ROWTYPE;
  now_at timestamptz := clock_timestamp();
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR p_operation_digest IS NULL OR p_operation_digest !~ '^[a-f0-9]{64}$'
      OR NOT canonical_v4.runtime_safe_text(p_lease_token,128,false)
      OR p_terminal_code NOT IN ('representation-failed','worker-failed') THEN
    RAISE EXCEPTION 'Invalid ingestion failure request' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane
    WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR lane.active_operation_id<>p_operation_id
      OR lane.active_lease_token<>p_lease_token THEN
    RETURN false;
  END IF;
  SELECT * INTO job FROM canonical_v4.ingestion_jobs
    WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR job.state<>'leased' OR job.operation_digest<>p_operation_digest
      OR job.lease_token<>p_lease_token THEN
    RETURN false;
  END IF;
  UPDATE canonical_v4.ingestion_jobs AS queued SET state='failed',request_material=NULL,
    source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
    lease_token=NULL,lease_until=NULL,source_witness_present=NULL,
    source_witness_id=NULL,source_witness_version=NULL,terminal_code=p_terminal_code,
    terminal_at=now_at,updated_at=now_at WHERE queued.operation_id=p_operation_id;
  UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
    active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
  RETURN true;
END
$ingest_fail_claim$;

CREATE FUNCTION canonical_v4.ingest_require_idle_lane(p_generation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_require_idle_lane$
DECLARE
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_generation,128,false) THEN
    RAISE EXCEPTION 'Invalid learned lifecycle request' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane
    WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR lane.active_operation_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE state='leased') THEN
    RAISE EXCEPTION 'Canonical ingestion is busy' USING ERRCODE = 'P1201';
  END IF;
  PERFORM 1 FROM canonical_v4.runtime_state
    WHERE singleton=true AND generation=p_generation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;
END
$ingest_require_idle_lane$;

-- Owner-only mutation helper.  Callers acquire receipt/Source/destination/
-- contribution locks in the shared order before invoking it.
CREATE FUNCTION canonical_v4.ingest_forget_sources_internal(p_source_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_forget_sources_internal$
BEGIN
  IF p_source_ids IS NULL OR cardinality(p_source_ids)=0 THEN RETURN; END IF;

  UPDATE canonical_v4.ingestion_jobs AS job SET state='cancelled',request_material=NULL,
    source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
    lease_token=NULL,lease_until=NULL,terminal_code='lifecycle-forgotten',
    terminal_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE job.state='pending' AND (
      job.source_witness_id=ANY(p_source_ids)
      OR job.source_url IN (
        SELECT source.url FROM canonical_v4.sources AS source
        WHERE source.id=ANY(p_source_ids)
      )
    );

  UPDATE canonical_v4.topics AS topic SET
    payload=jsonb_set(topic.payload::jsonb,'{reference}','null'::jsonb,false)::text,
    write_version=topic.write_version+1
    WHERE topic.id IN (
      SELECT reference.topic_id FROM canonical_v4.fixed_references AS reference
      WHERE reference.source_id=ANY(p_source_ids)
    );
  UPDATE canonical_v4.fixed_references AS reference SET
    payload='null',source_id=NULL,parameter_sha256=NULL,values_double=NULL,vector_mirror=NULL
    WHERE reference.source_id=ANY(p_source_ids);

  WITH changed AS (
    UPDATE canonical_v4.contributions AS contribution SET
      origin_source_id=CASE WHEN contribution.origin_source_id=ANY(p_source_ids)
        THEN NULL ELSE contribution.origin_source_id END,
      anchor_source_id=CASE WHEN contribution.anchor_source_id=ANY(p_source_ids)
        THEN NULL ELSE contribution.anchor_source_id END,
      payload=(
        contribution.payload::jsonb
        - CASE WHEN contribution.origin_source_id=ANY(p_source_ids)
            THEN 'originSourceId' ELSE '__canonical_noop__' END
        || CASE WHEN contribution.root_id IS NULL
              AND contribution.anchor_source_id=ANY(p_source_ids)
          THEN jsonb_build_object('anchor',jsonb_build_object(
            'kind','topic','topicId',discussion.topic_id))
          ELSE '{}'::jsonb END
      )::text,
      write_version=contribution.write_version+1
    FROM canonical_v4.discussions AS discussion
    WHERE contribution.discussion_id=discussion.id AND (
      contribution.origin_source_id=ANY(p_source_ids)
      OR contribution.anchor_source_id=ANY(p_source_ids)
    )
    RETURNING contribution.discussion_id
  )
  UPDATE canonical_v4.discussions AS discussion
    SET write_version=discussion.write_version+1
    WHERE discussion.id IN (SELECT changed.discussion_id FROM changed);

  DELETE FROM canonical_v4.runtime_source_stamps WHERE source_id=ANY(p_source_ids);
  DELETE FROM canonical_v4.operation_receipts WHERE source_id=ANY(p_source_ids);
  DELETE FROM canonical_v4.topic_memberships WHERE source_id=ANY(p_source_ids);
  DELETE FROM canonical_v4.source_links WHERE source_id=ANY(p_source_ids);
  DELETE FROM canonical_v4.embeddings WHERE source_id=ANY(p_source_ids);
  DELETE FROM canonical_v4.sources WHERE id=ANY(p_source_ids);
END
$ingest_forget_sources_internal$;

CREATE FUNCTION canonical_v4.ingest_correct_source(
  p_generation text,p_source_id text,p_topic_id text,
  p_new_topic_id text,p_new_discussion_id text,p_created_at text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_correct_source$
DECLARE
  source canonical_v4.sources%ROWTYPE;
  link canonical_v4.source_links%ROWTYPE;
  destination canonical_v4.topics%ROWTYPE;
  previous_topic_id text;
  selected_topic_id text;
  base jsonb;
  accepted_revision bigint;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_source_id,128,false)
      OR p_topic_id IS NOT NULL AND NOT canonical_v4.runtime_safe_text(p_topic_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_new_topic_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_new_discussion_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_created_at,64,false) THEN
    RAISE EXCEPTION 'Invalid learned Source correction' USING ERRCODE = 'P1203';
  END IF;
  PERFORM canonical_v4.ingest_require_idle_lane(p_generation);
  PERFORM 1 FROM canonical_v4.operation_receipts
    WHERE source_id=p_source_id FOR UPDATE;
  SELECT * INTO source FROM canonical_v4.sources
    WHERE id=p_source_id FOR UPDATE;
  SELECT * INTO link FROM canonical_v4.source_links
    WHERE source_id=p_source_id FOR UPDATE;
  IF source.id IS NULL OR source.provenance<>'owner-local-page-embedding/v1'
      OR link.source_id IS NULL THEN
    RAISE EXCEPTION 'Learned Source unavailable' USING ERRCODE = 'P1206';
  END IF;
  PERFORM 1 FROM canonical_v4.runtime_source_stamps
    WHERE source_id=p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid Source admission witness' USING ERRCODE = 'P1204';
  END IF;
  PERFORM canonical_v4.ingest_source_response(source.id);
  previous_topic_id := link.topic_id;
  selected_topic_id := COALESCE(p_topic_id,p_new_topic_id);

  PERFORM 1 FROM canonical_v4.discussions AS discussion
    WHERE discussion.topic_id=selected_topic_id
       OR discussion.id IN (
         SELECT root.discussion_id FROM canonical_v4.contributions AS root
         WHERE root.root_id IS NULL AND root.anchor_source_id=p_source_id
       )
    ORDER BY discussion.id COLLATE "C" FOR NO KEY UPDATE;
  IF p_topic_id IS NOT NULL THEN
    SELECT * INTO destination FROM canonical_v4.topics
      WHERE id=p_topic_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Correction destination unavailable' USING ERRCODE = 'P1206';
    END IF;
  END IF;
  PERFORM 1 FROM canonical_v4.topics AS topic
    WHERE topic.id IN (
      SELECT discussion.topic_id FROM canonical_v4.discussions AS discussion
      JOIN canonical_v4.contributions AS root ON root.discussion_id=discussion.id
      WHERE root.root_id IS NULL AND root.anchor_source_id=p_source_id
    )
    ORDER BY topic.id COLLATE "C" FOR SHARE;
  PERFORM 1 FROM canonical_v4.contributions AS contribution
    WHERE contribution.root_id IS NULL AND contribution.anchor_source_id=p_source_id
    ORDER BY contribution.id COLLATE "C" FOR UPDATE;

  IF p_topic_id IS NULL THEN
    INSERT INTO canonical_v4.id_registry(id,kind) VALUES(p_new_topic_id,'topics');
    INSERT INTO canonical_v4.id_registry(id,kind) VALUES(p_new_discussion_id,'discussions');
    INSERT INTO canonical_v4.topics(
      id,ordinal,payload,kind,title,created_at,provenance,retain_tight,write_version
    ) VALUES(
      p_new_topic_id,nextval('canonical_v4.topic_ordinal_sequence'),
      jsonb_build_object('id',p_new_topic_id,'kind','general','title',source.title,
        'createdAt',p_created_at,'provenance','owner-local-learned-topic/v1',
        'retainTight',false)::text,
      'general',source.title,p_created_at,'owner-local-learned-topic/v1',false,1
    );
    INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload,write_version)
      VALUES(p_new_discussion_id,p_new_topic_id,
        nextval('canonical_v4.discussion_ordinal_sequence'),
        jsonb_build_object('id',p_new_discussion_id,'topicId',p_new_topic_id)::text,0);
  END IF;

  IF previous_topic_id<>selected_topic_id THEN
    WITH pinned AS (
      UPDATE canonical_v4.contributions AS root SET anchor_source_id=NULL,
        payload=(root.payload::jsonb || jsonb_build_object('anchor',jsonb_build_object(
          'kind','topic','topicId',discussion.topic_id)))::text,
        write_version=root.write_version+1
      FROM canonical_v4.discussions AS discussion
      WHERE root.discussion_id=discussion.id AND root.root_id IS NULL
        AND root.anchor_source_id=p_source_id
      RETURNING root.discussion_id
    )
    UPDATE canonical_v4.discussions AS discussion
      SET write_version=discussion.write_version+1
      WHERE discussion.id IN (SELECT pinned.discussion_id FROM pinned);
  END IF;
  UPDATE canonical_v4.ingestion_jobs AS job SET state='cancelled',request_material=NULL,
    source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
    lease_token=NULL,lease_until=NULL,terminal_code='lifecycle-changed',
    terminal_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE job.state='pending' AND job.source_witness_id=p_source_id;
  DELETE FROM canonical_v4.topic_memberships WHERE source_id=p_source_id;
  INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
    VALUES(p_source_id,selected_topic_id,0);
  UPDATE canonical_v4.sources AS current SET
    payload=(current.payload::jsonb || jsonb_build_object(
      'topicIds',jsonb_build_array(selected_topic_id)))::text,
    write_version=current.write_version+1
    WHERE current.id=p_source_id;
  UPDATE canonical_v4.source_links SET topic_id=selected_topic_id,
    method='manual-confirmed',payload=jsonb_build_object(
      'sourceId',p_source_id,'topicId',selected_topic_id,'method','manual-confirmed')::text
    WHERE source_id=p_source_id;
  UPDATE canonical_v4.runtime_state SET revision=revision+1,
    catalog_version=catalog_version+1,matching_version=matching_version+1
    WHERE singleton=true AND generation=p_generation
    RETURNING revision INTO accepted_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;
  UPDATE canonical_v4.runtime_source_stamps
    SET catalog_revision=accepted_revision
    WHERE source_id=p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid Source admission witness' USING ERRCODE = 'P1204';
  END IF;
  base := canonical_v4.ingest_source_response(p_source_id)::jsonb;
  RETURN jsonb_build_object('version',base->'version','result',
    (base-'version') || jsonb_build_object('previousTopicId',previous_topic_id))::text;
END
$ingest_correct_source$;

CREATE FUNCTION canonical_v4.ingest_forget_source(
  p_generation text,p_source_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_forget_source$
DECLARE
  source canonical_v4.sources%ROWTYPE;
  runtime canonical_v4.runtime_state%ROWTYPE;
  source_ids text[] := ARRAY[p_source_id];
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_source_id,128,false) THEN
    RAISE EXCEPTION 'Invalid learned Source forget request' USING ERRCODE = 'P1203';
  END IF;
  PERFORM canonical_v4.ingest_require_idle_lane(p_generation);
  PERFORM 1 FROM canonical_v4.operation_receipts
    WHERE source_id=p_source_id FOR UPDATE;
  SELECT * INTO source FROM canonical_v4.sources
    WHERE id=p_source_id FOR UPDATE;
  IF NOT FOUND OR source.provenance<>'owner-local-page-embedding/v1' THEN
    RAISE EXCEPTION 'Learned Source unavailable' USING ERRCODE = 'P1206';
  END IF;
  PERFORM 1 FROM canonical_v4.source_links WHERE source_id=p_source_id FOR UPDATE;
  PERFORM 1 FROM canonical_v4.discussions AS discussion
    WHERE discussion.id IN (
      SELECT contribution.discussion_id FROM canonical_v4.contributions AS contribution
      WHERE contribution.origin_source_id=p_source_id OR contribution.anchor_source_id=p_source_id
    ) ORDER BY discussion.id COLLATE "C" FOR NO KEY UPDATE;
  PERFORM 1 FROM canonical_v4.topics AS topic
    WHERE topic.id IN (
      SELECT reference.topic_id FROM canonical_v4.fixed_references AS reference
      WHERE reference.source_id=p_source_id
      UNION
      SELECT discussion.topic_id FROM canonical_v4.discussions AS discussion
      JOIN canonical_v4.contributions AS contribution ON contribution.discussion_id=discussion.id
      WHERE contribution.origin_source_id=p_source_id OR contribution.anchor_source_id=p_source_id
    ) ORDER BY topic.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.contributions AS contribution
    WHERE contribution.origin_source_id=p_source_id OR contribution.anchor_source_id=p_source_id
    ORDER BY contribution.id COLLATE "C" FOR UPDATE;
  PERFORM canonical_v4.ingest_forget_sources_internal(source_ids);
  UPDATE canonical_v4.runtime_state SET revision=revision+1,
    catalog_version=catalog_version+1,matching_version=matching_version+1,
    source_absence_revision=revision+1
    WHERE singleton=true AND generation=p_generation
    RETURNING * INTO runtime;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;
  RETURN jsonb_build_object(
    'version',jsonb_build_object('generation',runtime.generation,'revision',runtime.revision),
    'result',jsonb_build_object('sourceId',p_source_id)
  )::text;
END
$ingest_forget_source$;

CREATE FUNCTION canonical_v4.ingest_delete_learned_topic(
  p_generation text,p_topic_id text,p_confirmation text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_delete_learned_topic$
DECLARE
  topic canonical_v4.topics%ROWTYPE;
  forgotten_source_ids text[];
  surviving_source_ids text[];
  surviving_source_id text;
  surviving_topic_ids text[];
  target_discussion_ids text[];
  affected_discussion_ids text[];
  affected_topic_ids text[];
  runtime canonical_v4.runtime_state%ROWTYPE;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_topic_id,128,false)
      OR p_confirmation<>'DELETE TOPIC AND DISCUSSION' THEN
    RAISE EXCEPTION 'Invalid learned Topic deletion' USING ERRCODE = 'P1203';
  END IF;
  PERFORM canonical_v4.ingest_require_idle_lane(p_generation);
  SELECT * INTO topic FROM canonical_v4.topics WHERE id=p_topic_id;
  IF NOT FOUND OR topic.provenance IS DISTINCT FROM 'owner-local-learned-topic/v1' THEN
    RAISE EXCEPTION 'Learned Topic unavailable for deletion' USING ERRCODE = 'P1205';
  END IF;
  SELECT COALESCE(array_agg(link.source_id ORDER BY link.ordinal),ARRAY[]::text[])
    INTO forgotten_source_ids
    FROM canonical_v4.source_links AS link WHERE link.topic_id=p_topic_id;
  SELECT COALESCE(array_agg(membership.source_id ORDER BY membership.source_id COLLATE "C"),
      ARRAY[]::text[])
    INTO surviving_source_ids
    FROM canonical_v4.topic_memberships AS membership
    WHERE membership.topic_id=p_topic_id
      AND NOT membership.source_id=ANY(forgotten_source_ids);
  IF EXISTS(SELECT 1 FROM canonical_v4.sources AS source
    WHERE source.id=ANY(forgotten_source_ids)
      AND source.provenance<>'owner-local-page-embedding/v1') THEN
    RAISE EXCEPTION 'Learned Topic unavailable for deletion' USING ERRCODE = 'P1205';
  END IF;
  SELECT array_agg(discussion.id ORDER BY discussion.id COLLATE "C")
    INTO target_discussion_ids FROM canonical_v4.discussions AS discussion
    WHERE discussion.topic_id=p_topic_id;
  SELECT COALESCE(array_agg(DISTINCT contribution.discussion_id
      ORDER BY contribution.discussion_id),ARRAY[]::text[])
    INTO affected_discussion_ids
    FROM canonical_v4.contributions AS contribution
    WHERE contribution.origin_source_id=ANY(forgotten_source_ids)
       OR contribution.anchor_source_id=ANY(forgotten_source_ids)
       OR contribution.discussion_id=ANY(target_discussion_ids);
  SELECT COALESCE(array_agg(DISTINCT selected.topic_id
      ORDER BY selected.topic_id),ARRAY[]::text[])
    INTO affected_topic_ids FROM (
      SELECT p_topic_id AS topic_id
      UNION
      SELECT reference.topic_id FROM canonical_v4.fixed_references AS reference
        WHERE reference.source_id=ANY(forgotten_source_ids)
      UNION
      SELECT discussion.topic_id FROM canonical_v4.discussions AS discussion
        WHERE discussion.id=ANY(affected_discussion_ids)
    ) AS selected;

  PERFORM 1 FROM canonical_v4.operation_receipts AS receipt
    WHERE receipt.source_id=ANY(forgotten_source_ids)
       OR receipt.source_id=ANY(surviving_source_ids)
    ORDER BY receipt.source_id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.command_receipts AS receipt
    WHERE receipt.discussion_id=ANY(target_discussion_ids)
    ORDER BY receipt.actor_id COLLATE "C",receipt.request_id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.sources AS source
    WHERE source.id=ANY(forgotten_source_ids) OR source.id=ANY(surviving_source_ids)
    ORDER BY source.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.source_links AS link
    WHERE link.source_id=ANY(forgotten_source_ids) FOR UPDATE;
  PERFORM 1 FROM canonical_v4.runtime_source_stamps AS stamp
    WHERE stamp.source_id=ANY(forgotten_source_ids)
       OR stamp.source_id=ANY(surviving_source_ids)
    ORDER BY stamp.source_id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.discussions AS discussion
    WHERE discussion.id=ANY(affected_discussion_ids)
    ORDER BY discussion.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.topics AS locked_topic
    WHERE locked_topic.id=ANY(affected_topic_ids)
    ORDER BY locked_topic.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.contributions AS contribution
    WHERE contribution.discussion_id=ANY(target_discussion_ids)
       OR contribution.origin_source_id=ANY(forgotten_source_ids)
       OR contribution.anchor_source_id=ANY(forgotten_source_ids)
    ORDER BY contribution.id COLLATE "C" FOR UPDATE;

  PERFORM canonical_v4.ingest_forget_sources_internal(forgotten_source_ids);
  -- A surviving page which held this Topic only as a secondary membership is
  -- retained and loses exactly that one membership.
  UPDATE canonical_v4.sources AS source SET
    payload=jsonb_set(source.payload::jsonb,'{topicIds}',
      COALESCE((SELECT jsonb_agg(membership.topic_id ORDER BY membership.topic_id COLLATE "C")
        FROM canonical_v4.topic_memberships AS membership
        WHERE membership.source_id=source.id AND membership.topic_id<>p_topic_id),'[]'::jsonb),false)::text,
    write_version=source.write_version+1
    WHERE source.provenance='owner-local-page-embedding/v1'
      AND EXISTS(SELECT 1 FROM canonical_v4.topic_memberships AS membership
        WHERE membership.source_id=source.id AND membership.topic_id=p_topic_id);
  -- Rebuild only the surviving Sources' small membership rows.  This preserves
  -- the exact sorted zero-based mirror without a global ordinal rewrite or a
  -- temporary offset that could collide/overflow at large catalog sizes.
  FOREACH surviving_source_id IN ARRAY surviving_source_ids LOOP
    SELECT array_agg(membership.topic_id ORDER BY membership.topic_id COLLATE "C")
      INTO surviving_topic_ids
      FROM canonical_v4.topic_memberships AS membership
      WHERE membership.source_id=surviving_source_id
        AND membership.topic_id<>p_topic_id;
    DELETE FROM canonical_v4.topic_memberships
      WHERE source_id=surviving_source_id;
    INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT surviving_source_id,member.topic_id,(member.ordinal-1)::integer
      FROM unnest(surviving_topic_ids) WITH ORDINALITY AS member(topic_id,ordinal);
  END LOOP;
  DELETE FROM canonical_v4.topic_memberships WHERE topic_id=p_topic_id;
  DELETE FROM canonical_v4.command_receipts WHERE discussion_id=ANY(target_discussion_ids);
  DELETE FROM canonical_v4.revisions WHERE contribution_id IN (
    SELECT contribution.id FROM canonical_v4.contributions AS contribution
    WHERE contribution.discussion_id=ANY(target_discussion_ids)
  );
  DELETE FROM canonical_v4.contributions WHERE discussion_id=ANY(target_discussion_ids);
  DELETE FROM canonical_v4.fixed_references WHERE topic_id=p_topic_id;
  DELETE FROM canonical_v4.discussions WHERE id=ANY(target_discussion_ids);
  DELETE FROM canonical_v4.topics WHERE id=p_topic_id;
  UPDATE canonical_v4.runtime_state SET revision=revision+1,
    catalog_version=catalog_version+1,matching_version=matching_version+1,
    source_absence_revision=CASE WHEN cardinality(forgotten_source_ids)>0
      THEN revision+1 ELSE source_absence_revision END
    WHERE singleton=true AND generation=p_generation RETURNING * INTO runtime;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;
  IF cardinality(surviving_source_ids)>0 THEN
    UPDATE canonical_v4.runtime_source_stamps
      SET catalog_revision=runtime.revision
      WHERE source_id=ANY(surviving_source_ids);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid Source admission witness' USING ERRCODE = 'P1204';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'version',jsonb_build_object('generation',runtime.generation,'revision',runtime.revision),
    'result',jsonb_build_object('topicId',p_topic_id,
      'forgottenSourceIds',to_jsonb(forgotten_source_ids))
  )::text;
END
$ingest_delete_learned_topic$;

CREATE FUNCTION canonical_v4.ingest_clear_learned_data(
  p_generation text,p_confirmation text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_clear_learned_data$
DECLARE
  forgotten_source_ids text[];
  deleted_topic_ids text[];
  deleted_discussion_ids text[];
  learned_root_ids text[];
  deleted_contribution_ids text[];
  affected_discussion_ids text[];
  affected_topic_ids text[];
  runtime canonical_v4.runtime_state%ROWTYPE;
BEGIN
  IF p_confirmation<>'CLEAR LEARNED DATA' THEN
    RAISE EXCEPTION 'Invalid learned-data clear request' USING ERRCODE = 'P1203';
  END IF;
  PERFORM canonical_v4.ingest_require_idle_lane(p_generation);
  SELECT COALESCE(array_agg(source.id ORDER BY source.ordinal),ARRAY[]::text[])
    INTO forgotten_source_ids FROM canonical_v4.sources AS source
    WHERE source.provenance='owner-local-page-embedding/v1';
  SELECT COALESCE(array_agg(topic.id ORDER BY topic.ordinal),ARRAY[]::text[])
    INTO deleted_topic_ids FROM canonical_v4.topics AS topic
    WHERE topic.provenance='owner-local-learned-topic/v1';
  IF EXISTS(SELECT 1 FROM canonical_v4.source_links AS link
    JOIN canonical_v4.sources AS source ON source.id=link.source_id
    WHERE link.topic_id=ANY(deleted_topic_ids)
      AND source.provenance<>'owner-local-page-embedding/v1') THEN
    RAISE EXCEPTION 'Invalid learned Topic boundary' USING ERRCODE = 'P1204';
  END IF;
  SELECT COALESCE(array_agg(discussion.id ORDER BY discussion.id COLLATE "C"),ARRAY[]::text[])
    INTO deleted_discussion_ids FROM canonical_v4.discussions AS discussion
    WHERE discussion.topic_id=ANY(deleted_topic_ids);
  SELECT COALESCE(array_agg(contribution.id ORDER BY contribution.id COLLATE "C"),ARRAY[]::text[])
    INTO learned_root_ids FROM canonical_v4.contributions AS contribution
    WHERE contribution.root_id IS NULL
      AND COALESCE((contribution.payload::jsonb->>'learnedOrigin')::boolean,false);
  SELECT COALESCE(array_agg(contribution.id ORDER BY contribution.id COLLATE "C"),ARRAY[]::text[])
    INTO deleted_contribution_ids FROM canonical_v4.contributions AS contribution
    WHERE contribution.discussion_id=ANY(deleted_discussion_ids)
       OR contribution.id=ANY(learned_root_ids)
       OR contribution.root_id=ANY(learned_root_ids);
  SELECT COALESCE(array_agg(DISTINCT contribution.discussion_id
      ORDER BY contribution.discussion_id),ARRAY[]::text[])
    INTO affected_discussion_ids FROM canonical_v4.contributions AS contribution
    WHERE contribution.id=ANY(deleted_contribution_ids)
       OR contribution.origin_source_id=ANY(forgotten_source_ids)
       OR contribution.anchor_source_id=ANY(forgotten_source_ids);
  SELECT COALESCE(array_agg(DISTINCT selected.topic_id
      ORDER BY selected.topic_id),ARRAY[]::text[])
    INTO affected_topic_ids FROM (
      SELECT unnest(deleted_topic_ids) AS topic_id
      UNION
      SELECT reference.topic_id FROM canonical_v4.fixed_references AS reference
        WHERE reference.source_id=ANY(forgotten_source_ids)
      UNION
      SELECT discussion.topic_id FROM canonical_v4.discussions AS discussion
        WHERE discussion.id=ANY(affected_discussion_ids)
    ) AS selected;

  PERFORM 1 FROM canonical_v4.operation_receipts AS receipt
    WHERE receipt.source_id=ANY(forgotten_source_ids)
    ORDER BY receipt.source_id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.command_receipts AS receipt
    WHERE receipt.contribution_id=ANY(deleted_contribution_ids)
       OR receipt.discussion_id=ANY(deleted_discussion_ids)
    ORDER BY receipt.actor_id COLLATE "C",receipt.request_id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.sources AS source
    WHERE source.id=ANY(forgotten_source_ids)
    ORDER BY source.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.discussions AS discussion
    WHERE discussion.id=ANY(affected_discussion_ids)
    ORDER BY discussion.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.topics AS topic
    WHERE topic.id=ANY(affected_topic_ids)
    ORDER BY topic.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.contributions AS contribution
    WHERE contribution.id=ANY(deleted_contribution_ids)
       OR contribution.origin_source_id=ANY(forgotten_source_ids)
       OR contribution.anchor_source_id=ANY(forgotten_source_ids)
    ORDER BY contribution.id COLLATE "C" FOR UPDATE;

  -- Remove learned-origin trees even if a manual correction routed their root
  -- into a retained Topic.  Unrelated retained roots in that discussion stay.
  DELETE FROM canonical_v4.command_receipts
    WHERE contribution_id=ANY(deleted_contribution_ids)
       OR discussion_id=ANY(deleted_discussion_ids);
  DELETE FROM canonical_v4.revisions
    WHERE contribution_id=ANY(deleted_contribution_ids);
  DELETE FROM canonical_v4.contributions
    WHERE id=ANY(deleted_contribution_ids);
  PERFORM canonical_v4.ingest_forget_sources_internal(forgotten_source_ids);
  DELETE FROM canonical_v4.topic_memberships WHERE topic_id=ANY(deleted_topic_ids);
  DELETE FROM canonical_v4.fixed_references WHERE topic_id=ANY(deleted_topic_ids);
  DELETE FROM canonical_v4.discussions WHERE id=ANY(deleted_discussion_ids);
  DELETE FROM canonical_v4.topics WHERE id=ANY(deleted_topic_ids);
  UPDATE canonical_v4.runtime_state SET revision=revision+1,
    catalog_version=catalog_version+1,matching_version=matching_version+1,
    source_absence_revision=CASE WHEN cardinality(forgotten_source_ids)>0
      THEN revision+1 ELSE source_absence_revision END
    WHERE singleton=true AND generation=p_generation RETURNING * INTO runtime;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;
  RETURN jsonb_build_object(
    'version',jsonb_build_object('generation',runtime.generation,'revision',runtime.revision),
    'result',jsonb_build_object('forgottenSourceIds',to_jsonb(forgotten_source_ids),
      'deletedTopicIds',to_jsonb(deleted_topic_ids))
  )::text;
END
$ingest_clear_learned_data$;

REVOKE ALL ON FUNCTION canonical_v4.ingest_default_runtime_witness() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_default_source_catalog_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_wipe_terminal_witness() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_source_response(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_receipt(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_apply(
  text,text,text,double precision[],text,text,text,text,text,text,boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_status(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_fail_claim(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_require_idle_lane(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_forget_sources_internal(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_correct_source(text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_forget_source(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_delete_learned_topic(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_clear_learned_data(text,text) FROM PUBLIC;

DO $ingest_apply_permissions$
DECLARE
  boundary_role text;
  unexpected integer;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT EXECUTE ON FUNCTION
      canonical_v4.ingest_receipt(text,text),
      canonical_v4.ingest_status(text,text),
      canonical_v4.ingest_correct_source(text,text,text,text,text,text),
      canonical_v4.ingest_forget_source(text,text),
      canonical_v4.ingest_delete_learned_topic(text,text,text),
      canonical_v4.ingest_clear_learned_data(text,text)
      TO murmingle_app;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_crawler_submitter') THEN
    GRANT EXECUTE ON FUNCTION
      canonical_v4.ingest_receipt(text,text),
      canonical_v4.ingest_status(text,text)
      TO murmingle_crawler_submitter;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
    GRANT EXECUTE ON FUNCTION
      canonical_v4.ingest_apply(
        text,text,text,double precision[],text,text,text,text,text,text,boolean
      ),
      canonical_v4.ingest_fail_claim(text,text,text,text)
      TO murmingle_ingest_worker;
  END IF;

  -- New SECURITY DEFINER helpers must never inherit PostgreSQL's default
  -- PUBLIC EXECUTE capability.
  IF EXISTS(
    SELECT 1 FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='canonical_v4'
      AND procedure.proname IN (
        'ingest_default_runtime_witness','ingest_default_source_catalog_revision',
        'ingest_wipe_terminal_witness','ingest_source_response',
        'ingest_receipt','ingest_apply','ingest_status','ingest_fail_claim',
        'ingest_require_idle_lane','ingest_forget_sources_internal',
        'ingest_correct_source','ingest_forget_source',
        'ingest_delete_learned_topic','ingest_clear_learned_data'
      )
      AND has_function_privilege('public',procedure.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains canonical ingestion apply capability';
  END IF;

  FOREACH boundary_role IN ARRAY ARRAY[
    'murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'
  ] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=boundary_role) THEN
      SELECT count(*) INTO unexpected
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='canonical_v4'
        AND procedure.proname IN (
          'ingest_default_runtime_witness','ingest_default_source_catalog_revision',
          'ingest_wipe_terminal_witness','ingest_source_response',
          'ingest_receipt','ingest_apply','ingest_status','ingest_fail_claim',
          'ingest_require_idle_lane','ingest_forget_sources_internal',
          'ingest_correct_source','ingest_forget_source',
          'ingest_delete_learned_topic','ingest_clear_learned_data'
        )
        AND has_function_privilege(boundary_role,procedure.oid,'EXECUTE')
        AND NOT (
          boundary_role='murmingle_app' AND procedure.proname IN (
            'ingest_receipt','ingest_status','ingest_correct_source',
            'ingest_forget_source','ingest_delete_learned_topic',
            'ingest_clear_learned_data'
          )
          OR boundary_role='murmingle_crawler_submitter'
            AND procedure.proname IN ('ingest_receipt','ingest_status')
          OR boundary_role='murmingle_ingest_worker'
            AND procedure.proname IN ('ingest_apply','ingest_fail_claim')
        );
      IF unexpected<>0 THEN
        RAISE EXCEPTION '% retains invalid canonical apply capability',boundary_role;
      END IF;
    END IF;
  END LOOP;
END
$ingest_apply_permissions$;
