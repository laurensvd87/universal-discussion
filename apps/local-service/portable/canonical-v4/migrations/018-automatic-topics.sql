-- Reviewed automatic topics migration018. Explicit owner installation only.
-- After activation, retain these migration/component bytes; changes require a later migration.

-- Component automatic-named-subjects.sql SHA256 7c979c501e9a648bff3be371340710adcf2a5319496c12c02b35c8a1d206f9b7
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
 actual_ jsonb;expected_candidates_ jsonb;result_ jsonb:='[]'::jsonb;selections_ jsonb:='[]'::jsonb;old_parent_ uuid;
 recovered_ uuid[]:=ARRAY[]::uuid[];head_exists_ boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>4194304 THEN
  RAISE EXCEPTION 'Invalid named subject publication' USING ERRCODE='P1283';END IF;
 SELECT array_agg(key ORDER BY key COLLATE "C") INTO keys_ FROM jsonb_object_keys(p) key;
 IF (keys_ IS DISTINCT FROM ARRAY['candidates','generation','matcherHash','policyHash','representationHash','selections','updates','witnesses']::text[] AND
     keys_ IS DISTINCT FROM ARRAY['candidates','generation','matcherHash','policyHash','publicRecovery','representationHash','selections','updates','witnesses']::text[]) OR
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
 IF p ? 'publicRecovery' AND (jsonb_typeof(p->'publicRecovery') IS DISTINCT FROM 'object' OR
  jsonb_typeof(p->'publicRecovery'->'candidates') IS DISTINCT FROM 'array' OR
  jsonb_typeof(p->'publicRecovery'->'proofs') IS DISTINCT FROM 'array' OR
  jsonb_typeof(p->'publicRecovery'->'focusKeys') IS DISTINCT FROM 'array' OR
  jsonb_array_length(p->'publicRecovery'->'candidates')>64 OR jsonb_array_length(p->'publicRecovery'->'proofs')>64 OR
  jsonb_array_length(p->'publicRecovery'->'focusKeys') NOT BETWEEN 1 AND 128) THEN
  RAISE EXCEPTION 'Public recovery capacity or shape' USING ERRCODE='P1283';END IF;
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
 PERFORM 1 FROM canonical_v4.named_subject_ids WHERE id IN(
  SELECT (value->>'subjectId')::uuid FROM jsonb_array_elements(p->'updates') UNION
  SELECT (value->>'topicId')::uuid FROM jsonb_array_elements(coalesce(p->'publicRecovery'->'candidates','[]'::jsonb))) ORDER BY id FOR UPDATE;
 -- Optional composition only: independent public evidence cannot reserve or
 -- restore an identity without the separately installed atomic verifier. All
 -- protected Source and identity locks precede public-root/prototype locks.
 IF p ? 'publicRecovery' THEN recovered_:=canonical_v4.named_lock_public_recovery(p);END IF;
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
   head_exists_:=FOUND;
   IF current_ IS DISTINCT FROM expected_ OR
     (NOT head_exists_ AND NOT subject_=ANY(recovered_)) OR (head_exists_ AND subject_=ANY(recovered_)) OR
     (old_parent_ IS NOT NULL AND old_parent_ IS DISTINCT FROM parent_) THEN
    RAISE EXCEPTION 'Named revision or parent changed' USING ERRCODE='P1281';END IF;
   IF head_exists_ AND old_parent_ IS NULL AND parent_ IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(p->'updates') parent_update
     WHERE parent_update->>'subjectId'=parent_::text AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(u_->'members') child_member WHERE NOT EXISTS(
       SELECT 1 FROM jsonb_array_elements(parent_update->'members') parent_member WHERE parent_member->>'sourceId'=child_member->>'sourceId'
      )
     )
   ) THEN RAISE EXCEPTION 'New named parent lacks the current child cohort' USING ERRCODE='P1283';END IF;
   UPDATE canonical_v4.named_subject_ids SET revision=revision+1 WHERE id=subject_ RETURNING revision INTO current_;
  END IF;
  -- Parents may appear later in this batch. The deferred FK checks those IDs
  -- at transaction end; full ancestry is checked after all writes below.
  -- Existing heads keep their founding label/prototype. Bounded incoming cohorts
  -- add evidence; they cannot move a popular subject's center on every batch or
  -- discard earlier Sources' assignments. An explicit rebuild is separate work.
  INSERT INTO canonical_v4.named_subject_heads VALUES(subject_,current_,generation_,p->>'policyHash',matcher_,representation_,u_->>'focusKey',u_->>'contextRootId',
    u_->>'label',c_->>'sourceId',parent_,path_,prototype_)
   ON CONFLICT(subject_id) DO UPDATE SET revision=excluded.revision,parent_id=excluded.parent_id;
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
  -- Absence of a second supporting page in one bounded neighbourhood is not
  -- evidence against an already published, still-current subject. A material
  -- change/erasure already withdraws its evidence in the Source triggers.
  IF s_->>'subjectId' IS NULL THEN
   SELECT h.subject_id INTO subject_ FROM canonical_v4.named_subject_selections selected_
    JOIN canonical_v4.named_subject_members m USING(subject_id,source_id)
    JOIN canonical_v4.named_subject_heads h ON h.subject_id=m.subject_id
    JOIN canonical_v4.named_subject_ids base_ ON base_.id=h.subject_id AND base_.revision=h.revision
    WHERE selected_.source_id=s_->>'sourceId' AND m.source_version=(w_->>'sourceVersion')::bigint AND m.operation_id=w_->>'operationId'
     AND m.operation_digest=w_->>'operationDigest' AND m.source_stamp=w_->>'sourceStamp'
     AND h.generation=generation_ AND h.matcher_hash=matcher_ AND h.policy_hash=p->>'policyHash';
   IF FOUND THEN
    selections_:=selections_||jsonb_build_array(jsonb_build_object('sourceId',s_->>'sourceId','sourceVersion',s_->>'sourceVersion',
      'subjectId',subject_::text,'reason','retained-supported-subject'));CONTINUE;
   END IF;
  END IF;
  DELETE FROM canonical_v4.named_subject_selections WHERE source_id=s_->>'sourceId';
  IF s_->>'subjectId' IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'updates') WHERE value->>'subjectId'=s_->>'subjectId') THEN
    RAISE EXCEPTION 'Named selection outside publication' USING ERRCODE='P1283';END IF;
   INSERT INTO canonical_v4.named_subject_selections VALUES(s_->>'sourceId',(s_->>'subjectId')::uuid);
  END IF;
  selections_:=selections_||jsonb_build_array(s_);
 END LOOP;
 RETURN jsonb_build_object('generation',generation_,'policyHash',p->>'policyHash','subjects',result_,'selections',selections_);
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

-- End component automatic-named-subjects.sql

-- Component automatic-subject-retrieval.sql SHA256 097c5f9a6aceb32d0b832db5709c2fff26ab2744bdbd032d2cdbdeee925edadf
-- Unregistered hierarchy18 background retrieval. Requires automatic named
-- subjects and installed pgvector0.8.2 in public. No live/startup installation.
-- Float32 HNSW is a candidate generator; protected float8 body/title values
-- are returned only to the trusted worker for exact bounded re-ranking.
CREATE TABLE canonical_v4.named_retrieval_inputs (
 source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 index_ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 source_ordinal bigint NOT NULL,
 generation text NOT NULL,
 matcher_hash text COLLATE "C" NOT NULL REFERENCES canonical_v4.semantic_matchers,
 representation_hash text COLLATE "C" NOT NULL,
 operation_digest text COLLATE "C" NOT NULL,
 body_wire_hash text COLLATE "C" NOT NULL,
 title_wire_hash text COLLATE "C" NOT NULL,
 mirror public.vector(384),
 exclusion text CHECK(exclusion IS NULL OR exclusion='zero-paired-norm'),
 title_terms text[] NOT NULL CHECK(cardinality(title_terms)<=8),
 completed_at timestamptz,
 CHECK((mirror IS NULL)=(exclusion IS NOT NULL))
);
CREATE INDEX named_retrieval_hnsw ON canonical_v4.named_retrieval_inputs USING hnsw(mirror public.vector_cosine_ops) WITH(m=16,ef_construction=64);
CREATE TABLE canonical_v4.named_retrieval_terms (
 term text COLLATE "C" NOT NULL,
 source_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.named_retrieval_inputs(source_id) ON DELETE CASCADE,
 source_ordinal bigint NOT NULL,
 PRIMARY KEY(term,source_id)
);
CREATE INDEX named_retrieval_term_recent ON canonical_v4.named_retrieval_terms(term,source_ordinal DESC,source_id);
CREATE TABLE canonical_v4.named_index_requests (
 source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 generation text NOT NULL,
 matcher_hash text COLLATE "C" NOT NULL,
 priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2)
);
CREATE INDEX named_index_requests_work ON canonical_v4.named_index_requests(generation,matcher_hash,ordinal);
CREATE INDEX named_index_requests_urgent ON canonical_v4.named_index_requests(generation,matcher_hash,priority DESC,ordinal DESC);
CREATE TABLE canonical_v4.named_discovery_requests (
 source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.named_retrieval_inputs(source_id) ON DELETE CASCADE,
 ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 generation text NOT NULL,
 matcher_hash text COLLATE "C" NOT NULL,
 priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2)
);
CREATE INDEX named_discovery_urgent ON canonical_v4.named_discovery_requests(generation,matcher_hash,priority DESC,ordinal DESC);
CREATE INDEX named_discovery_oldest ON canonical_v4.named_discovery_requests(generation,matcher_hash,ordinal);

-- One current protected preparation per Source. This internal view is never
-- granted to app/crawler roles. It is not a claim of original capture authority.
CREATE VIEW canonical_v4.named_indexable_sources AS
 SELECT s.id source_id,s.ordinal source_ordinal,s.write_version source_version,s.url,s.title,s.operation_id,
  r.operation_digest,st.stamp source_stamp,o.generation,i.matcher_hash,m.identity_text::jsonb->>'representationHash' representation_hash,
  i.body_wire_hash,i.title_wire_hash,i.body_values,i.title_values,i.supported_path
 FROM canonical_v4.sources s JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id
 JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
 JOIN canonical_v4.runtime_state runtime_ ON runtime_.singleton
 JOIN canonical_v4.semantic_installation install_ ON install_.singleton
 JOIN canonical_v4.semantic_observations o ON o.source_id=s.id AND o.source_version=s.write_version AND o.generation=runtime_.generation
  AND o.matcher_hash=install_.matcher_hash AND o.operation_id=s.operation_id AND o.operation_digest=r.operation_digest
 JOIN canonical_v4.semantic_inputs i ON i.source_id=s.id AND i.operation_digest=r.operation_digest AND i.matcher_hash=o.matcher_hash
 JOIN canonical_v4.semantic_matchers m ON m.matcher_hash=i.matcher_hash
 JOIN canonical_v4.embeddings e ON e.source_id=s.id AND e.model_id='e5-small-q8-browser-main-prefix-v1' AND e.dimensions=384
 WHERE s.provenance='owner-local-page-embedding/v1' AND s.has_embedding AND i.semantic_eligible
  AND s.payload::jsonb->>'operationDigest'=r.operation_digest
  AND s.payload::jsonb->>'title'=s.title AND s.payload::jsonb->>'url'=s.url
  AND i.body_wire_hash=encode(sha256(array_send(e.values_double)),'hex')
  AND i.title_wire_hash=encode(sha256(array_send(i.title_values)),'hex');

CREATE FUNCTION canonical_v4.named_enqueue_index(p_source text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $enqueue$
 INSERT INTO canonical_v4.named_index_requests(source_id,generation,matcher_hash,priority)
 SELECT i.source_id,i.generation,i.matcher_hash,1 FROM canonical_v4.named_indexable_sources i
 LEFT JOIN canonical_v4.named_retrieval_inputs done_ ON done_.source_id=i.source_id AND done_.generation=i.generation
  AND done_.matcher_hash=i.matcher_hash AND done_.operation_digest=i.operation_digest
  AND done_.body_wire_hash=i.body_wire_hash AND done_.title_wire_hash=i.title_wire_hash
 WHERE i.source_id=p_source AND done_.source_id IS NULL
 ON CONFLICT(source_id) DO UPDATE SET generation=excluded.generation,matcher_hash=excluded.matcher_hash,ordinal=DEFAULT,
  priority=greatest(named_index_requests.priority,excluded.priority)
$enqueue$;
CREATE FUNCTION canonical_v4.named_prepared_index_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $prepared$
BEGIN PERFORM canonical_v4.named_enqueue_index(NEW.source_id);RETURN NEW;END $prepared$;
CREATE TRIGGER named_prepared_index_request AFTER INSERT ON canonical_v4.semantic_observations
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_prepared_index_request();

CREATE FUNCTION canonical_v4.named_invalidate_retrieval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $invalidate$
DECLARE source_ text;
BEGIN
 source_:=to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='sources' THEN 'id' ELSE 'source_id' END;
 IF TG_OP='DELETE' THEN DELETE FROM canonical_v4.named_retrieval_inputs WHERE source_id=source_;RETURN OLD;END IF;
 IF TG_TABLE_NAME='sources' THEN
  IF (NEW.url,NEW.title,NEW.provenance,NEW.extractor_version,NEW.policy_version,NEW.has_embedding) IS NOT DISTINCT FROM
     (OLD.url,OLD.title,OLD.provenance,OLD.extractor_version,OLD.policy_version,OLD.has_embedding) AND
     NEW.payload::jsonb->>'operationDigest' IS NOT DISTINCT FROM OLD.payload::jsonb->>'operationDigest' THEN RETURN NEW;END IF;
 ELSIF TG_TABLE_NAME='operation_receipts' THEN
  IF NEW.operation_digest=OLD.operation_digest THEN RETURN NEW;END IF;
 ELSIF TG_TABLE_NAME='runtime_source_stamps' THEN
  IF (NEW.stamp,NEW.postable) IS NOT DISTINCT FROM (OLD.stamp,OLD.postable) THEN RETURN NEW;END IF;
 ELSIF TG_TABLE_NAME='embeddings' THEN
  IF (NEW.model_id,NEW.dimensions,array_send(NEW.values_double),NEW.payload) IS NOT DISTINCT FROM
    (OLD.model_id,OLD.dimensions,array_send(OLD.values_double),OLD.payload) THEN RETURN NEW;END IF;
 END IF;
 DELETE FROM canonical_v4.named_retrieval_inputs WHERE source_id=source_;
 -- Usually the new observation follows later in the same canonical operation.
 -- This also handles an eligibility restoration without a new observation row.
 PERFORM canonical_v4.named_enqueue_index(source_);RETURN NEW;
END $invalidate$;
CREATE TRIGGER named_retrieval_source AFTER UPDATE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();
CREATE TRIGGER named_retrieval_receipt AFTER UPDATE OR DELETE ON canonical_v4.operation_receipts FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();
CREATE TRIGGER named_retrieval_stamp AFTER UPDATE OR DELETE ON canonical_v4.runtime_source_stamps FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();
CREATE TRIGGER named_retrieval_embedding AFTER UPDATE OR DELETE ON canonical_v4.embeddings FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();

-- One-time additive backfill of already prepared material, not a catalog scan
-- on page reads or on every worker tick. Later work is fed by Source triggers.
INSERT INTO canonical_v4.named_index_requests(source_id,generation,matcher_hash)
 SELECT source_id,generation,matcher_hash FROM canonical_v4.named_indexable_sources;

CREATE FUNCTION canonical_v4.named_index_tasks(p_generation text,p_matcher text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $tasks$
DECLARE result_ jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_installation WHERE singleton AND matcher_hash=p_matcher) THEN
  RAISE EXCEPTION 'Named retrieval generation or matcher changed' USING ERRCODE='P1291';END IF;
 WITH urgent_ AS MATERIALIZED(SELECT * FROM canonical_v4.named_index_requests WHERE generation=p_generation AND matcher_hash=p_matcher ORDER BY priority DESC,ordinal DESC LIMIT 6),
 oldest_ AS MATERIALIZED(SELECT * FROM canonical_v4.named_index_requests WHERE generation=p_generation AND matcher_hash=p_matcher ORDER BY ordinal LIMIT 2),
 selected_ AS(SELECT DISTINCT ON(source_id) * FROM(SELECT * FROM urgent_ UNION ALL SELECT * FROM oldest_) all_)
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',q.source_id,'queueOrdinal',q.ordinal::text,
  'snapshot',CASE WHEN i.source_id IS NULL THEN NULL ELSE jsonb_build_object('sourceId',i.source_id,'sourceVersion',i.source_version::text,
   'operationId',i.operation_id,'operationDigest',i.operation_digest,'sourceStamp',i.source_stamp,'title',i.title) END) ORDER BY q.ordinal),'[]'::jsonb)
 INTO result_ FROM selected_ q
 LEFT JOIN canonical_v4.named_indexable_sources i ON i.source_id=q.source_id AND i.generation=q.generation AND i.matcher_hash=q.matcher_hash;
 RETURN result_;
END $tasks$;

CREATE FUNCTION canonical_v4.named_index_source(p_generation text,p_matcher text,p_source text,p_queue bigint,p_witness jsonb,p_terms jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $index$
DECLARE i record;weights_ jsonb;body_weight_ double precision;title_weight_ double precision;values_ double precision[];
 maximum_ double precision;norm_ double precision;mirror_ public.vector(384);terms_ text[];term_ text;index_ bigint;priority_ smallint;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_queue IS NULL OR p_queue<1 OR
    canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true OR jsonb_typeof(p_terms) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_terms)>8 OR octet_length(p_terms::text)>4096 THEN
  RAISE EXCEPTION 'Invalid named indexing task' USING ERRCODE='P1293';END IF;
 IF p_witness IS NULL OR p_witness='null'::jsonb THEN
  DELETE FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue AND generation=p_generation AND matcher_hash=p_matcher;
  RETURN 'obsolete';
 END IF;
 PERFORM 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Named indexing generation changed' USING ERRCODE='P1291';END IF;
 PERFORM 1 FROM canonical_v4.semantic_installation WHERE singleton AND matcher_hash=p_matcher FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Named indexing matcher changed' USING ERRCODE='P1291';END IF;
 -- Same receipt/Source/embedding/stamp order as stored preparation. The urgency
 -- row is locked LAST, never before a Source held by its enqueue trigger.
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=p_source FOR SHARE;
 PERFORM 1 FROM canonical_v4.embeddings WHERE source_id=p_source FOR SHARE;
 PERFORM 1 FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source FOR SHARE;
 SELECT priority INTO priority_ FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue AND generation=p_generation AND matcher_hash=p_matcher FOR UPDATE;
 IF NOT FOUND THEN RETURN 'retired';END IF;
 SELECT * INTO i FROM canonical_v4.named_indexable_sources WHERE source_id=p_source AND generation=p_generation AND matcher_hash=p_matcher;
 IF NOT FOUND OR p_witness IS DISTINCT FROM jsonb_build_object('sourceId',i.source_id,'sourceVersion',i.source_version::text,'operationId',i.operation_id,
     'operationDigest',i.operation_digest,'sourceStamp',i.source_stamp,'title',i.title) THEN
  RAISE EXCEPTION 'Named indexing Source changed' USING ERRCODE='P1291';END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.named_retrieval_inputs done_ WHERE done_.source_id=p_source AND done_.generation=p_generation AND done_.matcher_hash=p_matcher
   AND done_.operation_digest=i.operation_digest AND done_.body_wire_hash=i.body_wire_hash AND done_.title_wire_hash=i.title_wire_hash) THEN
  DELETE FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue;RETURN 'retired';
 END IF;
 SELECT identity_text::jsonb->'inputDefinition' INTO weights_ FROM canonical_v4.semantic_matchers WHERE matcher_hash=p_matcher;
 body_weight_:=(weights_->>'bodyWeight')::double precision;title_weight_:=(weights_->>'titleWeight')::double precision;
 IF body_weight_ IS NULL OR title_weight_ IS NULL OR body_weight_ NOT BETWEEN 0 AND 1 OR title_weight_ NOT BETWEEN 0 AND 1 OR body_weight_+title_weight_<>1 THEN
  RAISE EXCEPTION 'Invalid protected paired weights' USING ERRCODE='P1293';END IF;
 SELECT array_agg(body_weight_*i.body_values[n]+title_weight_*i.title_values[n] ORDER BY n) INTO values_ FROM generate_series(1,384) n;
 SELECT max(abs(value)) INTO maximum_ FROM unnest(values_) value;
 IF maximum_>0 THEN
  SELECT sqrt(sum((value/maximum_)*(value/maximum_))) INTO norm_ FROM unnest(values_) value;
  SELECT array_agg((value/maximum_)/norm_ ORDER BY n) INTO values_ FROM unnest(values_) WITH ORDINALITY q(value,n);
  mirror_:=values_::public.vector(384);
 END IF;
 SELECT coalesce(array_agg(value ORDER BY n),ARRAY[]::text[]) INTO terms_ FROM jsonb_array_elements_text(p_terms) WITH ORDINALITY q(value,n);
 IF (SELECT count(DISTINCT value) FROM unnest(terms_) value)<>cardinality(terms_) OR
    EXISTS(SELECT 1 FROM unnest(terms_) value WHERE length(value) NOT BETWEEN 1 AND 80 OR value ~ '[[:cntrl:][:space:]]') THEN
  RAISE EXCEPTION 'Invalid named retrieval terms' USING ERRCODE='P1293';END IF;
 DELETE FROM canonical_v4.named_retrieval_inputs WHERE source_id=p_source;
 INSERT INTO canonical_v4.named_retrieval_inputs(source_id,source_ordinal,generation,matcher_hash,representation_hash,operation_digest,body_wire_hash,title_wire_hash,mirror,exclusion,title_terms)
 VALUES(i.source_id,i.source_ordinal,i.generation,i.matcher_hash,i.representation_hash,i.operation_digest,i.body_wire_hash,i.title_wire_hash,mirror_,
  CASE WHEN mirror_ IS NULL THEN 'zero-paired-norm' ELSE NULL END,CASE WHEN mirror_ IS NULL THEN ARRAY[]::text[] ELSE terms_ END) RETURNING index_ordinal INTO index_;
 IF mirror_ IS NOT NULL THEN
  FOREACH term_ IN ARRAY terms_ LOOP INSERT INTO canonical_v4.named_retrieval_terms VALUES(term_,p_source,i.source_ordinal);END LOOP;
  INSERT INTO canonical_v4.named_discovery_requests(source_id,generation,matcher_hash,priority) VALUES(p_source,p_generation,p_matcher,priority_);
 END IF;
 DELETE FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue;
 RETURN CASE WHEN mirror_ IS NULL THEN 'zero-paired-norm' ELSE 'indexed' END;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN
 RAISE EXCEPTION 'Invalid named index encoding' USING ERRCODE='P1293';
