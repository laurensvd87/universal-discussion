-- Explicit, unregistered hierarchy18 publication composition. Install after
-- public evidence. No model/Source data retention/canonical discussion writes.
-- Only a still-public discussion can recover a withdrawn opaque identity.

CREATE FUNCTION canonical_v4.named_guard_public_focus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$
DECLARE row_ jsonb;lock_ integer;
BEGIN
 -- The publisher takes these guards before SKIP LOCKED root/prototype reads.
 -- A writer already holding a root never makes the publisher wait on that root.
 FOR lock_ IN SELECT DISTINCT hashtext(jsonb_build_array(r->>'generation',r->>'representation_hash',r->>'focus_key')::text)
  FROM jsonb_array_elements(CASE WHEN TG_OP='INSERT' THEN jsonb_build_array(to_jsonb(NEW))
   WHEN TG_OP='DELETE' THEN jsonb_build_array(to_jsonb(OLD)) ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) r ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(914092020,lock_);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $guard$;
CREATE TRIGGER named_public_focus_guard BEFORE INSERT OR UPDATE OR DELETE ON canonical_v4.named_public_prototypes
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_guard_public_focus();

CREATE FUNCTION canonical_v4.named_current_public_recovery_vector(p_source text,p_matcher text)
RETURNS double precision[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $paired$
DECLARE i_ record;weights_ jsonb;b_ double precision;t_ double precision;v_ double precision[];maximum_ double precision;norm_ double precision;
BEGIN
 SELECT i.body_values,i.title_values INTO STRICT i_ FROM canonical_v4.semantic_inputs i
  JOIN canonical_v4.operation_receipts r USING(source_id,operation_digest)
  WHERE i.source_id=p_source AND i.matcher_hash=p_matcher AND i.semantic_eligible;
 SELECT identity_text::jsonb->'inputDefinition' INTO weights_ FROM canonical_v4.semantic_matchers WHERE matcher_hash=p_matcher;
 b_:=(weights_->>'bodyWeight')::double precision;t_:=(weights_->>'titleWeight')::double precision;
 IF b_ IS NULL OR t_ IS NULL OR b_ NOT BETWEEN 0 AND 1 OR t_ NOT BETWEEN 0 AND 1 OR b_+t_<>1 THEN
  RAISE EXCEPTION 'Public recovery weights changed' USING ERRCODE='P1281';END IF;
 IF b_=1 THEN RETURN i_.body_values;ELSIF t_=1 THEN RETURN i_.title_values;END IF;
 SELECT array_agg(b_*i_.body_values[n]+t_*i_.title_values[n] ORDER BY n) INTO v_ FROM generate_series(1,384) n;
 SELECT max(abs(v)) INTO maximum_ FROM unnest(v_) v;
 IF maximum_ IS NULL OR maximum_=0 THEN RAISE EXCEPTION 'Zero public recovery vector' USING ERRCODE='P1283';END IF;
 SELECT sqrt(sum((v/maximum_)*(v/maximum_))) INTO norm_ FROM unnest(v_) v;
 SELECT array_agg((v/maximum_)/norm_ ORDER BY n) INTO v_ FROM unnest(v_) WITH ORDINALITY x(v,n);
 RETURN v_;
END $paired$;

CREATE FUNCTION canonical_v4.named_lock_public_recovery(p jsonb)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $recover$
DECLARE r_ jsonb:=p->'publicRecovery';keys_ text[];lock_ integer;raw_ record;c_ jsonb;u_ jsonb;proof_ jsonb;
 current_ jsonb;expected_ jsonb;scores_ jsonb;ranked_ record;first_candidate_ jsonb;first_score_ double precision;second_score_ double precision;
 wanted_ integer;locked_ integer;recovered_ uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF jsonb_typeof(r_) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r_))<>4 OR
  NOT r_ ?& ARRAY['policyHash','focusKeys','candidates','proofs'] OR
  r_->>'policyHash' IS DISTINCT FROM '987e0dfb66bf169b8b2fffe33a1e4fda468a165066b6595c5696d80eae2bb8a0' OR
  jsonb_typeof(r_->'focusKeys') IS DISTINCT FROM 'array' OR jsonb_array_length(r_->'focusKeys') NOT BETWEEN 1 AND 128 OR
  jsonb_typeof(r_->'candidates') IS DISTINCT FROM 'array' OR jsonb_array_length(r_->'candidates')>64 OR
  jsonb_typeof(r_->'proofs') IS DISTINCT FROM 'array' OR jsonb_array_length(r_->'proofs')>64 OR
  EXISTS(SELECT 1 FROM jsonb_array_elements(r_->'focusKeys') WHERE jsonb_typeof(value)<>'string' OR (value#>>'{}') !~ '^[a-f0-9]{64}$') OR
  (SELECT count(DISTINCT value) FROM jsonb_array_elements(r_->'focusKeys'))<>jsonb_array_length(r_->'focusKeys') THEN
  RAISE EXCEPTION 'Invalid public recovery composition' USING ERRCODE='P1283';END IF;
 FOR lock_ IN SELECT DISTINCT hashtext(jsonb_build_array(p->>'generation',p->>'representationHash',value)::text)
  FROM jsonb_array_elements_text(r_->'focusKeys') ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(914092020,lock_);
 END LOOP;
 -- Bound the raw indexed cohort, including stale representatives that might
 -- become valid after an edit. Never hide a competitor by truncating a join.
 SELECT array_agg(value) INTO keys_ FROM jsonb_array_elements_text(r_->'focusKeys');
 wanted_:=0;
 FOR raw_ IN SELECT root_id FROM canonical_v4.named_public_prototypes WHERE generation=p->>'generation'
  AND representation_hash=p->>'representationHash' AND focus_key=ANY(keys_)
  ORDER BY focus_key,scope_id LIMIT 65 LOOP
  wanted_:=wanted_+1;IF wanted_>64 THEN RAISE EXCEPTION 'Public recovery capacity' USING ERRCODE='P1283';END IF;
  PERFORM 1 FROM canonical_v4.contributions WHERE id=raw_.root_id FOR SHARE SKIP LOCKED;
  IF NOT FOUND THEN RAISE EXCEPTION 'Public recovery root busy' USING ERRCODE='P1281';END IF;
  PERFORM 1 FROM canonical_v4.named_root_contexts WHERE root_id=raw_.root_id FOR KEY SHARE SKIP LOCKED;
  IF NOT FOUND THEN RAISE EXCEPTION 'Public recovery context busy' USING ERRCODE='P1281';END IF;
 END LOOP;
 -- Same-focus prototype writers are fenced by the trigger guard. SKIP LOCKED
 -- refuses an already-running store rather than forming a row/guard deadlock.
 PERFORM 1 FROM canonical_v4.named_public_prototypes WHERE generation=p->>'generation'
  AND representation_hash=p->>'representationHash' AND focus_key=ANY(keys_) ORDER BY scope_id FOR SHARE SKIP LOCKED;
 GET DIAGNOSTICS locked_=ROW_COUNT;
 IF locked_<>wanted_ THEN RAISE EXCEPTION 'Public recovery prototype busy' USING ERRCODE='P1281';END IF;
 current_:=canonical_v4.named_public_candidates(p->>'generation',p->>'representationHash',r_->'focusKeys');
 SELECT coalesce(jsonb_agg(jsonb_build_object('rootId',v->>'rootId','topicId',v->>'topicId','rootVersion',v->>'rootVersion',
  'publicDigest',v->>'publicDigest','identityRevision',v->>'identityRevision','focusKey',v->>'focusKey','headPresent',(v->>'headPresent')::boolean)
  ORDER BY v->>'topicId'),'[]'::jsonb) INTO expected_ FROM jsonb_array_elements(current_) v;
 IF expected_ IS DISTINCT FROM r_->'candidates' THEN RAISE EXCEPTION 'Public recovery candidates changed' USING ERRCODE='P1281';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'updates') u WHERE NOT (u->>'focusKey'=ANY(keys_))) OR
  (SELECT count(DISTINCT v->>'topicId') FROM jsonb_array_elements(r_->'proofs') v)<>jsonb_array_length(r_->'proofs') THEN
  RAISE EXCEPTION 'Invalid public recovery scopes' USING ERRCODE='P1283';END IF;
 -- Compute each exact protected Source/public-prototype pair once, not once per
 -- overlapping proposal. At most64x64x384 products; no model, ANN or full scan.
 WITH sources_ AS MATERIALIZED(SELECT w->>'sourceId' id,canonical_v4.named_current_public_recovery_vector(w->>'sourceId',p->>'matcherHash') v
   FROM jsonb_array_elements(p->'witnesses') w),
 pairs_ AS(SELECT s.id,c->>'topicId' scope_id,sum(x.v*(c->'vector'->>(x.n-1)::integer)::double precision ORDER BY x.n) score
   FROM sources_ s CROSS JOIN jsonb_array_elements(current_) c CROSS JOIN LATERAL unnest(s.v) WITH ORDINALITY x(v,n)
   GROUP BY s.id,c->>'topicId')
 SELECT coalesce(jsonb_object_agg(jsonb_build_array(id,scope_id)::text,to_jsonb(score)),'{}'::jsonb) INTO scores_ FROM pairs_;
 FOR u_ IN SELECT value FROM jsonb_array_elements(p->'updates') LOOP
  SELECT value INTO proof_ FROM jsonb_array_elements(r_->'proofs') WHERE value->>'topicId'=u_->>'subjectId';
  IF u_->'expectedRevision'<>'null'::jsonb AND proof_ IS NULL THEN CONTINUE;END IF;
  first_candidate_:=NULL;first_score_:=NULL;second_score_:=NULL;
  FOR ranked_ IN SELECT c v,(SELECT min((scores_->>jsonb_build_array(m->>'sourceId',c->>'topicId')::text)::double precision)
    FROM jsonb_array_elements(u_->'members') m) score FROM jsonb_array_elements(current_) c
    WHERE c->>'focusKey'=u_->>'focusKey' ORDER BY score DESC,c->>'topicId' LOOP
   IF first_candidate_ IS NULL THEN first_candidate_:=ranked_.v;first_score_:=ranked_.score;ELSE second_score_:=ranked_.score;EXIT;END IF;
  END LOOP;
  IF first_candidate_ IS NULL OR first_score_<.88 THEN
   IF proof_ IS NOT NULL THEN RAISE EXCEPTION 'Public recovery unsupported' USING ERRCODE='P1283';END IF;CONTINUE;
  END IF;
  IF second_score_ IS NOT NULL AND first_score_-second_score_<.03 THEN RAISE EXCEPTION 'Public recovery ambiguous' USING ERRCODE='P1281';END IF;
  c_:=first_candidate_;
  SELECT value INTO expected_ FROM jsonb_array_elements(r_->'candidates') WHERE value->>'topicId'=c_->>'topicId';
  IF proof_ IS DISTINCT FROM expected_ OR c_->>'topicId' IS DISTINCT FROM u_->>'subjectId' OR
   u_->>'expectedRevision' IS DISTINCT FROM c_->>'identityRevision' OR (c_->>'headPresent')::boolean THEN
   RAISE EXCEPTION 'Public recovery identity changed' USING ERRCODE='P1281';END IF;
  recovered_:=array_append(recovered_,(u_->>'subjectId')::uuid);
 END LOOP;
 IF cardinality(recovered_)<>jsonb_array_length(r_->'proofs') THEN RAISE EXCEPTION 'Extraneous public recovery proof' USING ERRCODE='P1283';END IF;
 RETURN recovered_;
END $recover$;

REVOKE ALL ON FUNCTION canonical_v4.named_guard_public_focus(),canonical_v4.named_current_public_recovery_vector(text,text),canonical_v4.named_lock_public_recovery(jsonb) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_guard_public_focus(),canonical_v4.named_current_public_recovery_vector(text,text),canonical_v4.named_lock_public_recovery(jsonb) FROM %I',role_);
  END IF;
 END LOOP;
END $permissions$;
