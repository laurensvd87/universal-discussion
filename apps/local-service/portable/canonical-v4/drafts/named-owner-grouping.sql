-- Unregistered hierarchy18 owner-wide default discussion grouping. Matching
-- still stores its deepest supported subject. No Source/vector/head rewrite,
-- search-index rebuild, canonical destination change or per-user setting.

CREATE FUNCTION canonical_v4.named_current_subject_path(p_generation text,p_subject uuid)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $path$
DECLARE ids_ uuid[]:=ARRAY[]::uuid[];cursor_ uuid:=p_subject;parent_ uuid;
BEGIN
 WHILE cursor_ IS NOT NULL LOOP
  IF cursor_=ANY(ids_) OR cardinality(ids_)>=8 THEN RAISE EXCEPTION 'Invalid named grouping ancestry' USING ERRCODE='P1293';END IF;
  SELECT h.parent_id INTO parent_ FROM canonical_v4.named_subject_heads h
   JOIN canonical_v4.named_subject_ids base_ ON base_.id=h.subject_id AND base_.revision=h.revision
   JOIN canonical_v4.semantic_installation active_ ON active_.singleton AND active_.matcher_hash=h.matcher_hash
   WHERE h.subject_id=cursor_ AND h.generation=p_generation;
  IF NOT FOUND THEN RETURN ARRAY[]::uuid[];END IF;
  ids_:=array_prepend(cursor_,ids_);cursor_:=parent_;
 END LOOP;
 RETURN ids_;
END $path$;

