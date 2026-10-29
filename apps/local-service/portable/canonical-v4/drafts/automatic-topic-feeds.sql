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
