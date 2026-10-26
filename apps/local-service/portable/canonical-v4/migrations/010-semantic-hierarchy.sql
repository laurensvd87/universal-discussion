-- Unregistered foundation only. No native fixture boundary, second queue,
-- canonical destination changes, root adoption or ancestor feed activation.
CREATE TABLE canonical_v4.semantic_matchers (
  matcher_hash text COLLATE "C" PRIMARY KEY CHECK(matcher_hash ~ '^[a-f0-9]{64}$'),
  identity_text text NOT NULL CHECK(octet_length(identity_text) BETWEEN 1 AND 524288),
  model_id text NOT NULL CHECK(model_id='e5-small-q8-browser-main-prefix-v1'),
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(encode(sha256(convert_to(identity_text,'UTF8')),'hex')=matcher_hash)
);
CREATE TABLE canonical_v4.semantic_nodes (
  matcher_hash text COLLATE "C" NOT NULL REFERENCES canonical_v4.semantic_matchers,
  node_id text COLLATE "C" NOT NULL CHECK(canonical_v4.runtime_safe_text(node_id,160,false)),
  parent_id text COLLATE "C",
  path text[] NOT NULL CHECK(array_ndims(path)=1 AND array_lower(path,1)=1 AND cardinality(path) BETWEEN 1 AND 8),
  PRIMARY KEY(matcher_hash,node_id),
  FOREIGN KEY(matcher_hash,parent_id) REFERENCES canonical_v4.semantic_nodes(matcher_hash,node_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE canonical_v4.semantic_installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  revision bigint NOT NULL CHECK(revision>=0),
  matcher_hash text COLLATE "C" REFERENCES canonical_v4.semantic_matchers
);
INSERT INTO canonical_v4.semantic_installation VALUES(true,0,NULL);

-- One immutable numeric payload per Source/material/matcher. Renewals have
-- different operation IDs/Source write_versions but share this larger row.
CREATE TABLE canonical_v4.semantic_inputs (
  source_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
  operation_digest text COLLATE "C" NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
  matcher_hash text COLLATE "C" NOT NULL REFERENCES canonical_v4.semantic_matchers,
  body_wire_hash text NOT NULL CHECK(body_wire_hash ~ '^[a-f0-9]{64}$'),
  title_wire_hash text NOT NULL CHECK(title_wire_hash ~ '^[a-f0-9]{64}$'),
  body_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(body_values)),
  title_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(title_values)),
  -- Eligibility-filtered numeric path, not a native or feed authority claim.
  supported_path text[] NOT NULL CHECK(cardinality(supported_path) BETWEEN 0 AND 8),
  semantic_eligible boolean NOT NULL CHECK(semantic_eligible OR cardinality(supported_path)=0),
  CHECK(body_wire_hash=encode(sha256(array_send(body_values)),'hex')),
  CHECK(title_wire_hash=encode(sha256(array_send(title_values)),'hex')),
  PRIMARY KEY(source_id,operation_digest,matcher_hash)
);
CREATE TABLE canonical_v4.semantic_observations (
  source_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
  source_version bigint NOT NULL CHECK(source_version>0),
  generation text NOT NULL CHECK(canonical_v4.runtime_safe_text(generation,128,false)),
  operation_id text COLLATE "C" NOT NULL CHECK(canonical_v4.runtime_safe_text(operation_id,128,false)),
  operation_digest text COLLATE "C" NOT NULL,
  matcher_hash text COLLATE "C" NOT NULL,
  installation_revision bigint NOT NULL CHECK(installation_revision>0),
  PRIMARY KEY(source_id,source_version,matcher_hash), UNIQUE(generation,operation_id,matcher_hash),
  FOREIGN KEY(source_id,operation_digest,matcher_hash) REFERENCES canonical_v4.semantic_inputs ON DELETE CASCADE
);

CREATE FUNCTION canonical_v4.semantic_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  RAISE EXCEPTION 'Immutable semantic record' USING ERRCODE='P1214';
END $$;
CREATE TRIGGER semantic_matcher_immutable BEFORE UPDATE ON canonical_v4.semantic_matchers
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_immutable();
CREATE TRIGGER semantic_nodes_immutable BEFORE UPDATE ON canonical_v4.semantic_nodes
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_immutable();
CREATE TRIGGER semantic_inputs_immutable BEFORE UPDATE ON canonical_v4.semantic_inputs
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_immutable();
CREATE TRIGGER semantic_observations_immutable BEFORE UPDATE ON canonical_v4.semantic_observations
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_immutable();

