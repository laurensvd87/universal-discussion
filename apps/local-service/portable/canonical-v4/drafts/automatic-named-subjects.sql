-- Unregistered hierarchy18 component, owned fixtures only. No Wikipedia/provider
-- dependency, capture/model call, canonical topic/route/post mutation or startup
-- installation. Trusted worker computes the pinned subject policy; SQL checks
-- current protected Source witnesses, candidate freshness, CAS and ancestry.
-- These are SUBJECT scopes, never proof that two news reports are one event.
CREATE UNIQUE INDEX IF NOT EXISTS semantic_runtime_generation_key ON canonical_v4.runtime_state(generation);

-- Only opaque identity/revision survives withdrawal of its Source-derived data.
CREATE TABLE canonical_v4.named_subject_ids (
 id uuid PRIMARY KEY,
 revision bigint NOT NULL CHECK(revision>0)
);
CREATE TABLE canonical_v4.named_subject_heads (
 subject_id uuid PRIMARY KEY REFERENCES canonical_v4.named_subject_ids(id),
 revision bigint NOT NULL CHECK(revision>0),
 generation text NOT NULL,
 policy_hash text COLLATE "C" NOT NULL CHECK(policy_hash ~ '^[a-f0-9]{64}$'),
 matcher_hash text COLLATE "C" NOT NULL REFERENCES canonical_v4.semantic_matchers,
 representation_hash text COLLATE "C" NOT NULL CHECK(representation_hash ~ '^[a-f0-9]{64}$'),
 focus_key text COLLATE "C" NOT NULL CHECK(focus_key ~ '^[a-f0-9]{64}$'),
 context_root_id text COLLATE "C",
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80 AND label !~ '[[:cntrl:]]' AND label !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'),
 label_source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 -- A withdrawn parent cannot leave readable descendants with dangling scope.
 -- This FK also covers a child committed concurrently with parent withdrawal.
 parent_id uuid REFERENCES canonical_v4.named_subject_heads(subject_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 ancestor_path text[] NOT NULL CHECK(cardinality(ancestor_path)<=8),
 prototype_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(prototype_values)),
 CHECK(parent_id IS DISTINCT FROM subject_id)
);
CREATE INDEX named_subject_scope ON canonical_v4.named_subject_heads(generation,representation_hash,focus_key,context_root_id,subject_id);
CREATE INDEX named_subject_parent ON canonical_v4.named_subject_heads(parent_id);
CREATE TABLE canonical_v4.named_subject_members (
 subject_id uuid NOT NULL REFERENCES canonical_v4.named_subject_heads(subject_id) ON DELETE CASCADE,
 source_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 source_version bigint NOT NULL CHECK(source_version>=0),
 operation_id text COLLATE "C" NOT NULL,
 operation_digest text COLLATE "C" NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
 source_stamp text COLLATE "C" NOT NULL CHECK(source_stamp ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(subject_id,source_id)
);
CREATE INDEX named_subject_member_source ON canonical_v4.named_subject_members(source_id,subject_id);
CREATE TABLE canonical_v4.named_subject_selections (
 source_id text COLLATE "C" PRIMARY KEY,
 subject_id uuid NOT NULL,
 FOREIGN KEY(subject_id,source_id) REFERENCES canonical_v4.named_subject_members(subject_id,source_id) ON DELETE CASCADE
);

-- Offsets in the proposal are UTF-16 units in an NFKC title. PostgreSQL string
-- positions count Unicode code points; do not silently confuse those domains.
CREATE FUNCTION canonical_v4.named_title_slice(p_title text,p_start integer,p_end integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $slice$
DECLARE t_ text:=normalize(p_title,NFKC);i_ integer;units_ integer:=0;start_ integer;end_ integer;
BEGIN
 IF length(t_)>512 OR p_start<0 OR p_end<=p_start OR p_end>1024 THEN RETURN NULL;END IF;
 IF p_start=0 THEN start_:=1;END IF;
 FOR i_ IN 1..length(t_) LOOP
  units_:=units_+CASE WHEN ascii(substr(t_,i_,1))>65535 THEN 2 ELSE 1 END;
  IF units_=p_start THEN start_:=i_+1;END IF;
  IF units_=p_end THEN end_:=i_;EXIT;END IF;
 END LOOP;
 IF start_ IS NULL OR end_ IS NULL THEN RETURN NULL;END IF;
 RETURN substr(t_,start_,end_-start_+1);
END $slice$;

CREATE FUNCTION canonical_v4.named_invalidate_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $invalidate$
DECLARE source_ text;subject_ uuid;
BEGIN
 source_:=to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='sources' THEN 'id' ELSE 'source_id' END;
 -- Ordinary same-material renewals must not manufacture new topic identities.
 -- Refresh only the changed fences, within the caller's canonical transaction.
 -- A partial/corrupt renewal cannot become readable: the read joins all current
 -- Source/receipt/stamp witnesses. Material and eligibility changes withdraw.
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='sources' THEN
   IF NEW.id=OLD.id AND NEW.write_version>=OLD.write_version AND
     (NEW.url,NEW.title,NEW.provenance,NEW.extractor_version,NEW.policy_version,NEW.has_embedding) IS NOT DISTINCT FROM
     (OLD.url,OLD.title,OLD.provenance,OLD.extractor_version,OLD.policy_version,OLD.has_embedding) AND
     NEW.payload::jsonb->>'operationDigest' IS NOT DISTINCT FROM OLD.payload::jsonb->>'operationDigest' THEN
   UPDATE canonical_v4.named_subject_members SET source_version=NEW.write_version,operation_id=NEW.operation_id WHERE source_id=source_;
   RETURN NEW;
   END IF;
  ELSIF TG_TABLE_NAME='operation_receipts' THEN
   IF NEW.source_id=OLD.source_id AND NEW.operation_digest=OLD.operation_digest THEN
    UPDATE canonical_v4.named_subject_members SET operation_id=NEW.operation_id WHERE source_id=source_;RETURN NEW;END IF;
  ELSIF TG_TABLE_NAME='runtime_source_stamps' THEN
   IF (NEW.source_id,NEW.stamp,NEW.postable) IS NOT DISTINCT FROM (OLD.source_id,OLD.stamp,OLD.postable) THEN RETURN NEW;END IF;
  ELSIF TG_TABLE_NAME='embeddings' THEN
   IF (NEW.source_id,NEW.model_id,NEW.dimensions,NEW.payload,array_send(NEW.values_double)) IS NOT DISTINCT FROM
     (OLD.source_id,OLD.model_id,OLD.dimensions,OLD.payload,array_send(OLD.values_double)) THEN RETURN NEW;END IF;
  END IF;
 END IF;
 -- Source/receipt locks precede derived subject locks throughout this component.
 -- Conservative withdrawal removes all derived names/vectors/edges of an
 -- affected head. Human records and the opaque identity remain untouched.
 FOR subject_ IN WITH RECURSIVE affected(id) AS (
   SELECT m.subject_id FROM canonical_v4.named_subject_members m WHERE m.source_id=source_
   UNION SELECT h.subject_id FROM canonical_v4.named_subject_heads h JOIN affected a ON h.parent_id=a.id
  ) SELECT id FROM affected ORDER BY id LOOP
  UPDATE canonical_v4.named_subject_ids SET revision=revision+1 WHERE id=subject_;
  DELETE FROM canonical_v4.named_subject_heads WHERE subject_id=subject_;
 END LOOP;
 IF TG_OP='UPDATE' THEN RETURN NEW;END IF;RETURN OLD;
END $invalidate$;
CREATE TRIGGER named_source_invalidation BEFORE UPDATE OR DELETE ON canonical_v4.sources
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_source();
CREATE TRIGGER named_receipt_invalidation BEFORE UPDATE OR DELETE ON canonical_v4.operation_receipts
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_source();
CREATE TRIGGER named_stamp_invalidation BEFORE UPDATE OR DELETE ON canonical_v4.runtime_source_stamps
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_source();
CREATE TRIGGER named_embedding_invalidation BEFORE UPDATE OR DELETE ON canonical_v4.embeddings
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_source();

CREATE FUNCTION canonical_v4.named_publish(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $publish$
DECLARE generation_ text;matcher_ text;representation_ text;w_ jsonb;u_ jsonb;c_ jsonb;s_ jsonb;
 source_ canonical_v4.sources%ROWTYPE;receipt_ canonical_v4.operation_receipts%ROWTYPE;stamp_ canonical_v4.runtime_source_stamps%ROWTYPE;
 label_source_ canonical_v4.sources%ROWTYPE;keys_ text[];lock_ integer;subject_ uuid;parent_ uuid;seen_ uuid[];
 current_ bigint;expected_ bigint;depth_ integer;prototype_ double precision[];path_ text[];input_hash_ text;
 actual_ jsonb;expected_candidates_ jsonb;result_ jsonb:='[]'::jsonb;old_parent_ uuid;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>4194304 THEN
  RAISE EXCEPTION 'Invalid named subject publication' USING ERRCODE='P1283';END IF;
 SELECT array_agg(key ORDER BY key COLLATE "C") INTO keys_ FROM jsonb_object_keys(p) key;
 IF keys_ IS DISTINCT FROM ARRAY['candidates','generation','matcherHash','policyHash','representationHash','selections','updates','witnesses']::text[] OR
    jsonb_typeof(p->'updates') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'selections') IS DISTINCT FROM 'array' OR
    jsonb_typeof(p->'witnesses') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'candidates') IS DISTINCT FROM 'array' OR
    p->>'policyHash' IS DISTINCT FROM 'cd4f0786245a561499253c33cf53a0dc45e0d75e0471707e3a3f8606fb7c4217' OR
    canonical_v4.runtime_safe_text(p->>'generation',128,false) IS DISTINCT FROM true OR
    ((p->>'matcherHash') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR ((p->>'representationHash') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid named subject fields' USING ERRCODE='P1283';END IF;
 IF jsonb_array_length(p->'updates')>128 OR jsonb_array_length(p->'witnesses') NOT BETWEEN 1 AND 64 OR
    jsonb_array_length(p->'selections')<>jsonb_array_length(p->'witnesses') OR jsonb_array_length(p->'candidates')>64 THEN
  RAISE EXCEPTION 'Named subject capacity' USING ERRCODE='P1283';END IF;
 generation_:=p->>'generation';matcher_:=p->>'matcherHash';representation_:=p->>'representationHash';
 PERFORM 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=generation_ FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Named subject generation changed' USING ERRCODE='P1281';END IF;
 PERFORM 1 FROM canonical_v4.semantic_installation WHERE singleton AND matcher_hash=matcher_ FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_matchers WHERE matcher_hash=matcher_
   AND identity_text::jsonb->>'representationHash'=representation_) THEN
  RAISE EXCEPTION 'Named subject matcher changed' USING ERRCODE='P1281';END IF;
 -- Serialize only overlapping focus scopes. New names need no global registry
 -- writer lock; readers never acquire any of these locks.
 FOR lock_ IN SELECT DISTINCT hashtext(jsonb_build_array(value->>'focusKey',value->>'contextRootId',representation_,generation_)::text)
   FROM jsonb_array_elements(p->'updates') ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(914092019,lock_);
 END LOOP;
 IF (SELECT count(DISTINCT value->>'sourceId') FROM jsonb_array_elements(p->'witnesses'))<>jsonb_array_length(p->'witnesses') OR
    (SELECT count(DISTINCT value->>'sourceId') FROM jsonb_array_elements(p->'selections'))<>jsonb_array_length(p->'selections') THEN
  RAISE EXCEPTION 'Duplicate named Source' USING ERRCODE='P1283';END IF;
 FOR w_ IN SELECT value FROM jsonb_array_elements(p->'witnesses') ORDER BY value->>'sourceId' COLLATE "C" LOOP
  IF jsonb_typeof(w_) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(w_))<>5 OR
     NOT w_ ?& ARRAY['sourceId','sourceVersion','operationId','operationDigest','sourceStamp'] OR
     EXISTS(SELECT 1 FROM jsonb_each(w_) WHERE jsonb_typeof(value) IS DISTINCT FROM 'string') OR
     ((w_->>'sourceId') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') IS DISTINCT FROM true OR
     ((w_->>'operationId') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') IS DISTINCT FROM true OR
     jsonb_typeof(w_->'sourceVersion') IS DISTINCT FROM 'string' OR ((w_->>'sourceVersion') ~ '^(0|[1-9][0-9]{0,18})$') IS DISTINCT FROM true OR
     (w_->>'sourceVersion')::numeric>9223372036854775807 OR ((w_->>'operationDigest') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
     ((w_->>'sourceStamp') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Invalid named Source witness' USING ERRCODE='P1283';END IF;
  SELECT * INTO receipt_ FROM canonical_v4.operation_receipts WHERE source_id=w_->>'sourceId' FOR SHARE;
  SELECT * INTO source_ FROM canonical_v4.sources WHERE id=w_->>'sourceId' FOR SHARE;
  SELECT * INTO stamp_ FROM canonical_v4.runtime_source_stamps WHERE source_id=w_->>'sourceId' FOR SHARE;
  IF source_.id IS NULL OR source_.write_version IS DISTINCT FROM (w_->>'sourceVersion')::bigint OR
     source_.operation_id IS DISTINCT FROM w_->>'operationId' OR receipt_.operation_id IS DISTINCT FROM w_->>'operationId' OR
     receipt_.operation_digest IS DISTINCT FROM w_->>'operationDigest' OR stamp_.stamp IS DISTINCT FROM w_->>'sourceStamp' THEN
   RAISE EXCEPTION 'Named Source changed' USING ERRCODE='P1281';END IF;
  PERFORM canonical_v4.ingest_source_response(source_.id);
  IF source_.provenance IS DISTINCT FROM 'owner-local-page-embedding/v1' OR source_.has_embedding IS DISTINCT FROM true OR
     stamp_.postable IS DISTINCT FROM true OR source_.payload::jsonb->>'operationDigest' IS DISTINCT FROM receipt_.operation_digest THEN
   RAISE EXCEPTION 'Ineligible named Source' USING ERRCODE='P1283';END IF;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_observations o JOIN canonical_v4.semantic_inputs i
     USING(source_id,operation_digest,matcher_hash) WHERE o.source_id=source_.id AND o.generation=generation_ AND o.matcher_hash=matcher_
     AND o.source_version=source_.write_version AND o.operation_id=source_.operation_id AND o.operation_digest=receipt_.operation_digest AND i.semantic_eligible) THEN
   RAISE EXCEPTION 'Named Source preparation changed' USING ERRCODE='P1281';END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'subjectId') FROM jsonb_array_elements(p->'updates'))<>jsonb_array_length(p->'updates') THEN
  RAISE EXCEPTION 'Duplicate named subject' USING ERRCODE='P1283';END IF;
 -- Every proposal scope must have a complete indexed candidate snapshot, not
 -- a caller's truncated nearest-neighbour list. A concurrent new head conflicts
 -- and is read on the next planning pass, rather than creating a duplicate UUID.
 FOR u_ IN SELECT value FROM jsonb_array_elements(p->'updates') LOOP
  SELECT coalesce(jsonb_agg(jsonb_build_array(id,revision) ORDER BY id),'[]'::jsonb) INTO actual_ FROM (
   SELECT h.subject_id::text id,h.revision::text revision FROM canonical_v4.named_subject_heads h
   WHERE h.generation=generation_ AND h.matcher_hash=matcher_ AND h.representation_hash=representation_ AND h.focus_key=u_->>'focusKey'
    AND h.context_root_id IS NOT DISTINCT FROM u_->>'contextRootId' ORDER BY h.subject_id LIMIT 65) q;
  SELECT coalesce(jsonb_agg(jsonb_build_array(value->>'subjectId',value->>'revision') ORDER BY value->>'subjectId'),'[]'::jsonb)
   INTO expected_candidates_ FROM jsonb_array_elements(p->'candidates') WHERE value->>'focusKey'=u_->>'focusKey'
    AND value->>'contextRootId' IS NOT DISTINCT FROM u_->>'contextRootId';
  IF actual_ IS DISTINCT FROM expected_candidates_ THEN RAISE EXCEPTION 'Named candidates changed' USING ERRCODE='P1281';END IF;
 END LOOP;
 -- Lock identity rows in one order, after all Source locks. This also fences
 -- update/erase triggers and overlapping parent/child publication batches.
 PERFORM 1 FROM canonical_v4.named_subject_ids WHERE id IN(SELECT (value->>'subjectId')::uuid FROM jsonb_array_elements(p->'updates')) ORDER BY id FOR UPDATE;
 FOR u_ IN SELECT value FROM jsonb_array_elements(p->'updates') ORDER BY value->>'subjectId' LOOP
  IF jsonb_typeof(u_) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(u_))<>12 OR
     NOT u_ ?& ARRAY['subjectId','expectedRevision','kind','focusKey','contextRootId','label','labelWitness','parentId','acceptedAncestorPath','prototypeValues','minimumPairSimilarity','members'] OR
     u_->>'kind' IS DISTINCT FROM 'subject' OR ((u_->>'focusKey') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
     jsonb_typeof(u_->'members') IS DISTINCT FROM 'array' OR jsonb_typeof(u_->'prototypeValues') IS DISTINCT FROM 'array' OR
     jsonb_typeof(u_->'acceptedAncestorPath') IS DISTINCT FROM 'array' OR jsonb_typeof(u_->'labelWitness') IS DISTINCT FROM 'object' OR
     jsonb_typeof(u_->'label') IS DISTINCT FROM 'string' OR length(u_->>'label') NOT BETWEEN 1 AND 80 OR (u_->>'label') ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION 'Invalid named subject update' USING ERRCODE='P1283';END IF;
  IF jsonb_array_length(u_->'members') NOT BETWEEN 2 AND 64 OR jsonb_array_length(u_->'prototypeValues')<>384 OR
     jsonb_array_length(u_->'acceptedAncestorPath')>8 OR
     EXISTS(SELECT 1 FROM jsonb_array_elements(u_->'prototypeValues') WHERE jsonb_typeof(value) IS DISTINCT FROM 'number') OR
     jsonb_typeof(u_->'minimumPairSimilarity') IS DISTINCT FROM 'number' OR (u_->>'minimumPairSimilarity')::numeric NOT BETWEEN .8 AND 1.00000000001 OR
     (SELECT count(DISTINCT value->>'sourceId') FROM jsonb_array_elements(u_->'members'))<>jsonb_array_length(u_->'members') THEN
   RAISE EXCEPTION 'Invalid named subject evidence' USING ERRCODE='P1283';END IF;
  SELECT array_agg(value::double precision ORDER BY n) INTO prototype_ FROM jsonb_array_elements_text(u_->'prototypeValues') WITH ORDINALITY q(value,n);
  IF canonical_v4.ingest_valid_unit_vector(prototype_) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid named prototype' USING ERRCODE='P1283';END IF;
  SELECT coalesce(array_agg(value ORDER BY n),ARRAY[]::text[]) INTO path_ FROM jsonb_array_elements_text(u_->'acceptedAncestorPath') WITH ORDINALITY q(value,n);
  IF (cardinality(path_)>0 AND (u_->>'contextRootId' IS DISTINCT FROM path_[1] OR NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes
      WHERE matcher_hash=matcher_ AND node_id=path_[cardinality(path_)] AND path=path_))) OR
     (u_->>'contextRootId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes WHERE matcher_hash=matcher_
      AND node_id=u_->>'contextRootId' AND cardinality(path)=1)) THEN
   RAISE EXCEPTION 'Invalid named ancestor context' USING ERRCODE='P1283';END IF;
  FOR c_ IN SELECT value FROM jsonb_array_elements(u_->'members') LOOP
   SELECT value INTO w_ FROM jsonb_array_elements(p->'witnesses') WHERE value->>'sourceId'=c_->>'sourceId';
   IF w_ IS NULL OR NOT c_ @> w_ THEN RAISE EXCEPTION 'Missing named member witness' USING ERRCODE='P1283';END IF;
   input_hash_:=encode(sha256(convert_to('['||to_json(w_->>'sourceId')::text||','||to_json(w_->>'sourceVersion')::text||','||
     to_json(w_->>'operationId')::text||','||to_json(w_->>'operationDigest')::text||','||to_json(w_->>'sourceStamp')::text||']','UTF8')),'hex');
   IF c_->>'inputHash' IS DISTINCT FROM input_hash_ THEN RAISE EXCEPTION 'Named member input differs' USING ERRCODE='P1283';END IF;
   IF EXISTS(SELECT 1 FROM canonical_v4.semantic_inputs i WHERE i.source_id=c_->>'sourceId' AND i.operation_digest=c_->>'operationDigest' AND i.matcher_hash=matcher_
       AND ((cardinality(i.supported_path)>0 AND i.supported_path[1] IS DISTINCT FROM u_->>'contextRootId') OR
         (cardinality(path_)>0 AND i.supported_path[1:cardinality(path_)] IS DISTINCT FROM path_))) THEN
    RAISE EXCEPTION 'Named member ancestor conflict' USING ERRCODE='P1283';END IF;
  END LOOP;
  c_:=u_->'labelWitness';SELECT * INTO label_source_ FROM canonical_v4.sources WHERE id=c_->>'sourceId';
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(u_->'members') m WHERE m->>'sourceId'=c_->>'sourceId' AND m->>'inputHash'=c_->>'inputHash') OR
     c_->>'titleNormalization' IS DISTINCT FROM 'NFKC' OR
     canonical_v4.named_title_slice(label_source_.title,(c_->>'start')::integer,(c_->>'end')::integer) IS DISTINCT FROM u_->>'label' THEN
   RAISE EXCEPTION 'Named title witness differs' USING ERRCODE='P1283';END IF;
  subject_:=(u_->>'subjectId')::uuid;parent_:=(u_->>'parentId')::uuid;
  SELECT revision INTO current_ FROM canonical_v4.named_subject_ids WHERE id=subject_;
  IF u_->'expectedRevision'='null'::jsonb THEN
   IF current_ IS NOT NULL THEN RAISE EXCEPTION 'Named identity already reserved' USING ERRCODE='P1281';END IF;
   INSERT INTO canonical_v4.named_subject_ids VALUES(subject_,1);current_:=1;
  ELSE
   expected_:=(u_->>'expectedRevision')::bigint;
   SELECT parent_id INTO old_parent_ FROM canonical_v4.named_subject_heads WHERE subject_id=subject_;
   IF NOT FOUND OR current_ IS DISTINCT FROM expected_ OR old_parent_ IS DISTINCT FROM parent_ THEN
    RAISE EXCEPTION 'Named revision or parent changed' USING ERRCODE='P1281';END IF;
   UPDATE canonical_v4.named_subject_ids SET revision=revision+1 WHERE id=subject_ RETURNING revision INTO current_;
  END IF;
  -- Parents may appear later in this batch. The deferred FK checks those IDs
  -- at transaction end; full ancestry is checked after all writes below.
  -- Existing heads keep their founding label/prototype. Bounded incoming cohorts
  -- add evidence; they cannot move a popular subject's center on every batch or
  -- discard earlier Sources' assignments. An explicit rebuild is separate work.
  INSERT INTO canonical_v4.named_subject_heads VALUES(subject_,current_,generation_,p->>'policyHash',matcher_,representation_,u_->>'focusKey',u_->>'contextRootId',
    u_->>'label',c_->>'sourceId',parent_,path_,prototype_)
   ON CONFLICT(subject_id) DO UPDATE SET revision=excluded.revision;
  FOR c_ IN SELECT value FROM jsonb_array_elements(u_->'members') LOOP
   INSERT INTO canonical_v4.named_subject_members VALUES(subject_,c_->>'sourceId',(c_->>'sourceVersion')::bigint,c_->>'operationId',c_->>'operationDigest',c_->>'sourceStamp')
    ON CONFLICT(subject_id,source_id) DO UPDATE SET source_version=excluded.source_version,operation_id=excluded.operation_id,
     operation_digest=excluded.operation_digest,source_stamp=excluded.source_stamp;
  END LOOP;
  result_:=result_||jsonb_build_array(jsonb_build_object('subjectId',subject_::text,'revision',current_::text));
 END LOOP;
 FOR u_ IN SELECT value FROM jsonb_array_elements(p->'updates') LOOP
  subject_:=(u_->>'subjectId')::uuid;seen_:=ARRAY[subject_];parent_:=(u_->>'parentId')::uuid;depth_:=1;
  WHILE parent_ IS NOT NULL LOOP
   IF parent_=ANY(seen_) OR depth_>=8 THEN RAISE EXCEPTION 'Named ancestry cycle or capacity' USING ERRCODE='P1283';END IF;
   seen_:=array_append(seen_,parent_);depth_:=depth_+1;
   SELECT parent_id INTO parent_ FROM canonical_v4.named_subject_heads WHERE subject_id=parent_ AND generation=generation_
    AND representation_hash=representation_ AND matcher_hash=matcher_ AND context_root_id IS NOT DISTINCT FROM u_->>'contextRootId';
   IF NOT FOUND THEN RAISE EXCEPTION 'Named parent unavailable' USING ERRCODE='P1281';END IF;
  END LOOP;
 END LOOP;
 FOR s_ IN SELECT value FROM jsonb_array_elements(p->'selections') LOOP
  SELECT value INTO w_ FROM jsonb_array_elements(p->'witnesses') WHERE value->>'sourceId'=s_->>'sourceId';
  IF w_ IS NULL OR s_->>'sourceVersion' IS DISTINCT FROM w_->>'sourceVersion' THEN RAISE EXCEPTION 'Invalid named selection witness' USING ERRCODE='P1283';END IF;
  DELETE FROM canonical_v4.named_subject_selections WHERE source_id=s_->>'sourceId';
  IF s_->>'subjectId' IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'updates') WHERE value->>'subjectId'=s_->>'subjectId') THEN
    RAISE EXCEPTION 'Named selection outside publication' USING ERRCODE='P1283';END IF;
   INSERT INTO canonical_v4.named_subject_selections VALUES(s_->>'sourceId',(s_->>'subjectId')::uuid);
  END IF;
 END LOOP;
 RETURN jsonb_build_object('generation',generation_,'policyHash',p->>'policyHash','subjects',result_,'selections',p->'selections');
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Named publication conflict' USING ERRCODE='P1281';
 WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation OR foreign_key_violation THEN
  RAISE EXCEPTION 'Invalid named publication encoding or relation' USING ERRCODE='P1283';
