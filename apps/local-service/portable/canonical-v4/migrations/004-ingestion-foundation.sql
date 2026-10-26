-- This migration installs only durable admission, leasing and exact fixed-
-- reference matching. Canonical ingestion apply is intentionally absent until
-- the complete v4 domain transition has an independently reviewed SQL port.

-- Imported v4 state is expected to have one learned Source per URL and one
-- durable owner of every operation ID. Refuse to turn ambiguous legacy rows
-- into whichever row a unique index happens to retain.
DO $ingest_duplicate_preflight$
BEGIN
  IF EXISTS(
    SELECT 1 FROM canonical_v4.sources
    GROUP BY url COLLATE "C"
    HAVING count(*) > 1
      AND count(*) FILTER (WHERE provenance='owner-local-page-embedding/v1') > 0
  ) THEN
    RAISE EXCEPTION 'Duplicate learned Source URL' USING ERRCODE = 'P1204';
  END IF;
  IF EXISTS(
    SELECT 1 FROM canonical_v4.operation_receipts
    GROUP BY operation_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ingestion operation ID' USING ERRCODE = 'P1204';
  END IF;
END
$ingest_duplicate_preflight$;

CREATE UNIQUE INDEX sources_learned_url_unique
  ON canonical_v4.sources(url COLLATE "C")
  WHERE provenance='owner-local-page-embedding/v1';
CREATE UNIQUE INDEX operation_receipts_operation_unique
  ON canonical_v4.operation_receipts(operation_id);

-- Retained fixtures are not globally required to have unique URLs, but a
-- learned URL must never be ambiguous with a retained or learned row. App roles
-- cannot write Sources directly; this also protects future owner-only apply.
CREATE FUNCTION canonical_v4.ingest_guard_learned_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $ingest_guard_learned_url$
BEGIN
  IF (NEW.provenance='owner-local-page-embedding/v1'
      OR EXISTS(SELECT 1 FROM canonical_v4.sources AS learned
        WHERE learned.url COLLATE "C"=NEW.url COLLATE "C"
          AND learned.provenance='owner-local-page-embedding/v1'
          AND learned.id<>NEW.id))
      AND EXISTS(SELECT 1 FROM canonical_v4.sources AS other
        WHERE other.url COLLATE "C"=NEW.url COLLATE "C" AND other.id<>NEW.id) THEN
    RAISE EXCEPTION 'Learned Source URL already exists' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END
$ingest_guard_learned_url$;
CREATE TRIGGER sources_learned_url_guard
  BEFORE INSERT OR UPDATE OF url,provenance ON canonical_v4.sources
  FOR EACH ROW EXECUTE FUNCTION canonical_v4.ingest_guard_learned_url();

-- These are stable append ordinals, not dense indexes. Gaps after rollback are
-- valid. Applying 004 after an import starts above the imported maximum;
-- initializeCanonicalV4Runtime performs the same initialization when the
-- import happens after 004.
CREATE SEQUENCE canonical_v4.topic_ordinal_sequence
  AS bigint MINVALUE 0 START WITH 0;
CREATE SEQUENCE canonical_v4.discussion_ordinal_sequence
  AS bigint MINVALUE 0 START WITH 0;
CREATE SEQUENCE canonical_v4.source_ordinal_sequence
  AS bigint MINVALUE 0 START WITH 0;
CREATE SEQUENCE canonical_v4.source_link_ordinal_sequence
  AS bigint MINVALUE 0 START WITH 0;
CREATE SEQUENCE canonical_v4.ingestion_job_ordinal_sequence
  AS bigint MINVALUE 0 START WITH 0;

SELECT setval('canonical_v4.topic_ordinal_sequence',
  COALESCE((SELECT max(ordinal)+1 FROM canonical_v4.topics),0),false);
SELECT setval('canonical_v4.discussion_ordinal_sequence',
  COALESCE((SELECT max(ordinal)+1 FROM canonical_v4.discussions),0),false);
SELECT setval('canonical_v4.source_ordinal_sequence',
  COALESCE((SELECT max(ordinal)+1 FROM canonical_v4.sources),0),false);
SELECT setval('canonical_v4.source_link_ordinal_sequence',
  COALESCE((SELECT max(ordinal)+1 FROM canonical_v4.source_links),0),false);
SELECT setval('canonical_v4.contribution_ordinal_sequence',
  greatest(
    COALESCE((SELECT max(ordinal)+1 FROM canonical_v4.contributions),0),
    (SELECT CASE WHEN is_called THEN last_value+1 ELSE last_value END
      FROM canonical_v4.contribution_ordinal_sequence)
  ),false);

CREATE TABLE canonical_v4.ingestion_jobs (
  operation_id text COLLATE "C" PRIMARY KEY,
  operation_digest text NOT NULL CHECK (operation_digest ~ '^[a-f0-9]{64}$'),
  generation text NOT NULL,
  expected_revision bigint NOT NULL CHECK (expected_revision >= 0),
  job_class text NOT NULL CHECK (job_class IN ('interactive','crawler')),
  ordinal bigint NOT NULL UNIQUE CHECK (ordinal >= 0),
  state text NOT NULL CHECK (state IN ('pending','leased','complete','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  request_material text,
  source_url text COLLATE "C",
  authority_token text COLLATE "C",
  authority_until timestamptz,
  worker_id text COLLATE "C",
  lease_token text COLLATE "C",
  lease_until timestamptz,
  result_source_id text COLLATE "C"
    REFERENCES canonical_v4.sources(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  terminal_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  terminal_at timestamptz,
  CHECK (
    (state='pending' AND request_material IS NOT NULL AND source_url IS NOT NULL
      AND authority_token IS NOT NULL AND authority_until IS NOT NULL
      AND worker_id IS NULL AND lease_token IS NULL AND lease_until IS NULL
      AND result_source_id IS NULL AND terminal_code IS NULL AND terminal_at IS NULL)
    OR
    (state='leased' AND request_material IS NOT NULL AND source_url IS NOT NULL
      AND authority_token IS NOT NULL AND authority_until IS NOT NULL
      AND worker_id IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL
      AND result_source_id IS NULL AND terminal_code IS NULL AND terminal_at IS NULL)
    OR
    (state='complete' AND request_material IS NULL AND source_url IS NULL
      AND authority_token IS NULL AND authority_until IS NULL
      AND worker_id IS NULL AND lease_token IS NULL AND lease_until IS NULL
      AND result_source_id IS NOT NULL AND terminal_code IS NULL AND terminal_at IS NOT NULL)
    OR
    (state IN ('failed','cancelled') AND request_material IS NULL AND source_url IS NULL
      AND authority_token IS NULL AND authority_until IS NULL
      AND worker_id IS NULL AND lease_token IS NULL AND lease_until IS NULL
      AND result_source_id IS NULL AND terminal_code IS NOT NULL AND terminal_at IS NOT NULL)
  )
);
CREATE INDEX ingestion_jobs_schedule
  ON canonical_v4.ingestion_jobs(job_class,ordinal)
  WHERE state='pending';
CREATE INDEX ingestion_jobs_live_class
  ON canonical_v4.ingestion_jobs(job_class,state)
  WHERE state IN ('pending','leased');
CREATE UNIQUE INDEX ingestion_jobs_live_source_url
  ON canonical_v4.ingestion_jobs(source_url)
  WHERE state IN ('pending','leased');
CREATE UNIQUE INDEX ingestion_jobs_single_lease
  ON canonical_v4.ingestion_jobs((1))
  WHERE state='leased';

-- The singleton lane makes expensive matching globally bounded. Fairness is
-- durable: while crawler work is waiting, at most four interactive claims can
-- precede it. FIFO ordering remains stable inside each class.
CREATE TABLE canonical_v4.catalog_ingest_lane (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_operation_id text COLLATE "C"
    REFERENCES canonical_v4.ingestion_jobs(operation_id) DEFERRABLE INITIALLY DEFERRED,
  active_lease_token text COLLATE "C",
  active_lease_until timestamptz,
  interactive_streak smallint NOT NULL DEFAULT 0 CHECK (interactive_streak BETWEEN 0 AND 4),
  CHECK (
    (active_operation_id IS NULL AND active_lease_token IS NULL AND active_lease_until IS NULL)
    OR
    (active_operation_id IS NOT NULL AND active_lease_token IS NOT NULL AND active_lease_until IS NOT NULL)
  )
);
INSERT INTO canonical_v4.catalog_ingest_lane(singleton) VALUES(true);

CREATE FUNCTION canonical_v4.ingest_valid_unit_vector(candidate double precision[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $ingest_valid_unit_vector$
DECLARE
  axis integer;
  norm_squared double precision := 0;
  coordinate double precision;
  rendered text;
BEGIN
  IF candidate IS NULL OR array_ndims(candidate) <> 1
      OR array_lower(candidate,1) <> 1 OR array_upper(candidate,1) <> 384 THEN
    RETURN false;
  END IF;
  FOR axis IN 1..384 LOOP
    coordinate := candidate[axis];
    rendered := coordinate::text;
    IF coordinate IS NULL OR rendered IN ('NaN','Infinity','-Infinity') THEN
      RETURN false;
    END IF;
    norm_squared := norm_squared + coordinate*coordinate;
    IF norm_squared::text IN ('NaN','Infinity','-Infinity') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN abs(sqrt(norm_squared)-1.0) <= 0.000001;
END
$ingest_valid_unit_vector$;

CREATE FUNCTION canonical_v4.ingest_ridge_similarity(
  candidate double precision[], reference_values double precision[]
)
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $ingest_ridge_similarity$
DECLARE
  axis integer;
  similarity double precision := 0;
BEGIN
  IF NOT canonical_v4.ingest_valid_unit_vector(candidate)
      OR NOT canonical_v4.ingest_valid_unit_vector(reference_values) THEN
    RAISE EXCEPTION 'Invalid Ridge coordinate vector' USING ERRCODE = 'P1203';
  END IF;
  FOR axis IN 1..384 LOOP
    similarity := similarity + candidate[axis]*reference_values[axis];
  END LOOP;
  IF similarity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Invalid Ridge similarity' USING ERRCODE = 'P1203';
  END IF;
  RETURN greatest(-1.0,least(1.0,similarity));
END
$ingest_ridge_similarity$;

CREATE FUNCTION canonical_v4.ingest_ridge_predicate(
  candidate double precision[], reference_values double precision[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_ridge_predicate$
  SELECT canonical_v4.ingest_ridge_similarity(candidate,reference_values)
    >= 0.8639003810829322::double precision
$ingest_ridge_predicate$;

CREATE FUNCTION canonical_v4.ingest_ridge_scan(
  candidate double precision[], p_parameter_sha256 text
)
RETURNS TABLE(topic_id text, similarity double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_ridge_scan$
BEGIN
  IF p_parameter_sha256 IS DISTINCT FROM
      '593a52ba9a5495a49ef00f4dae38770684389632f961b60ec07067fd8784b3e4'
      OR NOT canonical_v4.ingest_valid_unit_vector(candidate) THEN
    RAISE EXCEPTION 'Invalid Ridge scan request' USING ERRCODE = 'P1203';
  END IF;
  IF EXISTS(
    SELECT 1 FROM canonical_v4.fixed_references AS reference
    WHERE reference.source_id IS NOT NULL AND (
      reference.parameter_sha256 IS DISTINCT FROM p_parameter_sha256
      OR NOT canonical_v4.ingest_valid_unit_vector(reference.values_double)
    )
  ) THEN
    RAISE EXCEPTION 'Invalid stored Ridge reference' USING ERRCODE = 'P1204';
  END IF;
  RETURN QUERY
    SELECT reference.topic_id,
      canonical_v4.ingest_ridge_similarity(candidate,reference.values_double)
    FROM canonical_v4.fixed_references AS reference
    WHERE reference.source_id IS NOT NULL
      AND canonical_v4.ingest_ridge_predicate(candidate,reference.values_double)
    ORDER BY reference.topic_id COLLATE "C";
END
$ingest_ridge_scan$;

-- PostgreSQL and ECMAScript use the same shortest-round-trip digits for
-- binary64 values, but choose different fixed/scientific presentation at the
-- edges and PostgreSQL pads a negative exponent. Normalize those presentation
-- choices so the database can prove the exact JSON.stringify bytes admitted by
-- the repository instead of accepting merely equivalent JSON text.
CREATE FUNCTION canonical_v4.ingest_json_number(candidate double precision)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
SET extra_float_digits = 3
AS $ingest_json_number$
DECLARE
  rendered text := candidate::text;
  exponent_at integer;
  exponent_value integer;
  mantissa text;
  sign_prefix text := '';
  digits text;
  decimal_at integer;
BEGIN
  IF candidate IS NULL OR rendered IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Invalid ingestion JSON number' USING ERRCODE = 'P1203';
  END IF;
  IF candidate=0 THEN
    RETURN '0';
  END IF;
  exponent_at := strpos(rendered,'e');
  IF exponent_at=0 THEN
    RETURN rendered;
  END IF;
  mantissa := substr(rendered,1,exponent_at-1);
  exponent_value := substr(rendered,exponent_at+1)::integer;
  IF abs(candidate) >= 0.000001::double precision
      AND abs(candidate) < 1e21::double precision THEN
    IF left(mantissa,1)='-' THEN
      sign_prefix := '-';
      mantissa := substr(mantissa,2);
    END IF;
    digits := replace(mantissa,'.','');
    decimal_at := 1+exponent_value;
    IF decimal_at <= 0 THEN
      RETURN sign_prefix || '0.' || repeat('0',-decimal_at) || digits;
    ELSIF decimal_at >= length(digits) THEN
      RETURN sign_prefix || digits || repeat('0',decimal_at-length(digits));
    END IF;
    RETURN sign_prefix || substr(digits,1,decimal_at) || '.' || substr(digits,decimal_at+1);
  END IF;
  RETURN mantissa || 'e' || CASE WHEN exponent_value>=0 THEN '+' ELSE '-' END
    || abs(exponent_value)::text;
END
$ingest_json_number$;

-- Validate the exact byte material whose SHA-256 is the durable operation
-- digest. JavaScript first applies readLearnedIngest; this boundary independently
-- rejects malformed direct calls and returns only the derived URL used for
-- live-job uniqueness. It never accepts a caller-supplied URL beside the bytes.
CREATE FUNCTION canonical_v4.ingest_validate_material(
  p_request_material text, p_operation_digest text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $ingest_validate_material$
DECLARE
  material jsonb;
  embedding jsonb;
  values_double double precision[];
  source_url text;
  source_title text;
  model_id text;
  extractor_version text;
  key_count integer;
  canonical_material text;
  axis integer;
BEGIN
  IF p_request_material IS NULL OR octet_length(p_request_material) > 65536
      OR p_operation_digest IS NULL OR p_operation_digest !~ '^[a-f0-9]{64}$'
      OR encode(sha256(convert_to(p_request_material,'UTF8')),'hex') <> p_operation_digest THEN
    RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  material := p_request_material::jsonb;
  IF jsonb_typeof(material) <> 'object' THEN
    RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  SELECT count(*) INTO key_count FROM jsonb_object_keys(material) AS key
    WHERE key NOT IN ('url','title','embedding','extractorVersion');
  IF key_count <> 0 OR NOT material ?& ARRAY['url','title','embedding','extractorVersion']
      OR (SELECT count(*) FROM jsonb_object_keys(material)) <> 4 THEN
    RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  source_url := material->>'url';
  source_title := material->>'title';
  extractor_version := material->>'extractorVersion';
  embedding := material->'embedding';
  IF jsonb_typeof(material->'url') <> 'string'
      OR jsonb_typeof(material->'title') <> 'string'
      OR jsonb_typeof(material->'extractorVersion') <> 'string'
      OR NOT canonical_v4.runtime_safe_text(source_url,2048,false)
      OR source_url !~ '^https?://'
      OR NOT canonical_v4.runtime_safe_text(source_title,200,false)
      OR extractor_version NOT IN (
        'main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1'
      )
      OR jsonb_typeof(embedding) <> 'object' THEN
    RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  SELECT count(*) INTO key_count FROM jsonb_object_keys(embedding) AS key
    WHERE key NOT IN ('modelId','values');
  IF key_count <> 0 OR NOT embedding ?& ARRAY['modelId','values']
      OR (SELECT count(*) FROM jsonb_object_keys(embedding)) <> 2
      OR jsonb_typeof(embedding->'modelId') <> 'string'
      OR jsonb_typeof(embedding->'values') <> 'array'
      OR jsonb_array_length(embedding->'values') <> 384 THEN
    RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  model_id := embedding->>'modelId';
  IF model_id <> 'e5-small-q8-browser-main-prefix-v1'
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(embedding->'values') AS item
        WHERE jsonb_typeof(item) <> 'number') THEN
    RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  SELECT array_agg((item.value::text)::double precision ORDER BY item.ordinal)
    INTO values_double
    FROM jsonb_array_elements(embedding->'values') WITH ORDINALITY AS item(value,ordinal);
  IF NOT canonical_v4.ingest_valid_unit_vector(values_double) THEN
    RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  canonical_material := '{"url":' || to_json(source_url)::text
    || ',"title":' || to_json(source_title)::text
    || ',"embedding":{"modelId":' || to_json(model_id)::text || ',"values":[';
  FOR axis IN 1..384 LOOP
    IF axis>1 THEN canonical_material := canonical_material || ','; END IF;
    canonical_material := canonical_material
      || canonical_v4.ingest_json_number(values_double[axis]);
  END LOOP;
  canonical_material := canonical_material || ']},"extractorVersion":'
    || to_json(extractor_version)::text || '}';
  IF canonical_material <> p_request_material THEN
    RAISE EXCEPTION 'Noncanonical ingestion operation material' USING ERRCODE = 'P1203';
  END IF;
  RETURN source_url;
EXCEPTION WHEN SQLSTATE 'P1203' THEN
  RAISE;
WHEN OTHERS THEN
  RAISE EXCEPTION 'Invalid ingestion operation material' USING ERRCODE = 'P1203';
END
$ingest_validate_material$;

CREATE FUNCTION canonical_v4.ingest_enqueue_job(
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
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  next_ordinal bigint;
  live_count integer;
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
          lease_token=NULL,lease_until=NULL,terminal_code='lease-exhausted',
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

  IF runtime.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'State revision changed' USING ERRCODE = 'P1201';
  END IF;
  IF EXISTS(SELECT 1 FROM canonical_v4.sources AS source
    WHERE source.url COLLATE "C"=v_source_url COLLATE "C"
      AND source.provenance<>'owner-local-page-embedding/v1') THEN
    RAISE EXCEPTION 'Source URL is not available for ingestion' USING ERRCODE = 'P1205';
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
    state,request_material,source_url,authority_token,authority_until
  ) VALUES(
    p_operation_id,p_operation_digest,p_generation,p_expected_revision,p_job_class,next_ordinal,
    'pending',p_request_material,v_source_url,p_authority_token,
    now_at+p_authority_seconds*interval '1 second'
  ) RETURNING * INTO existing;
  RETURN QUERY SELECT existing.operation_id,existing.operation_digest,existing.job_class,
    existing.state,existing.ordinal,existing.attempts,false,existing.result_source_id;
END
$ingest_enqueue_job$;

CREATE FUNCTION canonical_v4.ingest_enqueue_interactive(
  text,text,text,text,bigint,text,integer
)
RETURNS TABLE(
  operation_id text,operation_digest text,job_class text,state text,
  ordinal bigint,attempts integer,replayed boolean,result_source_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_enqueue_interactive$
  SELECT * FROM canonical_v4.ingest_enqueue_job($1,$2,$3,$4,$5,'interactive',$6,$7)
$ingest_enqueue_interactive$;

CREATE FUNCTION canonical_v4.ingest_enqueue_crawler(
  text,text,text,text,bigint,text,integer
)
RETURNS TABLE(
  operation_id text,operation_digest text,job_class text,state text,
  ordinal bigint,attempts integer,replayed boolean,result_source_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_enqueue_crawler$
  SELECT * FROM canonical_v4.ingest_enqueue_job($1,$2,$3,$4,$5,'crawler',$6,$7)
$ingest_enqueue_crawler$;

CREATE FUNCTION canonical_v4.ingest_claim(
  p_worker_id text,p_lease_token text,p_lease_seconds integer
)
RETURNS TABLE(
  operation_id text,operation_digest text,request_material text,generation text,
  expected_revision bigint,job_class text,ordinal bigint,attempts integer,
  lease_token text,lease_until timestamptz,authority_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_claim$
DECLARE
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  active canonical_v4.ingestion_jobs%ROWTYPE;
  selected canonical_v4.ingestion_jobs%ROWTYPE;
  now_at timestamptz := clock_timestamp();
  has_interactive boolean;
  has_crawler boolean;
  selected_class text;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_worker_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_lease_token,128,false)
      OR p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 30 THEN
    RAISE EXCEPTION 'Invalid ingestion claim request' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane
    WHERE singleton=true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid ingestion lane' USING ERRCODE = 'P1204';
  END IF;
  IF lane.active_operation_id IS NOT NULL THEN
    SELECT * INTO active FROM canonical_v4.ingestion_jobs AS job
      WHERE job.operation_id=lane.active_operation_id FOR UPDATE;
    IF NOT FOUND OR active.state <> 'leased'
        OR active.lease_token IS DISTINCT FROM lane.active_lease_token
        OR active.lease_until IS DISTINCT FROM lane.active_lease_until THEN
      RAISE EXCEPTION 'Invalid active ingestion lease' USING ERRCODE = 'P1204';
    END IF;
    IF active.authority_until <= now_at THEN
      UPDATE canonical_v4.ingestion_jobs AS job SET state='cancelled',request_material=NULL,
        source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
        lease_token=NULL,lease_until=NULL,terminal_code='authority-expired',
        terminal_at=now_at,updated_at=now_at WHERE job.operation_id=active.operation_id;
    ELSIF active.lease_until <= now_at AND active.attempts >= 3 THEN
      UPDATE canonical_v4.ingestion_jobs AS job SET state='failed',request_material=NULL,
        source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
        lease_token=NULL,lease_until=NULL,terminal_code='lease-exhausted',
        terminal_at=now_at,updated_at=now_at WHERE job.operation_id=active.operation_id;
    ELSIF active.lease_until <= now_at THEN
      UPDATE canonical_v4.ingestion_jobs AS job SET state='pending',worker_id=NULL,
        lease_token=NULL,lease_until=NULL,updated_at=now_at
        WHERE job.operation_id=active.operation_id;
    ELSE
      RETURN;
    END IF;
    UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
      active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
    SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane WHERE singleton=true;
  ELSIF EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS job WHERE job.state='leased') THEN
    RAISE EXCEPTION 'Unowned ingestion lease' USING ERRCODE = 'P1204';
  END IF;

  -- At most sixteen live jobs exist, so terminalizing abandoned pending jobs is
  -- a fixed bounded operation and cannot become an unbounded cleanup scan.
  UPDATE canonical_v4.ingestion_jobs AS job SET state='failed',request_material=NULL,
    source_url=NULL,authority_token=NULL,authority_until=NULL,terminal_code='lease-exhausted',
    terminal_at=now_at,updated_at=now_at
    WHERE job.state='pending' AND job.attempts>=3;
  UPDATE canonical_v4.ingestion_jobs AS job SET state='cancelled',request_material=NULL,
    source_url=NULL,authority_token=NULL,authority_until=NULL,terminal_code='authority-expired',
    terminal_at=now_at,updated_at=now_at
    WHERE job.state='pending' AND job.authority_until <= now_at;

  SELECT EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS job
    WHERE job.state='pending' AND job.job_class='interactive' AND job.authority_until>now_at)
    INTO has_interactive;
  SELECT EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS job
    WHERE job.state='pending' AND job.job_class='crawler' AND job.authority_until>now_at)
    INTO has_crawler;
  IF NOT has_interactive AND NOT has_crawler THEN
    RETURN;
  END IF;
  selected_class := CASE
    WHEN has_interactive AND (NOT has_crawler OR lane.interactive_streak < 4) THEN 'interactive'
    ELSE 'crawler'
  END;
  SELECT * INTO selected FROM canonical_v4.ingestion_jobs AS job
    WHERE job.state='pending' AND job.job_class=selected_class AND job.authority_until>now_at
    ORDER BY job.ordinal LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid ingestion schedule' USING ERRCODE = 'P1204';
  END IF;
  UPDATE canonical_v4.ingestion_jobs AS job SET state='leased',attempts=job.attempts+1,
    worker_id=p_worker_id,lease_token=p_lease_token,
    lease_until=least(selected.authority_until,now_at+p_lease_seconds*interval '1 second'),
    updated_at=now_at
    WHERE job.operation_id=selected.operation_id RETURNING * INTO selected;
  UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=selected.operation_id,
    active_lease_token=selected.lease_token,active_lease_until=selected.lease_until,
    interactive_streak=CASE WHEN selected.job_class='interactive'
      THEN least(4,interactive_streak+1) ELSE 0 END
    WHERE singleton=true;
  RETURN QUERY SELECT selected.operation_id,selected.operation_digest,selected.request_material,
    selected.generation,selected.expected_revision,selected.job_class,selected.ordinal,
    selected.attempts,selected.lease_token,selected.lease_until,selected.authority_until;
END
$ingest_claim$;

CREATE FUNCTION canonical_v4.ingest_renew_authority(
  p_operation_id text,p_operation_digest text,p_authority_token text,p_authority_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_renew_authority$
DECLARE
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  job canonical_v4.ingestion_jobs%ROWTYPE;
  now_at timestamptz := clock_timestamp();
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR p_operation_digest IS NULL OR p_operation_digest !~ '^[a-f0-9]{64}$'
      OR NOT canonical_v4.runtime_safe_text(p_authority_token,128,false)
      OR p_authority_seconds IS NULL OR p_authority_seconds<1 OR p_authority_seconds>30 THEN
    RAISE EXCEPTION 'Invalid ingestion authority renewal' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR lane.active_operation_id IS NULL AND
      EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS leased WHERE leased.state='leased')
      OR lane.active_operation_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM canonical_v4.ingestion_jobs AS leased
        WHERE leased.operation_id=lane.active_operation_id AND leased.state='leased'
          AND leased.lease_token IS NOT DISTINCT FROM lane.active_lease_token
          AND leased.lease_until IS NOT DISTINCT FROM lane.active_lease_until
      ) THEN
    RAISE EXCEPTION 'Invalid active ingestion lease' USING ERRCODE = 'P1204';
  END IF;
  SELECT * INTO job FROM canonical_v4.ingestion_jobs AS queued
    WHERE queued.operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR job.state NOT IN ('pending','leased')
      OR job.operation_digest<>p_operation_digest
      OR job.authority_token<>p_authority_token OR job.authority_until<=now_at THEN
    RETURN false;
  END IF;
  UPDATE canonical_v4.ingestion_jobs AS queued SET
    authority_until=now_at+p_authority_seconds*interval '1 second',
    lease_until=CASE WHEN queued.state='leased' THEN least(queued.lease_until,
      now_at+p_authority_seconds*interval '1 second') ELSE queued.lease_until END,
    updated_at=now_at
    WHERE queued.operation_id=p_operation_id RETURNING * INTO job;
  IF job.state='leased' THEN
    UPDATE canonical_v4.catalog_ingest_lane SET
      active_lease_until=least(job.lease_until,job.authority_until)
      WHERE singleton=true AND active_operation_id=job.operation_id;
  END IF;
  RETURN true;
END
$ingest_renew_authority$;

CREATE FUNCTION canonical_v4.ingest_renew_lease(
  p_worker_id text,p_operation_id text,p_lease_token text,p_lease_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_renew_lease$
DECLARE
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  job canonical_v4.ingestion_jobs%ROWTYPE;
  now_at timestamptz := clock_timestamp();
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_worker_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_lease_token,128,false)
      OR p_lease_seconds IS NULL OR p_lease_seconds<1 OR p_lease_seconds>30 THEN
    RAISE EXCEPTION 'Invalid ingestion lease renewal' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR lane.active_operation_id<>p_operation_id
      OR lane.active_lease_token<>p_lease_token OR lane.active_lease_until<=now_at THEN
    RETURN false;
  END IF;
  SELECT * INTO job FROM canonical_v4.ingestion_jobs AS queued
    WHERE queued.operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR job.state<>'leased' OR job.worker_id<>p_worker_id
      OR job.lease_token<>p_lease_token OR job.lease_until<=now_at OR job.authority_until<=now_at THEN
    RETURN false;
  END IF;
  UPDATE canonical_v4.ingestion_jobs AS queued SET
    lease_until=least(job.authority_until,now_at+p_lease_seconds*interval '1 second'),updated_at=now_at
    WHERE queued.operation_id=p_operation_id RETURNING * INTO job;
  UPDATE canonical_v4.catalog_ingest_lane SET active_lease_until=job.lease_until
    WHERE singleton=true;
  RETURN true;
END
$ingest_renew_lease$;

CREATE FUNCTION canonical_v4.ingest_revoke_authority(
  p_operation_id text,p_operation_digest text,p_authority_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_revoke_authority$
DECLARE
  lane canonical_v4.catalog_ingest_lane%ROWTYPE;
  job canonical_v4.ingestion_jobs%ROWTYPE;
  now_at timestamptz := clock_timestamp();
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
      OR p_operation_digest IS NULL OR p_operation_digest !~ '^[a-f0-9]{64}$'
      OR NOT canonical_v4.runtime_safe_text(p_authority_token,128,false) THEN
    RAISE EXCEPTION 'Invalid ingestion authority revocation' USING ERRCODE = 'P1203';
  END IF;
  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR lane.active_operation_id IS NULL AND
      EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs AS leased WHERE leased.state='leased')
      OR lane.active_operation_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM canonical_v4.ingestion_jobs AS leased
        WHERE leased.operation_id=lane.active_operation_id AND leased.state='leased'
          AND leased.lease_token IS NOT DISTINCT FROM lane.active_lease_token
          AND leased.lease_until IS NOT DISTINCT FROM lane.active_lease_until
      ) THEN
    RAISE EXCEPTION 'Invalid active ingestion lease' USING ERRCODE = 'P1204';
  END IF;
  SELECT * INTO job FROM canonical_v4.ingestion_jobs AS queued
    WHERE queued.operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR job.state NOT IN ('pending','leased')
      OR job.operation_digest<>p_operation_digest OR job.authority_token<>p_authority_token THEN
    RETURN false;
  END IF;
  UPDATE canonical_v4.ingestion_jobs AS queued SET state='cancelled',request_material=NULL,
    source_url=NULL,authority_token=NULL,authority_until=NULL,worker_id=NULL,
    lease_token=NULL,lease_until=NULL,terminal_code='authority-revoked',
    terminal_at=now_at,updated_at=now_at WHERE queued.operation_id=p_operation_id;
  IF lane.active_operation_id=p_operation_id THEN
    UPDATE canonical_v4.catalog_ingest_lane SET active_operation_id=NULL,
      active_lease_token=NULL,active_lease_until=NULL WHERE singleton=true;
  END IF;
  RETURN true;
END
$ingest_revoke_authority$;

REVOKE ALL ON TABLE canonical_v4.ingestion_jobs FROM PUBLIC;
REVOKE ALL ON TABLE canonical_v4.catalog_ingest_lane FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.topic_ordinal_sequence FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.discussion_ordinal_sequence FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.source_ordinal_sequence FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.source_link_ordinal_sequence FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.ingestion_job_ordinal_sequence FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_guard_learned_url() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_valid_unit_vector(double precision[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_ridge_similarity(double precision[],double precision[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_ridge_predicate(double precision[],double precision[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_ridge_scan(double precision[],text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_json_number(double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_validate_material(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_enqueue_job(text,text,text,text,bigint,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_enqueue_interactive(text,text,text,text,bigint,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_enqueue_crawler(text,text,text,text,bigint,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_claim(text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_renew_authority(text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_renew_lease(text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.ingest_revoke_authority(text,text,text) FROM PUBLIC;

DO $ingest_permissions$
DECLARE
  boundary_role text;
  protected_relation oid;
  protected_sequence oid;
  protected_function oid;
  relation_name text;
  function_name text;
  expected_execute boolean;
BEGIN
  -- Do not rely on cluster-specific default privileges. Strip every new
  -- ingestion capability first, then grant only each role's public boundary.
  FOREACH boundary_role IN ARRAY ARRAY[
    'murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'
  ] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=boundary_role) THEN
      IF boundary_role='murmingle_app' THEN
        REVOKE ALL PRIVILEGES ON canonical_v4.ingestion_jobs,
          canonical_v4.catalog_ingest_lane FROM murmingle_app;
      ELSIF boundary_role='murmingle_crawler_submitter' THEN
        REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA canonical_v4
          FROM murmingle_crawler_submitter;
      ELSE
        REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA canonical_v4
          FROM murmingle_ingest_worker;
      END IF;
      IF boundary_role='murmingle_app' THEN
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA canonical_v4 FROM murmingle_app;
      ELSIF boundary_role='murmingle_crawler_submitter' THEN
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA canonical_v4
          FROM murmingle_crawler_submitter;
      ELSE
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA canonical_v4
          FROM murmingle_ingest_worker;
      END IF;
      FOR protected_function IN
        SELECT procedure.oid FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='canonical_v4' AND procedure.proname LIKE 'ingest_%'
      LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I',
          protected_function::regprocedure,boundary_role);
      END LOOP;
    END IF;
  END LOOP;

  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT USAGE ON SCHEMA canonical_v4 TO murmingle_app;
    GRANT EXECUTE ON FUNCTION
      canonical_v4.ingest_enqueue_interactive(text,text,text,text,bigint,text,integer),
      canonical_v4.ingest_renew_authority(text,text,text,integer),
      canonical_v4.ingest_revoke_authority(text,text,text)
      TO murmingle_app;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_crawler_submitter') THEN
    GRANT USAGE ON SCHEMA canonical_v4 TO murmingle_crawler_submitter;
    GRANT SELECT ON canonical_v4.schema_migrations TO murmingle_crawler_submitter;
    GRANT EXECUTE ON FUNCTION
      canonical_v4.ingest_enqueue_crawler(text,text,text,text,bigint,text,integer),
      canonical_v4.ingest_renew_authority(text,text,text,integer),
      canonical_v4.ingest_revoke_authority(text,text,text)
      TO murmingle_crawler_submitter;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
    GRANT USAGE ON SCHEMA canonical_v4 TO murmingle_ingest_worker;
    GRANT SELECT ON canonical_v4.schema_migrations TO murmingle_ingest_worker;
    GRANT EXECUTE ON FUNCTION
      canonical_v4.ingest_claim(text,text,integer),
      canonical_v4.ingest_renew_lease(text,text,text,integer),
      canonical_v4.ingest_ridge_predicate(double precision[],double precision[]),
      canonical_v4.ingest_ridge_scan(double precision[],text)
      TO murmingle_ingest_worker;
  END IF;

  -- Fail migration rather than activating an inherited/default privilege that
  -- bypasses admission, leasing, material erasure, or the exact matcher.
  FOREACH boundary_role IN ARRAY ARRAY[
    'murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'
  ] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=boundary_role) THEN
      FOR protected_relation,relation_name IN
        SELECT relation.oid,relation.relname FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='canonical_v4' AND relation.relkind IN ('r','p')
      LOOP
        IF boundary_role='murmingle_app' THEN
          IF relation_name IN ('ingestion_jobs','catalog_ingest_lane') AND
              has_table_privilege(boundary_role,protected_relation,
                'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR relation_name IN ('ingestion_jobs','catalog_ingest_lane') AND
                has_any_column_privilege(boundary_role,protected_relation,
                  'SELECT,INSERT,UPDATE,REFERENCES')
              OR has_table_privilege(boundary_role,protected_relation,
                'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR has_any_column_privilege(boundary_role,protected_relation,
                'INSERT,UPDATE,REFERENCES') THEN
            RAISE EXCEPTION 'murmingle_app retains direct ingestion table access';
          END IF;
        ELSIF relation_name='schema_migrations' THEN
          IF NOT has_table_privilege(boundary_role,protected_relation,'SELECT')
              OR has_table_privilege(boundary_role,protected_relation,
                'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR has_any_column_privilege(boundary_role,protected_relation,
                'INSERT,UPDATE,REFERENCES') THEN
            RAISE EXCEPTION '% schema health privileges are invalid',boundary_role;
          END IF;
        ELSIF has_table_privilege(boundary_role,protected_relation,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(boundary_role,protected_relation,
              'SELECT,INSERT,UPDATE,REFERENCES') THEN
          RAISE EXCEPTION '% retains direct canonical table access',boundary_role;
        END IF;
      END LOOP;
      FOR protected_sequence IN
        SELECT relation.oid FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='canonical_v4' AND relation.relkind='S'
      LOOP
        IF has_sequence_privilege(boundary_role,protected_sequence,'USAGE,SELECT,UPDATE') THEN
          RAISE EXCEPTION '% retains direct canonical sequence access',boundary_role;
        END IF;
      END LOOP;
      FOR protected_function,function_name IN
        SELECT procedure.oid,procedure.proname FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='canonical_v4' AND procedure.proname LIKE 'ingest_%'
      LOOP
        expected_execute := CASE boundary_role
          WHEN 'murmingle_app' THEN function_name IN (
            'ingest_enqueue_interactive','ingest_renew_authority','ingest_revoke_authority')
          WHEN 'murmingle_crawler_submitter' THEN function_name IN (
            'ingest_enqueue_crawler','ingest_renew_authority','ingest_revoke_authority')
          ELSE function_name IN (
            'ingest_claim','ingest_renew_lease','ingest_ridge_predicate','ingest_ridge_scan')
        END;
        IF has_function_privilege(boundary_role,protected_function,'EXECUTE')
            IS DISTINCT FROM expected_execute THEN
          RAISE EXCEPTION '% ingestion function privileges are invalid',boundary_role;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END
$ingest_permissions$;