-- Invoker, owner-only installation. Raw identity bytes use the same hash as
-- describeRootedHierarchyMatcher/preparation, not PostgreSQL jsonb formatting.
CREATE FUNCTION canonical_v4.semantic_register_matcher(p_identity_text text)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE identity_ jsonb;hash_ text;
  nodes_ jsonb;roots_ text[];declared_roots_ text[];paths_ integer;
BEGIN
  -- An old repeatable-read snapshot could miss a registration committed while
  -- waiting for the control gate. Require a fresh statement snapshot afterward.
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION 'Semantic registration requires read committed' USING ERRCODE='P1213';
  END IF;
  IF p_identity_text IS NULL OR octet_length(p_identity_text) NOT BETWEEN 1 AND 524288 THEN
    RAISE EXCEPTION 'Invalid semantic installation' USING ERRCODE='P1213';
  END IF;
  -- Serialize registration across matcher hashes: semantic node IDs retain
  -- their parent and entire ancestry forever. Reparenting needs a new node ID.
  -- The owner control gate never acquires a Source, queue lane or job lock.
  PERFORM pg_advisory_xact_lock(914092010,1);
  identity_:=p_identity_text::jsonb;nodes_:=identity_->'nodes';
  IF jsonb_typeof(identity_) IS DISTINCT FROM 'object' OR identity_->>'schema' IS DISTINCT FROM 'rooted-hierarchy-matcher/v1' OR
      jsonb_typeof(nodes_) IS DISTINCT FROM 'array' OR jsonb_array_length(nodes_) NOT BETWEEN 2 AND 512 OR
      jsonb_typeof(identity_->'roots') IS DISTINCT FROM 'array' OR jsonb_array_length(identity_->'roots') NOT BETWEEN 2 AND 16 OR
      jsonb_typeof(identity_->'detailArtifacts') IS DISTINCT FROM 'array' OR jsonb_array_length(identity_->'detailArtifacts')>128 OR
      identity_->>'representation' IS DISTINCT FROM 'paired-raw-e5-body-title-v1' OR
      (identity_->'inputDefinition'->>'encoderHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      identity_->'nativeObservation' IS DISTINCT FROM 'false'::jsonb OR
      identity_->'productionValidated' IS DISTINCT FROM 'false'::jsonb OR identity_->'assignmentAuthority' IS DISTINCT FROM 'false'::jsonb OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(identity_->'roots') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'string') OR
      (identity_->>'representationHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      (identity_->>'rootModelJsonHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      (identity_->>'rootPolicyHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      identity_->'inputDefinition'->'bodyWeight' IS DISTINCT FROM '0.75'::jsonb OR
      identity_->'inputDefinition'->'titleWeight' IS DISTINCT FROM '0.25'::jsonb OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(nodes_) n WHERE jsonb_typeof(n) IS DISTINCT FROM 'object' OR
        NOT n ?& ARRAY['id','parentId'] OR (SELECT count(*) FROM jsonb_object_keys(n))<>2 OR
        jsonb_typeof(n->'id') IS DISTINCT FROM 'string' OR NOT canonical_v4.runtime_safe_text(n->>'id',160,false) OR
        (jsonb_typeof(n->'parentId') IS DISTINCT FROM 'null' AND
          (jsonb_typeof(n->'parentId') IS DISTINCT FROM 'string' OR NOT canonical_v4.runtime_safe_text(n->>'parentId',160,false)))) OR
      (SELECT count(DISTINCT n->>'id') FROM jsonb_array_elements(nodes_) n)<>jsonb_array_length(nodes_) THEN
    RAISE EXCEPTION 'Invalid semantic topology' USING ERRCODE='P1213';
  END IF;
  SELECT array_agg(n->>'id' ORDER BY (n->>'id') COLLATE "C") INTO roots_ FROM jsonb_array_elements(nodes_) n WHERE n->'parentId'='null'::jsonb;
  SELECT array_agg(r#>>'{}' ORDER BY (r#>>'{}') COLLATE "C") INTO declared_roots_ FROM jsonb_array_elements(identity_->'roots') r;
  IF roots_ IS DISTINCT FROM declared_roots_ OR cardinality(roots_) NOT BETWEEN 2 AND 16 THEN
    RAISE EXCEPTION 'Invalid semantic roots' USING ERRCODE='P1213';
  END IF;
  hash_:=encode(sha256(convert_to(p_identity_text,'UTF8')),'hex');
  INSERT INTO canonical_v4.semantic_matchers(matcher_hash,identity_text,model_id)
    VALUES(hash_,p_identity_text,'e5-small-q8-browser-main-prefix-v1') ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_matchers m WHERE m.matcher_hash=hash_ AND m.identity_text=p_identity_text) THEN
    RAISE EXCEPTION 'Semantic identity collision' USING ERRCODE='P1214';
  END IF;
  WITH RECURSIVE declared AS (
    SELECT n->>'id' id,n->>'parentId' parent_id FROM jsonb_array_elements(nodes_) n
  ), chain AS (
    SELECT id,parent_id,ARRAY[id] path FROM declared WHERE parent_id IS NULL
    UNION ALL SELECT d.id,d.parent_id,c.path||d.id FROM declared d JOIN chain c ON d.parent_id=c.id
      WHERE cardinality(c.path)<8 AND NOT d.id=ANY(c.path)
  ), inserted AS (
    INSERT INTO canonical_v4.semantic_nodes(matcher_hash,node_id,parent_id,path)
      SELECT hash_,id,parent_id,path FROM chain ON CONFLICT DO NOTHING RETURNING node_id
  ) SELECT count(*) INTO paths_ FROM chain;
  IF paths_<>jsonb_array_length(nodes_) THEN
    RAISE EXCEPTION 'Missing, cyclic or deep semantic parent' USING ERRCODE='P1213';
  END IF;
  IF EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_nodes prior_
      ON prior_.node_id=n.node_id AND prior_.matcher_hash<>hash_
      WHERE n.matcher_hash=hash_ AND
        (prior_.parent_id IS DISTINCT FROM n.parent_id OR prior_.path IS DISTINCT FROM n.path)) THEN
    RAISE EXCEPTION 'Semantic node ancestry changed; use a new node ID' USING ERRCODE='P1213';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(identity_->'detailArtifacts') d WHERE
      jsonb_typeof(d) IS DISTINCT FROM 'object' OR NOT d ?& ARRAY['nodeId','canonicalPath','artifactHash','eligible'] OR
      (SELECT count(*) FROM jsonb_object_keys(d))<>4 OR jsonb_typeof(d->'nodeId') IS DISTINCT FROM 'string' OR
      jsonb_typeof(d->'canonicalPath') IS DISTINCT FROM 'array' OR (d->>'artifactHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      jsonb_typeof(d->'eligible') IS DISTINCT FROM 'boolean' OR
      NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n WHERE n.matcher_hash=hash_ AND n.node_id=d->>'nodeId' AND
        cardinality(n.path)>1 AND to_jsonb(n.path)=d->'canonicalPath')) OR
      (SELECT count(DISTINCT d->>'nodeId') FROM jsonb_array_elements(identity_->'detailArtifacts') d)<>jsonb_array_length(identity_->'detailArtifacts') THEN
    RAISE EXCEPTION 'Invalid semantic detail topology' USING ERRCODE='P1213';
  END IF;
  RETURN hash_;
