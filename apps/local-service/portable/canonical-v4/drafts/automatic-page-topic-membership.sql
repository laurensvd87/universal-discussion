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
