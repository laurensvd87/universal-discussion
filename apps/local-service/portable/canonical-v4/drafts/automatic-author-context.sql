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
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.named_attach_root_context(text,text,text,text,text,jsonb),canonical_v4.named_valid_editor_scope(jsonb),canonical_v4.named_read_editor(text,text),canonical_v4.named_append_root(text,text,text,text,text,text,text,text,text,text,text,jsonb),canonical_v4.named_read_root_context(text,text),canonical_v4.named_erase_authored_context() FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.named_read_editor(text,text),canonical_v4.named_read_root_context(text,text),
   canonical_v4.named_append_root(text,text,text,text,text,text,text,text,text,text,jsonb) TO murmingle_app;END IF;
END $permissions$;
