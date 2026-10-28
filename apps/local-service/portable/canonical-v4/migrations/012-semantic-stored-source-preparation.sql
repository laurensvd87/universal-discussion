-- Unregistered ordinary stored-material preparation. No ingestion-queue/Source/
-- watermark writes, page fetching, original-capture assertions or automatic root
-- adoption. Public reads can suggest urgency in a bounded derived-only queue.
ALTER TABLE canonical_v4.semantic_observations
  DROP CONSTRAINT semantic_observations_generation_operation_id_matcher_hash_key,
  ADD UNIQUE(generation,operation_id,source_version,matcher_hash),
  DROP CONSTRAINT semantic_observations_source_version_check,
  ADD CHECK(source_version>=0);
ALTER TABLE canonical_v4.semantic_root_snapshots
  DROP CONSTRAINT semantic_root_snapshots_source_version_check,
  ADD CHECK(source_version>=0),
  ADD COLUMN context_basis text NOT NULL DEFAULT 'source-observation-at-root-create'
    CHECK(context_basis IN('source-observation-at-root-create','legacy-current-source-context'));

-- Background-only publication counter. Foreground apply/contribution triggers
-- never touch this row: they already advance the canonical watermark. Taking
-- this lock from those paths would invert domain -> material-state ordering.
CREATE TABLE canonical_v4.semantic_material_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  revision bigint NOT NULL CHECK(revision>=0)
);
INSERT INTO canonical_v4.semantic_material_state VALUES(true,0);
REVOKE ALL ON canonical_v4.semantic_material_state FROM PUBLIC;