END $index$;

CREATE FUNCTION canonical_v4.named_discovery_tasks(p_generation text,p_matcher text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $work$
 WITH urgent_ AS MATERIALIZED(
  SELECT q.* FROM canonical_v4.named_discovery_requests q
  WHERE q.generation=p_generation AND q.matcher_hash=p_matcher ORDER BY q.priority DESC,q.ordinal DESC LIMIT 3
 ), oldest_ AS MATERIALIZED(
  SELECT q.* FROM canonical_v4.named_discovery_requests q
  WHERE q.generation=p_generation AND q.matcher_hash=p_matcher ORDER BY q.ordinal LIMIT 1
 ), selected_ AS(SELECT DISTINCT ON(source_id) * FROM(SELECT * FROM urgent_ UNION ALL SELECT * FROM oldest_) all_)
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',q.source_id,'indexOrdinal',i.index_ordinal::text) ORDER BY q.ordinal),'[]'::jsonb)
 FROM selected_ q JOIN canonical_v4.named_retrieval_inputs i USING(source_id)
$work$;

CREATE FUNCTION canonical_v4.named_neighbours(p_generation text,p_matcher text,p_source text,p_index bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
 SET hnsw.ef_search='128' SET hnsw.iterative_scan='off' AS $neighbours$
DECLARE seed_ canonical_v4.named_retrieval_inputs%ROWTYPE;result_ jsonb;
BEGIN
 SELECT * INTO seed_ FROM canonical_v4.named_retrieval_inputs WHERE source_id=p_source AND index_ordinal=p_index AND generation=p_generation AND matcher_hash=p_matcher;
 IF NOT FOUND OR seed_.mirror IS NULL OR NOT EXISTS(SELECT 1 FROM canonical_v4.named_indexable_sources WHERE source_id=p_source AND generation=p_generation AND matcher_hash=p_matcher
   AND operation_digest=seed_.operation_digest AND body_wire_hash=seed_.body_wire_hash AND title_wire_hash=seed_.title_wire_hash) THEN RETURN NULL;END IF;
 -- 95 approximate + at most8*4 indexed lexical postings + explicit seed =128.
 -- Do not add iterative refill, full-scan fallback or a global fit here.
 WITH approximate_ AS MATERIALIZED (
  SELECT source_id,false lexical FROM canonical_v4.named_retrieval_inputs WHERE mirror IS NOT NULL
   ORDER BY mirror OPERATOR(public.<=>) seed_.mirror LIMIT 95
 ), lexical_ AS MATERIALIZED (
  SELECT posting_.source_id,true lexical FROM unnest(seed_.title_terms) term_
   CROSS JOIN LATERAL(SELECT t.source_id FROM canonical_v4.named_retrieval_terms t WHERE t.term=term_
    ORDER BY t.source_ordinal DESC,t.source_id LIMIT 4) posting_
 ), candidates_ AS MATERIALIZED (
  SELECT source_id,bool_or(lexical) lexical FROM (
   SELECT * FROM approximate_ UNION ALL SELECT * FROM lexical_ UNION ALL SELECT p_source,false
  ) all_ GROUP BY source_id
 ), eligible_ AS (
  SELECT current_.*,c.lexical FROM candidates_ c JOIN canonical_v4.named_retrieval_inputs cached_ ON cached_.source_id=c.source_id
  JOIN canonical_v4.named_indexable_sources current_ ON current_.source_id=c.source_id AND current_.generation=p_generation AND current_.matcher_hash=p_matcher
   AND current_.operation_digest=cached_.operation_digest AND current_.body_wire_hash=cached_.body_wire_hash AND current_.title_wire_hash=cached_.title_wire_hash
  WHERE cached_.generation=p_generation AND cached_.representation_hash=seed_.representation_hash AND cached_.mirror IS NOT NULL
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'sourceVersion',source_version::text,'ordinal',source_ordinal::text,
  'operationId',operation_id,'operationDigest',operation_digest,'sourceStamp',source_stamp,'url',url,'title',title,
  'bodyWireHash',body_wire_hash,'titleWireHash',title_wire_hash,'bodyBase64',replace(encode(array_send(body_values),'base64'),chr(10),''),
  'titleBase64',replace(encode(array_send(title_values),'base64'),chr(10),''),'supportedPath',supported_path,'lexical',lexical) ORDER BY source_id),'[]'::jsonb)
 INTO result_ FROM eligible_;
 IF jsonb_array_length(result_)>128 OR octet_length(result_::text)>4194304 THEN RAISE EXCEPTION 'Named neighbour capacity' USING ERRCODE='P1293';END IF;
 RETURN result_;
END $neighbours$;

CREATE FUNCTION canonical_v4.named_complete_discovery(p_generation text,p_matcher text,p_source text,p_index bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $complete$
DECLARE removed_ integer;
BEGIN
 -- Cache before completion queue, matching Source invalidation/indexing. Taking
 -- the queue first could deadlock a concurrent material change deleting cache.
 PERFORM 1 FROM canonical_v4.named_retrieval_inputs WHERE source_id=p_source AND index_ordinal=p_index AND generation=p_generation AND matcher_hash=p_matcher FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 DELETE FROM canonical_v4.named_discovery_requests q USING canonical_v4.named_retrieval_inputs i
 WHERE q.source_id=p_source AND i.source_id=q.source_id AND i.index_ordinal=p_index AND i.generation=p_generation AND i.matcher_hash=p_matcher;
 GET DIAGNOSTICS removed_=ROW_COUNT;
 IF removed_=1 THEN UPDATE canonical_v4.named_retrieval_inputs SET completed_at=statement_timestamp() WHERE source_id=p_source AND index_ordinal=p_index;END IF;
 RETURN removed_=1;
END $complete$;

-- Best-effort urgency only, on a separate app call outside read transactions.
-- It never creates Source/canonical work. Contended rows are skipped and the
-- function-local5ms lock limit bounds insertion/FK contention. A completed seed
-- can be hinted again after30s; frequent context polls do not create a hot loop.
CREATE FUNCTION canonical_v4.named_request_priority(p_generation text,p_source text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5ms' AS $priority$
DECLARE changed_ integer;
BEGIN
 IF canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RETURN false;END IF;
 WITH selected_ AS(SELECT source_id FROM canonical_v4.named_index_requests WHERE source_id=p_source AND generation=p_generation AND priority<2 FOR UPDATE SKIP LOCKED)
 UPDATE canonical_v4.named_index_requests q SET priority=2 FROM selected_ WHERE q.source_id=selected_.source_id;
 GET DIAGNOSTICS changed_=ROW_COUNT;IF changed_=1 THEN RETURN true;END IF;
 WITH selected_ AS(SELECT source_id FROM canonical_v4.named_discovery_requests WHERE source_id=p_source AND generation=p_generation AND priority<2 FOR UPDATE SKIP LOCKED)
 UPDATE canonical_v4.named_discovery_requests q SET priority=2 FROM selected_ WHERE q.source_id=selected_.source_id;
 GET DIAGNOSTICS changed_=ROW_COUNT;IF changed_=1 THEN RETURN true;END IF;
 INSERT INTO canonical_v4.named_discovery_requests(source_id,generation,matcher_hash,priority)
 SELECT i.source_id,i.generation,i.matcher_hash,2 FROM canonical_v4.named_retrieval_inputs i JOIN canonical_v4.semantic_installation h ON h.singleton AND h.matcher_hash=i.matcher_hash
 WHERE i.source_id=p_source AND i.generation=p_generation AND i.mirror IS NOT NULL AND i.completed_at<statement_timestamp()-interval '30 seconds'
 ON CONFLICT(source_id) DO NOTHING;
 GET DIAGNOSTICS changed_=ROW_COUNT;RETURN changed_=1;
EXCEPTION WHEN lock_not_available THEN RETURN false;
END $priority$;

REVOKE ALL ON TABLE canonical_v4.named_retrieval_inputs,canonical_v4.named_retrieval_terms,canonical_v4.named_index_requests,canonical_v4.named_discovery_requests,canonical_v4.named_indexable_sources FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.named_retrieval_inputs_index_ordinal_seq,canonical_v4.named_index_requests_ordinal_seq,canonical_v4.named_discovery_requests_ordinal_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_enqueue_index(text),canonical_v4.named_prepared_index_request(),canonical_v4.named_invalidate_retrieval(),
 canonical_v4.named_index_tasks(text,text),canonical_v4.named_index_source(text,text,text,bigint,jsonb,jsonb),canonical_v4.named_discovery_tasks(text,text),
 canonical_v4.named_neighbours(text,text,text,bigint),canonical_v4.named_complete_discovery(text,text,text,bigint),canonical_v4.named_request_priority(text,text) FROM PUBLIC;
DO $permissions$
DECLARE role_ text;
BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_retrieval_inputs,canonical_v4.named_retrieval_terms,canonical_v4.named_index_requests,canonical_v4.named_discovery_requests,canonical_v4.named_indexable_sources FROM %I',role_);
   EXECUTE format('REVOKE ALL ON SEQUENCE canonical_v4.named_retrieval_inputs_index_ordinal_seq,canonical_v4.named_index_requests_ordinal_seq,canonical_v4.named_discovery_requests_ordinal_seq FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_enqueue_index(text),canonical_v4.named_prepared_index_request(),canonical_v4.named_invalidate_retrieval(),canonical_v4.named_index_tasks(text,text),canonical_v4.named_index_source(text,text,text,bigint,jsonb,jsonb),canonical_v4.named_discovery_tasks(text,text),canonical_v4.named_neighbours(text,text,text,bigint),canonical_v4.named_complete_discovery(text,text,text,bigint),canonical_v4.named_request_priority(text,text) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_index_tasks(text,text),canonical_v4.named_index_source(text,text,text,bigint,jsonb,jsonb),
   canonical_v4.named_discovery_tasks(text,text),canonical_v4.named_neighbours(text,text,text,bigint),canonical_v4.named_complete_discovery(text,text,text,bigint) TO murmingle_ingest_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN GRANT EXECUTE ON FUNCTION canonical_v4.named_request_priority(text,text) TO murmingle_app;END IF;
END $permissions$;

-- End component automatic-subject-retrieval.sql

-- Component automatic-author-context.sql SHA256 c96eb765e457e0510737a5fa206352e74851d12b5db0f0e03093161427be0082
-- Unregistered hierarchy18 component. Existing canonical destinations and the
-- schema1..17 command primitives remain unchanged. No startup/live installation.
-- A caption becomes author-owned only in the transaction that creates its root.
CREATE TABLE canonical_v4.named_root_contexts (
 root_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.contributions(id) ON DELETE CASCADE,
 generation text COLLATE "C" NOT NULL,
 scope_kind text NOT NULL CHECK(scope_kind IN ('page','named')),
 scope_id text COLLATE "C" NOT NULL CHECK(canonical_v4.runtime_safe_text(scope_id,128,false)),
 caption text NOT NULL CHECK(canonical_v4.runtime_safe_text(caption,200,false))
);
CREATE INDEX named_root_scope ON canonical_v4.named_root_contexts(generation,scope_kind,scope_id,root_id);
-- This digest serves exact command replay only. It is not a topic-identity or
-- discovery index and cannot recover an erased Source-derived subject.
CREATE TABLE canonical_v4.named_context_receipts (
 actor_id text COLLATE "C" NOT NULL,
 request_id text COLLATE "C" NOT NULL,
 scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(actor_id,request_id),
 FOREIGN KEY(actor_id,request_id) REFERENCES canonical_v4.command_receipts(actor_id,request_id) ON DELETE CASCADE
);

CREATE FUNCTION canonical_v4.named_valid_editor_scope(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $valid$
 SELECT CASE WHEN jsonb_typeof(p) IS DISTINCT FROM 'object' THEN false ELSE
  (SELECT count(*) FROM jsonb_object_keys(p))=5 AND p ?& ARRAY['kind','id','caption','sourceId','materialDigest'] AND
  jsonb_typeof(p->'kind')='string' AND p->>'kind' IN ('page','named') AND
  jsonb_typeof(p->'id')='string' AND canonical_v4.runtime_safe_text(p->>'id',128,false) AND
  jsonb_typeof(p->'caption')='string' AND canonical_v4.runtime_safe_text(p->>'caption',200,false) AND
  jsonb_typeof(p->'sourceId')='string' AND canonical_v4.runtime_safe_text(p->>'sourceId',128,false) AND
  jsonb_typeof(p->'materialDigest')='string' AND p->>'materialDigest' ~ '^[a-f0-9]{64}$'
 END
$valid$;

CREATE FUNCTION canonical_v4.named_read_editor(p_generation text,p_source text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $editor$
DECLARE result_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
    canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid editor context' USING ERRCODE='P1293';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Editor generation changed' USING ERRCODE='P1291';END IF;
 SELECT jsonb_build_object('generation',p_generation,'topicId',link_.topic_id,
  'pageScope',jsonb_build_object('kind','page','id',s.id,'caption',s.title,'sourceId',s.id,'materialDigest',r.operation_digest),'scope',
  jsonb_build_object('kind',CASE WHEN h.subject_id IS NULL THEN 'page' ELSE 'named' END,
   'id',coalesce(h.subject_id::text,s.id),'caption',coalesce(h.label,s.title),
   'sourceId',s.id,'materialDigest',r.operation_digest)) INTO result_
 FROM canonical_v4.sources s
 JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id AND r.operation_digest=s.payload::jsonb->>'operationDigest'
 JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
 JOIN canonical_v4.source_links link_ ON link_.source_id=s.id
 JOIN canonical_v4.topics topic_ ON topic_.id=link_.topic_id
 JOIN canonical_v4.discussions d ON d.topic_id=link_.topic_id
 LEFT JOIN canonical_v4.named_subject_selections selection_ ON selection_.source_id=s.id
 LEFT JOIN canonical_v4.named_subject_members m ON m.source_id=s.id AND m.subject_id=selection_.subject_id
  AND m.source_version=s.write_version AND m.operation_id=s.operation_id AND m.operation_digest=r.operation_digest AND m.source_stamp=st.stamp
 LEFT JOIN canonical_v4.named_subject_ids identity_ ON identity_.id=m.subject_id
 LEFT JOIN canonical_v4.semantic_installation installation_ ON installation_.singleton
 LEFT JOIN canonical_v4.named_subject_heads h ON h.subject_id=m.subject_id AND h.revision=identity_.revision
  AND h.generation=p_generation AND h.matcher_hash=installation_.matcher_hash
 WHERE s.id=p_source AND s.provenance='owner-local-page-embedding/v1' AND s.has_embedding;
 RETURN result_;
END $editor$;

-- Same protected witnesses as publication, ordinary MVCC only. This permits
-- real AI job creation to authorize the captured earlier broad/page scope even
-- if the preferred leaf changes. Publication rechecks after its physical locks.
CREATE FUNCTION canonical_v4.named_check_editor_scope(p_generation text,p_topic text,p_scope jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $check$
DECLARE named_id_ uuid;
BEGIN
 IF canonical_v4.named_valid_editor_scope(p_scope) IS DISTINCT FROM true OR
   canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
   canonical_v4.runtime_safe_text(p_topic,128,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid selected context' USING ERRCODE='P1293';END IF;
 IF p_scope->>'kind'='named' THEN
  IF p_scope->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Invalid selected subject' USING ERRCODE='P1293';END IF;
  named_id_:=(p_scope->>'id')::uuid;
 END IF;
 RETURN EXISTS(SELECT 1 FROM canonical_v4.sources s
  JOIN canonical_v4.runtime_state state_ ON state_.singleton AND state_.generation=p_generation
  JOIN canonical_v4.source_links link_ ON link_.source_id=s.id AND link_.topic_id=p_topic
  JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id AND r.operation_digest=s.payload::jsonb->>'operationDigest'
  JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
  WHERE s.id=p_scope->>'sourceId' AND s.provenance='owner-local-page-embedding/v1' AND s.has_embedding AND r.operation_digest=p_scope->>'materialDigest'
   AND ((p_scope->>'kind'='page' AND p_scope->>'id'=s.id AND p_scope->>'caption'=s.title) OR
    (p_scope->>'kind'='named' AND EXISTS(SELECT 1 FROM canonical_v4.named_subject_heads h
      JOIN canonical_v4.named_subject_ids identity_ ON identity_.id=h.subject_id AND identity_.revision=h.revision
      JOIN canonical_v4.semantic_installation installation_ ON installation_.singleton AND installation_.matcher_hash=h.matcher_hash
      JOIN canonical_v4.named_subject_members m ON m.subject_id=h.subject_id AND m.source_id=s.id AND m.source_version=s.write_version
        AND m.operation_id=s.operation_id AND m.operation_digest=r.operation_digest AND m.source_stamp=st.stamp
      WHERE h.subject_id=named_id_ AND h.label=p_scope->>'caption' AND h.generation=p_generation))));
END $check$;

-- Private finalizer, after canonical domain locks and before the watermark.
-- Neither app nor worker can independently attach context to existing roots.
CREATE FUNCTION canonical_v4.named_attach_root_context(
 p_actor_id text,p_request_id text,p_generation text,p_source_id text,p_root text,p_scope jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $attach$
DECLARE source_ canonical_v4.sources%ROWTYPE;receipt_ canonical_v4.operation_receipts%ROWTYPE;
 stamp_ canonical_v4.runtime_source_stamps%ROWTYPE;head_ canonical_v4.named_subject_heads%ROWTYPE;matcher_ text;digest_ text;
BEGIN
 IF canonical_v4.named_valid_editor_scope(p_scope) IS DISTINCT FROM true OR p_scope->>'sourceId' IS DISTINCT FROM p_source_id THEN
  RAISE EXCEPTION 'Invalid editor scope' USING ERRCODE='P1293';END IF;
 digest_:=encode(sha256(convert_to(p_scope::text,'UTF8')),'hex');
 -- Private prepare has locked and checked the exact canonical destination.
 -- Additional derived metadata fences follow those domain locks; no head lock
 -- is held while entering a canonical discussion. Same-material renewals are
 -- accepted because a Source version/operation ID is not a draft's meaning.
 SELECT * INTO receipt_ FROM canonical_v4.operation_receipts WHERE source_id=p_source_id;
 SELECT * INTO source_ FROM canonical_v4.sources WHERE id=p_source_id;
 SELECT * INTO stamp_ FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source_id FOR SHARE;
 IF source_.id IS NULL OR source_.provenance<>'owner-local-page-embedding/v1' OR NOT source_.has_embedding OR
    receipt_.source_id IS NULL OR receipt_.operation_id IS DISTINCT FROM source_.operation_id OR
    receipt_.operation_digest IS DISTINCT FROM p_scope->>'materialDigest' OR
    receipt_.operation_digest IS DISTINCT FROM source_.payload::jsonb->>'operationDigest' OR stamp_.postable IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Editor material changed' USING ERRCODE='P1291';END IF;
 IF p_scope->>'kind'='page' THEN
  -- A page draft remains a page draft when discovery publishes a new subject.
  IF p_scope->>'id' IS DISTINCT FROM p_source_id OR p_scope->>'caption' IS DISTINCT FROM source_.title THEN
   RAISE EXCEPTION 'Page scope changed' USING ERRCODE='P1291';END IF;
 ELSE
  IF p_scope->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Invalid named scope' USING ERRCODE='P1293';END IF;
  SELECT matcher_hash INTO matcher_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  SELECT * INTO head_ FROM canonical_v4.named_subject_heads WHERE subject_id=(p_scope->>'id')::uuid FOR SHARE;
  -- Membership suffices: a previously chosen broad subject need not remain the
  -- current preferred leaf. Evidence revisions/first-parent attachment are not
  -- part of its stable ID or caption and cannot invalidate an author's draft.
  IF head_.subject_id IS NULL OR head_.generation<>p_generation OR head_.matcher_hash IS DISTINCT FROM matcher_ OR
    head_.label IS DISTINCT FROM p_scope->>'caption' OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.named_subject_ids id_ WHERE id_.id=head_.subject_id AND id_.revision=head_.revision) OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.named_subject_members m WHERE m.subject_id=head_.subject_id AND m.source_id=p_source_id
      AND m.source_version=source_.write_version AND m.operation_id=source_.operation_id
      AND m.operation_digest=receipt_.operation_digest AND m.source_stamp=stamp_.stamp) THEN
   RAISE EXCEPTION 'Named scope changed' USING ERRCODE='P1291';END IF;
 END IF;
 INSERT INTO canonical_v4.named_root_contexts VALUES(p_root,p_generation,p_scope->>'kind',p_scope->>'id',p_scope->>'caption');
 INSERT INTO canonical_v4.named_context_receipts VALUES(p_actor_id,p_request_id,digest_);
END $attach$;

CREATE FUNCTION canonical_v4.named_append_root(
 p_actor_id text,p_request_id text,p_request_digest text,p_request_material text,p_generation text,
 p_topic_id text,p_body text,p_source_id text,p_contribution_id text,p_created_at text,p_scope jsonb
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $append$
DECLARE prepared_ record;digest_ text;
BEGIN
 IF canonical_v4.named_valid_editor_scope(p_scope) IS DISTINCT FROM true OR
    p_scope->>'sourceId' IS DISTINCT FROM p_source_id THEN
  RAISE EXCEPTION 'Invalid editor scope' USING ERRCODE='P1293';END IF;
 digest_:=encode(sha256(convert_to(p_scope::text,'UTF8')),'hex');
 -- Same actor/receipt/Source/domain order as the existing append boundary.
 IF canonical_v4.runtime_safe_text(p_actor_id,128,false) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id,914092006));END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source_id FOR SHARE;
 SELECT * INTO prepared_ FROM canonical_v4.runtime_prepare_command(
  p_actor_id,p_request_id,p_request_digest,p_request_material,p_generation,'create-root',p_topic_id,
  NULL,NULL,NULL,p_body,p_source_id,p_contribution_id,p_created_at);
 IF prepared_.replayed THEN
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.named_context_receipts
    WHERE actor_id=p_actor_id AND request_id=p_request_id AND scope_digest=digest_) THEN
   RAISE EXCEPTION 'Original editor scope differs' USING ERRCODE='P1291';END IF;
  RETURN prepared_.response_text;
 END IF;
 PERFORM canonical_v4.named_attach_root_context(p_actor_id,p_request_id,p_generation,p_source_id,prepared_.contribution_id,p_scope);
 RETURN canonical_v4.runtime_complete_command(p_actor_id,p_request_id,p_generation,prepared_.discussion_id,
  prepared_.contribution_id,prepared_.discussion_version);
END $append$;

CREATE FUNCTION canonical_v4.named_read_root_context(p_generation text,p_root text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $root$
DECLARE result_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
    canonical_v4.runtime_safe_text(p_root,128,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid root context' USING ERRCODE='P1293';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Root generation changed' USING ERRCODE='P1291';END IF;
 SELECT jsonb_build_object('rootId',c.id,'discussionId',c.discussion_id,'topicId',d.topic_id,
  'scope',jsonb_build_object('kind',scope_.scope_kind,'id',scope_.scope_id,'caption',scope_.caption)) INTO result_
 FROM canonical_v4.named_root_contexts scope_ JOIN canonical_v4.contributions c ON c.id=scope_.root_id
 JOIN canonical_v4.discussions d ON d.id=c.discussion_id
 WHERE scope_.generation=p_generation AND scope_.root_id=p_root AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public';
 RETURN result_;
END $root$;

CREATE FUNCTION canonical_v4.named_erase_authored_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $erase$
BEGIN
 IF NEW.withdrawn OR NEW.visibility<>'local-public' THEN
  DELETE FROM canonical_v4.named_root_contexts WHERE root_id=NEW.id;END IF;
 RETURN NEW;
END $erase$;
CREATE TRIGGER named_authored_withdrawal AFTER UPDATE OF withdrawn,visibility ON canonical_v4.contributions
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_erase_authored_context();

REVOKE ALL ON TABLE canonical_v4.named_root_contexts,canonical_v4.named_context_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.named_attach_root_context(text,text,text,text,text,jsonb),canonical_v4.named_valid_editor_scope(jsonb),canonical_v4.named_read_editor(text,text),
 canonical_v4.named_append_root(text,text,text,text,text,text,text,text,text,text,jsonb),
 canonical_v4.named_read_root_context(text,text),canonical_v4.named_erase_authored_context() FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_root_contexts,canonical_v4.named_context_receipts FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.named_attach_root_context(text,text,text,text,text,jsonb),canonical_v4.named_valid_editor_scope(jsonb),canonical_v4.named_read_editor(text,text),canonical_v4.named_append_root(text,text,text,text,text,text,text,text,text,text,jsonb),canonical_v4.named_read_root_context(text,text),canonical_v4.named_erase_authored_context() FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.named_read_editor(text,text),canonical_v4.named_read_root_context(text,text),
   canonical_v4.named_append_root(text,text,text,text,text,text,text,text,text,text,jsonb) TO murmingle_app;END IF;
END $permissions$;

-- End component automatic-author-context.sql

-- Component automatic-author-insight.sql SHA256 9ac7220b8d00dfee6424ac90b33e47db7c7bd7e28cc4773025f1c7734e8933bb
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

-- End component automatic-author-insight.sql

-- Component automatic-topic-feeds.sql SHA256 8530e8df7e899ec045e2820132e226a4fa08305fb9d063f7a52e11144b982b91
-- Unregistered hierarchy18 component. No startup installation, model inference,
-- canonical destination change or retrospective relabelling of legacy posts.
-- Direct author scope is immediate. Bounded background work indexes ancestors
-- and searchable captions, without holding canonical discussion/watermark locks.
CREATE TABLE canonical_v4.named_feed_roots (
 root_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.named_root_contexts(root_id) ON DELETE CASCADE,
 generation text COLLATE "C" NOT NULL,
 scope_kind text COLLATE "C" NOT NULL CHECK(scope_kind IN ('page','named')),
 scope_id text COLLATE "C" NOT NULL,
 root_ordinal bigint NOT NULL CHECK(root_ordinal>=0),
 UNIQUE(root_id,root_ordinal)
);
CREATE INDEX named_feed_scope_roots ON canonical_v4.named_feed_roots(generation,scope_kind,scope_id,root_ordinal,root_id);
CREATE TABLE canonical_v4.named_feed_edges (
 root_id text COLLATE "C" NOT NULL,
 root_ordinal bigint NOT NULL,
 generation text COLLATE "C" NOT NULL,
 scope_kind text COLLATE "C" NOT NULL CHECK(scope_kind IN ('page','named')),
 scope_id text COLLATE "C" NOT NULL,
 basis text NOT NULL CHECK(basis IN ('author','ancestor')),
 PRIMARY KEY(root_id,scope_kind,scope_id),
 FOREIGN KEY(root_id,root_ordinal) REFERENCES canonical_v4.named_feed_roots(root_id,root_ordinal) ON DELETE CASCADE
);
CREATE INDEX named_feed_order ON canonical_v4.named_feed_edges(generation,scope_kind,scope_id,root_ordinal DESC,root_id);
CREATE TABLE canonical_v4.named_feed_witnesses (
 root_id text COLLATE "C" NOT NULL,scope_kind text COLLATE "C" NOT NULL,scope_id text COLLATE "C" NOT NULL,
 head_id uuid NOT NULL REFERENCES canonical_v4.named_subject_heads(subject_id) ON DELETE CASCADE,
 PRIMARY KEY(root_id,scope_kind,scope_id,head_id),
 FOREIGN KEY(root_id,scope_kind,scope_id) REFERENCES canonical_v4.named_feed_edges(root_id,scope_kind,scope_id) ON DELETE CASCADE
);
CREATE INDEX named_feed_witness_head ON canonical_v4.named_feed_witnesses(head_id);
CREATE TABLE canonical_v4.named_topic_cards (
 generation text COLLATE "C" NOT NULL,scope_kind text COLLATE "C" NOT NULL CHECK(scope_kind IN ('page','named')),
 scope_id text COLLATE "C" NOT NULL,
 caption text COLLATE "C" NOT NULL CHECK(canonical_v4.runtime_safe_text(caption,200,false)),
 caption_root_id text COLLATE "C" REFERENCES canonical_v4.named_root_contexts(root_id) ON DELETE CASCADE,
 head_id uuid REFERENCES canonical_v4.named_subject_heads(subject_id) ON DELETE CASCADE,
 path text[] NOT NULL CHECK(cardinality(path) BETWEEN 1 AND 8),
 human boolean NOT NULL,
 root_ordinal bigint NOT NULL CHECK(root_ordinal>=0),
 search tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig,caption)) STORED,
 PRIMARY KEY(generation,scope_kind,scope_id,caption),
 CHECK(caption_root_id IS NOT NULL OR head_id IS NOT NULL)
);
CREATE INDEX named_topic_card_terms ON canonical_v4.named_topic_cards USING gin(search);
CREATE INDEX named_topic_card_order ON canonical_v4.named_topic_cards(generation,human DESC,root_ordinal DESC,scope_kind,scope_id,caption);
CREATE INDEX named_topic_card_root ON canonical_v4.named_topic_cards(caption_root_id);
CREATE INDEX named_topic_card_head ON canonical_v4.named_topic_cards(head_id);
CREATE INDEX named_topic_card_scope ON canonical_v4.named_topic_cards(generation,scope_kind,scope_id,human DESC,root_ordinal DESC,caption);
-- A single public browse row per scope gives empty-query browsing an ordered
-- index. Distinct expressly posted captions remain searchable aliases.
CREATE TABLE canonical_v4.named_topic_directory (
 generation text COLLATE "C" NOT NULL,scope_kind text COLLATE "C" NOT NULL,scope_id text COLLATE "C" NOT NULL,
 caption text COLLATE "C" NOT NULL,human boolean NOT NULL,root_ordinal bigint NOT NULL,
 PRIMARY KEY(generation,scope_kind,scope_id),
 FOREIGN KEY(generation,scope_kind,scope_id,caption) REFERENCES canonical_v4.named_topic_cards(generation,scope_kind,scope_id,caption) ON DELETE CASCADE
);
CREATE INDEX named_topic_directory_order ON canonical_v4.named_topic_directory(generation,human DESC,root_ordinal DESC,scope_kind,scope_id);
CREATE INDEX named_subject_child_order ON canonical_v4.named_subject_heads(parent_id,subject_id);

-- Each event is independent: a writer never updates a shared hot-topic counter
-- or waits for a worker-owned event. Events become visible with the source/root
-- transaction. Exact event deletion cannot consume later concurrent changes.
CREATE TABLE canonical_v4.named_feed_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 generation text COLLATE "C" NOT NULL,
 kind text NOT NULL CHECK(kind IN ('root','scope','subject')),
 root_id text COLLATE "C" REFERENCES canonical_v4.named_root_contexts(root_id) ON DELETE CASCADE,
 scope_kind text COLLATE "C" NOT NULL CHECK(scope_kind IN ('page','named')),
 scope_id text COLLATE "C" NOT NULL,
 subject_id uuid REFERENCES canonical_v4.named_subject_heads(subject_id) ON DELETE CASCADE,
 after_root bigint NOT NULL DEFAULT -1,
 upper_root bigint,
 roots_done boolean NOT NULL DEFAULT false,
 after_child uuid,
 retry_after timestamptz NOT NULL DEFAULT '-infinity',
 CHECK((kind='root' AND root_id IS NOT NULL) OR kind<>'root' AND root_id IS NULL),
 CHECK((kind='subject' AND subject_id IS NOT NULL) OR kind<>'subject' AND subject_id IS NULL)
);
CREATE INDEX named_feed_event_ready ON canonical_v4.named_feed_events(generation,event_id) INCLUDE(retry_after);

CREATE FUNCTION canonical_v4.named_retire_ancestor_edge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $retire$
BEGIN
 DELETE FROM canonical_v4.named_feed_edges WHERE root_id=OLD.root_id AND scope_kind=OLD.scope_kind AND scope_id=OLD.scope_id AND basis='ancestor';
 RETURN OLD;
END $retire$;
CREATE TRIGGER named_retire_ancestor_witness AFTER DELETE ON canonical_v4.named_feed_witnesses
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_retire_ancestor_edge();

CREATE FUNCTION canonical_v4.named_schedule_root_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $schedule$
DECLARE ordinal_ bigint;
BEGIN
 IF TG_OP='DELETE' THEN
  -- Only opaque scope identity, never the withdrawn caption, survives here.
  INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id)
   VALUES(OLD.generation,'scope',OLD.scope_kind,OLD.scope_id);
  RETURN OLD;
 END IF;
 SELECT ordinal INTO ordinal_ FROM canonical_v4.contributions WHERE id=NEW.root_id AND root_id IS NULL AND NOT withdrawn AND visibility='local-public';
 IF ordinal_ IS NULL THEN RAISE EXCEPTION 'Invalid authored feed root' USING ERRCODE='P1304';END IF;
 INSERT INTO canonical_v4.named_feed_roots VALUES(NEW.root_id,NEW.generation,NEW.scope_kind,NEW.scope_id,ordinal_);
 INSERT INTO canonical_v4.named_feed_edges VALUES(NEW.root_id,ordinal_,NEW.generation,NEW.scope_kind,NEW.scope_id,'author');
 INSERT INTO canonical_v4.named_feed_events(generation,kind,root_id,scope_kind,scope_id)
  VALUES(NEW.generation,'root',NEW.root_id,NEW.scope_kind,NEW.scope_id);
 RETURN NEW;
END $schedule$;
CREATE TRIGGER named_schedule_new_root AFTER INSERT ON canonical_v4.named_root_contexts
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_root_feed();
CREATE TRIGGER named_schedule_removed_root AFTER DELETE ON canonical_v4.named_root_contexts
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_root_feed();

CREATE FUNCTION canonical_v4.named_schedule_subject_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $subject$
BEGIN
 IF TG_OP='DELETE' THEN
  INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id)
   VALUES(OLD.generation,'scope','named',OLD.subject_id::text);RETURN OLD;
 END IF;
 IF TG_OP='INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.matcher_hash IS DISTINCT FROM OLD.matcher_hash THEN
  INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id,subject_id)
   VALUES(NEW.generation,'subject','named',NEW.subject_id::text,NEW.subject_id);
 END IF;
 RETURN NEW;
