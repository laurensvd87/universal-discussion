-- Unregistered hierarchy18 component. Only expressly published named roots.
-- No Source FK/name/vector/digest/path, hidden capture, model or canonical write.
-- Each post/edit appends an independent event; no worker-owned counter on writes.
CREATE VIEW canonical_v4.named_public_roots AS
 SELECT b.*,encode(sha256(convert_to('['||to_json(b.root_id)::text||','||to_json(b.scope_id)::text||','||
  to_json(b.caption)::text||','||to_json(b.body)::text||']','UTF8')),'hex') public_digest
 FROM (
  SELECT ctx.root_id,ctx.scope_id,ctx.generation,ctx.caption,c.write_version,c.ordinal,c.actor_type='human' human,
   CASE WHEN c.revision_count=0 THEN c.payload::jsonb->>'body' ELSE rev.payload::jsonb->>'body' END body
  FROM canonical_v4.named_root_contexts ctx JOIN canonical_v4.contributions c ON c.id=ctx.root_id
  LEFT JOIN canonical_v4.revisions rev ON rev.contribution_id=c.id AND rev.ordinal=c.revision_count-1
  WHERE ctx.scope_kind='named' AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND
   (c.revision_count=0 AND jsonb_typeof(c.payload::jsonb->'body')='string' OR c.revision_count>0 AND jsonb_typeof(rev.payload::jsonb->'body')='string')
 ) b WHERE body IS NOT NULL AND length(body) BETWEEN 1 AND 8000;

CREATE TABLE canonical_v4.named_public_prototypes (
 generation text COLLATE "C" NOT NULL,representation_hash text COLLATE "C" NOT NULL CHECK(representation_hash ~ '^[a-f0-9]{64}$'),
 scope_id text COLLATE "C" NOT NULL CHECK(scope_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 root_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.named_root_contexts(root_id) ON DELETE CASCADE,
 public_digest text COLLATE "C" NOT NULL CHECK(public_digest ~ '^[a-f0-9]{64}$'),
 focus_key text COLLATE "C" NOT NULL CHECK(focus_key ~ '^[a-f0-9]{64}$'),
 values_double double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(values_double)),
 human boolean NOT NULL,input_hash text COLLATE "C" NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(generation,representation_hash,scope_id)
);
CREATE INDEX named_public_prototype_root ON canonical_v4.named_public_prototypes(root_id);
CREATE INDEX named_public_prototype_focus ON canonical_v4.named_public_prototypes(generation,representation_hash,focus_key,scope_id);
CREATE TABLE canonical_v4.named_public_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,generation text COLLATE "C" NOT NULL,
 kind text NOT NULL CHECK(kind IN ('root','scope')),scope_id text COLLATE "C" NOT NULL,
 root_id text COLLATE "C" REFERENCES canonical_v4.named_root_contexts(root_id) ON DELETE CASCADE,
 after_root text COLLATE "C",retry_after timestamptz NOT NULL DEFAULT '-infinity',
 CHECK((kind='root' AND root_id IS NOT NULL AND after_root IS NULL) OR kind='scope' AND root_id IS NULL)
);
CREATE INDEX named_public_event_order ON canonical_v4.named_public_events(generation,event_id) INCLUDE(retry_after);

CREATE FUNCTION canonical_v4.named_schedule_public_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $schedule$
DECLARE ctx_ record;
BEGIN
 IF TG_TABLE_NAME='named_public_prototypes' THEN
  INSERT INTO canonical_v4.named_public_events(generation,kind,scope_id) VALUES(OLD.generation,'scope',OLD.scope_id);RETURN OLD;
 ELSIF TG_TABLE_NAME='named_root_contexts' THEN
  IF NEW.scope_kind<>'named' THEN RETURN NEW;END IF;ctx_:=NEW;
 ELSE
  -- Edits append their actual body to revisions before advancing this root's
  -- version. Origin erasure may also advance it without changing public text.
  IF NEW.root_id IS NOT NULL THEN RETURN NEW;END IF;
  SELECT * INTO ctx_ FROM canonical_v4.named_root_contexts WHERE root_id=NEW.id AND scope_kind='named';
  IF NOT FOUND THEN RETURN NEW;END IF;
 END IF;
 INSERT INTO canonical_v4.named_public_events(generation,kind,scope_id,root_id) VALUES(ctx_.generation,'root',ctx_.scope_id,ctx_.root_id);
 RETURN NEW;