-- Urgency only, never publication authority. Many readers of the same saved
-- page share one hint; the worker still verifies and recomputes current material.
CREATE TABLE canonical_v4.semantic_preparation_requests (
  source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
  generation text NOT NULL,
  matcher_hash text NOT NULL REFERENCES canonical_v4.semantic_matchers(matcher_hash) ON DELETE CASCADE,
  source_version bigint NOT NULL CHECK(source_version>=0),
  requested_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
REVOKE ALL ON canonical_v4.semantic_preparation_requests FROM PUBLIC;

-- One MVCC statement snapshot, metadata only. Background material publication,
-- model activation and owner cuts all participate without a canonical write.
CREATE FUNCTION canonical_v4.semantic_read_revision()
RETURNS TABLE(generation text,revision text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT r.generation,encode(sha256(convert_to(jsonb_build_array(r.generation,h.revision,h.matcher_hash,p.revision,m.revision)::text,'UTF8')),'hex')
  FROM canonical_v4.runtime_state r CROSS JOIN canonical_v4.semantic_installation h
  CROSS JOIN canonical_v4.semantic_owner_policy p CROSS JOIN canonical_v4.semantic_material_state m
  WHERE r.singleton AND h.singleton AND p.singleton AND m.singleton
$$;

-- One statement snapshot, worker-only. Binary array_send/base64 retains exact
-- float8 coordinates; raw payloads remain separately available for mirror checks.
CREATE FUNCTION canonical_v4.semantic_read_source_candidates(p_generation text,p_matcher_hash text,p_after_ordinal bigint,p_limit integer)
RETURNS TABLE(candidate jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR (p_matcher_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_after_ordinal IS NOT NULL AND p_after_ordinal<0) THEN
    RAISE EXCEPTION 'Invalid stored Source candidate request' USING ERRCODE='P1233';END IF;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) OR
      NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_installation WHERE singleton AND matcher_hash=p_matcher_hash) THEN
    RAISE EXCEPTION 'Stored Source generation or matcher changed' USING ERRCODE='P1231';END IF;
  RETURN QUERY WITH selected AS (
    SELECT s.*,e.payload embedding_payload,e.model_id,e.dimensions,e.values_double,
      r.operation_id receipt_operation,r.operation_digest,st.stamp,st.postable,m.identity_text
    FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
    JOIN canonical_v4.operation_receipts r ON r.source_id=s.id JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id
    JOIN canonical_v4.runtime_state state_ ON state_.singleton AND state_.generation=p_generation
    JOIN canonical_v4.semantic_matchers m ON m.matcher_hash=p_matcher_hash AND m.matcher_hash=encode(sha256(convert_to(m.identity_text,'UTF8')),'hex')
    WHERE s.provenance='owner-local-page-embedding/v1' AND s.has_embedding AND st.postable AND e.dimensions=384
      AND s.write_version>=0 AND (p_after_ordinal IS NULL OR s.ordinal>p_after_ordinal)
      AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_observations done_
        WHERE done_.source_id=s.id AND done_.source_version=s.write_version AND done_.matcher_hash=p_matcher_hash AND done_.generation=p_generation)
      AND octet_length(s.payload)<=65536 AND octet_length(e.payload)<=32768
      AND octet_length(s.url)<=8192 AND octet_length(s.title)<=800
      AND octet_length(coalesce(s.extractor_version,''))<=512 AND octet_length(coalesce(s.policy_version,''))<=512
    ORDER BY s.ordinal LIMIT p_limit
  ), rows_ AS (
    SELECT s.ordinal,jsonb_build_object(
      'sourceId',s.id,'ordinal',s.ordinal::text,'sourceVersion',s.write_version::text,'generation',p_generation,'matcherIdentityHash',p_matcher_hash,
      'url',s.url,'title',s.title,'provenance',s.provenance,'extractorVersion',s.extractor_version,'policyVersion',s.policy_version,
      'operationId',s.operation_id,'hasEmbedding',s.has_embedding,'sourcePayload',s.payload,
      'embedding',jsonb_build_object('sourceId',s.id,'modelId',s.model_id,'dimensions',s.dimensions,'payload',s.embedding_payload,
        'valuesBase64',replace(encode(array_send(s.values_double),'base64'),chr(10),'')),
      'receipt',jsonb_build_object('sourceId',s.id,'operationId',s.receipt_operation,'operationDigest',s.operation_digest),
      'stamp',jsonb_build_object('sourceId',s.id,'stamp',s.stamp,'postable',s.postable),
      'reuse',reuse_.value) value_
    FROM selected s LEFT JOIN LATERAL (
      SELECT jsonb_build_object('matcherIdentityHash',i.matcher_hash,'encoderHash',old_.identity_text::jsonb->'inputDefinition'->>'encoderHash',
        'representationHash',old_.identity_text::jsonb->>'representationHash','operationDigest',i.operation_digest,
        'bodyWireHash',i.body_wire_hash,'titleValuesBase64',replace(encode(array_send(i.title_values),'base64'),chr(10),'')) value
      FROM canonical_v4.semantic_inputs i JOIN canonical_v4.semantic_matchers old_ ON old_.matcher_hash=i.matcher_hash
      WHERE i.source_id=s.id AND i.operation_digest=s.operation_digest AND i.body_wire_hash=encode(sha256(array_send(s.values_double)),'hex')
        AND i.title_wire_hash=encode(sha256(array_send(i.title_values)),'hex') AND canonical_v4.ingest_valid_unit_vector(i.title_values)
        AND old_.matcher_hash=encode(sha256(convert_to(old_.identity_text,'UTF8')),'hex')
        AND old_.identity_text::jsonb->'inputDefinition'->>'encoderHash'=s.identity_text::jsonb->'inputDefinition'->>'encoderHash'
        AND old_.identity_text::jsonb->>'representationHash'=s.identity_text::jsonb->>'representationHash'
      ORDER BY i.matcher_hash LIMIT 1
    ) reuse_ ON true
  ), bounded AS (
    SELECT ordinal,value_,sum(octet_length(value_::text)) OVER(ORDER BY ordinal) bytes_ FROM rows_
  ) SELECT value_ FROM bounded WHERE bytes_<=4194304 ORDER BY ordinal;
END $$;

CREATE FUNCTION canonical_v4.semantic_request_source_preparation(p_generation text,p_source text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE head_ text;version_ bigint;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR NOT canonical_v4.runtime_safe_text(p_source,128,false) THEN
    RAISE EXCEPTION 'Invalid preparation hint' USING ERRCODE='P1233';END IF;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RETURN false;END IF;
  SELECT matcher_hash INTO head_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  IF head_ IS NULL THEN RETURN false;END IF;
  SELECT s.write_version INTO version_ FROM canonical_v4.sources s
    JOIN canonical_v4.embeddings e ON e.source_id=s.id JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id
    WHERE s.id=p_source AND s.provenance='owner-local-page-embedding/v1' AND s.has_embedding AND st.postable
      AND e.model_id='e5-small-q8-browser-main-prefix-v1' AND e.dimensions=384;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM canonical_v4.semantic_observations
      WHERE source_id=p_source AND source_version=version_ AND matcher_hash=head_ AND generation=p_generation) THEN RETURN false;END IF;
  IF NOT pg_try_advisory_xact_lock(914092017) THEN RETURN false;END IF;
  DELETE FROM canonical_v4.semantic_preparation_requests WHERE requested_at<clock_timestamp()-interval '15 seconds';
  IF EXISTS(SELECT 1 FROM canonical_v4.semantic_preparation_requests
      WHERE source_id=p_source AND source_version=version_ AND matcher_hash=head_ AND generation=p_generation) THEN RETURN true;END IF;
  DELETE FROM canonical_v4.semantic_preparation_requests WHERE source_id=p_source;
  IF (SELECT count(*) FROM canonical_v4.semantic_preparation_requests)>=64 THEN RETURN false;END IF;
  INSERT INTO canonical_v4.semantic_preparation_requests(source_id,generation,matcher_hash,source_version)
    VALUES(p_source,p_generation,head_,version_);
  RETURN true;