END $subject$;
CREATE TRIGGER named_schedule_subject_change AFTER INSERT OR UPDATE OF parent_id,matcher_hash OR DELETE ON canonical_v4.named_subject_heads
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_subject_feed();

-- Shared ancestry reads never wait on a head or authored-context writer. A
-- contended/deleted partial path leaves its event pending rather than publishing
-- guessed ancestors. The root's direct author edge is independent of this work.
CREATE FUNCTION canonical_v4.named_locked_feed_path(p_generation text,p_subject uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $path$
DECLARE ids_ uuid[]:=ARRAY[]::uuid[];id_ uuid:=p_subject;parent_ uuid;n_ integer;locked_ integer;
BEGIN
 LOOP
  SELECT parent_id INTO parent_ FROM canonical_v4.named_subject_heads WHERE subject_id=id_ AND generation=p_generation;
  IF NOT FOUND THEN
   IF cardinality(ids_)=0 THEN RETURN ids_;END IF;
   RETURN NULL;
  END IF;
  IF id_=ANY(ids_) OR cardinality(ids_)>=8 THEN RAISE EXCEPTION 'Invalid named ancestry' USING ERRCODE='P1304';END IF;
  ids_:=array_append(ids_,id_);EXIT WHEN parent_ IS NULL;id_:=parent_;
 END LOOP;
 PERFORM 1 FROM canonical_v4.named_subject_heads WHERE subject_id=ANY(ids_) ORDER BY subject_id FOR SHARE SKIP LOCKED;
 GET DIAGNOSTICS locked_=ROW_COUNT;
 IF locked_<>cardinality(ids_) THEN RETURN NULL;END IF;
 FOR n_ IN 1..cardinality(ids_) LOOP
  SELECT parent_id INTO parent_ FROM canonical_v4.named_subject_heads WHERE subject_id=ids_[n_] AND generation=p_generation;
  IF NOT FOUND OR parent_ IS DISTINCT FROM (CASE WHEN n_<cardinality(ids_) THEN ids_[n_+1] ELSE NULL::uuid END) THEN RETURN NULL;END IF;
 END LOOP;
 RETURN ids_;
END $path$;

CREATE FUNCTION canonical_v4.named_refresh_topic_directory(p_generation text,p_kind text,p_scope text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $directory$
 INSERT INTO canonical_v4.named_topic_directory
  SELECT generation,scope_kind,scope_id,caption,human,root_ordinal FROM canonical_v4.named_topic_cards
   WHERE generation=p_generation AND scope_kind=p_kind AND scope_id=p_scope ORDER BY human DESC,root_ordinal DESC,caption LIMIT 1
 ON CONFLICT(generation,scope_kind,scope_id) DO UPDATE SET caption=EXCLUDED.caption,human=EXCLUDED.human,root_ordinal=EXCLUDED.root_ordinal;
$directory$;

CREATE FUNCTION canonical_v4.named_index_root_feed(p_root text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $index$
DECLARE root_ canonical_v4.named_feed_roots%ROWTYPE;caption_ text;human_ boolean;ids_ uuid[];path_ text[];
 n_ integer:=0;
BEGIN
 SELECT f.* INTO root_ FROM canonical_v4.named_feed_roots f JOIN canonical_v4.named_root_contexts ctx ON ctx.root_id=f.root_id
  WHERE f.root_id=p_root FOR KEY SHARE OF ctx SKIP LOCKED;
 IF NOT FOUND THEN RETURN NOT EXISTS(SELECT 1 FROM canonical_v4.named_feed_roots WHERE root_id=p_root);END IF;
 SELECT ctx.caption,c.actor_type='human' INTO caption_,human_ FROM canonical_v4.named_root_contexts ctx
  JOIN canonical_v4.contributions c ON c.id=ctx.root_id WHERE ctx.root_id=p_root AND NOT c.withdrawn AND c.visibility='local-public';
 IF NOT FOUND THEN RETURN true;END IF;
 path_:=ARRAY[CASE WHEN root_.scope_kind='named' THEN 'subject-' ELSE 'page-' END||root_.scope_id];
 ids_:=ARRAY[]::uuid[];
 IF root_.scope_kind='named' THEN
  ids_:=canonical_v4.named_locked_feed_path(root_.generation,root_.scope_id::uuid);
  IF ids_ IS NULL THEN RETURN false;END IF;
  IF cardinality(ids_)>0 THEN
   SELECT array_agg('subject-'||v::text ORDER BY ord DESC) INTO path_ FROM unnest(ids_) WITH ORDINALITY values_(v,ord);
  END IF;
 END IF;
 DELETE FROM canonical_v4.named_feed_edges WHERE root_id=p_root AND basis='ancestor';
 IF cardinality(ids_)>1 THEN
  FOR n_ IN 2..cardinality(ids_) LOOP
   INSERT INTO canonical_v4.named_feed_edges VALUES(p_root,root_.root_ordinal,root_.generation,'named',ids_[n_]::text,'ancestor');
   INSERT INTO canonical_v4.named_feed_witnesses SELECT p_root,'named',ids_[n_]::text,v FROM unnest(ids_[1:n_]) v;
  END LOOP;
 END IF;
 -- Caption aliases are per distinct expressly posted title, not per post. Both
 -- keys are bounded text; deletion of its representative erases the cached title.
 INSERT INTO canonical_v4.named_topic_cards(generation,scope_kind,scope_id,caption,caption_root_id,head_id,path,human,root_ordinal)
  VALUES(root_.generation,root_.scope_kind,root_.scope_id,caption_,p_root,CASE WHEN cardinality(ids_)>0 THEN ids_[1] ELSE NULL END,path_,human_,root_.root_ordinal)
 ON CONFLICT(generation,scope_kind,scope_id,caption) DO UPDATE SET
  caption_root_id=CASE WHEN named_topic_cards.caption_root_id IS NULL OR EXCLUDED.human AND NOT named_topic_cards.human THEN EXCLUDED.caption_root_id ELSE named_topic_cards.caption_root_id END,
  head_id=EXCLUDED.head_id,path=EXCLUDED.path,human=named_topic_cards.human OR EXCLUDED.human,
  root_ordinal=greatest(named_topic_cards.root_ordinal,EXCLUDED.root_ordinal);
 PERFORM canonical_v4.named_refresh_topic_directory(root_.generation,root_.scope_kind,root_.scope_id);
 RETURN true;
END $index$;

CREATE FUNCTION canonical_v4.named_feed_tasks(p_generation text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $tasks$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 RETURN coalesce((SELECT jsonb_agg(event_id::text ORDER BY event_id) FROM
  (SELECT event_id FROM canonical_v4.named_feed_events WHERE generation=p_generation AND retry_after<=clock_timestamp() ORDER BY event_id LIMIT 8) q),'[]'::jsonb);
END $tasks$;

CREATE FUNCTION canonical_v4.named_process_feed_event(p_generation text,p_event bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $process$
DECLARE event_ canonical_v4.named_feed_events%ROWTYPE;head_ canonical_v4.named_subject_heads%ROWTYPE;
 r_ record;count_ integer:=0;last_ bigint;last_child_ uuid;ids_ uuid[];path_ text[];ok_ boolean;
BEGIN
 IF p_event IS NULL OR p_event<1 OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 SELECT * INTO event_ FROM canonical_v4.named_feed_events WHERE event_id=p_event AND generation=p_generation FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN 'retired';END IF;
 IF event_.kind='root' THEN
  ok_:=canonical_v4.named_index_root_feed(event_.root_id);
  IF ok_ THEN DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event;RETURN 'completed';END IF;
  UPDATE canonical_v4.named_feed_events SET retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';
 END IF;
 IF event_.upper_root IS NULL THEN
  SELECT coalesce(max(root_ordinal),-1) INTO event_.upper_root FROM canonical_v4.named_feed_roots
   WHERE generation=p_generation AND scope_kind=event_.scope_kind AND scope_id=event_.scope_id;
  UPDATE canonical_v4.named_feed_events SET upper_root=event_.upper_root WHERE event_id=p_event;
 END IF;
 IF NOT event_.roots_done THEN
  FOR r_ IN SELECT root_id,root_ordinal FROM canonical_v4.named_feed_roots
    WHERE generation=p_generation AND scope_kind=event_.scope_kind AND scope_id=event_.scope_id
      AND root_ordinal>event_.after_root AND root_ordinal<=event_.upper_root ORDER BY root_ordinal,root_id LIMIT 16 LOOP
   PERFORM 1 FROM canonical_v4.named_root_contexts WHERE root_id=r_.root_id FOR KEY SHARE SKIP LOCKED;
   IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=r_.root_id) THEN
    UPDATE canonical_v4.named_feed_events SET after_root=coalesce(last_,after_root),retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';
   END IF;
   IF NOT FOUND THEN last_:=r_.root_ordinal;count_:=count_+1;CONTINUE;END IF;
   INSERT INTO canonical_v4.named_feed_events(generation,kind,root_id,scope_kind,scope_id)
    VALUES(p_generation,'root',r_.root_id,event_.scope_kind,event_.scope_id);
   count_:=count_+1;last_:=r_.root_ordinal;
  END LOOP;
  UPDATE canonical_v4.named_feed_events SET after_root=coalesce(last_,after_root),roots_done=count_<16 WHERE event_id=p_event;
  IF count_=16 THEN RETURN 'advanced';END IF;
 END IF;
 IF event_.kind='subject' THEN
  ids_:=canonical_v4.named_locked_feed_path(p_generation,event_.subject_id);
  IF ids_ IS NULL THEN
   UPDATE canonical_v4.named_feed_events SET retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';END IF;
  IF cardinality(ids_)=0 THEN DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event;RETURN 'retired';END IF;
  SELECT * INTO STRICT head_ FROM canonical_v4.named_subject_heads WHERE subject_id=event_.subject_id;
  SELECT array_agg('subject-'||v::text ORDER BY ord DESC) INTO path_ FROM unnest(ids_) WITH ORDINALITY values_(v,ord);
  -- The head row's label is a derived public basis. Its FK removes this alias
  -- atomically when the Source withdraws; an authored alias is repaired by events.
  INSERT INTO canonical_v4.named_topic_cards(generation,scope_kind,scope_id,caption,caption_root_id,head_id,path,human,root_ordinal)
   VALUES(p_generation,'named',head_.subject_id::text,head_.label,NULL,head_.subject_id,path_,false,0)
   ON CONFLICT(generation,scope_kind,scope_id,caption) DO UPDATE SET head_id=EXCLUDED.head_id,path=EXCLUDED.path;
  PERFORM canonical_v4.named_refresh_topic_directory(p_generation,'named',head_.subject_id::text);
  count_:=0;
  FOR r_ IN SELECT subject_id FROM canonical_v4.named_subject_heads WHERE parent_id=event_.subject_id
    AND (event_.after_child IS NULL OR subject_id>event_.after_child) ORDER BY subject_id LIMIT 16 LOOP
   PERFORM 1 FROM canonical_v4.named_subject_heads WHERE subject_id=r_.subject_id FOR KEY SHARE SKIP LOCKED;
   IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.named_subject_heads WHERE subject_id=r_.subject_id) THEN
    UPDATE canonical_v4.named_feed_events SET after_child=coalesce(last_child_,after_child),retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';
   END IF;
   IF NOT FOUND THEN last_child_:=r_.subject_id;count_:=count_+1;CONTINUE;END IF;
   INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id,subject_id)
    VALUES(p_generation,'subject','named',r_.subject_id::text,r_.subject_id);
   count_:=count_+1;last_child_:=r_.subject_id;
  END LOOP;
  IF count_=16 THEN UPDATE canonical_v4.named_feed_events SET after_child=last_child_ WHERE event_id=p_event;RETURN 'advanced';END IF;
 ELSIF event_.scope_kind='named' THEN
  -- A withdrawn representative can also have been the head-label alias. Requeue
  -- that still-live head without resurrecting any removed authored caption.
  PERFORM 1 FROM canonical_v4.named_subject_heads WHERE subject_id=event_.scope_id::uuid AND generation=p_generation FOR KEY SHARE SKIP LOCKED;
  IF FOUND THEN INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id,subject_id)
   VALUES(p_generation,'subject','named',event_.scope_id,event_.scope_id::uuid);
  ELSIF EXISTS(SELECT 1 FROM canonical_v4.named_subject_heads WHERE subject_id=event_.scope_id::uuid AND generation=p_generation) THEN
   UPDATE canonical_v4.named_feed_events SET retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';END IF;
 END IF;
 PERFORM canonical_v4.named_refresh_topic_directory(p_generation,event_.scope_kind,event_.scope_id);
 DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event;RETURN 'completed';
END $process$;

-- No Source classification authority is inferred from this read. Canonical
-- roots retain their original destinations and immutable author-selected scope.
CREATE FUNCTION canonical_v4.named_read_feed(p_generation text,p_kind text,p_scope text,p_before bigint,p_limit integer)
RETURNS TABLE(root_id text,discussion_id text,topic_id text,root_ordinal text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $feed$
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('page','named') OR canonical_v4.runtime_safe_text(p_scope,128,false) IS DISTINCT FROM true OR
   p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_before IS NOT NULL AND p_before<0 THEN
  RAISE EXCEPTION 'Invalid named feed' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 RETURN QUERY SELECT c.id,c.discussion_id,d.topic_id,e.root_ordinal::text
  FROM canonical_v4.named_feed_edges e JOIN canonical_v4.contributions c ON c.id=e.root_id
  JOIN canonical_v4.discussions d ON d.id=c.discussion_id
  WHERE e.generation=p_generation AND e.scope_kind=p_kind AND e.scope_id=p_scope AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
   AND c.ordinal=e.root_ordinal AND (p_before IS NULL OR e.root_ordinal<p_before)
  ORDER BY e.root_ordinal DESC,e.root_id LIMIT p_limit;
END $feed$;

CREATE FUNCTION canonical_v4.named_root_in_scope(p_generation text,p_route text,p_root text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $member$
DECLARE kind_ text;scope_ text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 IF canonical_v4.runtime_safe_text(p_route,160,false) IS DISTINCT FROM true OR canonical_v4.runtime_safe_text(p_root,128,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid feed membership' USING ERRCODE='P1303';END IF;
 IF left(p_route,8)='subject-' THEN kind_:='named';scope_:=substr(p_route,9);
 ELSIF left(p_route,5)='page-' THEN kind_:='page';scope_:=substr(p_route,6);ELSE RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM canonical_v4.named_feed_edges e JOIN canonical_v4.contributions c ON c.id=e.root_id
  WHERE e.generation=p_generation AND e.scope_kind=kind_ AND e.scope_id=scope_ AND e.root_id=p_root
    AND c.ordinal=e.root_ordinal AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public');
END $member$;

-- Global query: no active page, embedding, model or title-generation request.
-- Empty browsing walks the one-row-per-scope order index; text queries use the
-- alias GIN index then deduplicate scopes before the bounded public page.
CREATE FUNCTION canonical_v4.named_search_topics(p_generation text,p_terms text[],p_after jsonb,p_limit integer)
RETURNS TABLE(scope_kind text,scope_id text,caption text,path text[],human boolean,root_ordinal text,occupied boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $search$
DECLARE q_ tsquery;human_ boolean;ordinal_ bigint;kind_ text;id_ text;
BEGIN
 IF p_terms IS NULL OR cardinality(p_terms)>8 OR cardinality(p_terms)>0 AND
    (array_ndims(p_terms)<>1 OR array_lower(p_terms,1)<>1) OR EXISTS(
      SELECT 1 FROM unnest(p_terms) term WHERE term IS NULL OR length(term) NOT BETWEEN 1 AND 64 OR term !~ '^[[:alnum:]]+$') OR
   p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN
  RAISE EXCEPTION 'Invalid topic query' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 IF p_after IS NOT NULL THEN
  IF jsonb_typeof(p_after)<>'object' THEN RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_after))<>4 OR
    jsonb_typeof(p_after->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_after->'id') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_after->'human') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_after->'ordinal') IS DISTINCT FROM 'string' OR
    p_after->>'ordinal' !~ '^(0|[1-9][0-9]{0,18})$' OR (p_after->>'ordinal')::numeric>9223372036854775807 OR
    p_after->>'kind' NOT IN ('page','named') OR canonical_v4.runtime_safe_text(p_after->>'id',128,false) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
  human_:=(p_after->>'human')::boolean;ordinal_:=(p_after->>'ordinal')::bigint;kind_:=p_after->>'kind';id_:=p_after->>'id';
 END IF;
 IF cardinality(p_terms)=0 THEN
  RETURN QUERY SELECT d.scope_kind,d.scope_id,d.caption,c.path,d.human,d.root_ordinal::text,c.caption_root_id IS NOT NULL
   FROM canonical_v4.named_topic_directory d JOIN canonical_v4.named_topic_cards c USING(generation,scope_kind,scope_id,caption)
   WHERE d.generation=p_generation AND (p_after IS NULL OR d.human<human_ OR d.human=human_ AND
    (d.root_ordinal<ordinal_ OR d.root_ordinal=ordinal_ AND (d.scope_kind,d.scope_id)>(kind_ COLLATE "C",id_ COLLATE "C")))
   ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind COLLATE "C",d.scope_id LIMIT p_limit;
 ELSE
  SELECT to_tsquery('simple',string_agg(quote_literal(term)||':*',' & ')) INTO q_ FROM unnest(p_terms) term;
  RETURN QUERY WITH matches AS MATERIALIZED (
    SELECT DISTINCT c.generation,c.scope_kind,c.scope_id FROM canonical_v4.named_topic_cards c WHERE c.generation=p_generation AND c.search@@q_)
   SELECT d.scope_kind,d.scope_id,d.caption,c.path,d.human,d.root_ordinal::text,c.caption_root_id IS NOT NULL
    FROM matches m JOIN canonical_v4.named_topic_directory d USING(generation,scope_kind,scope_id)
    JOIN canonical_v4.named_topic_cards c USING(generation,scope_kind,scope_id,caption)
    WHERE p_after IS NULL OR d.human<human_ OR d.human=human_ AND
     (d.root_ordinal<ordinal_ OR d.root_ordinal=ordinal_ AND (d.scope_kind,d.scope_id)>(kind_ COLLATE "C",id_ COLLATE "C"))
    ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind COLLATE "C",d.scope_id LIMIT p_limit;
 END IF;
END $search$;

-- Install-time backfill applies only to explicitly authored contexts from this
-- new component; it cannot manufacture topic choices for old schema17 roots.
INSERT INTO canonical_v4.named_feed_roots SELECT x.root_id,x.generation,x.scope_kind,x.scope_id,c.ordinal
 FROM canonical_v4.named_root_contexts x JOIN canonical_v4.contributions c ON c.id=x.root_id WHERE c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public';
INSERT INTO canonical_v4.named_feed_edges SELECT root_id,root_ordinal,generation,scope_kind,scope_id,'author' FROM canonical_v4.named_feed_roots;
INSERT INTO canonical_v4.named_feed_events(generation,kind,root_id,scope_kind,scope_id) SELECT generation,'root',root_id,scope_kind,scope_id FROM canonical_v4.named_feed_roots;
INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id,subject_id) SELECT generation,'subject','named',subject_id::text,subject_id FROM canonical_v4.named_subject_heads;