END $schedule$;
CREATE TRIGGER named_public_new_context AFTER INSERT ON canonical_v4.named_root_contexts
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_public_evidence();
CREATE TRIGGER named_public_changed_body AFTER UPDATE OF write_version,withdrawn,visibility ON canonical_v4.contributions
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_public_evidence();
CREATE TRIGGER named_public_removed_prototype AFTER DELETE ON canonical_v4.named_public_prototypes
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_public_evidence();

CREATE FUNCTION canonical_v4.named_public_tasks(p_generation text,p_matcher text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $tasks$
DECLARE representation_ text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Public evidence generation changed' USING ERRCODE='P1311';END IF;
 SELECT m.identity_text::jsonb->>'representationHash' INTO representation_ FROM canonical_v4.semantic_installation i
  JOIN canonical_v4.semantic_matchers m USING(matcher_hash) WHERE i.singleton AND i.matcher_hash=p_matcher;
 IF representation_ IS NULL THEN RAISE EXCEPTION 'Public evidence model changed' USING ERRCODE='P1311';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('eventId',q.event_id::text,'kind',q.kind,'scopeId',q.scope_id,'witness',
   CASE WHEN r.root_id IS NULL THEN NULL ELSE jsonb_build_object('rootId',r.root_id,'topicId',r.scope_id,'caption',r.caption,'body',r.body,
    'rootVersion',r.write_version::text,'publicDigest',r.public_digest) END,'skipEncoding',
   q.kind='scope' OR r.root_id IS NULL OR EXISTS(SELECT 1 FROM canonical_v4.named_public_prototypes p
    JOIN canonical_v4.named_public_roots old_ ON old_.root_id=p.root_id AND old_.generation=p.generation AND old_.scope_id=p.scope_id AND old_.public_digest=p.public_digest
    WHERE p.generation=p_generation AND p.representation_hash=representation_ AND p.input_hash='4524c3fe89d89ea3de525f014aa73a1bd5f9845582fa3b9e87a41c23ef4b1389' AND p.scope_id=q.scope_id AND
     (p.root_id=r.root_id AND p.public_digest=r.public_digest OR p.root_id<>r.root_id AND p.human>=r.human))) ORDER BY q.event_id)
  FROM (SELECT * FROM canonical_v4.named_public_events WHERE generation=p_generation AND retry_after<=clock_timestamp() ORDER BY event_id LIMIT 2) q
  LEFT JOIN canonical_v4.named_public_roots r ON r.root_id=q.root_id AND r.generation=q.generation AND r.scope_id=q.scope_id),'[]'::jsonb);
END $tasks$;

CREATE FUNCTION canonical_v4.named_defer_public_evidence(p_generation text,p_event bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $defer$
 WITH ready_ AS (SELECT event_id FROM canonical_v4.named_public_events WHERE generation=p_generation AND event_id=p_event FOR UPDATE SKIP LOCKED),
 changed_ AS (UPDATE canonical_v4.named_public_events SET retry_after=clock_timestamp()+interval '5 seconds'
  WHERE event_id IN(SELECT event_id FROM ready_) RETURNING event_id)
 SELECT EXISTS(SELECT 1 FROM changed_);
$defer$;

CREATE FUNCTION canonical_v4.named_repair_public_scope(p_generation text,p_matcher text,p_event bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $repair$
DECLARE e_ canonical_v4.named_public_events%ROWTYPE;representation_ text;r_ record;n_ integer:=0;last_ text;
BEGIN
 IF p_event IS NULL OR p_event<1 OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Public repair generation changed' USING ERRCODE='P1311';END IF;
 SELECT m.identity_text::jsonb->>'representationHash' INTO representation_ FROM canonical_v4.semantic_installation i
  JOIN canonical_v4.semantic_matchers m USING(matcher_hash) WHERE i.singleton AND i.matcher_hash=p_matcher;
 IF representation_ IS NULL THEN RAISE EXCEPTION 'Public repair model changed' USING ERRCODE='P1311';END IF;
 SELECT * INTO e_ FROM canonical_v4.named_public_events WHERE event_id=p_event AND generation=p_generation FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN 'retired';END IF;
 IF e_.kind<>'scope' THEN RAISE EXCEPTION 'Wrong public repair event' USING ERRCODE='P1313';END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.named_public_prototypes p JOIN canonical_v4.named_public_roots r
   ON r.root_id=p.root_id AND r.generation=p.generation AND r.scope_id=p.scope_id AND r.public_digest=p.public_digest
   WHERE p.generation=p_generation AND p.representation_hash=representation_ AND p.input_hash='4524c3fe89d89ea3de525f014aa73a1bd5f9845582fa3b9e87a41c23ef4b1389' AND p.scope_id=e_.scope_id) THEN
  DELETE FROM canonical_v4.named_public_events WHERE event_id=p_event;RETURN 'completed';END IF;
 FOR r_ IN SELECT root_id FROM canonical_v4.named_root_contexts WHERE generation=p_generation AND scope_kind='named' AND scope_id=e_.scope_id
   AND (e_.after_root IS NULL OR root_id>e_.after_root) ORDER BY root_id LIMIT 16 LOOP
  PERFORM 1 FROM canonical_v4.named_root_contexts WHERE root_id=r_.root_id FOR KEY SHARE SKIP LOCKED;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=r_.root_id) THEN
   UPDATE canonical_v4.named_public_events SET after_root=coalesce(last_,after_root) WHERE event_id=p_event;RETURN 'busy';END IF;
  IF NOT FOUND THEN last_:=r_.root_id;n_:=n_+1;CONTINUE;END IF;
  INSERT INTO canonical_v4.named_public_events(generation,kind,scope_id,root_id) VALUES(p_generation,'root',e_.scope_id,r_.root_id);
  last_:=r_.root_id;n_:=n_+1;
 END LOOP;
 -- Yield this cursor behind the root jobs just emitted. Two large scope
 -- repairs must not continually occupy both ready slots ahead of their roots.
 IF n_=16 THEN UPDATE canonical_v4.named_public_events SET after_root=last_,event_id=DEFAULT WHERE event_id=p_event;RETURN 'advanced';END IF;
 DELETE FROM canonical_v4.named_public_events WHERE event_id=p_event;RETURN 'completed';
