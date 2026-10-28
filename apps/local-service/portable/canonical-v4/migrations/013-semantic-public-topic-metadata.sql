-- Unregistered public metadata reads. No model execution, preparation, queue,
-- registry mutation, root adoption, vector export or current-head row locks.
-- Projects protected observations; it does not independently re-attest captured
-- material/SourceStamp or grant posting permission. Caller joins owner policy in
-- the same repeatable-read snapshot before choosing a displayed grouping path.
CREATE FUNCTION canonical_v4.semantic_read_topic_nodes(p_generation text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE generation_ text;head_ text;nodes_ jsonb;result_ jsonb;
BEGIN
  IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Invalid semantic metadata request' USING ERRCODE='P1243';END IF;
  SELECT generation INTO generation_ FROM canonical_v4.runtime_state WHERE singleton;
  IF generation_ IS DISTINCT FROM p_generation THEN
    RAISE EXCEPTION 'Semantic generation changed' USING ERRCODE='P1241';END IF;
  SELECT matcher_hash INTO head_ FROM canonical_v4.semantic_installation WHERE singleton;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.node_id,'parentId',n.parent_id,'path',n.path)
    ORDER BY n.node_id COLLATE "C"),'[]'::jsonb) INTO nodes_
  FROM (SELECT node_id,parent_id,path FROM canonical_v4.semantic_nodes WHERE matcher_hash=head_
    ORDER BY node_id COLLATE "C" LIMIT 513) n;
  IF jsonb_array_length(nodes_)>512 THEN
    RAISE EXCEPTION 'Invalid semantic topology' USING ERRCODE='P1244';END IF;
  result_:=jsonb_build_object('generation',generation_,'matcherIdentityHash',head_,'nodes',nodes_);
  IF octet_length(result_::text)>524288 THEN
    RAISE EXCEPTION 'Semantic metadata capacity' USING ERRCODE='P1244';END IF;
  RETURN result_;
END $$;

CREATE FUNCTION canonical_v4.semantic_read_source_context(p_generation text,p_source text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE generation_ text;head_ text;source_ canonical_v4.sources%ROWTYPE;
  observation_ canonical_v4.semantic_observations%ROWTYPE;input_ canonical_v4.semantic_inputs%ROWTYPE;
  receipt_ canonical_v4.operation_receipts%ROWTYPE;embedding_ canonical_v4.embeddings%ROWTYPE;
  stamp_ canonical_v4.runtime_source_stamps%ROWTYPE;path_ text[]:=ARRAY[]::text[];
  status_ text:='pending';payload_ jsonb;
BEGIN
  IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
      canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Invalid semantic context request' USING ERRCODE='P1243';END IF;
  SELECT generation INTO generation_ FROM canonical_v4.runtime_state WHERE singleton;
  IF generation_ IS DISTINCT FROM p_generation THEN
    RAISE EXCEPTION 'Semantic generation changed' USING ERRCODE='P1241';END IF;
  SELECT * INTO source_ FROM canonical_v4.sources WHERE id=p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='P1242';END IF;
  SELECT matcher_hash INTO head_ FROM canonical_v4.semantic_installation WHERE singleton;
  SELECT * INTO observation_ FROM canonical_v4.semantic_observations
    WHERE source_id=p_source AND source_version=source_.write_version AND matcher_hash=head_;
  IF FOUND THEN
    SELECT * INTO receipt_ FROM canonical_v4.operation_receipts WHERE source_id=p_source;
    SELECT * INTO input_ FROM canonical_v4.semantic_inputs WHERE source_id=p_source
      AND operation_digest=observation_.operation_digest AND matcher_hash=head_;
    SELECT * INTO embedding_ FROM canonical_v4.embeddings WHERE source_id=p_source;
    SELECT * INTO stamp_ FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source;
    payload_:=source_.payload::jsonb;
    IF observation_.generation IS DISTINCT FROM generation_ OR
        observation_.operation_id IS DISTINCT FROM source_.operation_id OR
        receipt_.operation_id IS DISTINCT FROM source_.operation_id OR
        receipt_.operation_digest IS DISTINCT FROM observation_.operation_digest OR
        payload_->>'operationDigest' IS DISTINCT FROM observation_.operation_digest OR
        payload_->>'id' IS DISTINCT FROM source_.id OR payload_->>'url' IS DISTINCT FROM source_.url OR
        payload_->>'title' IS DISTINCT FROM source_.title OR
        payload_->>'operationId' IS DISTINCT FROM source_.operation_id OR
        payload_->>'provenance' IS DISTINCT FROM source_.provenance OR
        payload_->>'extractorVersion' IS DISTINCT FROM source_.extractor_version OR
        payload_->>'policyVersion' IS DISTINCT FROM source_.policy_version OR
        source_.provenance IS DISTINCT FROM 'owner-local-page-embedding/v1' OR source_.has_embedding IS DISTINCT FROM true OR
        input_.source_id IS DISTINCT FROM source_.id OR input_.matcher_hash IS DISTINCT FROM head_ OR
        embedding_.source_id IS DISTINCT FROM source_.id OR embedding_.model_id IS DISTINCT FROM 'e5-small-q8-browser-main-prefix-v1' OR
        embedding_.dimensions IS DISTINCT FROM 384 OR
        -- Normalized imports keep this data solely in the embedding table.
        (payload_ ? 'embedding' AND (
          payload_->'embedding'->>'modelId' IS DISTINCT FROM embedding_.model_id OR
          payload_->'embedding'->'values' IS DISTINCT FROM to_jsonb(embedding_.values_double))) OR
        embedding_.payload::jsonb->>'modelId' IS DISTINCT FROM embedding_.model_id OR
        embedding_.payload::jsonb->'values' IS DISTINCT FROM to_jsonb(embedding_.values_double) OR
        input_.body_wire_hash IS DISTINCT FROM encode(sha256(array_send(embedding_.values_double)),'hex') OR
        stamp_.source_id IS DISTINCT FROM source_.id OR
        (input_.semantic_eligible AND stamp_.postable IS DISTINCT FROM true) THEN
      RAISE EXCEPTION 'Invalid semantic context mirror' USING ERRCODE='P1244';END IF;
    path_:=input_.supported_path;
    IF path_ IS NULL OR cardinality(path_)>8 OR
        (cardinality(path_)>0 AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes
          WHERE matcher_hash=head_ AND node_id=path_[cardinality(path_)] AND path=path_)) OR
        (NOT input_.semantic_eligible AND cardinality(path_)<>0) THEN
      RAISE EXCEPTION 'Invalid semantic context path' USING ERRCODE='P1244';END IF;
    status_:=CASE WHEN input_.semantic_eligible THEN 'classified' ELSE 'excluded' END;
  END IF;
  RETURN jsonb_build_object('generation',generation_,'matcherIdentityHash',head_,'sourceId',p_source,
    'sourceVersion',source_.write_version::text,'status',status_,'supportedPath',path_);
END $$;

REVOKE ALL ON FUNCTION canonical_v4.semantic_read_topic_nodes(text),
  canonical_v4.semantic_read_source_context(text,text) FROM PUBLIC;
DO $semantic_metadata_permissions$
DECLARE role_ text;
BEGIN
  FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.semantic_read_topic_nodes(text),canonical_v4.semantic_read_source_context(text,text) FROM %I',role_);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_read_topic_nodes(text),canonical_v4.semantic_read_source_context(text,text) TO murmingle_app;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_read_topic_nodes(text) TO murmingle_ingest_worker;
  END IF;
END $semantic_metadata_permissions$;