CREATE FUNCTION canonical_v4.named_grouped_subject(p_generation text,p_subject uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $group$
DECLARE ids_ uuid[];policy_ canonical_v4.semantic_owner_policy%ROWTYPE;max_ integer;rules_ jsonb;node_ text;n_ integer;fixed_ text[];
BEGIN
 ids_:=canonical_v4.named_current_subject_path(p_generation,p_subject);
 IF cardinality(ids_)=0 THEN RETURN NULL;END IF;
 SELECT * INTO STRICT policy_ FROM canonical_v4.semantic_owner_policy WHERE singleton;max_:=policy_.default_max_depth;
 SELECT coalesce(jsonb_object_agg(e->>'nodeId',e->'maxDepth'),'{}'::jsonb) INTO rules_ FROM jsonb_array_elements(policy_.overrides) e;
 SELECT ancestor_path INTO fixed_ FROM canonical_v4.named_subject_heads WHERE subject_id=p_subject;
 -- Existing public taxonomy rules provide a subtree default. Learned branch
 -- depth is relative to its first learned subject, not its taxonomy root.
 FOREACH node_ IN ARRAY fixed_ LOOP
  IF rules_ ? node_ THEN max_:=(rules_->>node_)::integer;END IF;
 END LOOP;
 FOR n_ IN 1..cardinality(ids_) LOOP
  node_:='subject-'||ids_[n_]::text;
  IF rules_ ? node_ THEN
   -- An opaque rule follows its subject if a new parent later attaches. It
   -- cannot cut above that subject's new position or extend semantic support.
   max_:=greatest(n_,(rules_->>node_)::integer);
  END IF;
 END LOOP;
 RETURN ids_[least(max_,cardinality(ids_))];
END $group$;

CREATE FUNCTION canonical_v4.named_read_grouped_editor(p_generation text,p_source text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $editor$
DECLARE result_ jsonb;selected_ uuid;parent_ uuid;caption_ text;scope_ jsonb;n_ integer:=0;
BEGIN
 result_:=canonical_v4.named_read_editor(p_generation,p_source);
 IF result_ IS NULL OR result_->'scope'->>'kind'<>'named' THEN RETURN result_;END IF;
 selected_:=canonical_v4.named_grouped_subject(p_generation,(result_->'scope'->>'id')::uuid);
 WHILE selected_ IS NOT NULL AND n_<8 LOOP
   SELECT label,parent_id INTO caption_,parent_ FROM canonical_v4.named_subject_heads WHERE subject_id=selected_ AND generation=p_generation;
   IF FOUND THEN
    scope_:=jsonb_set(jsonb_set(result_->'scope','{id}',to_jsonb(selected_::text)),'{caption}',to_jsonb(caption_));
    -- Grouping is presentation, not new membership or posting authority. Every
    -- chosen ancestor must still be supported by this exact current Source.
    IF canonical_v4.named_check_editor_scope(p_generation,result_->>'topicId',scope_) THEN RETURN jsonb_set(result_,'{scope}',scope_);END IF;
   END IF;
   selected_:=parent_;n_:=n_+1;
 END LOOP;
 RETURN jsonb_set(result_,'{scope}',result_->'pageScope');
END $editor$;

-- Preserve the original static policy verifier and its role/CAS contract.
-- The new wrapper permits opaque subject routes in the same owner policy row.
ALTER FUNCTION canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb) RENAME TO semantic_set_static_owner_policy_core;
CREATE FUNCTION canonical_v4.semantic_set_owner_policy(p_expected_revision bigint,p_default_max_depth integer,p_overrides jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $policy$
DECLARE entry_ jsonb;node_ text;depth_ integer;ids_ uuid[];generation_ text;static_ jsonb:='[]'::jsonb;next_ bigint;normalized_ jsonb;
BEGIN
 IF p_overrides IS NULL OR jsonb_typeof(p_overrides) IS DISTINCT FROM 'array' OR jsonb_array_length(p_overrides)>512 OR octet_length(p_overrides::text)>131072 THEN
  RAISE EXCEPTION 'Invalid mixed owner policy' USING ERRCODE='P1223';END IF;
 FOR entry_ IN SELECT value FROM jsonb_array_elements(p_overrides) LOOP
  IF jsonb_typeof(entry_) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(entry_))<>2 OR
   NOT entry_ ?& ARRAY['nodeId','maxDepth'] OR jsonb_typeof(entry_->'nodeId') IS DISTINCT FROM 'string' OR
   canonical_v4.runtime_safe_text(entry_->>'nodeId',160,false) IS DISTINCT FROM true OR jsonb_typeof(entry_->'maxDepth') IS DISTINCT FROM 'number' OR
   (entry_->>'maxDepth' ~ '^[1-8]$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid mixed owner override' USING ERRCODE='P1223';END IF;
  node_:=entry_->>'nodeId';depth_:=(entry_->>'maxDepth')::integer;
  IF node_ ~ '^subject-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
   IF NOT EXISTS(SELECT 1 FROM canonical_v4.named_subject_ids WHERE id=substr(node_,9)::uuid) THEN
    RAISE EXCEPTION 'Unknown named owner scope' USING ERRCODE='P1223';END IF;
   SELECT generation INTO STRICT generation_ FROM canonical_v4.runtime_state WHERE singleton;
   ids_:=canonical_v4.named_current_subject_path(generation_,substr(node_,9)::uuid);
   IF cardinality(ids_)>depth_ THEN RAISE EXCEPTION 'Named owner override above its own scope' USING ERRCODE='P1223';END IF;
  ELSE static_:=static_||jsonb_build_array(entry_);END IF;
 END LOOP;
 IF (SELECT count(DISTINCT e->>'nodeId') FROM jsonb_array_elements(p_overrides) e)<>jsonb_array_length(p_overrides) THEN
  RAISE EXCEPTION 'Duplicate mixed owner scope' USING ERRCODE='P1223';END IF;
 next_:=canonical_v4.semantic_set_static_owner_policy_core(p_expected_revision,p_default_max_depth,static_);
 SELECT coalesce(jsonb_agg(e ORDER BY (e->>'nodeId') COLLATE "C"),'[]'::jsonb) INTO normalized_ FROM jsonb_array_elements(p_overrides) e;
 UPDATE canonical_v4.semantic_owner_policy SET overrides=normalized_ WHERE singleton;
 RETURN next_;
END $policy$;

REVOKE ALL ON FUNCTION canonical_v4.named_current_subject_path(text,uuid),canonical_v4.named_grouped_subject(text,uuid),
 canonical_v4.named_read_grouped_editor(text,text),canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_current_subject_path(text,uuid),canonical_v4.named_grouped_subject(text,uuid),canonical_v4.named_read_grouped_editor(text,text),canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN GRANT EXECUTE ON FUNCTION canonical_v4.named_read_grouped_editor(text,text) TO murmingle_app;END IF;
END $permissions$;