END $repair$;

CREATE FUNCTION canonical_v4.named_store_public_evidence(p_generation text,p_matcher text,p_event bigint,p_witness jsonb,
 p_focus text,p_body double precision[],p_title double precision[],p_exclusion text,p_contract text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $store$
DECLARE e_ canonical_v4.named_public_events%ROWTYPE;r_ record;representation_ text;weights_ jsonb;
 body_weight_ double precision;title_weight_ double precision;values_ double precision[];maximum_ double precision;norm_ double precision;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_event IS NULL OR p_event<1 OR
   canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR (p_matcher ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR p_contract IS DISTINCT FROM '4524c3fe89d89ea3de525f014aa73a1bd5f9845582fa3b9e87a41c23ef4b1389' THEN
  RAISE EXCEPTION 'Invalid public evidence store' USING ERRCODE='P1313';END IF;
 PERFORM 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Public evidence generation changed' USING ERRCODE='P1311';END IF;
 SELECT m.identity_text::jsonb->>'representationHash',m.identity_text::jsonb->'inputDefinition' INTO representation_,weights_
  FROM canonical_v4.semantic_installation i JOIN canonical_v4.semantic_matchers m USING(matcher_hash) WHERE i.singleton AND i.matcher_hash=p_matcher FOR SHARE OF i;
 IF representation_ IS NULL THEN RAISE EXCEPTION 'Public evidence model changed' USING ERRCODE='P1311';END IF;
 -- Root -> context -> event -> prototype. No Source/domain/head/clock lock.
 -- Encoding has already finished outside this short transaction.
 IF p_witness IS NOT NULL THEN
  IF jsonb_typeof(p_witness) IS DISTINCT FROM 'object' OR octet_length(p_witness::text)>65536 THEN
   RAISE EXCEPTION 'Invalid public evidence witness' USING ERRCODE='P1313';END IF;
  PERFORM 1 FROM canonical_v4.contributions WHERE id=p_witness->>'rootId' FOR SHARE SKIP LOCKED;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.contributions WHERE id=p_witness->>'rootId') THEN RETURN 'busy';END IF;
  PERFORM 1 FROM canonical_v4.named_root_contexts WHERE root_id=p_witness->>'rootId' FOR KEY SHARE SKIP LOCKED;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=p_witness->>'rootId') THEN RETURN 'busy';END IF;
 END IF;
 SELECT * INTO e_ FROM canonical_v4.named_public_events WHERE event_id=p_event AND generation=p_generation FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN 'retired';END IF;
 IF e_.kind<>'root' THEN RAISE EXCEPTION 'Wrong public evidence event' USING ERRCODE='P1313';END IF;
 SELECT * INTO r_ FROM canonical_v4.named_public_roots WHERE root_id=e_.root_id AND generation=p_generation AND scope_id=e_.scope_id;
 IF NOT FOUND THEN DELETE FROM canonical_v4.named_public_events WHERE event_id=p_event;RETURN 'retired';END IF;
 IF p_witness IS DISTINCT FROM jsonb_build_object('rootId',r_.root_id,'topicId',r_.scope_id,'caption',r_.caption,'body',r_.body,
   'rootVersion',r_.write_version::text,'publicDigest',r_.public_digest) THEN
  RAISE EXCEPTION 'Published text changed' USING ERRCODE='P1311';END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.named_public_prototypes p JOIN canonical_v4.named_public_roots old_
  ON old_.root_id=p.root_id AND old_.generation=p.generation AND old_.scope_id=p.scope_id AND old_.public_digest=p.public_digest
  WHERE p.generation=p_generation AND p.representation_hash=representation_ AND p.input_hash='4524c3fe89d89ea3de525f014aa73a1bd5f9845582fa3b9e87a41c23ef4b1389' AND p.scope_id=e_.scope_id AND
   (p.root_id=r_.root_id AND p.public_digest=r_.public_digest OR p.root_id<>r_.root_id AND p.human>=r_.human)) THEN
  DELETE FROM canonical_v4.named_public_events WHERE event_id=p_event;RETURN 'retained';END IF;
 IF p_exclusion IS NOT NULL THEN
  IF p_exclusion<>'insufficient-public-text' OR p_body IS NOT NULL OR p_title IS NOT NULL OR p_focus IS NOT NULL THEN
   RAISE EXCEPTION 'Invalid public evidence exclusion' USING ERRCODE='P1313';END IF;
  -- A stale old prototype of this edited root must not remain as a competitor.
  DELETE FROM canonical_v4.named_public_prototypes WHERE root_id=r_.root_id AND generation=p_generation AND representation_hash=representation_;
  DELETE FROM canonical_v4.named_public_events WHERE event_id=p_event;RETURN 'excluded';
 END IF;
 IF p_focus IS NULL AND p_body IS NULL AND p_title IS NULL THEN RAISE EXCEPTION 'Public evidence representative changed' USING ERRCODE='P1311';END IF;
 IF (p_focus ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR canonical_v4.ingest_valid_unit_vector(p_body) IS DISTINCT FROM true OR
    canonical_v4.ingest_valid_unit_vector(p_title) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid public evidence vectors' USING ERRCODE='P1313';END IF;
 body_weight_:=(weights_->>'bodyWeight')::double precision;title_weight_:=(weights_->>'titleWeight')::double precision;
 IF body_weight_ IS NULL OR title_weight_ IS NULL OR body_weight_ NOT BETWEEN 0 AND 1 OR title_weight_ NOT BETWEEN 0 AND 1 OR body_weight_+title_weight_<>1 THEN
  RAISE EXCEPTION 'Invalid public evidence weights' USING ERRCODE='P1313';END IF;
 IF body_weight_=1 THEN values_:=p_body;
 ELSIF title_weight_=1 THEN values_:=p_title;
 ELSE
  SELECT array_agg(body_weight_*p_body[n]+title_weight_*p_title[n] ORDER BY n) INTO values_ FROM generate_series(1,384) n;
  SELECT max(abs(v)) INTO maximum_ FROM unnest(values_) v;
  IF maximum_ IS NULL OR maximum_=0 THEN RAISE EXCEPTION 'Zero public paired vector' USING ERRCODE='P1313';END IF;
  SELECT sqrt(sum((v/maximum_)*(v/maximum_))) INTO norm_ FROM unnest(values_) v;
  SELECT array_agg((v/maximum_)/norm_ ORDER BY n) INTO values_ FROM unnest(values_) WITH ORDINALITY x(v,n);
 END IF;
 INSERT INTO canonical_v4.named_public_prototypes VALUES(p_generation,representation_,r_.scope_id,r_.root_id,r_.public_digest,p_focus,values_,r_.human,p_contract)
 ON CONFLICT(generation,representation_hash,scope_id) DO UPDATE SET root_id=EXCLUDED.root_id,public_digest=EXCLUDED.public_digest,
  focus_key=EXCLUDED.focus_key,values_double=EXCLUDED.values_double,human=EXCLUDED.human,input_hash=EXCLUDED.input_hash;
 DELETE FROM canonical_v4.named_public_events WHERE event_id=p_event;RETURN 'stored';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation THEN
 RAISE EXCEPTION 'Invalid public evidence encoding' USING ERRCODE='P1313';
END $store$;

CREATE FUNCTION canonical_v4.named_public_candidates(p_generation text,p_representation text,p_focus jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $candidates$
DECLARE result_ jsonb;keys_ text[];raw_count_ integer;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR (p_representation ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
    jsonb_typeof(p_focus) IS DISTINCT FROM 'array' OR jsonb_array_length(p_focus) NOT BETWEEN 1 AND 128 OR octet_length(p_focus::text)>16384 THEN
  RAISE EXCEPTION 'Invalid public evidence query' USING ERRCODE='P1313';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_focus) WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR (value#>>'{}') !~ '^[a-f0-9]{64}$') THEN
  RAISE EXCEPTION 'Invalid public evidence focus' USING ERRCODE='P1313';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Public evidence query generation changed' USING ERRCODE='P1311';END IF;
 SELECT array_agg(DISTINCT value) INTO keys_ FROM jsonb_array_elements_text(p_focus) value;
 -- One indexed representative per occupied scope; no DISTINCT over every post
 -- in a popular discussion. Erased/edited roots cannot pass the current digest.
 WITH raw_ AS MATERIALIZED(SELECT * FROM canonical_v4.named_public_prototypes p
   WHERE p.generation=p_generation AND p.representation_hash=p_representation AND p.input_hash='4524c3fe89d89ea3de525f014aa73a1bd5f9845582fa3b9e87a41c23ef4b1389' AND p.focus_key=ANY(keys_) ORDER BY p.focus_key,p.scope_id LIMIT 65)
 SELECT (SELECT count(*)::integer FROM raw_),coalesce(jsonb_agg(jsonb_build_object('rootId',q.root_id,'topicId',q.scope_id,'caption',q.caption,'body',q.body,
  'rootVersion',q.write_version::text,'publicDigest',q.public_digest,'representationHash',q.representation_hash,
  'focusKey',q.focus_key,'inputHash',q.input_hash,'vector',q.values_double,'identityRevision',q.revision::text) ORDER BY q.scope_id),'[]'::jsonb) INTO raw_count_,result_
 FROM (SELECT r.*,p.representation_hash,p.focus_key,p.input_hash,p.values_double,i.revision FROM raw_ p
  JOIN canonical_v4.named_public_roots r ON r.root_id=p.root_id AND r.generation=p.generation AND r.scope_id=p.scope_id AND r.public_digest=p.public_digest
  JOIN canonical_v4.named_subject_ids i ON i.id=p.scope_id::uuid) q;
 IF raw_count_>64 OR octet_length(result_::text)>4194304 THEN
  RAISE EXCEPTION 'Public evidence candidates exceed bound' USING ERRCODE='P1313';END IF;
 RETURN result_;
END $candidates$;

-- Offline one-time migration preparation only. No invented legacy author
-- choice: historical roots without an explicit named context are excluded.
INSERT INTO canonical_v4.named_public_events(generation,kind,scope_id)
 SELECT DISTINCT generation,'scope',scope_id FROM canonical_v4.named_root_contexts WHERE scope_kind='named';
REVOKE ALL ON canonical_v4.named_public_roots,canonical_v4.named_public_prototypes,canonical_v4.named_public_events FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_schedule_public_evidence(),canonical_v4.named_public_tasks(text,text),canonical_v4.named_repair_public_scope(text,text,bigint),
 canonical_v4.named_store_public_evidence(text,text,bigint,jsonb,text,double precision[],double precision[],text,text),canonical_v4.named_public_candidates(text,text,jsonb),canonical_v4.named_defer_public_evidence(text,bigint) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON canonical_v4.named_public_roots,canonical_v4.named_public_prototypes,canonical_v4.named_public_events FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_schedule_public_evidence(),canonical_v4.named_public_tasks(text,text),canonical_v4.named_repair_public_scope(text,text,bigint),canonical_v4.named_store_public_evidence(text,text,bigint,jsonb,text,double precision[],double precision[],text,text),canonical_v4.named_public_candidates(text,text,jsonb),canonical_v4.named_defer_public_evidence(text,bigint) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_public_tasks(text,text),canonical_v4.named_repair_public_scope(text,text,bigint),
   canonical_v4.named_store_public_evidence(text,text,bigint,jsonb,text,double precision[],double precision[],text,text),canonical_v4.named_public_candidates(text,text,jsonb),canonical_v4.named_defer_public_evidence(text,bigint) TO murmingle_ingest_worker;
 END IF;
END $permissions$;