END $$;

CREATE FUNCTION canonical_v4.semantic_take_source_preparation_request(p_generation text,p_matcher_hash text)
RETURNS TABLE(candidate jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE request_ canonical_v4.semantic_preparation_requests%ROWTYPE;ordinal_ bigint;head_ text;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR (p_matcher_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Invalid preparation request scope' USING ERRCODE='P1233';END IF;
  SELECT matcher_hash INTO head_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  IF head_ IS DISTINCT FROM p_matcher_hash OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
    RAISE EXCEPTION 'Preparation head changed' USING ERRCODE='P1231';END IF;
  SELECT * INTO request_ FROM canonical_v4.semantic_preparation_requests
    WHERE generation=p_generation AND matcher_hash=p_matcher_hash
    ORDER BY requested_at,source_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN;END IF;
  DELETE FROM canonical_v4.semantic_preparation_requests WHERE source_id=request_.source_id;
  IF request_.requested_at<clock_timestamp()-interval '15 seconds' THEN RETURN;END IF;
  SELECT s.ordinal INTO ordinal_ FROM canonical_v4.sources s WHERE s.id=request_.source_id AND s.write_version=request_.source_version;
  IF NOT FOUND THEN RETURN;END IF;
  RETURN QUERY SELECT c.candidate FROM canonical_v4.semantic_read_source_candidates(p_generation,p_matcher_hash,
    CASE WHEN ordinal_=0 THEN NULL ELSE ordinal_-1 END,1) c WHERE c.candidate->>'sourceId'=request_.source_id;
END $$;

-- Private verifier. Callers first lock receipt -> Source in sorted order. The
-- verifier never normalizes accepted numbers or changes canonical state.
CREATE FUNCTION canonical_v4.semantic_verify_current_source(p_generation text,p_source text,p_version bigint,p_operation text,
  p_digest text,p_material text,p_stamp text,p_body_hash text)
RETURNS double precision[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s canonical_v4.sources%ROWTYPE;e canonical_v4.embeddings%ROWTYPE;r canonical_v4.operation_receipts%ROWTYPE;
  st canonical_v4.runtime_source_stamps%ROWTYPE;sp jsonb;ep jsonb;body_payload_ double precision[];embedding_ text;stamp_ text;axis_ integer;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR NOT canonical_v4.runtime_safe_text(p_source,128,false) OR p_version IS NULL OR p_version<0 OR
      NOT canonical_v4.runtime_safe_text(p_operation,128,false) OR (p_digest ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      (p_stamp ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (p_body_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      p_material IS NULL OR octet_length(p_material)>65536 THEN
    RAISE EXCEPTION 'Invalid stored Source proof' USING ERRCODE='P1233';END IF;
  SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source;
  SELECT * INTO r FROM canonical_v4.operation_receipts WHERE source_id=p_source;
  IF s.id IS NULL OR s.write_version IS DISTINCT FROM p_version OR s.operation_id IS DISTINCT FROM p_operation OR
      r.operation_id IS DISTINCT FROM p_operation OR r.operation_digest IS DISTINCT FROM p_digest OR
      NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
    RAISE EXCEPTION 'Stored Source changed' USING ERRCODE='P1231';END IF;
  PERFORM canonical_v4.ingest_validate_material(p_material,p_digest);
  SELECT * INTO e FROM canonical_v4.embeddings WHERE source_id=p_source FOR SHARE;
  SELECT * INTO st FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source FOR SHARE;
  IF NOT s.has_embedding OR s.provenance<>'owner-local-page-embedding/v1' OR e.source_id IS NULL OR e.dimensions<>384 OR
      e.model_id<>'e5-small-q8-browser-main-prefix-v1' OR NOT canonical_v4.ingest_valid_unit_vector(e.values_double) OR st.postable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Stored Source is not eligible material' USING ERRCODE='P1233';END IF;
  IF octet_length(s.payload)>65536 OR octet_length(e.payload)>32768 THEN
    RAISE EXCEPTION 'Stored Source mirror too large' USING ERRCODE='P1234';END IF;
  sp:=s.payload::jsonb;ep:=e.payload::jsonb;
  IF jsonb_typeof(sp) IS DISTINCT FROM 'object' OR jsonb_typeof(ep) IS DISTINCT FROM 'object' OR
      sp->>'id' IS DISTINCT FROM s.id OR sp->>'url' IS DISTINCT FROM s.url OR sp->>'title' IS DISTINCT FROM s.title OR
      sp->>'provenance' IS DISTINCT FROM s.provenance OR sp->>'extractorVersion' IS DISTINCT FROM s.extractor_version OR
      sp->>'policyVersion' IS DISTINCT FROM s.policy_version OR sp->>'operationId' IS DISTINCT FROM s.operation_id OR
      sp->>'operationDigest' IS DISTINCT FROM r.operation_digest OR
      -- Normalized imports omit the duplicate; the separate typed embedding,
      -- payload, binary wire, receipt and stamp are still checked below.
      (sp ? 'embedding' AND sp->'embedding' IS DISTINCT FROM ep) OR
      ep->>'modelId' IS DISTINCT FROM e.model_id OR jsonb_typeof(ep->'values') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Stored Source mirrors disagree' USING ERRCODE='P1234';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(ep))<>2 OR jsonb_array_length(ep->'values')<>384 OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(ep->'values') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'number') THEN
    RAISE EXCEPTION 'Invalid stored embedding mirror' USING ERRCODE='P1234';END IF;
  SELECT array_agg(v::double precision ORDER BY ord) INTO body_payload_ FROM jsonb_array_elements_text(ep->'values') WITH ORDINALITY AS values_(v,ord);
  IF encode(sha256(array_send(body_payload_)),'hex') IS DISTINCT FROM p_body_hash OR
      encode(sha256(array_send(e.values_double)),'hex') IS DISTINCT FROM p_body_hash OR
      p_material::jsonb IS DISTINCT FROM jsonb_build_object('url',s.url,'title',s.title,'embedding',ep,'extractorVersion',s.extractor_version) THEN
    RAISE EXCEPTION 'Stored material or body wire differs' USING ERRCODE='P1234';END IF;
  embedding_:='{"modelId":'||to_json(e.model_id)::text||',"values":[';
  FOR axis_ IN 1..384 LOOP
    IF axis_>1 THEN embedding_:=embedding_||',';END IF;
    embedding_:=embedding_||canonical_v4.ingest_json_number(e.values_double[axis_]);
  END LOOP;
  embedding_:=embedding_||']}';
  stamp_:='{"url":'||to_json(s.url)::text||',"embedding":'||embedding_||',"extractorVersion":'||to_json(s.extractor_version)::text||'}';
  IF encode(sha256(convert_to(stamp_,'UTF8')),'hex') IS DISTINCT FROM p_stamp OR st.stamp IS DISTINCT FROM p_stamp THEN
    RAISE EXCEPTION 'Stored Source stamp differs' USING ERRCODE='P1234';END IF;
  RETURN e.values_double;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Invalid stored Source encoding' USING ERRCODE='P1234';
WHEN SQLSTATE 'P1203' THEN
  RAISE EXCEPTION 'Invalid stored Source canonical material' USING ERRCODE='P1233';
END $$;

-- Shared request validation for the two privileged bounded batch ports.
CREATE FUNCTION canonical_v4.semantic_validate_stored_items(p_generation text,p_matcher_hash text,p_items jsonb,p_adoption boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE item_ jsonb;keys_ text[];key_ text;count_ integer;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR (p_matcher_hash ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
      p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid stored Source batch' USING ERRCODE='P1233';END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 OR octet_length(p_items::text)>4194304 THEN
    RAISE EXCEPTION 'Stored Source batch capacity' USING ERRCODE='P1233';END IF;
  keys_:=ARRAY['generation','matcherIdentityHash','sourceId','sourceVersion','operationId','operationDigest','requestMaterial','sourceStamp','bodyWireHash'];
  IF p_adoption THEN keys_:=keys_||ARRAY['rootId','rootVersion','topicId','discussionId'];
  ELSE keys_:=keys_||ARRAY['titleValues','supportedPath','semanticEligible'];END IF;
  FOR item_ IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item_) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid stored Source item' USING ERRCODE='P1233';END IF;
    SELECT count(*) INTO count_ FROM jsonb_object_keys(item_);
    IF count_<>cardinality(keys_) OR NOT item_ ?& keys_ THEN RAISE EXCEPTION 'Invalid stored Source fields' USING ERRCODE='P1233';END IF;
    FOREACH key_ IN ARRAY keys_ LOOP
      IF key_ IN('supportedPath','semanticEligible') THEN CONTINUE;END IF;
      IF jsonb_typeof(item_->key_) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid stored Source field type' USING ERRCODE='P1233';END IF;
    END LOOP;
    IF item_->>'generation' IS DISTINCT FROM p_generation OR item_->>'matcherIdentityHash' IS DISTINCT FROM p_matcher_hash THEN
      RAISE EXCEPTION 'Stored Source item belongs to another generation or matcher' USING ERRCODE='P1233';END IF;
    IF NOT canonical_v4.runtime_safe_text(item_->>'sourceId',128,false) OR NOT canonical_v4.runtime_safe_text(item_->>'operationId',128,false) OR
        (item_->>'sourceVersion' ~ '^(0|[1-9][0-9]{0,18})$') IS DISTINCT FROM true OR (item_->>'sourceVersion')::numeric>9223372036854775807 OR
        (item_->>'operationDigest' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
        (item_->>'sourceStamp' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (item_->>'bodyWireHash' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
        octet_length(item_->>'requestMaterial')>65536 THEN RAISE EXCEPTION 'Invalid stored Source bounds' USING ERRCODE='P1233';END IF;
    IF p_adoption THEN
      IF NOT canonical_v4.runtime_safe_text(item_->>'rootId',128,false) OR NOT canonical_v4.runtime_safe_text(item_->>'topicId',128,false) OR
          NOT canonical_v4.runtime_safe_text(item_->>'discussionId',128,false) OR
          (item_->>'rootVersion' ~ '^(0|[1-9][0-9]{0,18})$') IS DISTINCT FROM true OR (item_->>'rootVersion')::numeric>9223372036854775807 THEN
        RAISE EXCEPTION 'Invalid adoption bounds' USING ERRCODE='P1233';END IF;
    ELSE
      IF jsonb_typeof(item_->'supportedPath') IS DISTINCT FROM 'array' OR jsonb_typeof(item_->'semanticEligible') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Invalid stored semantic result' USING ERRCODE='P1233';END IF;
      IF jsonb_array_length(item_->'supportedPath')>8 OR octet_length(item_->>'titleValues')>16384 OR
          EXISTS(SELECT 1 FROM jsonb_array_elements(item_->'supportedPath') n WHERE jsonb_typeof(n) IS DISTINCT FROM 'string' OR
            NOT canonical_v4.runtime_safe_text(n#>>'{}',160,false)) THEN RAISE EXCEPTION 'Invalid stored semantic path' USING ERRCODE='P1233';END IF;
    END IF;
  END LOOP;
  IF p_adoption THEN
    IF (SELECT count(DISTINCT i->>'rootId') FROM jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items) THEN
      RAISE EXCEPTION 'Duplicate adoption root' USING ERRCODE='P1233';END IF;
  ELSIF (SELECT count(DISTINCT i->>'sourceId') FROM jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Duplicate stored Source' USING ERRCODE='P1233';
  END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Invalid stored Source field encoding' USING ERRCODE='P1233';
END $$;

CREATE FUNCTION canonical_v4.semantic_reclassify_stored_sources(p_generation text,p_matcher_hash text,p_items jsonb)
RETURNS TABLE(source_id text,source_version text,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE head_ canonical_v4.semantic_installation%ROWTYPE;item_ jsonb;body_ double precision[];title_ double precision[];path_ text[];
  existing_ canonical_v4.semantic_inputs%ROWTYPE;observation_ canonical_v4.semantic_observations%ROWTYPE;title_hash_ text;recorded_ boolean;
  changed_ boolean:=false;revision_ bigint;
BEGIN
  PERFORM canonical_v4.semantic_validate_stored_items(p_generation,p_matcher_hash,p_items,false);
  SELECT * INTO head_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  IF p_matcher_hash IS NULL OR head_.matcher_hash IS DISTINCT FROM p_matcher_hash THEN RAISE EXCEPTION 'Stored matcher changed' USING ERRCODE='P1231';END IF;
  PERFORM r.source_id FROM canonical_v4.operation_receipts r WHERE r.source_id IN(SELECT i->>'sourceId' FROM jsonb_array_elements(p_items) i) ORDER BY r.source_id COLLATE "C" FOR SHARE;
  PERFORM s.id FROM canonical_v4.sources s WHERE s.id IN(SELECT i->>'sourceId' FROM jsonb_array_elements(p_items) i) ORDER BY s.id COLLATE "C" FOR SHARE;
  FOR item_ IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'sourceId' COLLATE "C" LOOP
    body_:=canonical_v4.semantic_verify_current_source(p_generation,item_->>'sourceId',(item_->>'sourceVersion')::bigint,item_->>'operationId',
      item_->>'operationDigest',item_->>'requestMaterial',item_->>'sourceStamp',item_->>'bodyWireHash');
    title_:=(item_->>'titleValues')::double precision[];
    SELECT coalesce(array_agg(n#>>'{}' ORDER BY ord),'{}'::text[]) INTO path_ FROM jsonb_array_elements(item_->'supportedPath') WITH ORDINALITY AS nodes_(n,ord);
    IF NOT canonical_v4.ingest_valid_unit_vector(title_) OR (item_->'semanticEligible'='false'::jsonb AND cardinality(path_)>0) OR
        (cardinality(path_)>0 AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n WHERE n.matcher_hash=p_matcher_hash AND n.node_id=path_[cardinality(path_)] AND n.path=path_)) THEN
      RAISE EXCEPTION 'Invalid stored numeric classification' USING ERRCODE='P1233';END IF;
    title_hash_:=encode(sha256(array_send(title_)),'hex');
    INSERT INTO canonical_v4.semantic_inputs VALUES(item_->>'sourceId',item_->>'operationDigest',p_matcher_hash,item_->>'bodyWireHash',title_hash_,body_,title_,path_,(item_->>'semanticEligible')::boolean) ON CONFLICT DO NOTHING;
    SELECT * INTO existing_ FROM canonical_v4.semantic_inputs i WHERE i.source_id=item_->>'sourceId' AND i.operation_digest=item_->>'operationDigest' AND i.matcher_hash=p_matcher_hash;
    IF existing_.body_wire_hash IS DISTINCT FROM item_->>'bodyWireHash' OR existing_.title_wire_hash IS DISTINCT FROM title_hash_ OR
        encode(sha256(array_send(existing_.body_values)),'hex') IS DISTINCT FROM item_->>'bodyWireHash' OR
        encode(sha256(array_send(existing_.title_values)),'hex') IS DISTINCT FROM title_hash_ OR
        existing_.supported_path IS DISTINCT FROM path_ OR existing_.semantic_eligible IS DISTINCT FROM (item_->>'semanticEligible')::boolean THEN
      RAISE EXCEPTION 'Changed immutable stored numeric input' USING ERRCODE='P1234';END IF;
    INSERT INTO canonical_v4.semantic_observations VALUES(item_->>'sourceId',(item_->>'sourceVersion')::bigint,p_generation,item_->>'operationId',item_->>'operationDigest',p_matcher_hash,head_.revision)
      ON CONFLICT DO NOTHING RETURNING true INTO recorded_;
    changed_:=changed_ OR coalesce(recorded_,false);
    SELECT * INTO observation_ FROM canonical_v4.semantic_observations o WHERE o.source_id=item_->>'sourceId' AND o.source_version=(item_->>'sourceVersion')::bigint AND o.matcher_hash=p_matcher_hash;
    IF observation_.generation IS DISTINCT FROM p_generation OR observation_.operation_id IS DISTINCT FROM item_->>'operationId' OR observation_.operation_digest IS DISTINCT FROM item_->>'operationDigest' THEN
      RAISE EXCEPTION 'Changed immutable stored observation' USING ERRCODE='P1234';END IF;
    RETURN QUERY SELECT item_->>'sourceId',item_->>'sourceVersion',CASE WHEN recorded_ THEN 'recorded'::text ELSE 'reused'::text END;
  END LOOP;
  -- LAST lock/write, once per changed batch, after every domain operation.
  IF changed_ THEN
    UPDATE canonical_v4.semantic_material_state SET revision=revision+1 WHERE singleton AND revision<9223372036854775807 RETURNING revision INTO revision_;
    IF NOT FOUND THEN RAISE EXCEPTION 'Semantic material revision exhausted or missing' USING ERRCODE='P1234';END IF;
  END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Invalid stored numeric encoding' USING ERRCODE='P1233';
END $$;

-- Explicit owner action only. These are CURRENT stored Source contexts adopted
-- by stable retained body anchors, never recovered original titles/captures.
CREATE FUNCTION canonical_v4.semantic_adopt_legacy_roots(p_generation text,p_matcher_hash text,p_items jsonb)
RETURNS TABLE(root_id text,status text) LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE head_ canonical_v4.semantic_installation%ROWTYPE;item_ jsonb;root_ canonical_v4.contributions%ROWTYPE;
  snapshot_ canonical_v4.semantic_root_snapshots%ROWTYPE;path_ text[];payload_ jsonb;
  changed_ boolean:=false;revision_ bigint;
BEGIN
  PERFORM canonical_v4.semantic_validate_stored_items(p_generation,p_matcher_hash,p_items,true);
  SELECT * INTO head_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  IF p_matcher_hash IS NULL OR head_.matcher_hash IS DISTINCT FROM p_matcher_hash THEN RAISE EXCEPTION 'Adoption matcher changed' USING ERRCODE='P1231';END IF;
  PERFORM r.source_id FROM canonical_v4.operation_receipts r WHERE r.source_id IN(SELECT i->>'sourceId' FROM jsonb_array_elements(p_items) i) ORDER BY r.source_id COLLATE "C" FOR SHARE;
  PERFORM s.id FROM canonical_v4.sources s WHERE s.id IN(SELECT i->>'sourceId' FROM jsonb_array_elements(p_items) i) ORDER BY s.id COLLATE "C" FOR SHARE;
  PERFORM d.id FROM canonical_v4.discussions d WHERE d.id IN(SELECT i->>'discussionId' FROM jsonb_array_elements(p_items) i) ORDER BY d.id COLLATE "C" FOR SHARE;
  PERFORM t.id FROM canonical_v4.topics t WHERE t.id IN(SELECT i->>'topicId' FROM jsonb_array_elements(p_items) i) ORDER BY t.id COLLATE "C" FOR SHARE;
  PERFORM c.id FROM canonical_v4.contributions c WHERE c.id IN(SELECT i->>'rootId' FROM jsonb_array_elements(p_items) i) ORDER BY c.id COLLATE "C" FOR SHARE;
  FOR item_ IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'rootId' COLLATE "C" LOOP
    PERFORM canonical_v4.semantic_verify_current_source(p_generation,item_->>'sourceId',(item_->>'sourceVersion')::bigint,item_->>'operationId',
      item_->>'operationDigest',item_->>'requestMaterial',item_->>'sourceStamp',item_->>'bodyWireHash');
    SELECT * INTO root_ FROM canonical_v4.contributions WHERE id=item_->>'rootId';payload_:=root_.payload::jsonb;
    IF root_.id IS NULL OR root_.write_version IS DISTINCT FROM (item_->>'rootVersion')::bigint OR root_.root_id IS NOT NULL OR
        root_.withdrawn OR root_.visibility<>'local-public' OR root_.discussion_id IS DISTINCT FROM item_->>'discussionId' OR
        root_.origin_source_id IS DISTINCT FROM item_->>'sourceId' OR root_.anchor_source_id IS DISTINCT FROM item_->>'sourceId' OR
        NOT EXISTS(SELECT 1 FROM canonical_v4.discussions d WHERE d.id=root_.discussion_id AND d.topic_id=item_->>'topicId') OR
        payload_->>'id' IS DISTINCT FROM root_.id OR payload_->>'discussionId' IS DISTINCT FROM root_.discussion_id OR
        payload_->'rootId' IS DISTINCT FROM 'null'::jsonb OR payload_->>'originSourceId' IS DISTINCT FROM item_->>'sourceId' OR
        payload_->'anchor'->>'kind' IS DISTINCT FROM 'source' OR payload_->'anchor'->>'sourceId' IS DISTINCT FROM item_->>'sourceId' OR
        payload_->'anchor'->>'stamp' IS DISTINCT FROM item_->>'sourceStamp' OR payload_->>'originalTopicId' IS DISTINCT FROM item_->>'topicId' OR
        payload_->'learnedOrigin' IS DISTINCT FROM 'true'::jsonb OR payload_->'visibility' IS DISTINCT FROM '"local-public"'::jsonb OR
        payload_->'withdrawn' IS DISTINCT FROM 'false'::jsonb THEN
      RAISE EXCEPTION 'Legacy root context changed or lacks retained evidence' USING ERRCODE='P1231';END IF;
    SELECT i.supported_path INTO path_ FROM canonical_v4.semantic_observations o JOIN canonical_v4.semantic_inputs i USING(source_id,operation_digest,matcher_hash)
      WHERE o.source_id=item_->>'sourceId' AND o.source_version=(item_->>'sourceVersion')::bigint AND o.matcher_hash=p_matcher_hash
        AND o.generation=p_generation AND o.operation_id=item_->>'operationId' AND o.operation_digest=item_->>'operationDigest'
        AND i.semantic_eligible AND cardinality(i.supported_path)>0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified current semantic context required' USING ERRCODE='P1231';END IF;
    SELECT * INTO snapshot_ FROM canonical_v4.semantic_root_snapshots s WHERE s.root_id=root_.id;
    IF FOUND THEN
      IF snapshot_.source_id IS DISTINCT FROM item_->>'sourceId' OR snapshot_.source_version IS DISTINCT FROM (item_->>'sourceVersion')::bigint OR
          snapshot_.matcher_hash IS DISTINCT FROM p_matcher_hash OR snapshot_.generation IS DISTINCT FROM p_generation OR
          snapshot_.operation_id IS DISTINCT FROM item_->>'operationId' OR snapshot_.operation_digest IS DISTINCT FROM item_->>'operationDigest' OR
          snapshot_.topic_id IS DISTINCT FROM item_->>'topicId' OR snapshot_.discussion_id IS DISTINCT FROM item_->>'discussionId' OR
          snapshot_.supported_path IS DISTINCT FROM path_ THEN RAISE EXCEPTION 'Existing historical snapshot is immutable' USING ERRCODE='P1231';END IF;
      RETURN QUERY SELECT root_.id,'existing'::text;
    ELSE
      INSERT INTO canonical_v4.semantic_root_snapshots VALUES(root_.id,item_->>'sourceId',(item_->>'sourceVersion')::bigint,p_matcher_hash,
        p_generation,item_->>'operationId',item_->>'operationDigest',item_->>'topicId',root_.discussion_id,root_.ordinal,path_,'legacy-current-source-context');
      INSERT INTO canonical_v4.semantic_root_edges(root_id,node_id,root_ordinal) SELECT root_.id,node,root_.ordinal FROM unnest(path_) node;
      changed_:=true;
      RETURN QUERY SELECT root_.id,'adopted'::text;
    END IF;
  END LOOP;
  -- LAST lock/write, once per changed batch. Idempotent adoption is inert.
  IF changed_ THEN
    UPDATE canonical_v4.semantic_material_state SET revision=revision+1 WHERE singleton AND revision<9223372036854775807 RETURNING revision INTO revision_;
    IF NOT FOUND THEN RAISE EXCEPTION 'Semantic material revision exhausted or missing' USING ERRCODE='P1234';END IF;
  END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Invalid legacy root material encoding' USING ERRCODE='P1234';
END $$;

REVOKE ALL ON FUNCTION canonical_v4.semantic_read_revision(),canonical_v4.semantic_read_source_candidates(text,text,bigint,integer),
  canonical_v4.semantic_request_source_preparation(text,text),canonical_v4.semantic_take_source_preparation_request(text,text),
  canonical_v4.semantic_verify_current_source(text,text,bigint,text,text,text,text,text),canonical_v4.semantic_validate_stored_items(text,text,jsonb,boolean),
  canonical_v4.semantic_reclassify_stored_sources(text,text,jsonb),canonical_v4.semantic_adopt_legacy_roots(text,text,jsonb) FROM PUBLIC;
DO $$ DECLARE role_ text;BEGIN
  FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
      EXECUTE format('REVOKE ALL ON canonical_v4.semantic_material_state FROM %I',role_);
      EXECUTE format('REVOKE ALL ON canonical_v4.semantic_preparation_requests FROM %I',role_);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.semantic_request_source_preparation(text,text),canonical_v4.semantic_take_source_preparation_request(text,text) FROM %I',role_);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.semantic_read_revision() FROM %I',role_);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.semantic_read_source_candidates(text,text,bigint,integer),canonical_v4.semantic_verify_current_source(text,text,bigint,text,text,text,text,text),canonical_v4.semantic_validate_stored_items(text,text,jsonb,boolean),canonical_v4.semantic_reclassify_stored_sources(text,text,jsonb),canonical_v4.semantic_adopt_legacy_roots(text,text,jsonb) FROM %I',role_);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_read_revision(),canonical_v4.semantic_read_source_candidates(text,text,bigint,integer),canonical_v4.semantic_reclassify_stored_sources(text,text,jsonb) TO murmingle_ingest_worker;
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_take_source_preparation_request(text,text) TO murmingle_ingest_worker;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_read_revision() TO murmingle_app;
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_request_source_preparation(text,text) TO murmingle_app;
  END IF;
END $$;