END $$;

-- Registration above is inert. Only this explicit owner CAS changes CURRENT.
-- Activation acquires no Source, queue lane or job locks.
CREATE FUNCTION canonical_v4.semantic_activate_matcher(p_matcher_hash text,p_expected_revision bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE head_ canonical_v4.semantic_installation%ROWTYPE;
BEGIN
  -- Same order as registration; only then acquire the CURRENT head row.
  PERFORM pg_advisory_xact_lock(914092010,1);
  IF p_matcher_hash IS NULL OR NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_matchers WHERE matcher_hash=p_matcher_hash) OR
      p_expected_revision IS NULL OR p_expected_revision<0 THEN
    RAISE EXCEPTION 'Invalid semantic activation' USING ERRCODE='P1213';
  END IF;
  SELECT * INTO head_ FROM canonical_v4.semantic_installation WHERE singleton FOR UPDATE;
  IF head_.revision IS DISTINCT FROM p_expected_revision OR head_.revision=9223372036854775807 THEN
    RAISE EXCEPTION 'Semantic installation changed' USING ERRCODE='P1211';
  END IF;
  UPDATE canonical_v4.semantic_installation SET revision=revision+1,matcher_hash=p_matcher_hash WHERE singleton;
  RETURN head_.revision+1;
END $$;