REVOKE ALL ON TABLE canonical_v4.named_feed_roots,canonical_v4.named_feed_edges,canonical_v4.named_feed_witnesses,canonical_v4.named_topic_cards,canonical_v4.named_topic_directory,canonical_v4.named_feed_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.named_feed_events_event_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_retire_ancestor_edge(),canonical_v4.named_schedule_root_feed(),canonical_v4.named_schedule_subject_feed(),
 canonical_v4.named_locked_feed_path(text,uuid),canonical_v4.named_refresh_topic_directory(text,text,text),canonical_v4.named_index_root_feed(text),canonical_v4.named_feed_tasks(text),canonical_v4.named_process_feed_event(text,bigint),
 canonical_v4.named_read_feed(text,text,text,bigint,integer),canonical_v4.named_root_in_scope(text,text,text),canonical_v4.named_search_topics(text,text[],jsonb,integer) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_feed_roots,canonical_v4.named_feed_edges,canonical_v4.named_feed_witnesses,canonical_v4.named_topic_cards,canonical_v4.named_topic_directory,canonical_v4.named_feed_events FROM %I',role_);
   EXECUTE format('REVOKE ALL ON SEQUENCE canonical_v4.named_feed_events_event_id_seq FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_retire_ancestor_edge(),canonical_v4.named_schedule_root_feed(),canonical_v4.named_schedule_subject_feed(),canonical_v4.named_locked_feed_path(text,uuid),canonical_v4.named_refresh_topic_directory(text,text,text),canonical_v4.named_index_root_feed(text),canonical_v4.named_feed_tasks(text),canonical_v4.named_process_feed_event(text,bigint),canonical_v4.named_read_feed(text,text,text,bigint,integer),canonical_v4.named_root_in_scope(text,text,text),canonical_v4.named_search_topics(text,text[],jsonb,integer) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_read_feed(text,text,text,bigint,integer),canonical_v4.named_root_in_scope(text,text,text),canonical_v4.named_search_topics(text,text[],jsonb,integer) TO murmingle_app;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_feed_tasks(text),canonical_v4.named_process_feed_event(text,bigint) TO murmingle_ingest_worker;END IF;
END $permissions$;

-- End component automatic-topic-feeds.sql

-- Component automatic-topic-public-reads.sql SHA256 8ac9916ec78204e42d50a90277015b9a6d8ef30b1a4eb7ed316f6b452d4c6685
-- Unregistered hierarchy18 public-read additions. No startup installation,
-- canonical destination rewrite, provider, model or new foreground mutex.
CREATE TABLE canonical_v4.named_feed_clock (
 singleton boolean PRIMARY KEY CHECK(singleton),revision bigint NOT NULL CHECK(revision>=0)
);
INSERT INTO canonical_v4.named_feed_clock VALUES(true,0);

-- Preferred editor scope can change without a canonical revision. Each change
-- appends its own opaque event, never updating a worker-owned clock row.
ALTER TABLE canonical_v4.named_feed_events DROP CONSTRAINT named_feed_events_kind_check;
ALTER TABLE canonical_v4.named_feed_events ADD CONSTRAINT named_feed_events_kind_check CHECK(kind IN ('root','scope','subject','context'));
CREATE FUNCTION canonical_v4.named_schedule_context_read()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $context$
DECLARE source_ text;generation_ text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.subject_id=OLD.subject_id THEN RETURN NEW;END IF;
 source_:=CASE WHEN TG_OP='DELETE' THEN OLD.source_id ELSE NEW.source_id END;
 SELECT generation INTO STRICT generation_ FROM canonical_v4.runtime_state WHERE singleton;
 INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id) VALUES(generation_,'context','page',source_);
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $context$;
CREATE TRIGGER named_schedule_context_read AFTER INSERT OR UPDATE OR DELETE ON canonical_v4.named_subject_selections
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_context_read();

-- Preserve the reviewed core byte-for-byte. Only this worker wrapper advances
-- the coalescing signature. Taking the clock first with SKIP LOCKED avoids a
-- worker waiting for a clock while holding a context/head needed by a writer.
ALTER FUNCTION canonical_v4.named_process_feed_event(text,bigint) RENAME TO named_process_feed_core;
CREATE FUNCTION canonical_v4.named_process_feed_event(p_generation text,p_event bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $process$
DECLARE outcome_ text;
BEGIN
 IF p_event IS NULL OR p_event<1 OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 PERFORM 1 FROM canonical_v4.named_feed_clock WHERE singleton FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RAISE EXCEPTION 'Feed clock busy' USING ERRCODE='P1301';END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.named_feed_events WHERE event_id=p_event AND generation=p_generation AND kind='context') THEN
  -- Independent event deletion cannot acknowledge later concurrent changes.
  DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event AND generation=p_generation AND kind='context';
  outcome_:='completed';
 ELSE outcome_:=canonical_v4.named_process_feed_core(p_generation,p_event);END IF;
 UPDATE canonical_v4.named_feed_clock SET revision=revision+1 WHERE singleton;
 RETURN outcome_;
END $process$;

