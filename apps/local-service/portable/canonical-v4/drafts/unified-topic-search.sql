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
