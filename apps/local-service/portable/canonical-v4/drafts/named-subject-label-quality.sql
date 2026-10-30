-- New unactivated18 append-only label-quality policy. Original16 components
-- remain exact. No Source/canonical rewrite, new identity allocation or model.
CREATE FUNCTION canonical_v4.named_label_has_content(p_label text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $content$
 SELECT p_label IS NOT NULL AND length(p_label) BETWEEN 1 AND 80 AND EXISTS(
  SELECT 1 FROM regexp_split_to_table(lower(normalize(p_label,NFKC)),'[^[:alnum:]]+') AS word
  WHERE word<>'' AND NOT word=ANY(ARRAY['a','all','alle','allebei','allemaal','allen','aller','alles','also','altra','altre','altri','altro','ambas','ambos','an','and','andere','anderen','anderes','any','as','at','au','auch','autre','autres','aux','avec','beide','beiden','both','by','cada','chacun','chacune','chaque','con','da','dasselbe','de','del','della','den','der','derselbe','des','di','die','dieselbe','du','each','een','ein','eine','einer','einige','einigen','el','elke','en','entrambi','et','etwas','every','everybody','everyone','everything','few','for','from','gli','het','hetzelfde','ieder','iedere','iedereen','il','in','into','is','it','its','jede','jedem','jeden','jeder','jedes','jegliche','jemand','la','las','le','les','lo','los','many','mas','meer','meeste','mehr','mehrere','meisten','meme','memes','met','misma','mismo','molte','molti','more','most','much','muchas','muchos','niemand','of','ogni','on','only','op','or','other','others','otra','otras','otro','otros','our','piu','plusieurs','por','pour','same','several','some','somebody','someone','something','sommige','sommigen','sowie','stessa','stesso','such','te','that','the','their','this','to','toda','todas','todo','todos','tous','tout','toute','toutes','tutte','tutti','tutto','un','una','unas','und','une','unos','van','von','voor','we','with','y','zu','zum','zur']::text[]));
$content$;
REVOKE ALL ON FUNCTION canonical_v4.named_label_has_content(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION canonical_v4.named_publish(p jsonb)
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
    (p->>'policyHash' IN ('cd4f0786245a561499253c33cf53a0dc45e0d75e0471707e3a3f8606fb7c4217','82d238016f5c766d6048186c6d381f8d3596d74803577cbef973cfb8a3c62ca1')) IS DISTINCT FROM true OR
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
  IF p->>'policyHash'='82d238016f5c766d6048186c6d381f8d3596d74803577cbef973cfb8a3c62ca1' AND canonical_v4.named_label_has_content(u_->>'label') IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Content-free named label' USING ERRCODE='P1283';END IF;
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


CREATE OR REPLACE FUNCTION canonical_v4.named_match_single_source(p_generation text,p_matcher text,p_witness jsonb,p_focus jsonb,p_policy text)
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
   AND h.representation_hash=representation_ AND h.policy_hash IN ('cd4f0786245a561499253c33cf53a0dc45e0d75e0471707e3a3f8606fb7c4217','82d238016f5c766d6048186c6d381f8d3596d74803577cbef973cfb8a3c62ca1')
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
   AND h.representation_hash=representation_ AND h.policy_hash IN ('cd4f0786245a561499253c33cf53a0dc45e0d75e0471707e3a3f8606fb7c4217','82d238016f5c766d6048186c6d381f8d3596d74803577cbef973cfb8a3c62ca1')
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