CREATE FUNCTION canonical_v4.named_read_revision()
RETURNS TABLE(generation text,revision text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $revision$
 SELECT legacy.generation,encode(sha256(convert_to(jsonb_build_array(legacy.revision,c.revision,
  (SELECT max(event_id) FROM canonical_v4.named_feed_events WHERE generation=legacy.generation))::text,'UTF8')),'hex')
 FROM canonical_v4.semantic_read_revision() legacy CROSS JOIN canonical_v4.named_feed_clock c WHERE c.singleton;
$revision$;

-- One bounded read for a public root page. Explicit author titles survive Source
-- withdrawal; absent contexts remain absent, including every legacy root.
CREATE FUNCTION canonical_v4.named_read_root_contexts(p_generation text,p_roots text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $roots$
BEGIN
 IF p_roots IS NULL OR cardinality(p_roots)>100 OR cardinality(p_roots)>0 AND
    (array_ndims(p_roots)<>1 OR array_lower(p_roots,1)<>1) OR EXISTS(SELECT 1 FROM unnest(p_roots) id WHERE canonical_v4.runtime_safe_text(id,128,false) IS DISTINCT FROM true) OR
    cardinality(p_roots)<>(SELECT count(DISTINCT id) FROM unnest(p_roots) id) THEN
  RAISE EXCEPTION 'Invalid root context page' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('rootId',ctx.root_id,'scope',jsonb_build_object('kind',ctx.scope_kind,'id',ctx.scope_id,'caption',ctx.caption)) ORDER BY ctx.root_id)
  FROM canonical_v4.named_root_contexts ctx JOIN canonical_v4.contributions c ON c.id=ctx.root_id
  WHERE ctx.generation=p_generation AND ctx.root_id=ANY(p_roots) AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'),'[]'::jsonb);
END $roots$;

REVOKE ALL ON TABLE canonical_v4.named_feed_clock FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_schedule_context_read(),canonical_v4.named_process_feed_core(text,bigint),canonical_v4.named_process_feed_event(text,bigint),
 canonical_v4.named_read_revision(),canonical_v4.named_read_root_contexts(text,text[]) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_feed_clock FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_schedule_context_read(),canonical_v4.named_process_feed_core(text,bigint),canonical_v4.named_process_feed_event(text,bigint),canonical_v4.named_read_revision(),canonical_v4.named_read_root_contexts(text,text[]) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_read_revision(),canonical_v4.named_read_root_contexts(text,text[]) TO murmingle_app;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_process_feed_event(text,bigint) TO murmingle_ingest_worker;END IF;
END $permissions$;

-- End component automatic-topic-public-reads.sql

-- Component automatic-topic-replies.sql SHA256 aa76f1d3478d5287f45d48d8a9a5ce077cf60df81a5ca5a4168f98a902e4b140
-- Unregistered hierarchy18 reply membership. Install only after named feeds,
-- existing015/016 and the authored AI-root component. No canonical retargeting,
-- body/evidence/expiry/replay relaxation, head lock or independent app grant.
CREATE FUNCTION canonical_v4.named_reply_member(
 p_generation text,p_node text,p_root text,p_ordinal bigint,p_topic text,p_discussion text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $membership$
 SELECT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_snapshots s
  JOIN canonical_v4.semantic_root_edges e ON e.root_id=s.root_id AND e.root_ordinal=s.root_ordinal
  WHERE s.root_id=p_root AND s.generation=p_generation AND s.root_ordinal=p_ordinal
   AND s.topic_id=p_topic AND s.discussion_id=p_discussion AND e.node_id=p_node)
 OR EXISTS(SELECT 1 FROM canonical_v4.named_feed_edges e
  JOIN canonical_v4.named_root_contexts ctx ON ctx.root_id=e.root_id AND ctx.generation=e.generation
  JOIN canonical_v4.contributions c ON c.id=e.root_id AND c.ordinal=e.root_ordinal
  JOIN canonical_v4.discussions d ON d.id=c.discussion_id
  WHERE e.generation=p_generation AND e.root_id=p_root AND e.root_ordinal=p_ordinal
   AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
   AND c.discussion_id=p_discussion AND d.topic_id=p_topic
   AND (e.scope_kind='named' AND p_node='subject-'||e.scope_id OR e.scope_kind='page' AND p_node='page-'||e.scope_id));
$membership$;
REVOKE ALL ON FUNCTION canonical_v4.named_reply_member(text,text,text,bigint,text,text) FROM PUBLIC;
DO $permission$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_reply_member(text,text,text,bigint,text,text) FROM %I',role_);
  END IF;
 END LOOP;
END $permission$;

-- Exact predecessor inverse except this one membership predicate: migrations/015-semantic-reply-witness.sql
CREATE OR REPLACE FUNCTION canonical_v4.runtime_prepare_command(
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
  v_semantic_target jsonb;
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
  -- Optional semantic provenance is part of the exact command material, never
  -- a selector that rewrites the canonical destination or captured Source.
  IF (v_material->'command') ? 'semanticTarget' THEN
    v_semantic_target := v_material->'command'->'semanticTarget';
    IF p_command_type<>'reply' OR p_reply_to_id IS NULL OR
        jsonb_typeof(v_semantic_target) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid semantic reply witness' USING ERRCODE = 'P1003';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_semantic_target))<>4 OR
        NOT (v_semantic_target ?& ARRAY['nodeId','topicId','rootRevision','targetRevision']) OR
        jsonb_typeof(v_semantic_target->'nodeId') IS DISTINCT FROM 'string' OR
        jsonb_typeof(v_semantic_target->'topicId') IS DISTINCT FROM 'string' OR
        jsonb_typeof(v_semantic_target->'rootRevision') IS DISTINCT FROM 'number' OR
        jsonb_typeof(v_semantic_target->'targetRevision') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid semantic reply witness' USING ERRCODE = 'P1003';
    END IF;
    IF NOT canonical_v4.runtime_safe_text(v_semantic_target->>'nodeId',160,false) OR
        NOT canonical_v4.runtime_safe_text(v_semantic_target->>'topicId',128,false) OR
        (v_semantic_target->>'rootRevision')::numeric NOT BETWEEN 1 AND 9007199254740991 OR
        (v_semantic_target->>'targetRevision')::numeric NOT BETWEEN 1 AND 9007199254740991 OR
        trunc((v_semantic_target->>'rootRevision')::numeric)<>(v_semantic_target->>'rootRevision')::numeric OR
        trunc((v_semantic_target->>'targetRevision')::numeric)<>(v_semantic_target->>'targetRevision')::numeric THEN
      RAISE EXCEPTION 'Invalid semantic reply witness' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_set(v_expected_material,'{command,semanticTarget}',v_semantic_target);
  END IF;
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

  -- Exact receipt replay above precedes this freshness fence. Root/target
  -- locks already protect visibility and body revision counts. Source forget
  -- locks the root before deleting its historical snapshot/edges; no new Source
  -- or current-head locks are taken here, and retired matcher paths remain valid.
  IF v_semantic_target IS NOT NULL THEN
    IF v_root.withdrawn OR v_target.withdrawn OR
        v_root.visibility IS DISTINCT FROM 'local-public' OR v_target.visibility IS DISTINCT FROM 'local-public' OR
        v_root.revision_count IS DISTINCT FROM (v_semantic_target->>'rootRevision')::bigint OR
        v_target.revision_count IS DISTINCT FROM (v_semantic_target->>'targetRevision')::bigint OR
        v_topic.id IS DISTINCT FROM v_semantic_target->>'topicId' OR
        v_root.discussion_id IS DISTINCT FROM v_discussion.id OR v_target.discussion_id IS DISTINCT FROM v_discussion.id OR
        NOT canonical_v4.named_reply_member(p_generation,v_semantic_target->>'nodeId',v_root.id,v_root.ordinal,v_topic.id,v_discussion.id) THEN
      RAISE EXCEPTION 'Semantic reply target changed' USING ERRCODE = 'P1001';
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

-- Exact predecessor inverse except this one membership predicate: migrations/016-semantic-insight-reply.sql
CREATE OR REPLACE FUNCTION canonical_v4.runtime_lifecycle_command(
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
  p_generated_proof text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $runtime_lifecycle_command$
DECLARE
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
        NOT canonical_v4.named_reply_member(p_generation,v_semantic_target->>'nodeId',v_root.id,v_root.ordinal,v_topic.id,v_discussion.id) THEN
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
$runtime_lifecycle_command$;

-- Exact predecessor inverse except this one membership predicate: drafts/automatic-author-insight.sql
CREATE OR REPLACE FUNCTION canonical_v4.named_share_insight(
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
        NOT canonical_v4.named_reply_member(p_generation,v_semantic_target->>'nodeId',v_root.id,v_root.ordinal,v_topic.id,v_discussion.id) THEN
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

-- End component automatic-topic-replies.sql

-- Component automatic-page-topic-membership.sql SHA256 c45733ba665fbe0a18b907bccc890f03e5f918ea88455a1b8e29398d0584f604
-- Unregistered hierarchy18 continuation. Install after public read/reply ports.
-- Capture only future expressly posted page roots. Never infer old material
-- from today's Source, move canonical roots, rewrite captions or call a model.
CREATE TABLE canonical_v4.named_page_root_material (
 root_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.named_root_contexts(root_id) ON DELETE CASCADE,
 source_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 material_digest text COLLATE "C" NOT NULL CHECK(material_digest ~ '^[a-f0-9]{64}$')
);
CREATE INDEX named_page_material_source ON canonical_v4.named_page_root_material(source_id,root_id);

CREATE FUNCTION canonical_v4.named_capture_page_material()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $capture$
DECLARE digest_ text;
BEGIN
 IF NEW.scope_kind<>'page' THEN RETURN NEW;END IF;
 -- The private authored finalizer has already verified the exact scope and
 -- holds its Source/domain locks. This constant-sized trigger adds no head,
 -- clock, topic-wide cache or discovery lock to the foreground transaction.
 SELECT r.operation_digest INTO digest_ FROM canonical_v4.contributions c
  JOIN canonical_v4.sources s ON s.id=c.origin_source_id AND s.id=NEW.scope_id AND s.title=NEW.caption
  JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id AND r.operation_digest=s.payload::jsonb->>'operationDigest'
  JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
  WHERE c.id=NEW.root_id AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
   AND s.has_embedding AND s.provenance='owner-local-page-embedding/v1';
 IF NOT FOUND THEN RAISE EXCEPTION 'Page material unavailable at publication' USING ERRCODE='P1304';END IF;
 INSERT INTO canonical_v4.named_page_root_material VALUES(NEW.root_id,NEW.scope_id,digest_);
 RETURN NEW;
END $capture$;
CREATE TRIGGER named_capture_page_material AFTER INSERT ON canonical_v4.named_root_contexts
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_capture_page_material();

CREATE FUNCTION canonical_v4.named_retire_page_material()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $retire$
BEGIN
 DELETE FROM canonical_v4.named_feed_edges WHERE root_id=OLD.root_id AND basis='ancestor';
 RETURN OLD;
END $retire$;
CREATE TRIGGER named_retire_page_material AFTER DELETE ON canonical_v4.named_page_root_material
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_retire_page_material();

-- Activity and title have different witnesses. A page author has not expressly
-- selected the later subject's label, so its caption_root_id must stay NULL.
-- These rows rank existing membership and depend on its exact edge; deletion
-- immediately removes the occupied directory row and queues bounded repair.
CREATE TABLE canonical_v4.named_scope_activity (
 generation text COLLATE "C" NOT NULL,scope_kind text COLLATE "C" NOT NULL,scope_id text COLLATE "C" NOT NULL,
 root_id text COLLATE "C" NOT NULL,root_ordinal bigint NOT NULL,human boolean NOT NULL,
 PRIMARY KEY(generation,scope_kind,scope_id),UNIQUE(generation,scope_kind,scope_id,root_id),
 FOREIGN KEY(root_id,scope_kind,scope_id) REFERENCES canonical_v4.named_feed_edges(root_id,scope_kind,scope_id) ON DELETE CASCADE
);
CREATE INDEX named_scope_activity_root ON canonical_v4.named_scope_activity(root_id);
ALTER TABLE canonical_v4.named_topic_directory ADD COLUMN activity_root_id text COLLATE "C";
ALTER TABLE canonical_v4.named_topic_directory ADD CONSTRAINT named_directory_activity
 FOREIGN KEY(generation,scope_kind,scope_id,activity_root_id) REFERENCES canonical_v4.named_scope_activity(generation,scope_kind,scope_id,root_id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE FUNCTION canonical_v4.named_schedule_activity_repair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $repair$
BEGIN
 INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id) VALUES(OLD.generation,'scope',OLD.scope_kind,OLD.scope_id);
 RETURN OLD;
END $repair$;
CREATE TRIGGER named_schedule_activity_repair AFTER DELETE ON canonical_v4.named_scope_activity
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_activity_repair();

CREATE FUNCTION canonical_v4.named_note_scope_activity(p_generation text,p_kind text,p_scope text,p_root text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $activity$
 INSERT INTO canonical_v4.named_scope_activity(generation,scope_kind,scope_id,root_id,root_ordinal,human)
 SELECT e.generation,e.scope_kind,e.scope_id,c.id,c.ordinal,c.actor_type='human'
  FROM canonical_v4.named_feed_edges e JOIN canonical_v4.contributions c ON c.id=e.root_id AND c.ordinal=e.root_ordinal
  WHERE e.generation=p_generation AND e.scope_kind=p_kind AND e.scope_id=p_scope AND e.root_id=p_root
   AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
 ON CONFLICT(generation,scope_kind,scope_id) DO UPDATE SET root_id=EXCLUDED.root_id,root_ordinal=EXCLUDED.root_ordinal,human=EXCLUDED.human
  WHERE EXCLUDED.human>named_scope_activity.human OR EXCLUDED.human=named_scope_activity.human AND EXCLUDED.root_ordinal>named_scope_activity.root_ordinal;
$activity$;

CREATE OR REPLACE FUNCTION canonical_v4.named_refresh_topic_directory(p_generation text,p_kind text,p_scope text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $directory$
 INSERT INTO canonical_v4.named_topic_directory(generation,scope_kind,scope_id,caption,human,root_ordinal,activity_root_id)
 SELECT c.generation,c.scope_kind,c.scope_id,c.caption,coalesce(a.human,false),coalesce(a.root_ordinal,0),a.root_id
  FROM canonical_v4.named_topic_cards c LEFT JOIN canonical_v4.named_scope_activity a USING(generation,scope_kind,scope_id)
  WHERE c.generation=p_generation AND c.scope_kind=p_kind AND c.scope_id=p_scope ORDER BY c.human DESC,c.root_ordinal DESC,c.caption LIMIT 1
 ON CONFLICT(generation,scope_kind,scope_id) DO UPDATE SET caption=EXCLUDED.caption,human=EXCLUDED.human,root_ordinal=EXCLUDED.root_ordinal,activity_root_id=EXCLUDED.activity_root_id;
$directory$;

-- Offline install backfill uses only already proven feed membership, not new
-- page-material witnesses or manufactured author choices for historical posts.
INSERT INTO canonical_v4.named_scope_activity(generation,scope_kind,scope_id,root_id,root_ordinal,human)
 SELECT DISTINCT ON(e.generation,e.scope_kind,e.scope_id) e.generation,e.scope_kind,e.scope_id,c.id,c.ordinal,c.actor_type='human'
 FROM canonical_v4.named_feed_edges e JOIN canonical_v4.contributions c ON c.id=e.root_id AND c.ordinal=e.root_ordinal
 WHERE c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
 ORDER BY e.generation,e.scope_kind,e.scope_id,(c.actor_type='human') DESC,c.ordinal DESC;
UPDATE canonical_v4.named_topic_directory d SET human=a.human,root_ordinal=a.root_ordinal,activity_root_id=a.root_id
 FROM canonical_v4.named_scope_activity a WHERE (d.generation,d.scope_kind,d.scope_id)=(a.generation,a.scope_kind,a.scope_id);
UPDATE canonical_v4.named_topic_directory SET human=false,root_ordinal=0 WHERE activity_root_id IS NULL;

-- Current-source eligibility never changes the explicitly posted root scope.
CREATE OR REPLACE FUNCTION canonical_v4.named_index_root_feed(p_root text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $index$
DECLARE root_ canonical_v4.named_feed_roots%ROWTYPE;caption_ text;human_ boolean;ids_ uuid[];path_ text[];
 n_ integer:=0;start_ integer:=2;chosen_ uuid;derived_path_ text[];head_ record;
BEGIN
 SELECT f.* INTO root_ FROM canonical_v4.named_feed_roots f JOIN canonical_v4.named_root_contexts ctx ON ctx.root_id=f.root_id
  WHERE f.root_id=p_root FOR KEY SHARE OF ctx SKIP LOCKED;
 IF NOT FOUND THEN RETURN NOT EXISTS(SELECT 1 FROM canonical_v4.named_feed_roots WHERE root_id=p_root);END IF;
 SELECT ctx.caption,c.actor_type='human' INTO caption_,human_ FROM canonical_v4.named_root_contexts ctx
  JOIN canonical_v4.contributions c ON c.id=ctx.root_id WHERE ctx.root_id=p_root AND NOT c.withdrawn AND c.visibility='local-public';
 IF NOT FOUND THEN RETURN true;END IF;
 path_:=ARRAY[CASE WHEN root_.scope_kind='named' THEN 'subject-' ELSE 'page-' END||root_.scope_id];
 ids_:=ARRAY[]::uuid[];
 IF root_.scope_kind='page' THEN
  -- PAGE MATERIAL: only the exact Source material captured at publication may
  -- contribute a newly discovered association. Legacy roots have no witness.
  SELECT h.subject_id INTO chosen_ FROM canonical_v4.named_page_root_material w
   JOIN canonical_v4.sources s ON s.id=w.source_id AND s.id=root_.scope_id AND s.has_embedding AND s.provenance='owner-local-page-embedding/v1'
   JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id AND r.operation_digest=w.material_digest AND r.operation_digest=s.payload::jsonb->>'operationDigest'
   JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
   JOIN canonical_v4.named_subject_selections sel ON sel.source_id=s.id
   JOIN canonical_v4.named_subject_members m ON m.source_id=s.id AND m.subject_id=sel.subject_id AND m.source_version=s.write_version AND m.operation_id=s.operation_id AND m.operation_digest=r.operation_digest AND m.source_stamp=st.stamp
   JOIN canonical_v4.named_subject_heads h ON h.subject_id=m.subject_id AND h.generation=root_.generation
   JOIN canonical_v4.named_subject_ids identity_ ON identity_.id=h.subject_id AND identity_.revision=h.revision
   JOIN canonical_v4.semantic_installation installation_ ON installation_.singleton AND installation_.matcher_hash=h.matcher_hash
   WHERE w.root_id=p_root;
  IF FOUND THEN
   ids_:=canonical_v4.named_locked_feed_path(root_.generation,chosen_);IF ids_ IS NULL THEN RETURN false;END IF;
  END IF;
  start_:=1;
 ELSIF root_.scope_kind='named' THEN
  ids_:=canonical_v4.named_locked_feed_path(root_.generation,root_.scope_id::uuid);
  IF ids_ IS NULL THEN RETURN false;END IF;
  IF cardinality(ids_)>0 THEN
   SELECT array_agg('subject-'||v::text ORDER BY ord DESC) INTO path_ FROM unnest(ids_) WITH ORDINALITY values_(v,ord);
  END IF;
 END IF;
 -- DELTA EDGES: stable membership is not deleted/reinserted. Its activity
 -- witness must not disappear and enqueue an endless repair of itself.
 DELETE FROM canonical_v4.named_feed_edges WHERE root_id=p_root AND basis='ancestor'
  AND (scope_kind<>'named' OR NOT(scope_id=ANY(coalesce(ids_[start_:cardinality(ids_)]::text[],ARRAY[]::text[]))));
 IF cardinality(ids_)>=start_ THEN
  FOR n_ IN start_..cardinality(ids_) LOOP
   INSERT INTO canonical_v4.named_feed_edges VALUES(p_root,root_.root_ordinal,root_.generation,'named',ids_[n_]::text,'ancestor')
    ON CONFLICT(root_id,scope_kind,scope_id) DO NOTHING;
   INSERT INTO canonical_v4.named_feed_witnesses SELECT p_root,'named',ids_[n_]::text,v FROM unnest(ids_[1:n_]) v
    ON CONFLICT(root_id,scope_kind,scope_id,head_id) DO NOTHING;
   PERFORM canonical_v4.named_note_scope_activity(root_.generation,'named',ids_[n_]::text,p_root);
   SELECT label INTO STRICT head_ FROM canonical_v4.named_subject_heads WHERE subject_id=ids_[n_];
   SELECT array_agg('subject-'||v::text ORDER BY ord DESC) INTO derived_path_ FROM unnest(ids_[n_:cardinality(ids_)]) WITH ORDINALITY x(v,ord);
   INSERT INTO canonical_v4.named_topic_cards(generation,scope_kind,scope_id,caption,caption_root_id,head_id,path,human,root_ordinal)
    VALUES(root_.generation,'named',ids_[n_]::text,head_.label,NULL,ids_[n_],derived_path_,false,0)
    ON CONFLICT(generation,scope_kind,scope_id,caption) DO UPDATE SET head_id=EXCLUDED.head_id,path=EXCLUDED.path;
   PERFORM canonical_v4.named_refresh_topic_directory(root_.generation,'named',ids_[n_]::text);
  END LOOP;
 END IF;
 -- Caption aliases are per distinct expressly posted title, not per post. Both
 -- keys are bounded text; deletion of its representative erases the cached title.
 INSERT INTO canonical_v4.named_topic_cards(generation,scope_kind,scope_id,caption,caption_root_id,head_id,path,human,root_ordinal)
  VALUES(root_.generation,root_.scope_kind,root_.scope_id,caption_,p_root,CASE WHEN root_.scope_kind='named' AND cardinality(ids_)>0 THEN ids_[1] ELSE NULL END,path_,human_,root_.root_ordinal)
 ON CONFLICT(generation,scope_kind,scope_id,caption) DO UPDATE SET
  caption_root_id=CASE WHEN named_topic_cards.caption_root_id IS NULL OR EXCLUDED.human AND NOT named_topic_cards.human THEN EXCLUDED.caption_root_id ELSE named_topic_cards.caption_root_id END,
  head_id=EXCLUDED.head_id,path=EXCLUDED.path,human=named_topic_cards.human OR EXCLUDED.human,
  root_ordinal=greatest(named_topic_cards.root_ordinal,EXCLUDED.root_ordinal);
 PERFORM canonical_v4.named_note_scope_activity(root_.generation,root_.scope_kind,root_.scope_id,p_root);
 PERFORM canonical_v4.named_refresh_topic_directory(root_.generation,root_.scope_kind,root_.scope_id);
 RETURN true;
END $index$;

-- Scope repair walks actual current direct/derived members, in the old16-row bound.
CREATE OR REPLACE FUNCTION canonical_v4.named_process_feed_core(p_generation text,p_event bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $process$
DECLARE event_ canonical_v4.named_feed_events%ROWTYPE;head_ canonical_v4.named_subject_heads%ROWTYPE;
 r_ record;count_ integer:=0;last_ bigint;last_child_ uuid;ids_ uuid[];path_ text[];ok_ boolean;
BEGIN
 IF p_event IS NULL OR p_event<1 OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 SELECT * INTO event_ FROM canonical_v4.named_feed_events WHERE event_id=p_event AND generation=p_generation FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN 'retired';END IF;
 IF event_.kind='root' THEN
  ok_:=canonical_v4.named_index_root_feed(event_.root_id);
  IF ok_ THEN DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event;RETURN 'completed';END IF;
  UPDATE canonical_v4.named_feed_events SET retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';
 END IF;
 IF event_.upper_root IS NULL THEN
  SELECT coalesce(max(root_ordinal),-1) INTO event_.upper_root FROM canonical_v4.named_feed_edges
   WHERE generation=p_generation AND scope_kind=event_.scope_kind AND scope_id=event_.scope_id;
  UPDATE canonical_v4.named_feed_events SET upper_root=event_.upper_root WHERE event_id=p_event;
 END IF;
 IF NOT event_.roots_done THEN
  FOR r_ IN SELECT root_id,root_ordinal FROM canonical_v4.named_feed_edges
    WHERE generation=p_generation AND scope_kind=event_.scope_kind AND scope_id=event_.scope_id
      AND root_ordinal>event_.after_root AND root_ordinal<=event_.upper_root ORDER BY root_ordinal,root_id LIMIT 16 LOOP
   PERFORM 1 FROM canonical_v4.named_root_contexts WHERE root_id=r_.root_id FOR KEY SHARE SKIP LOCKED;
   IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=r_.root_id) THEN
    UPDATE canonical_v4.named_feed_events SET after_root=coalesce(last_,after_root),retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';
   END IF;
   IF NOT FOUND THEN last_:=r_.root_ordinal;count_:=count_+1;CONTINUE;END IF;
   INSERT INTO canonical_v4.named_feed_events(generation,kind,root_id,scope_kind,scope_id)
    VALUES(p_generation,'root',r_.root_id,event_.scope_kind,event_.scope_id);
   count_:=count_+1;last_:=r_.root_ordinal;
  END LOOP;
  UPDATE canonical_v4.named_feed_events SET after_root=coalesce(last_,after_root),roots_done=count_<16 WHERE event_id=p_event;
  IF count_=16 THEN RETURN 'advanced';END IF;
 END IF;
 IF event_.kind='subject' THEN
  ids_:=canonical_v4.named_locked_feed_path(p_generation,event_.subject_id);
  IF ids_ IS NULL THEN
   UPDATE canonical_v4.named_feed_events SET retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';END IF;
  IF cardinality(ids_)=0 THEN DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event;RETURN 'retired';END IF;
  SELECT * INTO STRICT head_ FROM canonical_v4.named_subject_heads WHERE subject_id=event_.subject_id;
  SELECT array_agg('subject-'||v::text ORDER BY ord DESC) INTO path_ FROM unnest(ids_) WITH ORDINALITY values_(v,ord);
  -- The head row's label is a derived public basis. Its FK removes this alias
  -- atomically when the Source withdraws; an authored alias is repaired by events.
  INSERT INTO canonical_v4.named_topic_cards(generation,scope_kind,scope_id,caption,caption_root_id,head_id,path,human,root_ordinal)
   VALUES(p_generation,'named',head_.subject_id::text,head_.label,NULL,head_.subject_id,path_,false,0)
   ON CONFLICT(generation,scope_kind,scope_id,caption) DO UPDATE SET head_id=EXCLUDED.head_id,path=EXCLUDED.path;
  PERFORM canonical_v4.named_refresh_topic_directory(p_generation,'named',head_.subject_id::text);
  count_:=0;
  FOR r_ IN SELECT subject_id FROM canonical_v4.named_subject_heads WHERE parent_id=event_.subject_id
    AND (event_.after_child IS NULL OR subject_id>event_.after_child) ORDER BY subject_id LIMIT 16 LOOP
   PERFORM 1 FROM canonical_v4.named_subject_heads WHERE subject_id=r_.subject_id FOR KEY SHARE SKIP LOCKED;
   IF NOT FOUND AND EXISTS(SELECT 1 FROM canonical_v4.named_subject_heads WHERE subject_id=r_.subject_id) THEN
    UPDATE canonical_v4.named_feed_events SET after_child=coalesce(last_child_,after_child),retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';
   END IF;
   IF NOT FOUND THEN last_child_:=r_.subject_id;count_:=count_+1;CONTINUE;END IF;
   INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id,subject_id)
    VALUES(p_generation,'subject','named',r_.subject_id::text,r_.subject_id);
   count_:=count_+1;last_child_:=r_.subject_id;
  END LOOP;
  IF count_=16 THEN UPDATE canonical_v4.named_feed_events SET after_child=last_child_ WHERE event_id=p_event;RETURN 'advanced';END IF;
 ELSIF event_.scope_kind='named' THEN
  -- A withdrawn representative can also have been the head-label alias. Requeue
  -- that still-live head without resurrecting any removed authored caption.
  PERFORM 1 FROM canonical_v4.named_subject_heads WHERE subject_id=event_.scope_id::uuid AND generation=p_generation FOR KEY SHARE SKIP LOCKED;
  IF FOUND THEN INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id,subject_id)
   VALUES(p_generation,'subject','named',event_.scope_id,event_.scope_id::uuid);
  ELSIF EXISTS(SELECT 1 FROM canonical_v4.named_subject_heads WHERE subject_id=event_.scope_id::uuid AND generation=p_generation) THEN
   UPDATE canonical_v4.named_feed_events SET retry_after=clock_timestamp()+interval '200 milliseconds' WHERE event_id=p_event;RETURN 'busy';END IF;
 END IF;
 PERFORM canonical_v4.named_refresh_topic_directory(p_generation,event_.scope_kind,event_.scope_id);
 DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event;RETURN 'completed';
END $process$;

CREATE OR REPLACE FUNCTION canonical_v4.named_process_feed_event(p_generation text,p_event bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $process$
DECLARE outcome_ text;
BEGIN
 IF p_event IS NULL OR p_event<1 OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 PERFORM 1 FROM canonical_v4.named_feed_clock WHERE singleton FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RAISE EXCEPTION 'Feed clock busy' USING ERRCODE='P1301';END IF;
 -- Context events now repair the bounded original page-root cohort too.
 outcome_:=canonical_v4.named_process_feed_core(p_generation,p_event);
 UPDATE canonical_v4.named_feed_clock SET revision=revision+1 WHERE singleton;
 RETURN outcome_;
END $process$;

-- Search occupation is a membership witness, separate from the caption witness.
CREATE OR REPLACE FUNCTION canonical_v4.named_search_topics(p_generation text,p_terms text[],p_after jsonb,p_limit integer)
RETURNS TABLE(scope_kind text,scope_id text,caption text,path text[],human boolean,root_ordinal text,occupied boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $search$
DECLARE q_ tsquery;human_ boolean;ordinal_ bigint;kind_ text;id_ text;
BEGIN
 IF p_terms IS NULL OR cardinality(p_terms)>8 OR cardinality(p_terms)>0 AND
    (array_ndims(p_terms)<>1 OR array_lower(p_terms,1)<>1) OR EXISTS(
      SELECT 1 FROM unnest(p_terms) term WHERE term IS NULL OR length(term) NOT BETWEEN 1 AND 64 OR term !~ '^[[:alnum:]]+$') OR
   p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN
  RAISE EXCEPTION 'Invalid topic query' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 IF p_after IS NOT NULL THEN
  IF jsonb_typeof(p_after)<>'object' THEN RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_after))<>4 OR
    jsonb_typeof(p_after->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_after->'id') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_after->'human') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_after->'ordinal') IS DISTINCT FROM 'string' OR
    p_after->>'ordinal' !~ '^(0|[1-9][0-9]{0,18})$' OR (p_after->>'ordinal')::numeric>9223372036854775807 OR
    p_after->>'kind' NOT IN ('page','named') OR canonical_v4.runtime_safe_text(p_after->>'id',128,false) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
  human_:=(p_after->>'human')::boolean;ordinal_:=(p_after->>'ordinal')::bigint;kind_:=p_after->>'kind';id_:=p_after->>'id';
 END IF;
 IF cardinality(p_terms)=0 THEN
  RETURN QUERY SELECT d.scope_kind,d.scope_id,d.caption,c.path,d.human,d.root_ordinal::text,d.activity_root_id IS NOT NULL
   FROM canonical_v4.named_topic_directory d JOIN canonical_v4.named_topic_cards c USING(generation,scope_kind,scope_id,caption)
   WHERE d.generation=p_generation AND (p_after IS NULL OR d.human<human_ OR d.human=human_ AND
    (d.root_ordinal<ordinal_ OR d.root_ordinal=ordinal_ AND (d.scope_kind,d.scope_id)>(kind_ COLLATE "C",id_ COLLATE "C")))
   ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind COLLATE "C",d.scope_id LIMIT p_limit;
 ELSE
  SELECT to_tsquery('simple',string_agg(quote_literal(term)||':*',' & ')) INTO q_ FROM unnest(p_terms) term;
  RETURN QUERY WITH matches AS MATERIALIZED (
    SELECT DISTINCT ON(c.generation,c.scope_kind,c.scope_id) c.generation,c.scope_kind,c.scope_id,c.caption
     FROM canonical_v4.named_topic_cards c WHERE c.generation=p_generation AND c.search@@q_
     ORDER BY c.generation,c.scope_kind,c.scope_id,c.human DESC,c.root_ordinal DESC,c.caption)
   SELECT d.scope_kind,d.scope_id,m.caption,c.path,d.human,d.root_ordinal::text,d.activity_root_id IS NOT NULL
    FROM matches m JOIN canonical_v4.named_topic_directory d USING(generation,scope_kind,scope_id)
    JOIN canonical_v4.named_topic_cards c ON (c.generation,c.scope_kind,c.scope_id,c.caption)=(m.generation,m.scope_kind,m.scope_id,m.caption)
    WHERE p_after IS NULL OR d.human<human_ OR d.human=human_ AND
     (d.root_ordinal<ordinal_ OR d.root_ordinal=ordinal_ AND (d.scope_kind,d.scope_id)>(kind_ COLLATE "C",id_ COLLATE "C"))
    ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind COLLATE "C",d.scope_id LIMIT p_limit;
 END IF;
END $search$;

REVOKE ALL ON TABLE canonical_v4.named_page_root_material,canonical_v4.named_scope_activity FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_capture_page_material(),canonical_v4.named_retire_page_material(),canonical_v4.named_schedule_activity_repair(),canonical_v4.named_note_scope_activity(text,text,text,text) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_page_root_material,canonical_v4.named_scope_activity FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_capture_page_material(),canonical_v4.named_retire_page_material(),canonical_v4.named_schedule_activity_repair(),canonical_v4.named_note_scope_activity(text,text,text,text) FROM %I',role_);
  END IF;
 END LOOP;
END $permissions$;

-- End component automatic-page-topic-membership.sql

-- Component published-topic-evidence.sql SHA256 eb6e777875433c9e1804e9aa2f50154cbb315cdb7a6dfa7ec1df220c5a30e1d9
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
  'focusKey',q.focus_key,'inputHash',q.input_hash,'vector',q.values_double,'identityRevision',q.revision::text,
  'headPresent',EXISTS(SELECT 1 FROM canonical_v4.named_subject_heads h WHERE h.subject_id=q.scope_id::uuid)) ORDER BY q.scope_id),'[]'::jsonb) INTO raw_count_,result_
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