END $publish$;

CREATE FUNCTION canonical_v4.named_read_source(p_generation text,p_source text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $read$
DECLARE result_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid named context read' USING ERRCODE='P1283';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RAISE EXCEPTION 'Named generation changed' USING ERRCODE='P1281';END IF;
 SELECT jsonb_build_object('generation',p_generation,'sourceId',s.id,'sourceVersion',s.write_version::text,'pageTitle',s.title,
  'subject',CASE WHEN h.subject_id IS NULL THEN NULL ELSE jsonb_build_object('id',h.subject_id::text,'revision',h.revision::text,
   'title',h.label,'parentId',h.parent_id::text,'ancestorPath',h.ancestor_path) END) INTO result_
 FROM canonical_v4.sources s LEFT JOIN canonical_v4.named_subject_selections selected_ ON selected_.source_id=s.id
 LEFT JOIN canonical_v4.named_subject_members m ON m.subject_id=selected_.subject_id AND m.source_id=s.id AND m.source_version=s.write_version AND m.operation_id=s.operation_id
 LEFT JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=m.operation_id AND r.operation_digest=m.operation_digest
 LEFT JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.stamp=m.source_stamp AND st.postable
 LEFT JOIN canonical_v4.named_subject_ids base_ ON base_.id=m.subject_id
 LEFT JOIN canonical_v4.semantic_installation install_ ON install_.singleton
 LEFT JOIN canonical_v4.named_subject_heads h ON h.subject_id=m.subject_id AND h.revision=base_.revision AND h.generation=p_generation
  AND h.matcher_hash=install_.matcher_hash AND r.source_id IS NOT NULL AND st.source_id IS NOT NULL
 WHERE s.id=p_source;
 RETURN result_;
END $read$;

CREATE FUNCTION canonical_v4.named_candidates(p_generation text,p_representation text,p_scopes jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $candidates$
DECLARE result_ jsonb;scope_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
    (p_representation ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(p_scopes) IS DISTINCT FROM 'array' OR octet_length(p_scopes::text)>32768 THEN
  RAISE EXCEPTION 'Invalid named candidate request' USING ERRCODE='P1283';END IF;
 IF jsonb_array_length(p_scopes) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Named scope capacity' USING ERRCODE='P1283';END IF;
 FOR scope_ IN SELECT value FROM jsonb_array_elements(p_scopes) LOOP
  IF jsonb_typeof(scope_) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(scope_))<>2 OR
     NOT scope_ ?& ARRAY['focusKey','contextRootId'] OR ((scope_->>'focusKey') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR
     (scope_->'contextRootId'<>'null'::jsonb AND canonical_v4.runtime_safe_text(scope_->>'contextRootId',128,false) IS DISTINCT FROM true) THEN
   RAISE EXCEPTION 'Invalid named scope' USING ERRCODE='P1283';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RAISE EXCEPTION 'Named generation changed' USING ERRCODE='P1281';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('subjectId',h.subject_id::text,'revision',h.revision::text,'focusKey',h.focus_key,
   'contextRootId',h.context_root_id,'prototypeValues',h.prototype_values,'representationHash',h.representation_hash,'parentId',h.parent_id::text)
   ORDER BY h.subject_id),'[]'::jsonb) INTO result_ FROM (
  SELECT heads_.* FROM jsonb_array_elements(p_scopes) scope_rows(value)
  JOIN canonical_v4.named_subject_heads heads_ ON heads_.generation=p_generation AND heads_.representation_hash=p_representation
   AND heads_.focus_key=scope_rows.value->>'focusKey' AND heads_.context_root_id IS NOT DISTINCT FROM scope_rows.value->>'contextRootId'
  JOIN canonical_v4.named_subject_ids base_ ON base_.id=heads_.subject_id AND base_.revision=heads_.revision
  JOIN canonical_v4.semantic_installation install_ ON install_.singleton AND install_.matcher_hash=heads_.matcher_hash
  GROUP BY heads_.subject_id ORDER BY heads_.subject_id LIMIT 65
 ) h;
 IF jsonb_array_length(result_)>64 OR octet_length(result_::text)>1048576 THEN RAISE EXCEPTION 'Named candidates exceed bounded cohort' USING ERRCODE='P1283';END IF;
 RETURN result_;
END $candidates$;

REVOKE ALL ON TABLE canonical_v4.named_subject_ids,canonical_v4.named_subject_heads,canonical_v4.named_subject_members,canonical_v4.named_subject_selections FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_title_slice(text,integer,integer),canonical_v4.named_invalidate_source(),canonical_v4.named_publish(jsonb),canonical_v4.named_read_source(text,text),canonical_v4.named_candidates(text,text,jsonb) FROM PUBLIC;
DO $permissions$
DECLARE role_ text;
BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_subject_ids,canonical_v4.named_subject_heads,canonical_v4.named_subject_members,canonical_v4.named_subject_selections FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_title_slice(text,integer,integer),canonical_v4.named_invalidate_source(),canonical_v4.named_publish(jsonb),canonical_v4.named_read_source(text,text),canonical_v4.named_candidates(text,text,jsonb) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN GRANT EXECUTE ON FUNCTION canonical_v4.named_publish(jsonb),canonical_v4.named_candidates(text,text,jsonb) TO murmingle_ingest_worker;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN GRANT EXECUTE ON FUNCTION canonical_v4.named_read_source(text,text) TO murmingle_app;END IF;
END $permissions$;
