-- Unregistered Source-container routing for the semantic ingestion port only.
-- The private helper is mechanically derived from migration005 ingest_apply;
-- lease, material, mirror, lock, unpin, Source and terminal fences are preserved.
-- Existing canonical routes (including all memberships/manual links) stay intact.
-- New Sources receive distinct canonical Topic/Discussion IDs. Their original
-- Ridge reference payload is retained as data, not a container-selection claim.
-- The semantic wrapper differs from010 only by CREATE OR REPLACE and delegate.
CREATE FUNCTION canonical_v4.semantic_apply_source_container(
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
  -- first. Expensive transformation happened before this call; every canonical
  -- mutation remains inside this transaction. Routing uses Source containers.
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
    v_policy_version := source.policy_version;
  ELSE
    v_source_id := p_new_source_id;
    rematch := true;
    v_policy_version := 'hierarchy-source-container/v1';
  END IF;

  -- New pages own distinct canonical containers; semantic paths are not IDs.
  -- Existing routes/memberships remain intact, including manual destinations.
  -- rematch below retains only its original matching-cache invalidation role.
  IF NOT job.source_witness_present THEN
    topic_ids := ARRAY[p_new_topic_id];
    new_topic := true;
    primary_topic_id := p_new_topic_id;
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

  IF NOT job.source_witness_present THEN
    INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT v_source_id,topic_id,(ordinal-1)::integer
      FROM unnest(topic_ids) WITH ORDINALITY AS membership(topic_id,ordinal);
    INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
      VALUES(v_source_id,primary_topic_id,nextval('canonical_v4.source_link_ordinal_sequence'),
        jsonb_build_object('sourceId',v_source_id,'topicId',primary_topic_id,
          'method','learned-provisional')::text,'learned-provisional');
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

CREATE OR REPLACE FUNCTION canonical_v4.semantic_ingest_apply(
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
  SELECT * INTO result_ FROM canonical_v4.semantic_apply_source_container(p_operation_id,p_operation_digest,p_lease_token,p_represented_values,p_parameter_sha256,
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

REVOKE ALL ON FUNCTION canonical_v4.semantic_apply_source_container(text,text,text,double precision[],text,text,text,text,text,text,boolean) FROM PUBLIC;
DO $semantic_source_container_permissions$
DECLARE role_ text;
BEGIN
  FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.semantic_apply_source_container(text,text,text,double precision[],text,text,text,text,text,text,boolean) FROM %I',role_);
    END IF;
  END LOOP;
END $semantic_source_container_permissions$;