-- End component published-topic-evidence.sql

-- Component published-topic-recovery.sql SHA256 3d8f5608a7826bf60d22db91acd693af841d8f541c00c5e5307f8b390d5440f9
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

-- End component published-topic-recovery.sql

-- Component single-source-topic-match.sql SHA256 f1c6a0231afe1af9e07ce77a436e23ee06e8a949d8e9861519d5286676f93333
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

-- End component single-source-topic-match.sql

-- Component named-owner-grouping.sql SHA256 8eadff3a3776077f6a9b7094557798be1e1a47b9643f300c2b8414f0ac12bc3d
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

-- End component named-owner-grouping.sql

-- Component unified-topic-search.sql SHA256 e288026b6d2325bb5eff1e01a9e6c93224b635c0e6f8c0a94e78b51ebd540658
-- Explicit hierarchy18 component; import/startup do not install it. Only public
-- root identities, public canonical titles and installed taxonomy labels enter
-- this index. No Source URL/title/body/vector or embedding work is required.
-- Install after authored/public feeds and automatic-page-topic-membership.sql.
CREATE TABLE canonical_v4.unified_search_roots (
 generation text COLLATE "C" NOT NULL,scope_kind text COLLATE "C" NOT NULL CHECK(scope_kind IN ('fixed','legacy')),
 scope_id text COLLATE "C" NOT NULL,root_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.contributions(id) ON DELETE CASCADE,
 root_ordinal bigint NOT NULL CHECK(root_ordinal>=0),human boolean NOT NULL,
 fixed_root text COLLATE "C",fixed_node text COLLATE "C",
 PRIMARY KEY(generation,scope_kind,scope_id,root_id),
 FOREIGN KEY(fixed_root,fixed_node) REFERENCES canonical_v4.semantic_root_edges(root_id,node_id) ON DELETE CASCADE,
 CHECK((scope_kind='fixed' AND fixed_root IS NOT NULL AND fixed_node IS NOT NULL AND fixed_root=root_id AND fixed_node=scope_id) OR
       (scope_kind='legacy' AND fixed_root IS NULL AND fixed_node IS NULL))
);
CREATE INDEX unified_search_root_order ON canonical_v4.unified_search_roots(generation,scope_kind,scope_id,human DESC,root_ordinal DESC,root_id);
CREATE INDEX unified_search_root_identity ON canonical_v4.unified_search_roots(root_id);
CREATE TABLE canonical_v4.unified_search_directory (
 generation text COLLATE "C" NOT NULL,scope_kind text COLLATE "C" NOT NULL,scope_id text COLLATE "C" NOT NULL,
 root_id text COLLATE "C" NOT NULL,caption text NOT NULL CHECK(canonical_v4.runtime_safe_text(caption,200,false)),
 human boolean NOT NULL,root_ordinal bigint NOT NULL CHECK(root_ordinal>=0),
 search tsvector GENERATED ALWAYS AS(to_tsvector('simple'::regconfig,normalize(caption,NFKC))) STORED,
 PRIMARY KEY(generation,scope_kind,scope_id),
 FOREIGN KEY(generation,scope_kind,scope_id,root_id) REFERENCES canonical_v4.unified_search_roots ON DELETE CASCADE
);
CREATE INDEX unified_search_directory_order ON canonical_v4.unified_search_directory(generation,scope_kind,human DESC,root_ordinal DESC,scope_id);
CREATE INDEX unified_search_directory_terms ON canonical_v4.unified_search_directory USING gin(search) WHERE scope_kind='legacy';
CREATE TABLE canonical_v4.unified_search_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,generation text COLLATE "C" NOT NULL,
 root_id text COLLATE "C",scope_kind text COLLATE "C",scope_id text COLLATE "C",
 CHECK((root_id IS NOT NULL AND scope_kind IS NULL AND scope_id IS NULL) OR
       (root_id IS NULL AND scope_kind IS NOT NULL AND scope_kind IN ('fixed','legacy') AND scope_id IS NOT NULL))
);
CREATE INDEX unified_search_event_ready ON canonical_v4.unified_search_events(generation,event_id);
CREATE TABLE canonical_v4.unified_search_clock(singleton boolean PRIMARY KEY CHECK(singleton),revision bigint NOT NULL CHECK(revision>=0));
INSERT INTO canonical_v4.unified_search_clock VALUES(true,0);

-- Foreground hooks append independent work. They never update a shared topic
-- directory/counter or take the worker clock. Deletion cascades remove witnesses
-- immediately, even before a worker repairs the next public browse representative.
CREATE FUNCTION canonical_v4.unified_schedule_search() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $schedule$
DECLARE generation_ text;root_ text;
BEGIN
 SELECT generation INTO STRICT generation_ FROM canonical_v4.runtime_state WHERE singleton;
 IF TG_TABLE_NAME='unified_search_roots' THEN
  INSERT INTO canonical_v4.unified_search_events(generation,scope_kind,scope_id) VALUES(OLD.generation,OLD.scope_kind,OLD.scope_id);
 ELSIF TG_TABLE_NAME='topics' THEN
  INSERT INTO canonical_v4.unified_search_events(generation,scope_kind,scope_id) VALUES(generation_,'legacy',NEW.id);
 ELSE
  IF TG_TABLE_NAME='contributions' THEN
   IF TG_OP='DELETE' THEN IF OLD.root_id IS NOT NULL THEN RETURN OLD;END IF;root_:=OLD.id;
   ELSE IF NEW.root_id IS NOT NULL THEN RETURN NEW;END IF;root_:=NEW.id;END IF;
  ELSE root_:=CASE WHEN TG_OP='DELETE' THEN OLD.root_id ELSE NEW.root_id END;END IF;
  INSERT INTO canonical_v4.unified_search_events(generation,root_id) VALUES(generation_,root_);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $schedule$;
CREATE TRIGGER unified_search_root_change AFTER INSERT OR UPDATE OF withdrawn,visibility ON canonical_v4.contributions
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.unified_schedule_search();
CREATE TRIGGER unified_search_root_delete BEFORE DELETE ON canonical_v4.contributions
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.unified_schedule_search();
CREATE TRIGGER unified_search_static_change AFTER INSERT OR DELETE ON canonical_v4.semantic_root_edges
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.unified_schedule_search();
CREATE TRIGGER unified_search_authored_change AFTER INSERT OR DELETE ON canonical_v4.named_root_contexts
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.unified_schedule_search();
CREATE TRIGGER unified_search_caption_change AFTER UPDATE OF title ON canonical_v4.topics
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.unified_schedule_search();
CREATE TRIGGER unified_search_repair_deleted AFTER DELETE ON canonical_v4.unified_search_roots
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.unified_schedule_search();
-- One-time migration seed scans public roots, not the crawled Source catalog.
-- Each later worker turn handles <=8 events, each root <=8 installed ancestors.
INSERT INTO canonical_v4.unified_search_events(generation,root_id)
 SELECT r.generation,c.id FROM canonical_v4.contributions c CROSS JOIN canonical_v4.runtime_state r
 WHERE r.singleton AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public';

CREATE FUNCTION canonical_v4.unified_public_label(p_node text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $label$
 SELECT coalesce((SELECT label FROM (VALUES
 ('business','Business'),('cooking','Cooking'),('culture','Culture'),('education','Education'),('games','Games'),
 ('geography','Geography'),('health','Health'),('history','History'),('ideas-beliefs','Ideas and beliefs'),('languages','Languages'),
 ('nature','Nature'),('science','Science'),('society','Society'),('sports','Sports'),('technology','Technology'),('vehicles','Vehicles'),
 ('video-games','Video games'),('gta','Grand Theft Auto (GTA)'),('animals','Animals'),('koalas','Koalas')) labels(node,label)
 WHERE node=p_node),p_node);
$label$;
CREATE FUNCTION canonical_v4.unified_search_tasks(p_generation text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $tasks$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Search generation changed' USING ERRCODE='P1301';END IF;
 RETURN coalesce((SELECT jsonb_agg(e.event_id::text ORDER BY e.event_id) FROM (
  SELECT event_id FROM canonical_v4.unified_search_events WHERE generation=p_generation ORDER BY event_id LIMIT 8)e),'[]'::jsonb);
END $tasks$;
CREATE FUNCTION canonical_v4.unified_process_search_event(p_generation text,p_event bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $process$
DECLARE e_ canonical_v4.unified_search_events%ROWTYPE;root_ record;winner_ record;edge_ record;n_ integer:=0;
BEGIN
 IF p_event IS NULL OR p_event<1 OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Search generation changed' USING ERRCODE='P1301';END IF;
 PERFORM 1 FROM canonical_v4.unified_search_clock WHERE singleton FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN 'busy';END IF;
 SELECT * INTO e_ FROM canonical_v4.unified_search_events WHERE generation=p_generation AND event_id=p_event FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN 'retired';END IF;
 IF e_.root_id IS NOT NULL THEN
  DELETE FROM canonical_v4.unified_search_roots WHERE root_id=e_.root_id;
  SELECT c.id,c.ordinal,c.actor_type,d.topic_id INTO root_ FROM canonical_v4.contributions c
   JOIN canonical_v4.discussions d ON d.id=c.discussion_id
   WHERE c.id=e_.root_id AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public';
  IF FOUND THEN
   IF NOT EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=root_.id) AND
      NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_edges WHERE root_id=root_.id) THEN
    INSERT INTO canonical_v4.unified_search_roots VALUES(p_generation,'legacy',root_.topic_id,root_.id,root_.ordinal,root_.actor_type='human',NULL,NULL);
    INSERT INTO canonical_v4.unified_search_events(generation,scope_kind,scope_id) VALUES(p_generation,'legacy',root_.topic_id);
   END IF;
   FOR edge_ IN SELECT node_id FROM canonical_v4.semantic_root_edges WHERE root_id=root_.id ORDER BY node_id LIMIT 9 LOOP
    n_:=n_+1;IF n_>8 THEN RAISE EXCEPTION 'Search ancestry capacity' USING ERRCODE='P1304';END IF;
    INSERT INTO canonical_v4.unified_search_roots VALUES(p_generation,'fixed',edge_.node_id,root_.id,root_.ordinal,root_.actor_type='human',root_.id,edge_.node_id);
    INSERT INTO canonical_v4.unified_search_events(generation,scope_kind,scope_id) VALUES(p_generation,'fixed',edge_.node_id);
   END LOOP;
  END IF;
 ELSE
  DELETE FROM canonical_v4.unified_search_directory WHERE generation=p_generation AND scope_kind=e_.scope_kind AND scope_id=e_.scope_id;
  WITH candidates AS MATERIALIZED(SELECT s.* FROM canonical_v4.unified_search_roots s
   WHERE s.generation=p_generation AND s.scope_kind=e_.scope_kind AND s.scope_id=e_.scope_id
   ORDER BY s.human DESC,s.root_ordinal DESC,s.root_id LIMIT 8)
  SELECT s.root_id,s.human,s.root_ordinal,CASE WHEN s.scope_kind='fixed' THEN canonical_v4.unified_public_label(s.scope_id) ELSE t.title END caption
   INTO winner_ FROM candidates s JOIN canonical_v4.contributions c ON c.id=s.root_id
   JOIN canonical_v4.discussions d ON d.id=c.discussion_id JOIN canonical_v4.topics t ON t.id=d.topic_id
   WHERE c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.ordinal=s.root_ordinal
    AND (s.scope_kind='fixed' OR (d.topic_id=s.scope_id AND NOT EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_edges WHERE root_id=c.id)))
   ORDER BY s.human DESC,s.root_ordinal DESC,s.root_id LIMIT 1;
  IF FOUND AND canonical_v4.runtime_safe_text(winner_.caption,200,false) THEN
   INSERT INTO canonical_v4.unified_search_directory VALUES(p_generation,e_.scope_kind,e_.scope_id,winner_.root_id,winner_.caption,winner_.human,winner_.root_ordinal);
  END IF;
 END IF;
 DELETE FROM canonical_v4.unified_search_events WHERE event_id=p_event;
 UPDATE canonical_v4.unified_search_clock SET revision=revision+1 WHERE singleton;
 RETURN 'completed';
END $process$;

CREATE FUNCTION canonical_v4.unified_after(p_human boolean,p_ordinal bigint,p_kind text,p_id text,p_after jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $after$
 SELECT p_after IS NULL OR p_human<(p_after->>'human')::boolean OR p_human=(p_after->>'human')::boolean AND
  (p_ordinal<(p_after->>'ordinal')::bigint OR p_ordinal=(p_after->>'ordinal')::bigint AND
   (p_kind COLLATE "C",p_id COLLATE "C")>(p_after->>'kind' COLLATE "C",p_after->>'id' COLLATE "C"));
$after$;
CREATE FUNCTION canonical_v4.unified_search_topics(p_generation text,p_terms text[],p_after jsonb,p_limit integer)
RETURNS TABLE(scope_kind text,scope_id text,caption text,path text[],human boolean,root_ordinal text,occupied boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $search$
DECLARE q_ tsquery;
BEGIN
 IF p_terms IS NULL OR cardinality(p_terms)>8 OR cardinality(p_terms)>0 AND (array_ndims(p_terms)<>1 OR array_lower(p_terms,1)<>1)
  OR EXISTS(SELECT 1 FROM unnest(p_terms)t WHERE t IS NULL OR length(t) NOT BETWEEN 1 AND 64 OR t !~ '^[[:alnum:]]+$')
  OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN RAISE EXCEPTION 'Invalid topic query' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Search generation changed' USING ERRCODE='P1301';END IF;
 IF p_after IS NOT NULL THEN
  IF jsonb_typeof(p_after)<>'object' THEN RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_after))<>4 OR jsonb_typeof(p_after->'human') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(p_after->'ordinal') IS DISTINCT FROM 'string' OR p_after->>'ordinal' !~ '^(0|[1-9][0-9]{0,18})$'
   OR (p_after->>'ordinal')::numeric>9223372036854775807 OR p_after->>'kind' NOT IN ('fixed','legacy','named','page')
   OR jsonb_typeof(p_after->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_after->'id') IS DISTINCT FROM 'string'
   OR canonical_v4.runtime_safe_text(p_after->>'id',CASE WHEN p_after->>'kind'='fixed' THEN 160 ELSE 128 END,false) IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
 END IF;
 IF (SELECT count(*) FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_installation i ON i.singleton AND n.matcher_hash=i.matcher_hash)>512 OR
  EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_installation i ON i.singleton AND n.matcher_hash=i.matcher_hash
   WHERE n.node_id ~ '^(subject|page|legacy)-') THEN RAISE EXCEPTION 'Search topology capacity or namespace' USING ERRCODE='P1304';END IF;
 IF cardinality(p_terms)>0 THEN SELECT to_tsquery('simple',string_agg(quote_literal(t)||':*',' & ')) INTO q_ FROM unnest(p_terms)t;END IF;
 RETURN QUERY WITH named_empty AS (
  SELECT d.scope_kind,d.scope_id,d.caption,c.path,d.human,d.root_ordinal,d.activity_root_id IS NOT NULL occupied
   FROM canonical_v4.named_topic_directory d JOIN canonical_v4.named_topic_cards c USING(generation,scope_kind,scope_id,caption)
   WHERE q_ IS NULL AND d.generation=p_generation AND canonical_v4.unified_after(d.human,d.root_ordinal,d.scope_kind,d.scope_id,p_after)
   ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind,d.scope_id LIMIT p_limit
 ), named_matches AS (
  SELECT DISTINCT ON(c.scope_kind,c.scope_id) c.scope_kind,c.scope_id,c.caption,c.path,d.human,d.root_ordinal,d.activity_root_id IS NOT NULL occupied
   FROM canonical_v4.named_topic_cards c JOIN canonical_v4.named_topic_directory d USING(generation,scope_kind,scope_id)
   WHERE q_ IS NOT NULL AND c.generation=p_generation AND c.search@@q_ AND canonical_v4.unified_after(d.human,d.root_ordinal,d.scope_kind,d.scope_id,p_after)
   ORDER BY c.scope_kind,c.scope_id,c.human DESC,c.root_ordinal DESC,c.caption
 ), named_ranked AS (
  SELECT m.* FROM named_matches m ORDER BY m.human DESC,m.root_ordinal DESC,m.scope_kind,m.scope_id LIMIT p_limit
 ), fixed AS (
  SELECT 'fixed'::text scope_kind,n.node_id scope_id,canonical_v4.unified_public_label(n.node_id) caption,n.path,
   coalesce(a.human,false) human,coalesce(a.root_ordinal,0) root_ordinal,a.root_id IS NOT NULL occupied
   FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_installation i ON i.singleton AND i.matcher_hash=n.matcher_hash
   LEFT JOIN LATERAL(SELECT d.human,d.root_ordinal,d.root_id FROM canonical_v4.unified_search_directory d
    JOIN canonical_v4.contributions c ON c.id=d.root_id WHERE d.generation=p_generation AND d.scope_kind='fixed' AND d.scope_id=n.node_id
     AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.ordinal=d.root_ordinal)a ON true
   WHERE q_ IS NULL OR to_tsvector('simple',canonical_v4.unified_public_label(n.node_id))@@q_
 ), fixed_ranked AS (
  SELECT * FROM fixed f WHERE canonical_v4.unified_after(f.human,f.root_ordinal,f.scope_kind,f.scope_id,p_after)
   ORDER BY f.human DESC,f.root_ordinal DESC,f.scope_kind,f.scope_id LIMIT p_limit
 ), legacy AS (
  SELECT d.scope_kind,d.scope_id,d.caption,ARRAY['legacy-'||d.scope_id]::text[] path,d.human,d.root_ordinal,true occupied
   FROM canonical_v4.unified_search_directory d JOIN canonical_v4.contributions c ON c.id=d.root_id
   JOIN canonical_v4.discussions disc ON disc.id=c.discussion_id AND disc.topic_id=d.scope_id JOIN canonical_v4.topics t ON t.id=disc.topic_id
   WHERE d.generation=p_generation AND d.scope_kind='legacy' AND (q_ IS NULL OR d.search@@q_) AND t.title=d.caption
    AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.ordinal=d.root_ordinal
    AND NOT EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_edges WHERE root_id=c.id)
    AND canonical_v4.unified_after(d.human,d.root_ordinal,d.scope_kind,d.scope_id,p_after)
   ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind,d.scope_id LIMIT p_limit
 ), combined AS (SELECT * FROM named_empty UNION ALL SELECT * FROM named_ranked UNION ALL SELECT * FROM fixed_ranked UNION ALL SELECT * FROM legacy)
 SELECT x.scope_kind,x.scope_id,x.caption,x.path,x.human,x.root_ordinal::text,x.occupied FROM combined x
  ORDER BY x.human DESC,x.root_ordinal DESC,x.scope_kind COLLATE "C",x.scope_id COLLATE "C" LIMIT p_limit;
END $search$;

