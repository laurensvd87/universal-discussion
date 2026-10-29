-- Unregistered hierarchy18 authored AI-root port. Mechanical016 inverse is
-- required by the source test. Existing016 and its18-argument port are unchanged.
-- Only share-insight is enabled here; replies retain original canonical roots.
CREATE FUNCTION canonical_v4.named_share_insight(
  p_actor_id text,
  p_request_id text,
  p_request_digest text,
  p_request_material text,
  p_generation text,
  p_expected_revision bigint,
  p_command_type text,
  p_topic_id text,
  p_discussion_id text,
  p_root_id text,
  p_reply_to_id text,
  p_body text,
  p_origin_source_id text,
  p_operation_id text,
  p_target_contribution_id text,
  p_new_contribution_id text,
  p_created_at text,
  p_generated_proof text,
  p_scope jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $named_share_insight$
DECLARE
  -- BEGIN AUTHOR DECLARATIONS
  v_scope_digest text;
  -- END AUTHOR DECLARATIONS
  v_expected_material jsonb;
  v_material jsonb;
  v_expected_proof jsonb;
  v_proof jsonb;
  -- BEGIN SEMANTIC DECLARATIONS
  v_publication jsonb;
  v_semantic_target jsonb;
  v_evidence jsonb;
  v_evidence_source canonical_v4.sources%ROWTYPE;
  v_evidence_operation canonical_v4.operation_receipts%ROWTYPE;
  v_evidence_embedding canonical_v4.embeddings%ROWTYPE;
  v_embedding_text text;
  v_evidence_material text;
  v_axis integer;
  -- END SEMANTIC DECLARATIONS
  v_claimed boolean := false;
  v_receipt canonical_v4.command_receipts%ROWTYPE;
  v_runtime canonical_v4.runtime_state%ROWTYPE;
  v_discussion canonical_v4.discussions%ROWTYPE;
  v_topic canonical_v4.topics%ROWTYPE;
  v_root canonical_v4.contributions%ROWTYPE;
  v_target canonical_v4.contributions%ROWTYPE;
  v_source canonical_v4.sources%ROWTYPE;
  v_link canonical_v4.source_links%ROWTYPE;
  v_membership canonical_v4.topic_memberships%ROWTYPE;
  v_embedding canonical_v4.embeddings%ROWTYPE;
  v_operation canonical_v4.operation_receipts%ROWTYPE;
  v_source_stamp canonical_v4.runtime_source_stamps%ROWTYPE;
  v_source_payload jsonb;
  v_link_payload jsonb;
  v_embedding_payload jsonb;
  v_root_payload jsonb;
  v_target_payload jsonb;
  v_payload jsonb;
  v_revision_payload jsonb;
  v_historical_origin boolean := false;
  v_has_link boolean := false;
  v_has_embedding boolean := false;
  v_has_operation boolean := false;
  v_revision_rows bigint;
  v_ordinal bigint;
  v_discussion_version bigint;
  v_response text;
BEGIN
  -- BEGIN AUTHOR SCOPE
  IF p_command_type IS DISTINCT FROM 'share-insight' OR p_origin_source_id IS NULL OR
      canonical_v4.named_valid_editor_scope(p_scope) IS DISTINCT FROM true OR p_scope->>'sourceId' IS DISTINCT FROM p_origin_source_id THEN
    RAISE EXCEPTION 'Invalid authored insight scope' USING ERRCODE='P1293';END IF;
  v_scope_digest:=encode(sha256(convert_to(p_scope::text,'UTF8')),'hex');
  -- END AUTHOR SCOPE
  IF NOT canonical_v4.runtime_safe_text(p_actor_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_request_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_generation,128,false)
      OR p_expected_revision IS NULL OR p_expected_revision<0
      OR p_actor_id !~ '^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND p_actor_id NOT IN ('demo-alex','demo-blair')
      OR p_request_digest IS NULL OR p_request_digest !~ '^[a-f0-9]{64}$'
      OR p_request_material IS NULL OR octet_length(p_request_material)>65536
      OR p_command_type IS NULL OR p_command_type NOT IN (
        'edit','withdraw','share-insight','share-insight-reply'
      )
      OR NOT canonical_v4.runtime_safe_text(p_created_at,64,false) THEN
    RAISE EXCEPTION 'Invalid canonical lifecycle command' USING ERRCODE = 'P1003';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id,914092006));

  IF p_command_type='edit' THEN
    IF NOT canonical_v4.runtime_safe_text(p_target_contribution_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_body,8000,true)
        OR p_topic_id IS NOT NULL OR p_discussion_id IS NOT NULL
        OR p_root_id IS NOT NULL OR p_reply_to_id IS NOT NULL
        OR p_origin_source_id IS NOT NULL OR p_operation_id IS NOT NULL
        OR p_new_contribution_id IS NOT NULL OR p_generated_proof IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid canonical edit command' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_build_object(
      'generation',p_generation,'revision',p_expected_revision,
      'command',jsonb_build_object('type','edit',
        'contributionId',p_target_contribution_id,'body',p_body)
    );
  ELSIF p_command_type='withdraw' THEN
    IF NOT canonical_v4.runtime_safe_text(p_target_contribution_id,128,false)
        OR p_body IS NOT NULL OR p_topic_id IS NOT NULL OR p_discussion_id IS NOT NULL
        OR p_root_id IS NOT NULL OR p_reply_to_id IS NOT NULL
        OR p_origin_source_id IS NOT NULL OR p_operation_id IS NOT NULL
        OR p_new_contribution_id IS NOT NULL OR p_generated_proof IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid canonical withdrawal command' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_build_object(
      'generation',p_generation,'revision',p_expected_revision,
      'command',jsonb_build_object('type','withdraw',
        'contributionId',p_target_contribution_id)
    );
  ELSIF p_command_type='share-insight' THEN
    IF NOT canonical_v4.runtime_safe_text(p_topic_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_body,8000,true)
        OR NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_new_contribution_id,128,false)
        OR p_discussion_id IS NOT NULL OR p_root_id IS NOT NULL
        OR p_reply_to_id IS NOT NULL OR p_target_contribution_id IS NOT NULL
        OR p_generated_proof IS NULL OR octet_length(p_generated_proof)>65536
        OR p_origin_source_id IS NOT NULL
          AND NOT canonical_v4.runtime_safe_text(p_origin_source_id,128,false) THEN
      RAISE EXCEPTION 'Invalid generated root command' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_build_object(
      'generation',p_generation,'revision',p_expected_revision,
      'command',jsonb_build_object('type','share-insight','topicId',p_topic_id,
        'body',p_body,'operationId',p_operation_id,
        'originSourceId',p_origin_source_id)
    );
    v_expected_proof := jsonb_build_object(
      'kind','generated-insight','operationId',p_operation_id,
      'actorId',p_actor_id,'topicId',p_topic_id,
      'originSourceId',p_origin_source_id,'body',p_body,
      'rootId',NULL,'replyToId',NULL,'discussionId',NULL
    );
  ELSE
    IF NOT canonical_v4.runtime_safe_text(p_topic_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_discussion_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_root_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_reply_to_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_body,8000,true)
        OR NOT canonical_v4.runtime_safe_text(p_operation_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_new_contribution_id,128,false)
        OR p_target_contribution_id IS NOT NULL
        OR p_generated_proof IS NULL OR octet_length(p_generated_proof)>65536
        OR p_origin_source_id IS NOT NULL
          AND NOT canonical_v4.runtime_safe_text(p_origin_source_id,128,false) THEN
      RAISE EXCEPTION 'Invalid generated reply command' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_build_object(
      'generation',p_generation,'revision',p_expected_revision,
      'command',jsonb_build_object('type','share-insight-reply',
        'topicId',p_topic_id,'discussionId',p_discussion_id,
        'rootId',p_root_id,'replyToId',p_reply_to_id,'body',p_body,
        'operationId',p_operation_id,'originSourceId',p_origin_source_id)
    );
    v_expected_proof := jsonb_build_object(
      'kind','generated-insight','operationId',p_operation_id,
      'actorId',p_actor_id,'topicId',p_topic_id,
      'originSourceId',p_origin_source_id,'body',p_body,
      'rootId',p_root_id,'replyToId',p_reply_to_id,
      'discussionId',p_discussion_id
    );
  END IF;

  BEGIN
    v_material := p_request_material::jsonb;
    IF v_expected_proof IS NOT NULL THEN v_proof := p_generated_proof::jsonb; END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid canonical lifecycle material' USING ERRCODE = 'P1003';
  END;
  -- BEGIN SEMANTIC MATERIAL
  IF (v_material->'command') ? 'semanticPublication' THEN
    v_publication:=v_material->'command'->'semanticPublication';
    IF p_command_type<>'share-insight-reply' OR jsonb_typeof(v_publication) IS DISTINCT FROM 'object' OR
        (SELECT count(*) FROM jsonb_object_keys(v_publication))<>6 OR
        NOT(v_publication ?& ARRAY['semanticTarget','evidence','articleDigest','rootDigest','targetDigest','expiresAt']) THEN
      RAISE EXCEPTION 'Invalid semantic publication' USING ERRCODE='P1003';END IF;
    v_semantic_target:=v_publication->'semanticTarget';v_evidence:=v_publication->'evidence';
    IF jsonb_typeof(v_semantic_target) IS DISTINCT FROM 'object' OR jsonb_typeof(v_evidence) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid semantic publication' USING ERRCODE='P1003';END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_semantic_target))<>4 OR
        NOT(v_semantic_target ?& ARRAY['nodeId','topicId','rootRevision','targetRevision']) OR
        (SELECT count(*) FROM jsonb_object_keys(v_evidence))<>5 OR
        NOT(v_evidence ?& ARRAY['sourceId','sourceVersion','operationId','operationDigest','sourceStamp']) OR
        jsonb_typeof(v_semantic_target->'nodeId') IS DISTINCT FROM 'string' OR
        NOT canonical_v4.runtime_safe_text(v_semantic_target->>'nodeId',160,false) OR
        jsonb_typeof(v_semantic_target->'topicId') IS DISTINCT FROM 'string' OR
        v_semantic_target->>'topicId' IS DISTINCT FROM p_topic_id OR
        jsonb_typeof(v_evidence->'sourceId') IS DISTINCT FROM 'string' OR
        NOT canonical_v4.runtime_safe_text(v_evidence->>'sourceId',128,false) OR
        jsonb_typeof(v_evidence->'operationId') IS DISTINCT FROM 'string' OR
        NOT canonical_v4.runtime_safe_text(v_evidence->>'operationId',128,false) OR
        jsonb_typeof(v_evidence->'sourceVersion') IS DISTINCT FROM 'string' OR
        (v_evidence->>'sourceVersion' ~ '^(0|[1-9][0-9]{0,18})$') IS DISTINCT FROM true OR
        jsonb_typeof(v_semantic_target->'rootRevision') IS DISTINCT FROM 'number' OR
        jsonb_typeof(v_semantic_target->'targetRevision') IS DISTINCT FROM 'number' OR
        (v_semantic_target->>'rootRevision' ~ '^[1-9][0-9]{0,15}$') IS DISTINCT FROM true OR
        (v_semantic_target->>'targetRevision' ~ '^[1-9][0-9]{0,15}$') IS DISTINCT FROM true OR
        jsonb_typeof(v_publication->'expiresAt') IS DISTINCT FROM 'number' OR
        (v_publication->>'expiresAt' ~ '^[1-9][0-9]{0,15}$') IS DISTINCT FROM true OR
        EXISTS(SELECT 1 FROM jsonb_each(v_publication) WHERE key IN ('articleDigest','rootDigest','targetDigest') AND
          (jsonb_typeof(value) IS DISTINCT FROM 'string' OR (value#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)) OR
        EXISTS(SELECT 1 FROM jsonb_each(v_evidence) WHERE key IN ('operationDigest','sourceStamp') AND
          (jsonb_typeof(value) IS DISTINCT FROM 'string' OR (value#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)) THEN
      RAISE EXCEPTION 'Invalid semantic publication' USING ERRCODE='P1003';END IF;
    IF (v_evidence->>'sourceVersion')::numeric>9223372036854775807 OR
        (v_semantic_target->>'rootRevision')::numeric>9007199254740991 OR
        (v_semantic_target->>'targetRevision')::numeric>9007199254740991 OR
        (v_publication->>'expiresAt')::numeric>9007199254740991 OR
        p_origin_source_id IS NOT NULL AND p_origin_source_id IS DISTINCT FROM v_evidence->>'sourceId' THEN
      RAISE EXCEPTION 'Invalid semantic publication bounds' USING ERRCODE='P1003';END IF;
    v_expected_material:=jsonb_set(v_expected_material,'{command,semanticPublication}',v_publication);
    v_expected_proof:=v_expected_proof||jsonb_build_object('semanticPublication',v_publication);
  END IF;
  -- END SEMANTIC MATERIAL
  IF v_material IS DISTINCT FROM v_expected_material
      OR encode(sha256(convert_to(p_request_material,'UTF8')),'hex')<>p_request_digest THEN
    RAISE EXCEPTION 'Invalid canonical lifecycle digest' USING ERRCODE = 'P1003';
  END IF;
  IF v_expected_proof IS NOT NULL AND v_proof IS DISTINCT FROM v_expected_proof THEN
    RAISE EXCEPTION 'Generated proof unavailable' USING ERRCODE = 'P1006';
  END IF;

  PERFORM 1 FROM canonical_v4.runtime_state
    WHERE singleton=true AND generation=p_generation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1001';
  END IF;

  INSERT INTO canonical_v4.command_receipts(
    actor_id,request_id,request_digest,command_type
  ) VALUES(p_actor_id,p_request_id,p_request_digest,p_command_type)
  ON CONFLICT(actor_id,request_id) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT COALESCE(v_claimed,false) THEN
    SELECT * INTO v_receipt FROM canonical_v4.command_receipts
      WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE;
    IF NOT FOUND OR v_receipt.response_text IS NULL THEN
      RAISE EXCEPTION 'Incomplete canonical lifecycle receipt' USING ERRCODE = 'P1004';
    END IF;
    IF v_receipt.request_digest<>p_request_digest
        OR v_receipt.command_type<>p_command_type THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE = 'P1001';
    END IF;
    -- BEGIN AUTHOR REPLAY
    IF NOT EXISTS(SELECT 1 FROM canonical_v4.named_context_receipts
        WHERE actor_id=p_actor_id AND request_id=p_request_id AND scope_digest=v_scope_digest) THEN
      RAISE EXCEPTION 'Original insight scope differs' USING ERRCODE='P1291';END IF;
    -- END AUTHOR REPLAY
    RETURN v_receipt.response_text;
  END IF;

  -- Exact lifecycle commands retain the current global-version precondition.
  -- It is checked once before semantic validation and again atomically when the
  -- watermark advances; exact receipt replays above remain valid afterward.
  PERFORM 1 FROM canonical_v4.runtime_state WHERE singleton=true
    AND generation=p_generation AND revision=p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State changed' USING ERRCODE = 'P1001';
  END IF;

  -- BEGIN SEMANTIC EVIDENCE_LOCKS
  -- Evidence is mandatory even when the generated contribution's origin is null.
  -- Receipt -> Source precedes domain/root locks; no semantic head lock is taken.
  IF v_publication IS NOT NULL THEN
    SELECT * INTO v_evidence_operation FROM canonical_v4.operation_receipts
      WHERE source_id=v_evidence->>'sourceId' FOR SHARE;
    SELECT * INTO v_evidence_source FROM canonical_v4.sources
      WHERE id=v_evidence->>'sourceId' FOR SHARE;
    IF v_evidence_source.id IS NULL OR v_evidence_operation.source_id IS NULL OR
        v_evidence_source.write_version IS DISTINCT FROM (v_evidence->>'sourceVersion')::bigint OR
        v_evidence_source.operation_id IS DISTINCT FROM v_evidence->>'operationId' OR
        v_evidence_operation.operation_id IS DISTINCT FROM v_evidence->>'operationId' OR
        v_evidence_operation.operation_digest IS DISTINCT FROM v_evidence->>'operationDigest' THEN
      RAISE EXCEPTION 'Semantic evidence changed' USING ERRCODE='P1001';END IF;
    SELECT * INTO v_evidence_embedding FROM canonical_v4.embeddings WHERE source_id=v_evidence_source.id FOR SHARE;
    IF v_evidence_embedding.source_id IS NULL OR v_evidence_embedding.dimensions<>384 THEN
      RAISE EXCEPTION 'Semantic evidence unavailable' USING ERRCODE='P1003';END IF;
    v_embedding_text:='{"modelId":'||to_json(v_evidence_embedding.model_id)::text||',"values":[';
    FOR v_axis IN 1..384 LOOP
      IF v_axis>1 THEN v_embedding_text:=v_embedding_text||',';END IF;
      v_embedding_text:=v_embedding_text||canonical_v4.ingest_json_number(v_evidence_embedding.values_double[v_axis]);
    END LOOP;
    v_embedding_text:=v_embedding_text||']}';
    v_evidence_material:='{"url":'||to_json(v_evidence_source.url)::text||',"title":'||to_json(v_evidence_source.title)::text||
      ',"embedding":'||v_embedding_text||',"extractorVersion":'||to_json(v_evidence_source.extractor_version)::text||'}';
    PERFORM canonical_v4.semantic_verify_current_source(p_generation,v_evidence_source.id,v_evidence_source.write_version,
      v_evidence->>'operationId',v_evidence->>'operationDigest',v_evidence_material,v_evidence->>'sourceStamp',
      encode(sha256(array_send(v_evidence_embedding.values_double)),'hex'));
  END IF;
  -- END SEMANTIC EVIDENCE_LOCKS
  -- Learned Source operation receipts precede Source locks everywhere.  This
  -- is the same order used by ingestion apply/refresh and the repaired append
  -- wrapper above.
  IF p_origin_source_id IS NOT NULL THEN
    SELECT * INTO v_operation FROM canonical_v4.operation_receipts
      WHERE source_id=p_origin_source_id FOR SHARE;
    v_has_operation := FOUND;
    SELECT * INTO v_source FROM canonical_v4.sources
      WHERE id=p_origin_source_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source is not linked to destination' USING ERRCODE = 'P1003';
    END IF;
  END IF;

  IF p_command_type IN ('edit','withdraw') THEN
    SELECT discussion_id INTO p_discussion_id
      FROM canonical_v4.contributions WHERE id=p_target_contribution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contribution unavailable' USING ERRCODE = 'P1002';
    END IF;
    SELECT * INTO v_discussion FROM canonical_v4.discussions
      WHERE id=p_discussion_id FOR NO KEY UPDATE;
  ELSIF p_command_type='share-insight' THEN
    SELECT * INTO v_discussion FROM canonical_v4.discussions
      WHERE topic_id=p_topic_id FOR NO KEY UPDATE;
  ELSE
    SELECT * INTO v_discussion FROM canonical_v4.discussions
      WHERE id=p_discussion_id FOR NO KEY UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical destination unavailable' USING ERRCODE = 'P1002';
  END IF;
  SELECT * INTO v_topic FROM canonical_v4.topics
    WHERE id=v_discussion.topic_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical destination unavailable' USING ERRCODE = 'P1002';
  END IF;
  BEGIN
    IF v_discussion.payload::jsonb->>'id' IS DISTINCT FROM v_discussion.id
        OR v_discussion.payload::jsonb->>'topicId' IS DISTINCT FROM v_discussion.topic_id
        OR v_topic.payload::jsonb->>'id' IS DISTINCT FROM v_topic.id THEN
      RAISE EXCEPTION 'Invalid canonical destination mirror' USING ERRCODE = 'P1004';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid canonical destination mirror' USING ERRCODE = 'P1004';
  END;
  IF p_command_type IN ('share-insight','share-insight-reply')
      AND v_discussion.topic_id<>p_topic_id THEN
    RAISE EXCEPTION 'Generated destination changed' USING ERRCODE = 'P1006';
  END IF;

  IF p_command_type='share-insight-reply' THEN
    SELECT * INTO v_root FROM canonical_v4.contributions
      WHERE id=p_root_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Root unavailable' USING ERRCODE = 'P1002';
    END IF;
    IF v_root.discussion_id<>v_discussion.id
        OR v_root.root_id IS NOT NULL OR v_root.withdrawn THEN
      RAISE EXCEPTION 'Invalid canonical reply lineage' USING ERRCODE = 'P1003';
    END IF;
    BEGIN
      v_root_payload := v_root.payload::jsonb;
      IF v_root_payload->>'id' IS DISTINCT FROM v_root.id
          OR v_root_payload->>'discussionId' IS DISTINCT FROM v_root.discussion_id
          OR v_root_payload->>'rootId' IS NOT NULL
          OR (v_root_payload->>'withdrawn')::boolean IS DISTINCT FROM v_root.withdrawn
          OR v_root_payload->>'originSourceId' IS DISTINCT FROM v_root.origin_source_id THEN
        RAISE EXCEPTION 'Invalid canonical root mirror' USING ERRCODE = 'P1004';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid canonical root mirror' USING ERRCODE = 'P1004';
    END;
    SELECT * INTO v_target FROM canonical_v4.contributions
      WHERE id=p_reply_to_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reply target unavailable' USING ERRCODE = 'P1002';
    END IF;
    IF v_target.discussion_id<>v_discussion.id
        OR COALESCE(v_target.root_id,v_target.id)<>v_root.id OR v_target.withdrawn THEN
      RAISE EXCEPTION 'Invalid canonical reply lineage' USING ERRCODE = 'P1003';
    END IF;
    BEGIN
      v_target_payload := v_target.payload::jsonb;
      IF v_target_payload->>'id' IS DISTINCT FROM v_target.id
          OR v_target_payload->>'discussionId' IS DISTINCT FROM v_target.discussion_id
          OR v_target_payload->>'rootId' IS DISTINCT FROM v_target.root_id
          OR (v_target_payload->>'withdrawn')::boolean IS DISTINCT FROM v_target.withdrawn THEN
        RAISE EXCEPTION 'Invalid canonical target mirror' USING ERRCODE = 'P1004';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid canonical target mirror' USING ERRCODE = 'P1004';
    END;
  ELSIF p_command_type IN ('edit','withdraw') THEN
    SELECT * INTO v_target FROM canonical_v4.contributions
      WHERE id=p_target_contribution_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contribution unavailable' USING ERRCODE = 'P1002';
    END IF;
    IF v_target.discussion_id<>v_discussion.id THEN
      RAISE EXCEPTION 'Contribution destination changed' USING ERRCODE = 'P1001';
    END IF;
    BEGIN
      v_target_payload := v_target.payload::jsonb;
      SELECT count(*) INTO v_revision_rows FROM canonical_v4.revisions
        WHERE contribution_id=v_target.id;
      IF v_target_payload->>'id' IS DISTINCT FROM v_target.id
          OR v_target_payload->>'discussionId' IS DISTINCT FROM v_target.discussion_id
          OR v_target_payload->>'rootId' IS DISTINCT FROM v_target.root_id
          OR v_target_payload->>'replyToId' IS DISTINCT FROM v_target.reply_to_id
          OR NOT (v_target_payload ? 'authorId')
          OR v_target_payload->>'authorId' IS DISTINCT FROM v_target.author_id
          OR v_target_payload->>'actorType' IS DISTINCT FROM v_target.actor_type
          OR v_target_payload->>'visibility' IS DISTINCT FROM v_target.visibility
          OR (v_target_payload->>'withdrawn')::boolean IS DISTINCT FROM v_target.withdrawn
          OR v_target_payload->>'createdAt' IS DISTINCT FROM v_target.created_at
          OR v_target_payload->>'originSourceId' IS DISTINCT FROM v_target.origin_source_id
          OR v_revision_rows<>v_target.revision_count
          OR v_target.actor_type='human' AND (
            v_target.operator_id IS NOT NULL OR v_target_payload ? 'insight'
          )
          OR v_target.actor_type='agent' AND (
            v_target.operator_id IS NULL
            OR jsonb_typeof(v_target_payload->'insight') IS DISTINCT FROM 'object'
            OR v_target_payload->'insight'->>'kind' NOT IN ('manual-import','generated')
            OR v_target_payload->'insight'->>'operatorId' IS DISTINCT FROM v_target.operator_id
          ) THEN
        RAISE EXCEPTION 'Invalid canonical contribution mirror' USING ERRCODE = 'P1004';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid canonical contribution mirror' USING ERRCODE = 'P1004';
    END;
    IF v_target.withdrawn
        OR v_target.actor_type='human' AND v_target.author_id<>p_actor_id
        OR v_target.actor_type='agent' AND v_target.operator_id<>p_actor_id
        OR p_command_type='edit' AND v_target.actor_type='agent' THEN
      RAISE EXCEPTION 'Contribution is not owned by actor' USING ERRCODE = 'P1006';
    END IF;
  END IF;

  -- BEGIN SEMANTIC TARGET_FENCE
  IF v_publication IS NOT NULL THEN
    IF (v_publication->>'expiresAt')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000) OR
        (v_publication->>'expiresAt')::bigint>floor(extract(epoch FROM clock_timestamp())*1000)+1800000 OR
        v_root.visibility<>'local-public' OR v_target.visibility<>'local-public' OR
        v_root.revision_count IS DISTINCT FROM (v_semantic_target->>'rootRevision')::bigint OR
        v_target.revision_count IS DISTINCT FROM (v_semantic_target->>'targetRevision')::bigint OR
        encode(sha256(convert_to((SELECT payload::jsonb->>'body' FROM canonical_v4.revisions WHERE contribution_id=v_root.id AND ordinal=v_root.revision_count-1),'UTF8')),'hex') IS DISTINCT FROM v_publication->>'rootDigest' OR
        encode(sha256(convert_to((SELECT payload::jsonb->>'body' FROM canonical_v4.revisions WHERE contribution_id=v_target.id AND ordinal=v_target.revision_count-1),'UTF8')),'hex') IS DISTINCT FROM v_publication->>'targetDigest' OR
        NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_snapshots s
          JOIN canonical_v4.semantic_root_edges e ON e.root_id=s.root_id AND e.root_ordinal=s.root_ordinal
          WHERE s.root_id=v_root.id AND s.generation=p_generation AND s.root_ordinal=v_root.ordinal
            AND s.topic_id=v_topic.id AND s.discussion_id=v_discussion.id AND e.node_id=v_semantic_target->>'nodeId') THEN
      RAISE EXCEPTION 'Semantic publication changed or expired' USING ERRCODE='P1001';END IF;
  END IF;
  -- END SEMANTIC TARGET_FENCE
  IF p_origin_source_id IS NOT NULL THEN
    v_historical_origin := p_command_type='share-insight-reply'
      AND v_root.origin_source_id=p_origin_source_id;
    SELECT * INTO v_link FROM canonical_v4.source_links
      WHERE source_id=p_origin_source_id FOR SHARE;
    v_has_link := FOUND;
    IF NOT v_historical_origin
        AND (NOT v_has_link OR v_link.topic_id<>v_discussion.topic_id) THEN
      RAISE EXCEPTION 'Source is not linked to destination' USING ERRCODE = 'P1003';
    END IF;
    IF NOT v_historical_origin THEN
      SELECT * INTO v_membership FROM canonical_v4.topic_memberships
        WHERE source_id=p_origin_source_id AND topic_id=v_discussion.topic_id FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Source is not linked to destination' USING ERRCODE = 'P1003';
      END IF;
    END IF;
    BEGIN
      v_source_payload := v_source.payload::jsonb;
      IF v_source_payload->>'id' IS DISTINCT FROM v_source.id
          OR v_source_payload->>'url' IS DISTINCT FROM v_source.url
          OR v_source_payload->>'title' IS DISTINCT FROM v_source.title
          OR v_source_payload->>'provenance' IS DISTINCT FROM v_source.provenance
          OR v_source_payload->>'extractorVersion' IS DISTINCT FROM v_source.extractor_version
          OR v_source_payload->>'policyVersion' IS DISTINCT FROM v_source.policy_version
          OR v_source_payload->>'operationId' IS DISTINCT FROM v_source.operation_id THEN
        RAISE EXCEPTION 'Invalid canonical Source mirror' USING ERRCODE = 'P1004';
      END IF;
      IF v_has_link THEN
        v_link_payload := v_link.payload::jsonb;
        IF v_link_payload->>'sourceId' IS DISTINCT FROM v_link.source_id
            OR v_link_payload->>'topicId' IS DISTINCT FROM v_link.topic_id
            OR v_link_payload->>'method' IS DISTINCT FROM v_link.method THEN
          RAISE EXCEPTION 'Invalid canonical Source link mirror' USING ERRCODE = 'P1004';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid canonical Source mirror' USING ERRCODE = 'P1004';
    END;

    SELECT * INTO v_embedding FROM canonical_v4.embeddings
      WHERE source_id=p_origin_source_id FOR SHARE;
    v_has_embedding := FOUND;
    IF v_source.has_embedding IS DISTINCT FROM v_has_embedding THEN
      RAISE EXCEPTION 'Invalid canonical Source embedding mirror' USING ERRCODE = 'P1004';
    END IF;
    IF v_has_embedding THEN
      BEGIN
        v_embedding_payload := v_embedding.payload::jsonb;
        IF v_embedding_payload->>'modelId' IS DISTINCT FROM v_embedding.model_id
            OR jsonb_typeof(v_embedding_payload->'values')<>'array'
            OR jsonb_array_length(v_embedding_payload->'values')<>v_embedding.dimensions
            OR EXISTS(
              SELECT 1 FROM jsonb_array_elements_text(v_embedding_payload->'values')
                WITH ORDINALITY AS value(item,ordinal)
              WHERE value.item::double precision
                IS DISTINCT FROM v_embedding.values_double[value.ordinal]
            ) THEN
          RAISE EXCEPTION 'Invalid canonical Source embedding mirror' USING ERRCODE = 'P1004';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid canonical Source embedding mirror' USING ERRCODE = 'P1004';
      END;
    END IF;
    IF v_source.provenance='owner-local-page-embedding/v1' THEN
      IF NOT v_has_operation
          OR v_operation.operation_id IS DISTINCT FROM v_source.operation_id
          OR v_operation.operation_digest IS DISTINCT FROM v_source_payload->>'operationDigest' THEN
        RAISE EXCEPTION 'Invalid canonical Source operation receipt' USING ERRCODE = 'P1004';
      END IF;
    ELSIF v_has_operation THEN
      RAISE EXCEPTION 'Invalid canonical Source operation receipt' USING ERRCODE = 'P1004';
    END IF;
    SELECT * INTO v_source_stamp FROM canonical_v4.runtime_source_stamps
      WHERE source_id=p_origin_source_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid canonical Source stamp mirror' USING ERRCODE = 'P1004';
    END IF;
    IF v_source.provenance='owner-local-page-embedding/v1'
        AND NOT v_source_stamp.postable THEN
      RAISE EXCEPTION 'Source is not eligible for a new post origin' USING ERRCODE = 'P1003';
    END IF;
  END IF;

  IF p_command_type='edit' THEN
    IF v_target.revision_count>=50 THEN
      RAISE EXCEPTION 'Contribution revision capacity reached' USING ERRCODE = 'P1005';
    END IF;
    v_revision_payload := jsonb_build_object('body',p_body,'createdAt',p_created_at);
    INSERT INTO canonical_v4.revisions(contribution_id,ordinal,payload)
      VALUES(v_target.id,v_target.revision_count,v_revision_payload::text);
    UPDATE canonical_v4.contributions SET
      revision_count=revision_count+1,write_version=write_version+1
      WHERE id=v_target.id;
  ELSIF p_command_type='withdraw' THEN
    v_payload := (v_target_payload || jsonb_build_object(
      'authorId',NULL,'withdrawn',true
    )) - 'insight' - 'originSourceId';
    IF v_target.root_id IS NULL THEN
      v_payload := jsonb_set(v_payload,'{anchor}',jsonb_build_object(
        'kind','topic','topicId',v_discussion.topic_id),false);
    END IF;
    DELETE FROM canonical_v4.revisions WHERE contribution_id=v_target.id;
    UPDATE canonical_v4.contributions SET
      author_id=NULL,operator_id=NULL,origin_source_id=NULL,anchor_source_id=NULL,
      withdrawn=true,revision_count=0,payload=v_payload::text,
      write_version=write_version+1
      WHERE id=v_target.id;
  ELSE
    v_payload := jsonb_build_object(
      'id',p_new_contribution_id,'discussionId',v_discussion.id,
      'rootId',CASE WHEN p_command_type='share-insight-reply' THEN v_root.id ELSE NULL END,
      'replyToId',CASE WHEN p_command_type='share-insight-reply' THEN p_reply_to_id ELSE NULL END,
      'authorId','demo-imported-ai','actorType','agent',
      'insight',jsonb_build_object('kind','generated','operatorId',p_actor_id),
      'visibility','local-public','withdrawn',false,'createdAt',p_created_at
    );
    IF p_origin_source_id IS NOT NULL THEN
      v_payload := v_payload || jsonb_build_object('originSourceId',p_origin_source_id);
    END IF;
    IF p_command_type='share-insight' THEN
      v_payload := v_payload || jsonb_build_object(
        'anchor',CASE WHEN p_origin_source_id IS NULL
          THEN jsonb_build_object('kind','topic','topicId',v_discussion.topic_id)
          ELSE jsonb_build_object('kind','source','sourceId',p_origin_source_id,
            'stamp',v_source_stamp.stamp)
        END,
        'originalTopicId',v_discussion.topic_id,
        'learnedOrigin',COALESCE(v_source.provenance='owner-local-page-embedding/v1',false)
      );
    END IF;
    v_revision_payload := jsonb_build_object('body',p_body,'createdAt',p_created_at);
    SELECT nextval('canonical_v4.contribution_ordinal_sequence') INTO v_ordinal;
    INSERT INTO canonical_v4.id_registry(id,kind)
      VALUES(p_new_contribution_id,'contributions');
    INSERT INTO canonical_v4.contributions(
      id,discussion_id,root_id,reply_to_id,author_id,operator_id,
      origin_source_id,anchor_source_id,actor_type,visibility,withdrawn,
      created_at,revision_count,ordinal,payload,write_version
    ) VALUES(
      p_new_contribution_id,v_discussion.id,
      CASE WHEN p_command_type='share-insight-reply' THEN v_root.id ELSE NULL END,
      CASE WHEN p_command_type='share-insight-reply' THEN p_reply_to_id ELSE NULL END,
      'demo-imported-ai',p_actor_id,p_origin_source_id,
      CASE WHEN p_command_type='share-insight' THEN p_origin_source_id ELSE NULL END,
      'agent','local-public',false,p_created_at,1,v_ordinal,v_payload::text,1
    );
    INSERT INTO canonical_v4.revisions(contribution_id,ordinal,payload)
      VALUES(p_new_contribution_id,0,v_revision_payload::text);
    p_target_contribution_id := p_new_contribution_id;
  END IF;

  UPDATE canonical_v4.discussions SET write_version=write_version+1
    WHERE id=v_discussion.id RETURNING write_version INTO v_discussion_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical destination changed' USING ERRCODE = 'P1001';
  END IF;
  -- BEGIN AUTHOR COMMIT
  PERFORM canonical_v4.named_attach_root_context(p_actor_id,p_request_id,p_generation,p_origin_source_id,p_new_contribution_id,p_scope);
  -- END AUTHOR COMMIT
  UPDATE canonical_v4.runtime_state SET revision=revision+1
    WHERE singleton=true AND generation=p_generation AND revision=p_expected_revision
    RETURNING * INTO v_runtime;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State changed' USING ERRCODE = 'P1001';
  END IF;
  -- BEGIN SEMANTIC FINAL_EXPIRY
  -- The watermark CAS can wait. Recheck after that last contended write so an
  -- expired job cannot complete its receipt; raising rolls back every write.
  IF v_publication IS NOT NULL AND
      (v_publication->>'expiresAt')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
    RAISE EXCEPTION 'Semantic publication expired' USING ERRCODE='P1001';
  END IF;
  -- END SEMANTIC FINAL_EXPIRY
  v_response := jsonb_build_object(
    'version',jsonb_build_object('generation',v_runtime.generation,
      'revision',v_runtime.revision),
    'result',jsonb_build_object('contributionId',p_target_contribution_id)
  )::text;
  UPDATE canonical_v4.command_receipts SET
    discussion_id=v_discussion.id,contribution_id=p_target_contribution_id,
    response_text=v_response
    WHERE actor_id=p_actor_id AND request_id=p_request_id
      AND response_text IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical lifecycle receipt completion failed' USING ERRCODE = 'P1004';
  END IF;
  RETURN v_response;
END
$named_share_insight$;

REVOKE ALL ON FUNCTION canonical_v4.named_share_insight(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_share_insight(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM %I',role_);END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_share_insight(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) TO murmingle_app;END IF;
END $permissions$;
