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