CREATE FUNCTION canonical_v4.unified_read_legacy_feed(p_generation text,p_topic text,p_before bigint,p_limit integer)
RETURNS TABLE(root_id text,discussion_id text,topic_id text,root_ordinal text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $feed$
BEGIN
 IF canonical_v4.runtime_safe_text(p_topic,128,false) IS DISTINCT FROM true OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_before<0 THEN
  RAISE EXCEPTION 'Invalid original feed' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Search generation changed' USING ERRCODE='P1301';END IF;
 RETURN QUERY SELECT c.id,c.discussion_id,d.topic_id,c.ordinal::text FROM canonical_v4.discussions d JOIN canonical_v4.contributions c ON c.discussion_id=d.id
  WHERE d.topic_id=p_topic AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND (p_before IS NULL OR c.ordinal<p_before)
  ORDER BY c.ordinal DESC LIMIT p_limit;
END $feed$;
CREATE INDEX unified_legacy_feed_order ON canonical_v4.contributions(discussion_id,ordinal DESC) WHERE root_id IS NULL AND NOT withdrawn AND visibility='local-public';
-- Preserve exact historical derived membership. Only the stable original
-- canonical-container route is additional; no root/topic/discussion can move.
ALTER FUNCTION canonical_v4.named_reply_member(text,text,text,bigint,text,text) RENAME TO unified_derived_reply_member;
CREATE FUNCTION canonical_v4.named_reply_member(p_generation text,p_node text,p_root text,p_ordinal bigint,p_topic text,p_discussion text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $member$
 SELECT canonical_v4.unified_derived_reply_member(p_generation,p_node,p_root,p_ordinal,p_topic,p_discussion)
 OR (p_node='legacy-'||p_topic AND EXISTS(SELECT 1 FROM canonical_v4.runtime_state r CROSS JOIN canonical_v4.contributions c
  JOIN canonical_v4.discussions d ON d.id=c.discussion_id WHERE r.singleton AND r.generation=p_generation AND c.id=p_root
   AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.ordinal=p_ordinal AND c.discussion_id=p_discussion AND d.topic_id=p_topic));
$member$;
CREATE FUNCTION canonical_v4.unified_read_revision() RETURNS TABLE(generation text,revision text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $revision$
 SELECT n.generation,encode(sha256(convert_to(jsonb_build_array(n.revision,c.revision,
  (SELECT max(event_id) FROM canonical_v4.unified_search_events WHERE generation=n.generation))::text,'UTF8')),'hex')
 FROM canonical_v4.named_read_revision() n CROSS JOIN canonical_v4.unified_search_clock c WHERE c.singleton;
$revision$;

REVOKE ALL ON TABLE canonical_v4.unified_search_roots,canonical_v4.unified_search_directory,canonical_v4.unified_search_events,canonical_v4.unified_search_clock FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.unified_schedule_search(),canonical_v4.unified_public_label(text),canonical_v4.unified_search_tasks(text),
 canonical_v4.unified_process_search_event(text,bigint),canonical_v4.unified_after(boolean,bigint,text,text,jsonb),canonical_v4.unified_search_topics(text,text[],jsonb,integer),
 canonical_v4.unified_read_legacy_feed(text,text,bigint,integer),canonical_v4.named_reply_member(text,text,text,bigint,text,text),
 canonical_v4.unified_derived_reply_member(text,text,text,bigint,text,text),canonical_v4.unified_read_revision() FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.unified_search_roots,canonical_v4.unified_search_directory,canonical_v4.unified_search_events,canonical_v4.unified_search_clock FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.unified_schedule_search(),canonical_v4.unified_public_label(text),canonical_v4.unified_search_tasks(text),canonical_v4.unified_process_search_event(text,bigint),canonical_v4.unified_after(boolean,bigint,text,text,jsonb),canonical_v4.unified_search_topics(text,text[],jsonb,integer),canonical_v4.unified_read_legacy_feed(text,text,bigint,integer),canonical_v4.named_reply_member(text,text,text,bigint,text,text),canonical_v4.unified_derived_reply_member(text,text,text,bigint,text,text),canonical_v4.unified_read_revision() FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN GRANT EXECUTE ON FUNCTION
  canonical_v4.unified_search_topics(text,text[],jsonb,integer),canonical_v4.unified_read_legacy_feed(text,text,bigint,integer),canonical_v4.unified_read_revision() TO murmingle_app;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN GRANT EXECUTE ON FUNCTION
  canonical_v4.unified_search_tasks(text),canonical_v4.unified_process_search_event(text,bigint) TO murmingle_ingest_worker;END IF;
END $permissions$;

-- End component unified-topic-search.sql

-- Component combined-author-hierarchy.sql SHA256 5d5cf6e11bba40ce319c6a63f4c5bda63f7fa02c88c1377775a971bc7b88427f
-- Explicit hierarchy18 composition after page membership, owner grouping and
-- unified public search. No startup installation, model call or canonical move.
ALTER TABLE canonical_v4.named_root_contexts DROP CONSTRAINT named_root_contexts_scope_kind_check;
ALTER TABLE canonical_v4.named_root_contexts ADD CONSTRAINT named_root_contexts_scope_kind_check CHECK(scope_kind IN ('page','named','semantic'));
ALTER TABLE canonical_v4.named_root_contexts DROP CONSTRAINT named_root_contexts_scope_id_check;
ALTER TABLE canonical_v4.named_root_contexts ADD CONSTRAINT named_root_contexts_scope_id_check
 CHECK(canonical_v4.runtime_safe_text(scope_id,CASE WHEN scope_kind='semantic' THEN 160 ELSE 128 END,false));

CREATE TABLE canonical_v4.combined_fixed_edges (
 root_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.named_root_contexts(root_id) ON DELETE CASCADE,
 generation text COLLATE "C" NOT NULL,node_id text COLLATE "C" NOT NULL,root_ordinal bigint NOT NULL CHECK(root_ordinal>=0),
 human boolean NOT NULL,basis text NOT NULL CHECK(basis IN ('author','derived')),
 head_id uuid REFERENCES canonical_v4.named_subject_heads(subject_id) ON DELETE CASCADE,
 PRIMARY KEY(root_id,node_id),CHECK((basis='author' AND head_id IS NULL) OR(basis='derived' AND head_id IS NOT NULL))
);
CREATE INDEX combined_fixed_feed ON canonical_v4.combined_fixed_edges(generation,node_id,root_ordinal DESC,root_id);
CREATE INDEX combined_fixed_activity ON canonical_v4.combined_fixed_edges(generation,node_id,human DESC,root_ordinal DESC,root_id);
CREATE INDEX combined_fixed_head ON canonical_v4.combined_fixed_edges(head_id);

CREATE FUNCTION canonical_v4.combined_named_prefix(p_generation text,p_subject uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $prefix$
DECLARE ids_ uuid[];path_ text[];root_ text;matcher_ text;
BEGIN
 ids_:=canonical_v4.named_current_subject_path(p_generation,p_subject);IF cardinality(ids_)=0 THEN RETURN ARRAY[]::text[];END IF;
 SELECT ancestor_path,context_root_id,matcher_hash INTO path_,root_,matcher_ FROM canonical_v4.named_subject_heads WHERE subject_id=ids_[1];
 IF cardinality(path_)=0 AND root_ IS NOT NULL THEN path_:=ARRAY[root_];END IF;
 IF cardinality(path_)>0 AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes WHERE matcher_hash=matcher_ AND node_id=path_[cardinality(path_)] AND path=path_) THEN
  RAISE EXCEPTION 'Invalid combined public ancestry' USING ERRCODE='P1293';END IF;
 RETURN path_;
END $prefix$;
CREATE FUNCTION canonical_v4.combined_source_fixed_path(p_generation text,p_source text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fixed$
 SELECT coalesce((SELECT i.supported_path FROM canonical_v4.sources s
  JOIN canonical_v4.runtime_state state_ ON state_.singleton AND state_.generation=p_generation
  JOIN canonical_v4.semantic_installation active_ ON active_.singleton
  JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id AND r.operation_digest=s.payload::jsonb->>'operationDigest'
  JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
  JOIN canonical_v4.semantic_observations o ON o.source_id=s.id AND o.source_version=s.write_version AND o.matcher_hash=active_.matcher_hash
   AND o.generation=p_generation AND o.operation_id=s.operation_id AND o.operation_digest=r.operation_digest
  JOIN canonical_v4.semantic_inputs i ON i.source_id=s.id AND i.operation_digest=r.operation_digest AND i.matcher_hash=active_.matcher_hash AND i.semantic_eligible
  WHERE s.id=p_source AND s.provenance='owner-local-page-embedding/v1' AND s.has_embedding),ARRAY[]::text[]);
$fixed$;
-- The two existing independent bounds remain8 fixed +8 named. Owner depth1..8
-- is an absolute cut through their combined order, never an extra classification.
CREATE FUNCTION canonical_v4.combined_supported_scopes(p_generation text,p_source text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $scopes$
DECLARE editor_ jsonb;ids_ uuid[];path_ text[];id_ text;v_ uuid;caption_ text;result_ jsonb:='[]'::jsonb;
BEGIN
 editor_:=canonical_v4.named_read_editor(p_generation,p_source);IF editor_ IS NULL THEN RETURN result_;END IF;
 IF editor_->'scope'->>'kind'='named' THEN
  ids_:=canonical_v4.named_current_subject_path(p_generation,(editor_->'scope'->>'id')::uuid);
  path_:=canonical_v4.combined_named_prefix(p_generation,(editor_->'scope'->>'id')::uuid);
 ELSE ids_:=ARRAY[]::uuid[];path_:=canonical_v4.combined_source_fixed_path(p_generation,p_source);END IF;
 IF cardinality(path_)>8 OR cardinality(ids_)>8 THEN RAISE EXCEPTION 'Combined ancestry capacity' USING ERRCODE='P1293';END IF;
 FOREACH id_ IN ARRAY path_ LOOP result_:=result_||jsonb_build_array(jsonb_build_object('kind','semantic','id',id_,'caption',canonical_v4.unified_public_label(id_)));END LOOP;
 FOREACH v_ IN ARRAY ids_ LOOP
  SELECT label INTO STRICT caption_ FROM canonical_v4.named_subject_heads WHERE subject_id=v_ AND generation=p_generation;
  result_:=result_||jsonb_build_array(jsonb_build_object('kind','named','id',v_::text,'caption',caption_));
 END LOOP;
 RETURN result_;
END $scopes$;

CREATE FUNCTION canonical_v4.combined_read_editor(p_generation text,p_source text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $editor$
DECLARE result_ jsonb;path_ jsonb;rules_ jsonb;item_ jsonb;scope_ jsonb;policy_ canonical_v4.semantic_owner_policy%ROWTYPE;
 max_ integer;n_ integer;key_ text;
BEGIN
 result_:=canonical_v4.named_read_editor(p_generation,p_source);IF result_ IS NULL THEN RETURN NULL;END IF;
 path_:=canonical_v4.combined_supported_scopes(p_generation,p_source);IF jsonb_array_length(path_)=0 THEN RETURN result_;END IF;
 SELECT * INTO STRICT policy_ FROM canonical_v4.semantic_owner_policy WHERE singleton;max_:=policy_.default_max_depth;
 SELECT coalesce(jsonb_object_agg(e->>'nodeId',e->'maxDepth'),'{}'::jsonb) INTO rules_ FROM jsonb_array_elements(policy_.overrides)e;
 FOR n_ IN 0..jsonb_array_length(path_)-1 LOOP
  item_:=path_->n_;key_:=CASE WHEN item_->>'kind'='named' THEN 'subject-' ELSE '' END||(item_->>'id');
  IF rules_ ? key_ THEN max_:=greatest(n_+1,(rules_->>key_)::integer);END IF;
 END LOOP;
 n_:=least(max_,jsonb_array_length(path_))-1;
 WHILE n_>=0 LOOP
  scope_:=(path_->n_)||jsonb_build_object('sourceId',p_source,'materialDigest',result_->'pageScope'->>'materialDigest');
  IF canonical_v4.named_check_editor_scope(p_generation,result_->>'topicId',scope_) THEN RETURN jsonb_set(result_,'{scope}',scope_);END IF;
  n_:=n_-1;
 END LOOP;
 RETURN jsonb_set(result_,'{scope}',result_->'pageScope');
END $editor$;

CREATE OR REPLACE FUNCTION canonical_v4.named_valid_editor_scope(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $valid$
 SELECT CASE WHEN jsonb_typeof(p) IS DISTINCT FROM 'object' THEN false ELSE
  (SELECT count(*) FROM jsonb_object_keys(p))=5 AND p ?& ARRAY['kind','id','caption','sourceId','materialDigest'] AND
  jsonb_typeof(p->'kind')='string' AND p->>'kind' IN ('page','named','semantic') AND
  jsonb_typeof(p->'id')='string' AND canonical_v4.runtime_safe_text(p->>'id',CASE WHEN p->>'kind'='semantic' THEN 160 ELSE 128 END,false) AND
  (p->>'kind'<>'semantic' OR p->>'id' !~ '^(subject|page|legacy)-') AND
  jsonb_typeof(p->'caption')='string' AND canonical_v4.runtime_safe_text(p->>'caption',200,false) AND
  jsonb_typeof(p->'sourceId')='string' AND canonical_v4.runtime_safe_text(p->>'sourceId',128,false) AND
  jsonb_typeof(p->'materialDigest')='string' AND p->>'materialDigest' ~ '^[a-f0-9]{64}$'
 END
$valid$;

-- Retain the exact original page/direct-named checks. A current confident leaf
-- also supports its active ancestors; semantic scopes use protected material.
CREATE FUNCTION canonical_v4.combined_inherited_named_scope(p_generation text,p_source text,p_subject uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $inherit$
 SELECT coalesce((SELECT CASE WHEN e->'scope'->>'kind'='named' THEN
  p_subject=ANY(canonical_v4.named_current_subject_path(p_generation,(e->'scope'->>'id')::uuid)) ELSE false END
  FROM (SELECT canonical_v4.named_read_editor(p_generation,p_source)e) current_),false);
$inherit$;
ALTER FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb) RENAME TO combined_original_check_scope;
CREATE FUNCTION canonical_v4.named_check_editor_scope(p_generation text,p_topic text,p_scope jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $check$
DECLARE editor_ jsonb;
BEGIN
 IF p_scope->>'kind' IS DISTINCT FROM 'semantic' THEN
  IF canonical_v4.combined_original_check_scope(p_generation,p_topic,p_scope) THEN RETURN true;END IF;
  IF p_scope->>'kind'<>'named' THEN RETURN false;END IF;
  editor_:=canonical_v4.named_read_editor(p_generation,p_scope->>'sourceId');
  RETURN editor_->>'topicId'=p_topic AND editor_->'pageScope'->>'materialDigest'=p_scope->>'materialDigest' AND
   canonical_v4.combined_inherited_named_scope(p_generation,p_scope->>'sourceId',(p_scope->>'id')::uuid) AND
   EXISTS(SELECT 1 FROM canonical_v4.named_subject_heads h WHERE h.subject_id=(p_scope->>'id')::uuid AND h.label=p_scope->>'caption');
 END IF;
 IF canonical_v4.named_valid_editor_scope(p_scope) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid combined scope' USING ERRCODE='P1293';END IF;
 RETURN EXISTS(SELECT 1 FROM canonical_v4.source_links l JOIN canonical_v4.operation_receipts r ON r.source_id=l.source_id
  WHERE l.source_id=p_scope->>'sourceId' AND l.topic_id=p_topic AND r.operation_digest=p_scope->>'materialDigest') AND
  EXISTS(SELECT 1 FROM jsonb_array_elements(canonical_v4.combined_supported_scopes(p_generation,p_scope->>'sourceId'))e
   WHERE e->>'kind'='semantic' AND e->>'id'=p_scope->>'id' AND e->>'caption'=p_scope->>'caption');
END $check$;

CREATE FUNCTION canonical_v4.combined_index_fixed_root(p_root text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $index$
DECLARE root_ record;ids_ uuid[];head_ uuid;path_ text[];node_ text;
BEGIN
 SELECT ctx.*,c.ordinal,c.actor_type='human' human INTO root_ FROM canonical_v4.named_root_contexts ctx
  JOIN canonical_v4.contributions c ON c.id=ctx.root_id WHERE ctx.root_id=p_root AND NOT c.withdrawn AND c.visibility='local-public';
 IF NOT FOUND THEN RETURN true;END IF;
 IF root_.scope_kind='semantic' THEN RETURN true;END IF;
 IF root_.scope_kind='named' THEN head_:=root_.scope_id::uuid;
 ELSE
  -- Existing page-material verifier has already created these exact, current
  -- named membership witnesses. There is no reconstruction from today's page.
  SELECT w.head_id INTO head_ FROM canonical_v4.named_feed_witnesses w
   JOIN canonical_v4.named_subject_heads h ON h.subject_id=w.head_id
   WHERE w.root_id=p_root AND w.scope_kind='named' ORDER BY w.head_id LIMIT 1;
 END IF;
 path_:=ARRAY[]::text[];
 IF head_ IS NOT NULL THEN
  ids_:=canonical_v4.named_locked_feed_path(root_.generation,head_);IF ids_ IS NULL THEN RETURN false;END IF;
  IF cardinality(ids_)>0 THEN path_:=canonical_v4.combined_named_prefix(root_.generation,head_);END IF;
 END IF;
 DELETE FROM canonical_v4.combined_fixed_edges WHERE root_id=p_root AND basis='derived' AND (NOT(node_id=ANY(path_)) OR head_id IS DISTINCT FROM head_);
 FOREACH node_ IN ARRAY path_ LOOP
  INSERT INTO canonical_v4.combined_fixed_edges VALUES(p_root,root_.generation,node_,root_.ordinal,root_.human,'derived',head_) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN true;
END $index$;

-- Semantic roots use the public fixed feed instead of inventing page routes.
CREATE OR REPLACE FUNCTION canonical_v4.named_schedule_root_feed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $schedule$
DECLARE ordinal_ bigint;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.scope_kind='semantic' THEN RETURN OLD;END IF;
  INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id) VALUES(OLD.generation,'scope',OLD.scope_kind,OLD.scope_id);RETURN OLD;
 END IF;
 IF NEW.scope_kind='semantic' THEN RETURN NEW;END IF;
 SELECT ordinal INTO ordinal_ FROM canonical_v4.contributions WHERE id=NEW.root_id AND root_id IS NULL AND NOT withdrawn AND visibility='local-public';
 IF ordinal_ IS NULL THEN RAISE EXCEPTION 'Invalid authored feed root' USING ERRCODE='P1304';END IF;
 INSERT INTO canonical_v4.named_feed_roots VALUES(NEW.root_id,NEW.generation,NEW.scope_kind,NEW.scope_id,ordinal_);
 INSERT INTO canonical_v4.named_feed_edges VALUES(NEW.root_id,ordinal_,NEW.generation,NEW.scope_kind,NEW.scope_id,'author');
 INSERT INTO canonical_v4.named_feed_events(generation,kind,root_id,scope_kind,scope_id) VALUES(NEW.generation,'root',NEW.root_id,NEW.scope_kind,NEW.scope_id);RETURN NEW;
END $schedule$;
ALTER FUNCTION canonical_v4.named_index_root_feed(text) RENAME TO combined_original_index_root;
CREATE FUNCTION canonical_v4.named_index_root_feed(p_root text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $index$
BEGIN
 IF NOT canonical_v4.combined_original_index_root(p_root) THEN RETURN false;END IF;
 RETURN canonical_v4.combined_index_fixed_root(p_root);
END $index$;

CREATE FUNCTION canonical_v4.combined_read_fixed_feed(p_generation text,p_node text,p_before bigint,p_limit integer)
RETURNS TABLE(root_id text,discussion_id text,topic_id text,root_ordinal text,generation text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $feed$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_before<0 OR NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid combined feed' USING ERRCODE='P1223';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state r WHERE r.singleton AND r.generation=p_generation) THEN RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1221';END IF;
 RETURN QUERY WITH old_ AS (SELECT * FROM canonical_v4.semantic_read_feed(p_generation,p_node,p_before,p_limit)),
 new_ AS(SELECT c.id root_id,c.discussion_id,d.topic_id,c.ordinal::text root_ordinal,e.generation FROM canonical_v4.combined_fixed_edges e
  JOIN canonical_v4.contributions c ON c.id=e.root_id JOIN canonical_v4.discussions d ON d.id=c.discussion_id
  WHERE e.generation=p_generation AND e.node_id=p_node AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
   AND c.ordinal=e.root_ordinal AND (p_before IS NULL OR e.root_ordinal<p_before) ORDER BY e.root_ordinal DESC LIMIT p_limit),
 joined_ AS(SELECT * FROM old_ UNION SELECT * FROM new_)
 SELECT x.* FROM joined_ x ORDER BY x.root_ordinal::bigint DESC LIMIT p_limit;
END $feed$;
CREATE FUNCTION canonical_v4.combined_fixed_activity(p_generation text,p_node text)
RETURNS TABLE(human boolean,root_ordinal bigint,root_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $activity$
 WITH old_ AS(SELECT d.human,d.root_ordinal,d.root_id FROM canonical_v4.unified_search_directory d
  JOIN canonical_v4.contributions c ON c.id=d.root_id WHERE d.generation=p_generation AND d.scope_kind='fixed' AND d.scope_id=p_node
   AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.ordinal=d.root_ordinal),
 new_ AS(SELECT e.human,e.root_ordinal,e.root_id FROM canonical_v4.combined_fixed_edges e JOIN canonical_v4.contributions c ON c.id=e.root_id
  WHERE e.generation=p_generation AND e.node_id=p_node AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.ordinal=e.root_ordinal
  ORDER BY e.human DESC,e.root_ordinal DESC,e.root_id LIMIT 1),
 joined_ AS(SELECT * FROM old_ UNION ALL SELECT * FROM new_)
 SELECT j.* FROM joined_ j ORDER BY j.human DESC,j.root_ordinal DESC,j.root_id LIMIT 1;
$activity$;
ALTER FUNCTION canonical_v4.named_reply_member(text,text,text,bigint,text,text) RENAME TO combined_original_reply_member;
CREATE FUNCTION canonical_v4.named_reply_member(p_generation text,p_node text,p_root text,p_ordinal bigint,p_topic text,p_discussion text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $member$
 SELECT canonical_v4.combined_original_reply_member(p_generation,p_node,p_root,p_ordinal,p_topic,p_discussion) OR EXISTS(
  SELECT 1 FROM canonical_v4.combined_fixed_edges e JOIN canonical_v4.contributions c ON c.id=e.root_id JOIN canonical_v4.discussions d ON d.id=c.discussion_id
  WHERE e.generation=p_generation AND e.node_id=p_node AND e.root_id=p_root AND e.root_ordinal=p_ordinal AND c.ordinal=p_ordinal
   AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.discussion_id=p_discussion AND d.topic_id=p_topic);
$member$;

-- Further exact-source finalizer/policy and search projection bodies below.

CREATE OR REPLACE FUNCTION canonical_v4.named_attach_root_context(
 p_actor_id text,p_request_id text,p_generation text,p_source_id text,p_root text,p_scope jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $attach$
DECLARE source_ canonical_v4.sources%ROWTYPE;receipt_ canonical_v4.operation_receipts%ROWTYPE;
 stamp_ canonical_v4.runtime_source_stamps%ROWTYPE;head_ canonical_v4.named_subject_heads%ROWTYPE;matcher_ text;digest_ text;editor_ jsonb;path_ text[];node_ text;ordinal_ bigint;human_ boolean;
BEGIN
 IF canonical_v4.named_valid_editor_scope(p_scope) IS DISTINCT FROM true OR p_scope->>'sourceId' IS DISTINCT FROM p_source_id THEN
  RAISE EXCEPTION 'Invalid editor scope' USING ERRCODE='P1293';END IF;
 digest_:=encode(sha256(convert_to(p_scope::text,'UTF8')),'hex');
 -- Private prepare has locked and checked the exact canonical destination.
 -- Additional derived metadata fences follow those domain locks; no head lock
 -- is held while entering a canonical discussion. Same-material renewals are
 -- accepted because a Source version/operation ID is not a draft's meaning.
 SELECT * INTO receipt_ FROM canonical_v4.operation_receipts WHERE source_id=p_source_id;
 SELECT * INTO source_ FROM canonical_v4.sources WHERE id=p_source_id;
 SELECT * INTO stamp_ FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source_id FOR SHARE;
 IF source_.id IS NULL OR source_.provenance<>'owner-local-page-embedding/v1' OR NOT source_.has_embedding OR
    receipt_.source_id IS NULL OR receipt_.operation_id IS DISTINCT FROM source_.operation_id OR
    receipt_.operation_digest IS DISTINCT FROM p_scope->>'materialDigest' OR
    receipt_.operation_digest IS DISTINCT FROM source_.payload::jsonb->>'operationDigest' OR stamp_.postable IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Editor material changed' USING ERRCODE='P1291';END IF;
 IF p_scope->>'kind'='page' THEN
  -- A page draft remains a page draft when discovery publishes a new subject.
  IF p_scope->>'id' IS DISTINCT FROM p_source_id OR p_scope->>'caption' IS DISTINCT FROM source_.title THEN
   RAISE EXCEPTION 'Page scope changed' USING ERRCODE='P1291';END IF;
 ELSIF p_scope->>'kind'='semantic' THEN
  SELECT matcher_hash INTO matcher_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  editor_:=canonical_v4.named_read_editor(p_generation,p_source_id);
  IF editor_->'scope'->>'kind'='named' AND canonical_v4.named_locked_feed_path(p_generation,(editor_->'scope'->>'id')::uuid) IS NULL THEN
   RAISE EXCEPTION 'Combined ancestry busy' USING ERRCODE='P1291';END IF;
  IF canonical_v4.named_check_editor_scope(p_generation,(SELECT topic_id FROM canonical_v4.discussions d JOIN canonical_v4.contributions c ON c.discussion_id=d.id WHERE c.id=p_root),p_scope) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Combined semantic scope changed' USING ERRCODE='P1291';END IF;
 ELSE
  IF p_scope->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Invalid named scope' USING ERRCODE='P1293';END IF;
  SELECT matcher_hash INTO matcher_ FROM canonical_v4.semantic_installation WHERE singleton FOR SHARE;
  editor_:=canonical_v4.named_read_editor(p_generation,p_source_id);
  IF canonical_v4.named_locked_feed_path(p_generation,CASE WHEN canonical_v4.combined_inherited_named_scope(p_generation,p_source_id,(p_scope->>'id')::uuid)
    THEN (editor_->'scope'->>'id')::uuid ELSE (p_scope->>'id')::uuid END) IS NULL THEN
   RAISE EXCEPTION 'Combined ancestry busy' USING ERRCODE='P1291';END IF;
  SELECT * INTO head_ FROM canonical_v4.named_subject_heads WHERE subject_id=(p_scope->>'id')::uuid FOR SHARE;
  -- Membership suffices: a previously chosen broad subject need not remain the
  -- current preferred leaf. Evidence revisions/first-parent attachment are not
  -- part of its stable ID or caption and cannot invalidate an author's draft.
  IF head_.subject_id IS NULL OR head_.generation<>p_generation OR head_.matcher_hash IS DISTINCT FROM matcher_ OR
    head_.label IS DISTINCT FROM p_scope->>'caption' OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.named_subject_ids id_ WHERE id_.id=head_.subject_id AND id_.revision=head_.revision) OR
    (NOT EXISTS(SELECT 1 FROM canonical_v4.named_subject_members m WHERE m.subject_id=head_.subject_id AND m.source_id=p_source_id
      AND m.source_version=source_.write_version AND m.operation_id=source_.operation_id
      AND m.operation_digest=receipt_.operation_digest AND m.source_stamp=stamp_.stamp) AND
     NOT canonical_v4.combined_inherited_named_scope(p_generation,p_source_id,head_.subject_id)) THEN
   RAISE EXCEPTION 'Named scope changed' USING ERRCODE='P1291';END IF;
 END IF;
 INSERT INTO canonical_v4.named_root_contexts VALUES(p_root,p_generation,p_scope->>'kind',p_scope->>'id',p_scope->>'caption');
 -- Explicit author choice constrains the NEW root's meaning. A broad Games
 -- root cannot inherit a more specific Source classification behind that choice.
 IF p_scope->>'kind' IN ('named','semantic') THEN DELETE FROM canonical_v4.semantic_root_snapshots WHERE root_id=p_root;END IF;
 IF p_scope->>'kind'='semantic' THEN
  SELECT path INTO STRICT path_ FROM canonical_v4.semantic_nodes WHERE matcher_hash=matcher_ AND node_id=p_scope->>'id';
  SELECT ordinal,actor_type='human' INTO STRICT ordinal_,human_ FROM canonical_v4.contributions WHERE id=p_root;
  FOREACH node_ IN ARRAY path_ LOOP
   INSERT INTO canonical_v4.combined_fixed_edges VALUES(p_root,p_generation,node_,ordinal_,human_,'author',NULL);
  END LOOP;
 ELSIF p_scope->>'kind'='named' AND NOT canonical_v4.combined_index_fixed_root(p_root) THEN
  RAISE EXCEPTION 'Combined ancestors changed' USING ERRCODE='P1291';END IF;
 INSERT INTO canonical_v4.named_context_receipts VALUES(p_actor_id,p_request_id,digest_);
END $attach$;

CREATE OR REPLACE FUNCTION canonical_v4.semantic_set_owner_policy(p_expected_revision bigint,p_default_max_depth integer,p_overrides jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $policy$
DECLARE entry_ jsonb;node_ text;depth_ integer;ids_ uuid[];generation_ text;static_ jsonb:='[]'::jsonb;next_ bigint;normalized_ jsonb;fixed_ text[];
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
   fixed_:=canonical_v4.combined_named_prefix(generation_,substr(node_,9)::uuid);
   IF cardinality(ids_)+cardinality(fixed_)>depth_ THEN RAISE EXCEPTION 'Named owner override above its combined scope' USING ERRCODE='P1223';END IF;
  ELSE static_:=static_||jsonb_build_array(entry_);END IF;
 END LOOP;
 IF (SELECT count(DISTINCT e->>'nodeId') FROM jsonb_array_elements(p_overrides) e)<>jsonb_array_length(p_overrides) THEN
  RAISE EXCEPTION 'Duplicate mixed owner scope' USING ERRCODE='P1223';END IF;
 next_:=canonical_v4.semantic_set_static_owner_policy_core(p_expected_revision,p_default_max_depth,static_);
 SELECT coalesce(jsonb_agg(e ORDER BY (e->>'nodeId') COLLATE "C"),'[]'::jsonb) INTO normalized_ FROM jsonb_array_elements(p_overrides) e;
 UPDATE canonical_v4.semantic_owner_policy SET overrides=normalized_ WHERE singleton;
 RETURN next_;
END $policy$;

CREATE OR REPLACE FUNCTION canonical_v4.unified_search_topics(p_generation text,p_terms text[],p_after jsonb,p_limit integer)
RETURNS TABLE(scope_kind text,scope_id text,caption text,path text[],human boolean,root_ordinal text,occupied boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $search$
DECLARE q_ tsquery;
BEGIN
 IF p_terms IS NULL OR cardinality(p_terms)>8 OR cardinality(p_terms)>0 AND (array_ndims(p_terms)<>1 OR array_lower(p_terms,1)<>1)
  OR EXISTS(SELECT 1 FROM unnest(p_terms)t WHERE t IS NULL OR length(t) NOT BETWEEN 1 AND 64 OR t !~ '^[[:alnum:]]+$')
  OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN RAISE EXCEPTION 'Invalid topic query' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Search generation changed' USING ERRCODE='P1301';END IF;
 IF p_after IS NOT NULL THEN
  IF jsonb_typeof(p_after)<>'object' THEN RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_after))<>4 OR jsonb_typeof(p_after->'human') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(p_after->'ordinal') IS DISTINCT FROM 'string' OR p_after->>'ordinal' !~ '^(0|[1-9][0-9]{0,18})$'
   OR (p_after->>'ordinal')::numeric>9223372036854775807 OR p_after->>'kind' NOT IN ('fixed','legacy','named','page')
   OR jsonb_typeof(p_after->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_after->'id') IS DISTINCT FROM 'string'
   OR canonical_v4.runtime_safe_text(p_after->>'id',CASE WHEN p_after->>'kind'='fixed' THEN 160 ELSE 128 END,false) IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'Invalid topic position' USING ERRCODE='P1303';END IF;
 END IF;
 IF (SELECT count(*) FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_installation i ON i.singleton AND n.matcher_hash=i.matcher_hash)>512 OR
  EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_installation i ON i.singleton AND n.matcher_hash=i.matcher_hash
   WHERE n.node_id ~ '^(subject|page|legacy)-') THEN RAISE EXCEPTION 'Search topology capacity or namespace' USING ERRCODE='P1304';END IF;
 IF cardinality(p_terms)>0 THEN SELECT to_tsquery('simple',string_agg(quote_literal(t)||':*',' & ')) INTO q_ FROM unnest(p_terms)t;END IF;
 RETURN QUERY WITH named_empty AS (
  SELECT d.scope_kind,d.scope_id,d.caption,c.path,d.human,d.root_ordinal,d.activity_root_id IS NOT NULL occupied
   FROM canonical_v4.named_topic_directory d JOIN canonical_v4.named_topic_cards c USING(generation,scope_kind,scope_id,caption)
   WHERE q_ IS NULL AND d.generation=p_generation AND canonical_v4.unified_after(d.human,d.root_ordinal,d.scope_kind,d.scope_id,p_after)
   ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind,d.scope_id LIMIT p_limit
 ), named_matches AS (
  SELECT DISTINCT ON(c.scope_kind,c.scope_id) c.scope_kind,c.scope_id,c.caption,c.path,d.human,d.root_ordinal,d.activity_root_id IS NOT NULL occupied
   FROM canonical_v4.named_topic_cards c JOIN canonical_v4.named_topic_directory d USING(generation,scope_kind,scope_id)
   WHERE q_ IS NOT NULL AND c.generation=p_generation AND c.search@@q_ AND canonical_v4.unified_after(d.human,d.root_ordinal,d.scope_kind,d.scope_id,p_after)
   ORDER BY c.scope_kind,c.scope_id,c.human DESC,c.root_ordinal DESC,c.caption
 ), named_ranked AS (
  SELECT m.* FROM named_matches m ORDER BY m.human DESC,m.root_ordinal DESC,m.scope_kind,m.scope_id LIMIT p_limit
 ), fixed AS (
  SELECT 'fixed'::text scope_kind,n.node_id scope_id,canonical_v4.unified_public_label(n.node_id) caption,n.path,
   coalesce(a.human,false) human,coalesce(a.root_ordinal,0) root_ordinal,a.root_id IS NOT NULL occupied
   FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_installation i ON i.singleton AND i.matcher_hash=n.matcher_hash
   LEFT JOIN LATERAL canonical_v4.combined_fixed_activity(p_generation,n.node_id)a ON true
   WHERE q_ IS NULL OR to_tsvector('simple',canonical_v4.unified_public_label(n.node_id))@@q_
 ), fixed_ranked AS (
  SELECT * FROM fixed f WHERE canonical_v4.unified_after(f.human,f.root_ordinal,f.scope_kind,f.scope_id,p_after)
   ORDER BY f.human DESC,f.root_ordinal DESC,f.scope_kind,f.scope_id LIMIT p_limit
 ), legacy AS (
  SELECT d.scope_kind,d.scope_id,d.caption,ARRAY['legacy-'||d.scope_id]::text[] path,d.human,d.root_ordinal,true occupied
   FROM canonical_v4.unified_search_directory d JOIN canonical_v4.contributions c ON c.id=d.root_id
   JOIN canonical_v4.discussions disc ON disc.id=c.discussion_id AND disc.topic_id=d.scope_id JOIN canonical_v4.topics t ON t.id=disc.topic_id
   WHERE d.generation=p_generation AND d.scope_kind='legacy' AND (q_ IS NULL OR d.search@@q_) AND t.title=d.caption
    AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND c.ordinal=d.root_ordinal
    AND NOT EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_edges WHERE root_id=c.id)
    AND canonical_v4.unified_after(d.human,d.root_ordinal,d.scope_kind,d.scope_id,p_after)
   ORDER BY d.human DESC,d.root_ordinal DESC,d.scope_kind,d.scope_id LIMIT p_limit
 ), combined AS (SELECT * FROM named_empty UNION ALL SELECT * FROM named_ranked UNION ALL SELECT * FROM fixed_ranked UNION ALL SELECT * FROM legacy)
 SELECT x.scope_kind,x.scope_id,x.caption,x.path,x.human,x.root_ordinal::text,x.occupied FROM combined x
  ORDER BY x.human DESC,x.root_ordinal DESC,x.scope_kind COLLATE "C",x.scope_id COLLATE "C" LIMIT p_limit;
END $search$;

REVOKE ALL ON TABLE canonical_v4.combined_fixed_edges FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.combined_named_prefix(text,uuid),canonical_v4.combined_source_fixed_path(text,text),canonical_v4.combined_supported_scopes(text,text),canonical_v4.combined_read_editor(text,text),canonical_v4.named_valid_editor_scope(jsonb),canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.combined_index_fixed_root(text),canonical_v4.named_schedule_root_feed(),canonical_v4.named_index_root_feed(text),canonical_v4.combined_read_fixed_feed(text,text,bigint,integer),canonical_v4.combined_fixed_activity(text,text),canonical_v4.named_reply_member(text,text,text,bigint,text,text),canonical_v4.named_attach_root_context(text,text,text,text,text,jsonb),canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb),canonical_v4.unified_search_topics(text,text[],jsonb,integer),canonical_v4.combined_inherited_named_scope(text,text,uuid),canonical_v4.combined_original_check_scope(text,text,jsonb),canonical_v4.combined_original_index_root(text),canonical_v4.combined_original_reply_member(text,text,text,bigint,text,text) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.combined_fixed_edges FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.combined_named_prefix(text,uuid),canonical_v4.combined_source_fixed_path(text,text),canonical_v4.combined_supported_scopes(text,text),canonical_v4.combined_read_editor(text,text),canonical_v4.named_valid_editor_scope(jsonb),canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.combined_index_fixed_root(text),canonical_v4.named_schedule_root_feed(),canonical_v4.named_index_root_feed(text),canonical_v4.combined_read_fixed_feed(text,text,bigint,integer),canonical_v4.combined_fixed_activity(text,text),canonical_v4.named_reply_member(text,text,text,bigint,text,text),canonical_v4.named_attach_root_context(text,text,text,text,text,jsonb),canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb),canonical_v4.unified_search_topics(text,text[],jsonb,integer),canonical_v4.combined_inherited_named_scope(text,text,uuid),canonical_v4.combined_original_check_scope(text,text,jsonb),canonical_v4.combined_original_index_root(text),canonical_v4.combined_original_reply_member(text,text,text,bigint,text,text) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN GRANT EXECUTE ON FUNCTION canonical_v4.combined_read_editor(text,text),canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.combined_read_fixed_feed(text,text,bigint,integer),canonical_v4.unified_search_topics(text,text[],jsonb,integer) TO murmingle_app;END IF;
END $permissions$;

-- End component combined-author-hierarchy.sql

-- Component automatic-topic-dashboard.sql SHA256 0f7e860a06a4d918cdb84ca6f8e4adba156774eb26605fe78e2be3b4f5ff7085
-- Pre-activation schema18 component. Aggregate metadata only; no vector/text
-- payload, canonical change, foreground model work or shared writer counter.
CREATE FUNCTION canonical_v4.named_schedule_assignment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $schedule$
DECLARE old_ uuid;new_ uuid;id_ uuid;generation_ text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_:=OLD.subject_id;END IF;
 IF TG_OP<>'DELETE' THEN new_:=NEW.subject_id;END IF;
 IF TG_OP='UPDATE' AND old_ IS NOT DISTINCT FROM new_ THEN RETURN NULL;END IF;
 FOR id_ IN SELECT DISTINCT id FROM unnest(ARRAY[old_,new_]) id WHERE id IS NOT NULL ORDER BY id LOOP
  SELECT h.generation INTO generation_ FROM canonical_v4.named_subject_heads h WHERE h.subject_id=id_;
  -- A scope event has no head FK, counter row or child-tree fanout. Do not add
  -- a new lock dependency to a Source/selection writer just to refresh counts.
  IF FOUND THEN INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id)
   VALUES(generation_,'scope','named',id_::text);END IF;
 END LOOP;
 RETURN NULL;
END $schedule$;
CREATE TRIGGER named_schedule_assignment AFTER INSERT OR UPDATE OR DELETE ON canonical_v4.named_subject_selections
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_assignment_change();

CREATE FUNCTION canonical_v4.named_read_dashboard_counts(p_generation text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $counts$
DECLARE matcher_ text;result_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid dashboard generation' USING ERRCODE='P1293';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state r WHERE r.singleton AND r.generation=p_generation) THEN
  RAISE EXCEPTION 'Dashboard generation changed' USING ERRCODE='P1291';END IF;
 SELECT i.matcher_hash INTO matcher_ FROM canonical_v4.semantic_installation i WHERE i.singleton;
 WITH RECURSIVE heads AS MATERIALIZED(
  SELECT h.subject_id,h.parent_id,h.label FROM canonical_v4.named_subject_heads h
  JOIN canonical_v4.named_subject_ids i ON i.id=h.subject_id AND i.revision=h.revision
  WHERE h.generation=p_generation AND h.matcher_hash=matcher_
 ),walk AS(
  SELECT h.subject_id AS origin,h.subject_id,h.parent_id,ARRAY[h.subject_id] AS path FROM heads h
  UNION ALL SELECT w.origin,h.subject_id,h.parent_id,array_append(w.path,h.subject_id)
   FROM walk w JOIN heads h ON h.subject_id=w.parent_id
   WHERE cardinality(w.path)<8 AND NOT h.subject_id=ANY(w.path)
 ),complete AS MATERIALIZED(SELECT w.origin,w.path FROM walk w WHERE w.parent_id IS NULL),
 direct AS MATERIALIZED(
  SELECT selection_.subject_id,count(*) AS sources
  FROM canonical_v4.named_subject_selections selection_
  JOIN complete path_ ON path_.origin=selection_.subject_id
  JOIN canonical_v4.named_subject_members m ON m.subject_id=selection_.subject_id AND m.source_id=selection_.source_id
  JOIN canonical_v4.sources s ON s.id=m.source_id AND s.write_version=m.source_version AND s.operation_id=m.operation_id
  JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id AND r.operation_digest=m.operation_digest
  JOIN canonical_v4.runtime_source_stamps stamp_ ON stamp_.source_id=s.id AND stamp_.stamp=m.source_stamp AND stamp_.postable
  WHERE s.provenance='owner-local-page-embedding/v1' AND s.has_embedding
   AND EXISTS(SELECT 1 FROM canonical_v4.source_links l JOIN canonical_v4.topics t ON t.id=l.topic_id
    JOIN canonical_v4.discussions d ON d.topic_id=t.id WHERE l.source_id=s.id)
  GROUP BY selection_.subject_id
 ),rollup AS MATERIALIZED(
  SELECT id_,sum(d.sources) AS sources FROM direct d JOIN complete p ON p.origin=d.subject_id
  CROSS JOIN LATERAL unnest(p.path) id_ GROUP BY id_
 ),rows_ AS(
  SELECT h.subject_id,h.parent_id,h.label,p.path,coalesce(d.sources,0) AS direct_sources,coalesce(r.sources,0) AS sources
   FROM heads h JOIN complete p ON p.origin=h.subject_id
   LEFT JOIN direct d ON d.subject_id=h.subject_id LEFT JOIN rollup r ON r.id_=h.subject_id
 ),shown AS(
  SELECT * FROM rows_ ORDER BY sources DESC,label COLLATE "C",subject_id LIMIT 200
 ) SELECT jsonb_build_object('schema','automatic-topic-assignment-counts/v1','generation',p_generation,
  'matcherIdentityHash',matcher_,'activeSubjects',(SELECT count(*) FROM rows_),
  'occupiedSubjects',(SELECT count(*) FROM rows_ WHERE sources>0),'matchedSources',(SELECT coalesce(sum(sources),0) FROM direct),
  'truncated',(SELECT count(*)>200 FROM rows_),'topics',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id','subject-'||s.subject_id,'parentId',CASE WHEN s.parent_id IS NULL THEN NULL ELSE 'subject-'||s.parent_id END,
   'title',s.label,'directSources',s.direct_sources,'sources',s.sources,
   'path',(SELECT jsonb_agg(jsonb_build_object('id','subject-'||p.id,'title',h.label) ORDER BY p.n DESC)
    FROM unnest(s.path) WITH ORDINALITY p(id,n) JOIN heads h ON h.subject_id=p.id)
  ) ORDER BY s.sources DESC,s.label COLLATE "C",s.subject_id) FROM shown s),'[]'::jsonb)) INTO result_;
 RETURN result_;
END $counts$;
REVOKE ALL ON FUNCTION canonical_v4.named_schedule_assignment_change(),canonical_v4.named_read_dashboard_counts(text) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_schedule_assignment_change(),canonical_v4.named_read_dashboard_counts(text) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_read_dashboard_counts(text) TO murmingle_app;
 END IF;
END $permissions$;

-- End component automatic-topic-dashboard.sql