-- The function call itself is one PostgreSQL transaction, even when the caller
-- uses a pool. Never invoke legacy apply and semantic recording as two calls.
CREATE FUNCTION canonical_v4.semantic_ingest_apply(
  p_operation_id text,p_operation_digest text,p_lease_token text,p_represented_values double precision[],p_parameter_sha256 text,
  p_new_source_id text,p_new_topic_id text,p_new_discussion_id text,p_created_at text,p_source_stamp text,p_postable boolean,
  p_matcher_hash text,p_title_values double precision[],p_supported_path text[]
) RETURNS TABLE(response_text text,terminal_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lane_ canonical_v4.catalog_ingest_lane%ROWTYPE;job_ canonical_v4.ingestion_jobs%ROWTYPE;
  installation_ canonical_v4.semantic_installation%ROWTYPE;source_ canonical_v4.sources%ROWTYPE;
  input_ canonical_v4.semantic_inputs%ROWTYPE;result_ record;material_ jsonb;body_ double precision[];
  body_hash_ text;title_hash_ text;source_id_ text;model_id_ text;
BEGIN
  -- Shared installed head first; owner activation never takes lane/Source locks.
  SELECT * INTO installation_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  IF p_matcher_hash IS NULL OR installation_.matcher_hash IS DISTINCT FROM p_matcher_hash THEN
    RAISE EXCEPTION 'Semantic installation changed' USING ERRCODE='P1211';
  END IF;
  SELECT * INTO lane_ FROM canonical_v4.catalog_ingest_lane WHERE singleton FOR UPDATE;
  SELECT * INTO job_ FROM canonical_v4.ingestion_jobs WHERE operation_id=p_operation_id FOR UPDATE;
  IF lane_.active_operation_id IS DISTINCT FROM p_operation_id OR lane_.active_lease_token IS DISTINCT FROM p_lease_token OR
      (lane_.active_lease_until>clock_timestamp()) IS DISTINCT FROM true OR job_.state IS DISTINCT FROM 'leased' OR
      job_.operation_digest IS DISTINCT FROM p_operation_digest OR job_.lease_token IS DISTINCT FROM p_lease_token OR
      (job_.lease_until>clock_timestamp() AND job_.authority_until>clock_timestamp()) IS DISTINCT FROM true OR
      job_.generation IS DISTINCT FROM (SELECT generation FROM canonical_v4.runtime_state WHERE singleton) THEN
    RAISE EXCEPTION 'Ingestion lease unavailable' USING ERRCODE='P1201';
  END IF;
  PERFORM canonical_v4.ingest_validate_material(job_.request_material,job_.operation_digest);
  material_:=job_.request_material::jsonb;model_id_:=material_->'embedding'->>'modelId';
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_matchers m WHERE m.matcher_hash=p_matcher_hash AND m.model_id=model_id_) OR
      p_title_values IS NULL OR NOT canonical_v4.ingest_valid_unit_vector(p_title_values) OR p_supported_path IS NULL OR
      cardinality(p_supported_path)>8 OR (p_represented_values IS NULL AND cardinality(p_supported_path)>0) OR (cardinality(p_supported_path)>0 AND
        (array_ndims(p_supported_path) IS DISTINCT FROM 1 OR array_lower(p_supported_path,1) IS DISTINCT FROM 1 OR
         NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n WHERE n.matcher_hash=p_matcher_hash AND
           n.node_id=p_supported_path[cardinality(p_supported_path)] AND n.path=p_supported_path))) THEN
    RAISE EXCEPTION 'Invalid registered semantic preparation' USING ERRCODE='P1213';
  END IF;
  SELECT array_agg(v::double precision ORDER BY ord) INTO body_
    FROM jsonb_array_elements_text(material_->'embedding'->'values') WITH ORDINALITY AS values_(v,ord);
  body_hash_:=encode(sha256(array_send(body_)),'hex');title_hash_:=encode(sha256(array_send(p_title_values)),'hex');
  SELECT * INTO result_ FROM canonical_v4.ingest_apply(p_operation_id,p_operation_digest,p_lease_token,p_represented_values,p_parameter_sha256,
    p_new_source_id,p_new_topic_id,p_new_discussion_id,p_created_at,p_source_stamp,p_postable);
  IF result_.terminal_code IS NOT NULL THEN RETURN QUERY SELECT result_.response_text,result_.terminal_code;RETURN;END IF;
  source_id_:=(result_.response_text::jsonb)->>'sourceId';
  SELECT * INTO source_ FROM canonical_v4.sources WHERE id=source_id_ FOR SHARE;
  IF source_.operation_id IS DISTINCT FROM p_operation_id OR source_.url IS DISTINCT FROM material_->>'url' OR
      source_.title IS DISTINCT FROM material_->>'title' OR source_.extractor_version IS DISTINCT FROM material_->>'extractorVersion' OR
      NOT EXISTS(SELECT 1 FROM canonical_v4.operation_receipts r WHERE r.source_id=source_id_ AND r.operation_id=p_operation_id AND r.operation_digest=p_operation_digest) OR
      NOT EXISTS(SELECT 1 FROM canonical_v4.embeddings e WHERE e.source_id=source_id_ AND e.model_id=model_id_ AND
        encode(sha256(array_send(e.values_double)),'hex')=body_hash_) THEN
    RAISE EXCEPTION 'Semantic Source binding mismatch' USING ERRCODE='P1214';
  END IF;
  INSERT INTO canonical_v4.semantic_inputs VALUES(source_id_,p_operation_digest,p_matcher_hash,body_hash_,title_hash_,body_,p_title_values,p_supported_path,p_represented_values IS NOT NULL)
    ON CONFLICT DO NOTHING;
  SELECT * INTO input_ FROM canonical_v4.semantic_inputs i WHERE i.source_id=source_id_ AND i.operation_digest=p_operation_digest AND i.matcher_hash=p_matcher_hash;
  IF input_.body_wire_hash IS DISTINCT FROM body_hash_ OR input_.title_wire_hash IS DISTINCT FROM title_hash_ OR input_.supported_path IS DISTINCT FROM p_supported_path OR
      encode(sha256(array_send(input_.body_values)),'hex') IS DISTINCT FROM body_hash_ OR
      encode(sha256(array_send(input_.title_values)),'hex') IS DISTINCT FROM title_hash_ OR
      input_.semantic_eligible IS DISTINCT FROM (p_represented_values IS NOT NULL) THEN
    RAISE EXCEPTION 'Changed immutable semantic input' USING ERRCODE='P1214';
  END IF;
  INSERT INTO canonical_v4.semantic_observations VALUES(source_id_,source_.write_version,job_.generation,p_operation_id,p_operation_digest,p_matcher_hash,installation_.revision);
  RETURN QUERY SELECT result_.response_text,NULL::text;
END $$;

REVOKE ALL ON canonical_v4.semantic_matchers,canonical_v4.semantic_nodes,canonical_v4.semantic_installation,
  canonical_v4.semantic_inputs,canonical_v4.semantic_observations FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.semantic_immutable(),canonical_v4.semantic_register_matcher(text),canonical_v4.semantic_activate_matcher(text,bigint),
  canonical_v4.semantic_ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean,text,double precision[],text[]) FROM PUBLIC;
DO $$ DECLARE role_ text;BEGIN
  FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
      EXECUTE format('REVOKE ALL ON canonical_v4.semantic_matchers,canonical_v4.semantic_nodes,canonical_v4.semantic_installation,canonical_v4.semantic_inputs,canonical_v4.semantic_observations FROM %I',role_);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.semantic_register_matcher(text),canonical_v4.semantic_activate_matcher(text,bigint),canonical_v4.semantic_immutable(),canonical_v4.semantic_ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean,text,double precision[],text[]) FROM %I',role_);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
    REVOKE EXECUTE ON FUNCTION canonical_v4.ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean) FROM murmingle_ingest_worker;
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean,text,double precision[],text[]) TO murmingle_ingest_worker;
  END IF;
END $$;
