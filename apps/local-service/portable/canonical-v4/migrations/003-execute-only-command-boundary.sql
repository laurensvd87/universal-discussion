-- Runtime-created Source anchors use the canonical JavaScript sourceStamp.
-- This protected mirror is populated by the migration/import owner and lets
-- the command boundary construct roots without trusting caller-supplied JSON.
CREATE TABLE canonical_v4.runtime_source_stamps (
  source_id text COLLATE "C" PRIMARY KEY
    REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  stamp text NOT NULL CHECK (stamp ~ '^[a-f0-9]{64}$'),
  postable boolean NOT NULL
);

-- JavaScript's String.length counts UTF-16 code units. PostgreSQL length()
-- counts Unicode scalar values, so astral characters must count twice here to
-- keep the database boundary at least as strict as readText/readBody.
CREATE FUNCTION canonical_v4.runtime_utf16_length(candidate text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $runtime_utf16_length$
  SELECT COALESCE(sum(CASE WHEN ascii(character) > 65535 THEN 2 ELSE 1 END),0)::integer
  FROM regexp_split_to_table(candidate,'') AS character
$runtime_utf16_length$;

CREATE FUNCTION canonical_v4.runtime_safe_text(
  candidate text,
  maximum_length integer,
  allow_multiline boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $runtime_safe_text$
  SELECT candidate IS NOT NULL
    AND canonical_v4.runtime_utf16_length(candidate) BETWEEN 1 AND maximum_length
    AND candidate !~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$'
    AND CASE WHEN allow_multiline
      THEN regexp_replace(candidate,E'[\\t\\r\\n]','','g')
      ELSE candidate
    END !~ '[[:cntrl:]]'
    AND candidate !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
$runtime_safe_text$;

-- Owner-only half of the command. It deliberately leaves the receipt pending;
-- only the atomic public wrapper calls it in production. The split exists so
-- the isolated native concurrency harness can pause after taking the exact
-- discussion lock and still roll the whole transaction back on a test fault.
CREATE FUNCTION canonical_v4.runtime_prepare_command(
  p_actor_id text,
  p_request_id text,
  p_request_digest text,
  p_request_material text,
  p_generation text,
  p_command_type text,
  p_topic_id text,
  p_discussion_id text,
  p_root_id text,
  p_reply_to_id text,
  p_body text,
  p_origin_source_id text,
  p_contribution_id text,
  p_created_at text
)
RETURNS TABLE(
  replayed boolean,
  response_text text,
  discussion_id text,
  contribution_id text,
  discussion_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $runtime_prepare_command$
DECLARE
  v_expected_material jsonb;
  v_material jsonb;
  v_claimed boolean := false;
  v_receipt canonical_v4.command_receipts%ROWTYPE;
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
  v_ordinal bigint;
  v_discussion_version bigint;
  v_historical_origin boolean := false;
  v_has_link boolean := false;
  v_has_embedding boolean := false;
  v_has_operation boolean := false;
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_actor_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_request_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_generation,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_contribution_id,128,false)
      OR NOT canonical_v4.runtime_safe_text(p_created_at,64,false)
      OR NOT canonical_v4.runtime_safe_text(p_body,8000,true)
      OR p_actor_id !~ '^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND p_actor_id NOT IN ('demo-alex','demo-blair')
      OR p_request_digest IS NULL OR p_request_digest !~ '^[a-f0-9]{64}$'
      OR p_request_material IS NULL OR octet_length(p_request_material) > 32768
      OR p_command_type IS NULL OR p_command_type NOT IN ('create-root','reply') THEN
    RAISE EXCEPTION 'Invalid canonical runtime command' USING ERRCODE = 'P1003';
  END IF;
  IF p_origin_source_id IS NOT NULL
      AND NOT canonical_v4.runtime_safe_text(p_origin_source_id,128,false) THEN
    RAISE EXCEPTION 'Invalid canonical runtime command' USING ERRCODE = 'P1003';
  END IF;
  IF p_command_type = 'create-root' THEN
    IF NOT canonical_v4.runtime_safe_text(p_topic_id,128,false)
        OR p_discussion_id IS NOT NULL OR p_root_id IS NOT NULL OR p_reply_to_id IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid canonical runtime command' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_build_object(
      'generation',p_generation,
      'command',jsonb_build_object(
        'type','create-root','topicId',p_topic_id,'body',p_body,
        'originSourceId',p_origin_source_id
      )
    );
  ELSE
    IF p_topic_id IS NOT NULL
        OR NOT canonical_v4.runtime_safe_text(p_discussion_id,128,false)
        OR NOT canonical_v4.runtime_safe_text(p_root_id,128,false)
        OR p_reply_to_id IS NOT NULL
          AND NOT canonical_v4.runtime_safe_text(p_reply_to_id,128,false) THEN
      RAISE EXCEPTION 'Invalid canonical runtime command' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_build_object(
      'generation',p_generation,
      'command',jsonb_build_object(
        'type','reply','discussionId',p_discussion_id,'rootId',p_root_id,
        'replyToId',p_reply_to_id,'body',p_body,'originSourceId',p_origin_source_id
      )
    );
  END IF;
  BEGIN
    v_material := p_request_material::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid canonical runtime command' USING ERRCODE = 'P1003';
  END;
  IF v_material IS DISTINCT FROM v_expected_material
      OR encode(sha256(convert_to(p_request_material,'UTF8')),'hex') <> p_request_digest THEN
    RAISE EXCEPTION 'Invalid canonical runtime command digest' USING ERRCODE = 'P1003';
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
      WHERE actor_id=p_actor_id AND request_id=p_request_id
      FOR UPDATE;
    IF NOT FOUND OR v_receipt.response_text IS NULL THEN
      RAISE EXCEPTION 'Incomplete canonical command receipt' USING ERRCODE = 'P1004';
    END IF;
    IF v_receipt.request_digest <> p_request_digest
        OR v_receipt.command_type <> p_command_type THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE = 'P1001';
    END IF;
    RETURN QUERY SELECT true,v_receipt.response_text,v_receipt.discussion_id,
      v_receipt.contribution_id,NULL::bigint;
    RETURN;
  END IF;

  -- Shared lock order for append and future ingestion commands:
  -- receipt -> Source -> Discussion -> Topic -> Contribution -> watermark.
  -- Source is locked before the destination even though historical-origin
  -- validation must wait until the root is known.
  IF p_origin_source_id IS NOT NULL THEN
    SELECT * INTO v_source FROM canonical_v4.sources
      WHERE id=p_origin_source_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source is not linked to destination' USING ERRCODE = 'P1003';
    END IF;
  END IF;

  IF p_command_type = 'create-root' THEN
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

  IF p_command_type = 'reply' THEN
    SELECT * INTO v_root FROM canonical_v4.contributions
      WHERE id=p_root_id FOR SHARE;
    IF NOT FOUND OR v_root.discussion_id <> v_discussion.id
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
    IF p_reply_to_id IS NOT NULL THEN
      SELECT * INTO v_target FROM canonical_v4.contributions
        WHERE id=p_reply_to_id FOR SHARE;
      IF NOT FOUND OR v_target.discussion_id <> v_discussion.id
          OR COALESCE(v_target.root_id,v_target.id) <> v_root.id OR v_target.withdrawn THEN
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
    END IF;
  END IF;

  IF p_origin_source_id IS NOT NULL THEN
    v_historical_origin := p_command_type='reply'
      AND v_root.origin_source_id=p_origin_source_id;
    SELECT * INTO v_link FROM canonical_v4.source_links
      WHERE source_id=p_origin_source_id FOR SHARE;
    v_has_link := FOUND;
    IF NOT v_historical_origin
        AND (NOT v_has_link OR v_link.topic_id <> v_discussion.topic_id) THEN
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
            OR jsonb_typeof(v_embedding_payload->'values') <> 'array'
            OR jsonb_array_length(v_embedding_payload->'values') <> v_embedding.dimensions
            OR EXISTS(
              SELECT 1
              FROM jsonb_array_elements_text(v_embedding_payload->'values') WITH ORDINALITY AS value(item,ordinal)
              WHERE value.item::double precision IS DISTINCT FROM v_embedding.values_double[value.ordinal]
            ) THEN
          RAISE EXCEPTION 'Invalid canonical Source embedding mirror' USING ERRCODE = 'P1004';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid canonical Source embedding mirror' USING ERRCODE = 'P1004';
      END;
    END IF;
    SELECT * INTO v_operation FROM canonical_v4.operation_receipts
      WHERE source_id=p_origin_source_id FOR SHARE;
    v_has_operation := FOUND;
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

  v_payload := jsonb_build_object(
    'id',p_contribution_id,
    'discussionId',v_discussion.id,
    'rootId',CASE WHEN p_command_type='reply' THEN v_root.id ELSE NULL END,
    'replyToId',CASE WHEN p_command_type='reply' THEN p_reply_to_id ELSE NULL END,
    'authorId',p_actor_id,
    'actorType','human',
    'visibility','local-public',
    'withdrawn',false,
    'createdAt',p_created_at
  );
  IF p_origin_source_id IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('originSourceId',p_origin_source_id);
  END IF;
  IF p_command_type='create-root' THEN
    v_payload := v_payload || jsonb_build_object(
      'anchor',CASE WHEN p_origin_source_id IS NULL
        THEN jsonb_build_object('kind','topic','topicId',v_discussion.topic_id)
        ELSE jsonb_build_object('kind','source','sourceId',p_origin_source_id,'stamp',v_source_stamp.stamp)
      END,
      'originalTopicId',v_discussion.topic_id,
      'learnedOrigin',COALESCE(v_source.provenance='owner-local-page-embedding/v1',false)
    );
  END IF;
  v_revision_payload := jsonb_build_object('body',p_body,'createdAt',p_created_at);
  SELECT nextval('canonical_v4.contribution_ordinal_sequence') INTO v_ordinal;
  INSERT INTO canonical_v4.id_registry(id,kind)
    VALUES(p_contribution_id,'contributions');
  INSERT INTO canonical_v4.contributions(
    id,discussion_id,root_id,reply_to_id,author_id,operator_id,
    origin_source_id,anchor_source_id,actor_type,visibility,withdrawn,
    created_at,revision_count,ordinal,payload,write_version
  ) VALUES(
    p_contribution_id,v_discussion.id,
    CASE WHEN p_command_type='reply' THEN v_root.id ELSE NULL END,
    CASE WHEN p_command_type='reply' THEN p_reply_to_id ELSE NULL END,
    p_actor_id,NULL,p_origin_source_id,
    CASE WHEN p_command_type='create-root' THEN p_origin_source_id ELSE NULL END,
    'human','local-public',false,p_created_at,1,v_ordinal,v_payload::text,1
  );
  INSERT INTO canonical_v4.revisions(contribution_id,ordinal,payload)
    VALUES(p_contribution_id,0,v_revision_payload::text);
  UPDATE canonical_v4.discussions
    SET write_version=write_version+1
    WHERE id=v_discussion.id
    RETURNING write_version INTO v_discussion_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical destination changed' USING ERRCODE = 'P1001';
  END IF;
  RETURN QUERY SELECT false,NULL::text,v_discussion.id,p_contribution_id,v_discussion_version;
END
$runtime_prepare_command$;

CREATE FUNCTION canonical_v4.runtime_complete_command(
  p_actor_id text,
  p_request_id text,
  p_generation text,
  p_discussion_id text,
  p_contribution_id text,
  p_discussion_version bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $runtime_complete_command$
DECLARE
  v_response text;
BEGIN
  WITH watermark AS (
    UPDATE canonical_v4.runtime_state
    SET revision=revision+1
    WHERE singleton=true AND generation=p_generation
    RETURNING generation,revision
  ), receipt AS (
    UPDATE canonical_v4.command_receipts AS command_receipt
    SET discussion_id=p_discussion_id,
      contribution_id=p_contribution_id,
      response_text=jsonb_build_object(
        'version',jsonb_build_object(
          'generation',watermark.generation,
          'revision',watermark.revision
        ),
        'discussionVersion',p_discussion_version,
        'result',jsonb_build_object('contributionId',p_contribution_id)
      )::text
    FROM watermark
    WHERE command_receipt.actor_id=p_actor_id
      AND command_receipt.request_id=p_request_id
      AND command_receipt.response_text IS NULL
    RETURNING command_receipt.response_text
  )
  SELECT receipt.response_text INTO v_response
  FROM watermark CROSS JOIN receipt;
  IF NOT FOUND OR v_response IS NULL THEN
    RAISE EXCEPTION 'Canonical command receipt completion failed' USING ERRCODE = 'P1004';
  END IF;
  RETURN v_response;
END
$runtime_complete_command$;

CREATE FUNCTION canonical_v4.runtime_append_command(
  p_actor_id text,
  p_request_id text,
  p_request_digest text,
  p_request_material text,
  p_generation text,
  p_command_type text,
  p_topic_id text,
  p_discussion_id text,
  p_root_id text,
  p_reply_to_id text,
  p_body text,
  p_origin_source_id text,
  p_contribution_id text,
  p_created_at text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $runtime_append_command$
DECLARE
  v_prepared record;
BEGIN
  SELECT * INTO v_prepared FROM canonical_v4.runtime_prepare_command(
    p_actor_id,p_request_id,p_request_digest,p_request_material,p_generation,
    p_command_type,p_topic_id,p_discussion_id,p_root_id,p_reply_to_id,p_body,
    p_origin_source_id,p_contribution_id,p_created_at
  );
  IF v_prepared.replayed THEN
    RETURN v_prepared.response_text;
  END IF;
  RETURN canonical_v4.runtime_complete_command(
    p_actor_id,p_request_id,p_generation,v_prepared.discussion_id,
    v_prepared.contribution_id,v_prepared.discussion_version
  );
END
$runtime_append_command$;

REVOKE ALL ON FUNCTION canonical_v4.runtime_safe_text(text,integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.runtime_utf16_length(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.runtime_prepare_command(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.runtime_complete_command(
  text,text,text,text,text,bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.runtime_append_command(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text
) FROM PUBLIC;
REVOKE ALL ON TABLE canonical_v4.runtime_source_stamps FROM PUBLIC;

DO $runtime_execute_only_permissions$
DECLARE
  protected_relation oid;
  protected_sequence oid;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON ALL TABLES IN SCHEMA canonical_v4 FROM murmingle_app;
    REVOKE UPDATE(write_version) ON canonical_v4.discussions FROM murmingle_app;
    REVOKE UPDATE(revision) ON canonical_v4.runtime_state FROM murmingle_app;
    REVOKE UPDATE(discussion_id,contribution_id,response_text)
      ON canonical_v4.command_receipts FROM murmingle_app;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA canonical_v4 FROM murmingle_app;
    REVOKE EXECUTE ON FUNCTION canonical_v4.runtime_lock_row(text,text,text)
      FROM murmingle_app;
    REVOKE SELECT ON canonical_v4.command_receipts,canonical_v4.runtime_source_stamps
      FROM murmingle_app;
    GRANT USAGE ON SCHEMA canonical_v4 TO murmingle_app;
    GRANT EXECUTE ON FUNCTION canonical_v4.runtime_append_command(
      text,text,text,text,text,text,text,text,text,text,text,text,text,text
    ) TO murmingle_app;
    FOR protected_relation IN
      SELECT relation.oid FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='canonical_v4' AND relation.relkind IN ('r','p')
    LOOP
      IF has_table_privilege('murmingle_app',protected_relation,
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege('murmingle_app',protected_relation,'INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'murmingle_app retains direct canonical table DML';
      END IF;
    END LOOP;
    FOR protected_sequence IN
      SELECT relation.oid FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='canonical_v4' AND relation.relkind='S'
    LOOP
      IF has_sequence_privilege('murmingle_app',protected_sequence,'USAGE,SELECT,UPDATE') THEN
        RAISE EXCEPTION 'murmingle_app retains direct canonical sequence access';
      END IF;
    END LOOP;
    IF has_function_privilege('murmingle_app',
        'canonical_v4.runtime_prepare_command(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE')
        OR has_function_privilege('murmingle_app',
          'canonical_v4.runtime_complete_command(text,text,text,text,text,bigint)','EXECUTE')
        OR has_function_privilege('murmingle_app',
          'canonical_v4.runtime_lock_row(text,text,text)','EXECUTE')
        OR NOT has_function_privilege('murmingle_app',
          'canonical_v4.runtime_append_command(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
          'EXECUTE') THEN
      RAISE EXCEPTION 'murmingle_app canonical command boundary privileges are invalid';
    END IF;
  END IF;
END
$runtime_execute_only_permissions$;
