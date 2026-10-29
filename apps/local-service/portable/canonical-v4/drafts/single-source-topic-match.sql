-- Unregistered hierarchy18, worker-only assignment to existing heads. Requires
-- named subjects and protected retrieval inputs. No new identity, model call,
-- canonical post mutation, registry-wide writer lock or startup installation.
CREATE FUNCTION canonical_v4.named_read_single_source(p_generation text,p_matcher text,p_source text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $read$
 SELECT jsonb_build_object('sourceId',source_id,'sourceVersion',source_version::text,'operationId',operation_id,
  'operationDigest',operation_digest,'sourceStamp',source_stamp,'title',title)
 FROM canonical_v4.named_indexable_sources WHERE source_id=p_source AND generation=p_generation AND matcher_hash=p_matcher;
$read$;

CREATE FUNCTION canonical_v4.named_match_single_source(p_generation text,p_matcher text,p_witness jsonb,p_focus jsonb,p_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $match$
DECLARE source_ text;i_ record;h_ record;keys_ text[];representation_ text;root_ text;weights_ jsonb;
 body_weight_ double precision;title_weight_ double precision;values_ double precision[];maximum_ double precision;norm_ double precision;
 raw_ids_ uuid[];check_ids_ uuid[];closure_ uuid[]:=ARRAY[]::uuid[];chain_ uuid[];leaf_ uuid;next_ uuid;context_ text;
 metadata_ jsonb:='{}'::jsonb;row_ jsonb;scored_ jsonb:='{}'::jsonb;c_ record;count_ integer;score_ double precision;rival_ double precision;
 chosen_ uuid;chosen_depth_ integer:=0;chosen_score_ double precision:=-2;unchanged_ boolean;status_ text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_policy IS DISTINCT FROM 'e7092424f2ab8de466c5057c1876cd7f821e33f443e7defe27c6ef494c14a5c7' OR
  canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR (p_matcher ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
  jsonb_typeof(p_witness) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_witness))<>6 OR
  NOT p_witness ?& ARRAY['sourceId','sourceVersion','operationId','operationDigest','sourceStamp','title'] OR octet_length(p_witness::text)>8192 OR
  jsonb_typeof(p_focus) IS DISTINCT FROM 'array' OR jsonb_array_length(p_focus) NOT BETWEEN 1 AND 512 OR octet_length(p_focus::text)>65536 OR
  EXISTS(SELECT 1 FROM jsonb_array_elements(p_focus) WHERE jsonb_typeof(value)<>'string' OR (value#>>'{}') !~ '^[a-f0-9]{64}$') OR
  (SELECT count(DISTINCT value) FROM jsonb_array_elements(p_focus))<>jsonb_array_length(p_focus) THEN
  RAISE EXCEPTION 'Invalid single page matching request' USING ERRCODE='P1323';END IF;
 source_:=p_witness->>'sourceId';
 PERFORM 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Single page generation changed' USING ERRCODE='P1321';END IF;
 SELECT m.identity_text::jsonb->>'representationHash',m.identity_text::jsonb->'inputDefinition' INTO representation_,weights_
  FROM canonical_v4.semantic_installation install_ JOIN canonical_v4.semantic_matchers m USING(matcher_hash)
  WHERE install_.singleton AND install_.matcher_hash=p_matcher FOR SHARE OF install_;
 IF representation_ IS NULL THEN RAISE EXCEPTION 'Single page model changed' USING ERRCODE='P1321';END IF;
 -- Same order as protected preparation. Busy current material is left for the
 -- existing durable discovery request; this function never waits on its rows.
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=source_ FOR SHARE SKIP LOCKED;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE source_id=source_) THEN status_:='busy';END IF;
 PERFORM 1 FROM canonical_v4.sources WHERE id=source_ FOR SHARE SKIP LOCKED;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.sources WHERE id=source_) THEN status_:='busy';END IF;
 PERFORM 1 FROM canonical_v4.embeddings WHERE source_id=source_ FOR SHARE SKIP LOCKED;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.embeddings WHERE source_id=source_) THEN status_:='busy';END IF;
 PERFORM 1 FROM canonical_v4.runtime_source_stamps WHERE source_id=source_ FOR SHARE SKIP LOCKED;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.runtime_source_stamps WHERE source_id=source_) THEN status_:='busy';END IF;
 PERFORM 1 FROM canonical_v4.semantic_inputs WHERE source_id=source_ AND operation_digest=p_witness->>'operationDigest' AND matcher_hash=p_matcher FOR SHARE SKIP LOCKED;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.semantic_inputs WHERE source_id=source_ AND operation_digest=p_witness->>'operationDigest' AND matcher_hash=p_matcher) THEN status_:='busy';END IF;
 IF status_='busy' THEN RETURN jsonb_build_object('status','busy','subjectId',NULL,'candidates',0);END IF;
 SELECT * INTO i_ FROM canonical_v4.named_indexable_sources WHERE source_id=source_ AND generation=p_generation AND matcher_hash=p_matcher;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','retired','subjectId',NULL,'candidates',0);END IF;
 IF p_witness IS DISTINCT FROM jsonb_build_object('sourceId',i_.source_id,'sourceVersion',i_.source_version::text,'operationId',i_.operation_id,
  'operationDigest',i_.operation_digest,'sourceStamp',i_.source_stamp,'title',i_.title) THEN
  RAISE EXCEPTION 'Single page material changed' USING ERRCODE='P1321';END IF;
 root_:=i_.supported_path[1];SELECT array_agg(value ORDER BY value) INTO keys_ FROM jsonb_array_elements_text(p_focus);
 SELECT coalesce(array_agg(subject_id ORDER BY subject_id),ARRAY[]::uuid[]) INTO raw_ids_ FROM (
  SELECT h.subject_id FROM canonical_v4.named_subject_heads h WHERE h.generation=p_generation AND h.matcher_hash=p_matcher
   AND h.representation_hash=representation_ AND h.policy_hash='cd4f0786245a561499253c33cf53a0dc45e0d75e0471707e3a3f8606fb7c4217'
   AND h.focus_key=ANY(keys_) AND (root_ IS NULL OR h.context_root_id IS NULL OR h.context_root_id=root_)
  ORDER BY h.subject_id LIMIT 65) bounded_;
 IF cardinality(raw_ids_)>64 THEN RETURN jsonb_build_object('status','capacity','subjectId',NULL,'candidates',65);END IF;
 IF cardinality(raw_ids_)=0 THEN RETURN jsonb_build_object('status','unresolved','subjectId',NULL,'candidates',0);END IF;
 -- Gather at most64 total heads including their ancestors. No recursive scan
 -- of descendants or the whole catalog. Lock with SKIP LOCKED, then recheck the
 -- exact captured revisions/parents and the complete current literal cohort.
 FOREACH leaf_ IN ARRAY raw_ids_ LOOP
  next_:=leaf_;chain_:=ARRAY[]::uuid[];context_:=NULL;
  WHILE next_ IS NOT NULL LOOP
   IF next_=ANY(chain_) OR cardinality(chain_)>=8 THEN RAISE EXCEPTION 'Single page ancestry invalid' USING ERRCODE='P1323';END IF;
   SELECT h.subject_id,h.revision,h.parent_id,h.context_root_id INTO h_ FROM canonical_v4.named_subject_heads h
    JOIN canonical_v4.named_subject_ids base_ ON base_.id=h.subject_id AND base_.revision=h.revision
    WHERE h.subject_id=next_ AND h.generation=p_generation AND h.matcher_hash=p_matcher AND h.representation_hash=representation_;
   IF NOT FOUND THEN RETURN jsonb_build_object('status','busy','subjectId',NULL,'candidates',cardinality(raw_ids_));END IF;
   IF cardinality(chain_)=0 THEN context_:=h_.context_root_id;
   ELSIF h_.context_root_id IS DISTINCT FROM context_ THEN RAISE EXCEPTION 'Single page ancestor sense differs' USING ERRCODE='P1323';END IF;
   row_:=jsonb_build_object('revision',h_.revision::text,'parentId',h_.parent_id::text);
   IF metadata_ ? next_::text AND metadata_->next_::text IS DISTINCT FROM row_ THEN
    RETURN jsonb_build_object('status','busy','subjectId',NULL,'candidates',cardinality(raw_ids_));END IF;
   metadata_:=jsonb_set(metadata_,ARRAY[next_::text],row_);chain_:=array_append(chain_,next_);
   IF NOT next_=ANY(closure_) THEN closure_:=array_append(closure_,next_);END IF;
   IF cardinality(closure_)>64 THEN RETURN jsonb_build_object('status','capacity','subjectId',NULL,'candidates',65);END IF;
   next_:=h_.parent_id;
  END LOOP;
 END LOOP;
 PERFORM 1 FROM canonical_v4.named_subject_heads WHERE subject_id=ANY(closure_) ORDER BY subject_id FOR SHARE SKIP LOCKED;
 GET DIAGNOSTICS count_=ROW_COUNT;
 IF count_<>cardinality(closure_) OR EXISTS(SELECT 1 FROM unnest(closure_) id_ LEFT JOIN canonical_v4.named_subject_heads h ON h.subject_id=id_
   LEFT JOIN canonical_v4.named_subject_ids base_ ON base_.id=id_ AND base_.revision=h.revision
   WHERE h.subject_id IS NULL OR base_.id IS NULL OR metadata_->id_::text IS DISTINCT FROM jsonb_build_object('revision',h.revision::text,'parentId',h.parent_id::text)) THEN
  RETURN jsonb_build_object('status','busy','subjectId',NULL,'candidates',cardinality(raw_ids_));END IF;
 SELECT coalesce(array_agg(subject_id ORDER BY subject_id),ARRAY[]::uuid[]) INTO check_ids_ FROM (
  SELECT h.subject_id FROM canonical_v4.named_subject_heads h WHERE h.generation=p_generation AND h.matcher_hash=p_matcher
   AND h.representation_hash=representation_ AND h.policy_hash='cd4f0786245a561499253c33cf53a0dc45e0d75e0471707e3a3f8606fb7c4217'
   AND h.focus_key=ANY(keys_) AND (root_ IS NULL OR h.context_root_id IS NULL OR h.context_root_id=root_)
  ORDER BY h.subject_id LIMIT 65) bounded_;
 IF check_ids_ IS DISTINCT FROM raw_ids_ THEN RETURN jsonb_build_object('status','busy','subjectId',NULL,'candidates',cardinality(raw_ids_));END IF;
 body_weight_:=(weights_->>'bodyWeight')::double precision;title_weight_:=(weights_->>'titleWeight')::double precision;
 IF body_weight_ IS NULL OR title_weight_ IS NULL OR body_weight_ NOT BETWEEN 0 AND 1 OR title_weight_ NOT BETWEEN 0 AND 1 OR body_weight_+title_weight_<>1 THEN
  RAISE EXCEPTION 'Single page weights invalid' USING ERRCODE='P1323';END IF;
 IF body_weight_=1 THEN values_:=i_.body_values;ELSIF title_weight_=1 THEN values_:=i_.title_values;
 ELSE
  SELECT array_agg(body_weight_*i_.body_values[n]+title_weight_*i_.title_values[n] ORDER BY n) INTO values_ FROM generate_series(1,384) n;
  SELECT max(abs(v)) INTO maximum_ FROM unnest(values_) v;
  IF maximum_ IS NULL OR maximum_=0 THEN RETURN jsonb_build_object('status','unresolved','subjectId',NULL,'candidates',cardinality(raw_ids_));END IF;
  SELECT sqrt(sum((v/maximum_)*(v/maximum_) ORDER BY n)) INTO norm_ FROM unnest(values_) WITH ORDINALITY x(v,n);
  SELECT array_agg((v/maximum_)/norm_ ORDER BY n) INTO values_ FROM unnest(values_) WITH ORDINALITY x(v,n);
 END IF;
 FOREACH leaf_ IN ARRAY closure_ LOOP
  next_:=leaf_;chain_:=ARRAY[]::uuid[];
  WHILE next_ IS NOT NULL LOOP chain_:=array_append(chain_,next_);next_:=(metadata_->next_::text->>'parentId')::uuid;END LOOP;
  SELECT sum(values_[n]*h.prototype_values[n] ORDER BY n) INTO score_ FROM canonical_v4.named_subject_heads h CROSS JOIN generate_series(1,384) n WHERE h.subject_id=leaf_;
  scored_:=jsonb_set(scored_,ARRAY[leaf_::text],jsonb_build_object('score',score_,'ancestors',chain_));
 END LOOP;
 FOR c_ IN SELECT key,value FROM jsonb_each(scored_) LOOP
  score_:=(c_.value->>'score')::double precision;
  IF score_<.88 THEN CONTINUE;END IF;
  SELECT max((r.value->>'score')::double precision) INTO rival_ FROM jsonb_each(scored_) r
   WHERE NOT (c_.value->'ancestors' ? r.key) AND NOT (r.value->'ancestors' ? c_.key);
  IF rival_ IS NOT NULL AND score_-rival_<.03 THEN CONTINUE;END IF;
  count_:=jsonb_array_length(c_.value->'ancestors');
  IF count_>chosen_depth_ OR count_=chosen_depth_ AND (score_>chosen_score_ OR score_=chosen_score_ AND c_.key<chosen_::text) THEN
   chosen_:=(c_.key)::uuid;chosen_depth_:=count_;chosen_score_:=score_;END IF;
 END LOOP;
 IF chosen_ IS NULL THEN RETURN jsonb_build_object('status','unresolved','subjectId',NULL,'candidates',cardinality(closure_));END IF;
 SELECT array_agg(value::uuid) INTO chain_ FROM jsonb_array_elements_text(scored_->chosen_::text->'ancestors');
 unchanged_:=EXISTS(SELECT 1 FROM canonical_v4.named_subject_selections WHERE source_id=source_ AND subject_id=chosen_) AND NOT EXISTS(
  SELECT 1 FROM unnest(chain_) id_ LEFT JOIN canonical_v4.named_subject_members m ON m.subject_id=id_ AND m.source_id=source_
  WHERE m.subject_id IS NULL OR (m.source_version,m.operation_id,m.operation_digest,m.source_stamp) IS DISTINCT FROM (i_.source_version,i_.operation_id,i_.operation_digest,i_.source_stamp));
 IF unchanged_ THEN RETURN jsonb_build_object('status','retained','subjectId',chosen_::text,'candidates',cardinality(closure_));END IF;
 INSERT INTO canonical_v4.named_subject_members SELECT id_,source_,i_.source_version,i_.operation_id,i_.operation_digest,i_.source_stamp FROM unnest(chain_) id_
  ON CONFLICT(subject_id,source_id) DO UPDATE SET source_version=excluded.source_version,operation_id=excluded.operation_id,operation_digest=excluded.operation_digest,source_stamp=excluded.source_stamp
  WHERE (named_subject_members.source_version,named_subject_members.operation_id,named_subject_members.operation_digest,named_subject_members.source_stamp)
   IS DISTINCT FROM (excluded.source_version,excluded.operation_id,excluded.operation_digest,excluded.source_stamp);
 INSERT INTO canonical_v4.named_subject_selections VALUES(source_,chosen_) ON CONFLICT(source_id) DO UPDATE SET subject_id=excluded.subject_id
  WHERE named_subject_selections.subject_id IS DISTINCT FROM excluded.subject_id;
 RETURN jsonb_build_object('status','matched','subjectId',chosen_::text,'candidates',cardinality(closure_));
EXCEPTION WHEN unique_violation OR serialization_failure OR deadlock_detected THEN RAISE EXCEPTION 'Single page matching conflict' USING ERRCODE='P1321';
 WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation OR foreign_key_violation THEN
  RAISE EXCEPTION 'Invalid single page matching data' USING ERRCODE='P1323';
END $match$;

REVOKE ALL ON FUNCTION canonical_v4.named_read_single_source(text,text,text),canonical_v4.named_match_single_source(text,text,jsonb,jsonb,text) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_read_single_source(text,text,text),canonical_v4.named_match_single_source(text,text,jsonb,jsonb,text) FROM %I',role_);END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN GRANT EXECUTE ON FUNCTION
  canonical_v4.named_read_single_source(text,text,text),canonical_v4.named_match_single_source(text,text,jsonb,jsonb,text) TO murmingle_ingest_worker;END IF;
END $permissions$;
