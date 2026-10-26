-- OPT-IN DISPOSABLE PROTOTYPE ONLY. Never registered as migration 010.
-- Actual canonical FKs/writes; no queue, role grant, classifier or runtime hook.
CREATE SCHEMA hierarchy_fast_input_versions_v1;
CREATE TABLE hierarchy_fast_input_versions_v1.artifact (
 singleton boolean PRIMARY KEY CHECK(singleton), identity jsonb NOT NULL,
 artifact_hash text NOT NULL UNIQUE CHECK(artifact_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE hierarchy_fast_input_versions_v1.nodes (
 node_id text PRIMARY KEY CHECK(canonical_v4.runtime_safe_text(node_id,128,false)),
 feed_version bigint NOT NULL DEFAULT 0 CHECK(feed_version>=0)
);
CREATE TABLE hierarchy_fast_input_versions_v1.containers (
 topic_id text PRIMARY KEY REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL UNIQUE REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 source_id text UNIQUE REFERENCES canonical_v4.sources(id) ON DELETE SET NULL
);
CREATE TABLE hierarchy_fast_input_versions_v1.input_versions (
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 generation text NOT NULL, source_version bigint NOT NULL CHECK(source_version>0),
 material text NOT NULL CHECK(octet_length(material)<=32768), input_hash text NOT NULL,
 witness_hash text NOT NULL UNIQUE, body_wire_hash text NOT NULL, title_wire_hash text NOT NULL,
 body_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(body_values)),
 title_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(title_values)),
 source_stamp text NOT NULL,
 PRIMARY KEY(source_id,source_version)
);
CREATE TABLE hierarchy_fast_input_versions_v1.decisions (
 source_id text NOT NULL, source_version bigint NOT NULL, decision_hash text NOT NULL,
 artifact_hash text NOT NULL REFERENCES hierarchy_fast_input_versions_v1.artifact(artifact_hash), node_id text REFERENCES hierarchy_fast_input_versions_v1.nodes(node_id),
 PRIMARY KEY(source_id,source_version,decision_hash),
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_fast_input_versions_v1.input_versions ON DELETE CASCADE
);
CREATE TABLE hierarchy_fast_input_versions_v1.current_inputs (
 source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 source_version bigint NOT NULL, decision_hash text NOT NULL,
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_fast_input_versions_v1.input_versions ON DELETE CASCADE,
 FOREIGN KEY(source_id,source_version,decision_hash) REFERENCES hierarchy_fast_input_versions_v1.decisions ON DELETE CASCADE
);
CREATE VIEW hierarchy_fast_input_versions_v1.inputs AS SELECT i.*,c.decision_hash FROM hierarchy_fast_input_versions_v1.input_versions i JOIN hierarchy_fast_input_versions_v1.current_inputs c USING(source_id,source_version);
CREATE TABLE hierarchy_fast_input_versions_v1.update_intents (
 source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 old_version bigint NOT NULL, new_payload text NOT NULL
);
CREATE TABLE hierarchy_fast_input_versions_v1.operations (
 operation_id text PRIMARY KEY, command_hash text NOT NULL,
 source_id text REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 receipt jsonb NOT NULL
);
CREATE TABLE hierarchy_fast_input_versions_v1.receipts (
 operation_id text PRIMARY KEY, operation_digest text NOT NULL,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 receipt jsonb NOT NULL
);
-- Minimal operation retirement survives erasure; intentionally no Source FK,
-- URL, input hash/material, vector, receipt, credential or destination.
CREATE TABLE hierarchy_fast_input_versions_v1.retired_operations (
 generation text NOT NULL CHECK(canonical_v4.runtime_safe_text(generation,128,false)),
 operation_id text NOT NULL CHECK(canonical_v4.runtime_safe_text(operation_id,128,false)),
 kind text NOT NULL CHECK(kind IN('admission','update','renewal')),
 PRIMARY KEY(generation,operation_id)
);
-- Protected one-command intent is not caller-mirrored canonical existence.
-- Its deferred FK must resolve to the root created in this SAME transaction.
CREATE TABLE hierarchy_fast_input_versions_v1.root_intents (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) DEFERRABLE INITIALLY DEFERRED,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 witness_hash text NOT NULL, decision_hash text NOT NULL
);
CREATE TABLE hierarchy_fast_input_versions_v1.root_snapshots (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) ON DELETE CASCADE,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 topic_id text NOT NULL REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 witness_hash text NOT NULL, source_version bigint NOT NULL,
 artifact_hash text NOT NULL REFERENCES hierarchy_fast_input_versions_v1.artifact(artifact_hash), node_id text REFERENCES hierarchy_fast_input_versions_v1.nodes(node_id),
 decision_hash text NOT NULL,
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_fast_input_versions_v1.input_versions ON DELETE CASCADE,
 FOREIGN KEY(source_id,source_version,decision_hash) REFERENCES hierarchy_fast_input_versions_v1.decisions ON DELETE CASCADE
);
CREATE INDEX fast_root_feed ON hierarchy_fast_input_versions_v1.root_snapshots(node_id,root_id);
CREATE INDEX fast_root_origin ON hierarchy_fast_input_versions_v1.root_snapshots(source_id,root_id);

CREATE FUNCTION hierarchy_fast_input_versions_v1.sha(v text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT encode(sha256(convert_to(v,'UTF8')),'hex') $$;
CREATE FUNCTION hierarchy_fast_input_versions_v1.wire_hash(v double precision[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT encode(sha256(array_send(v)),'hex') $$;
CREATE FUNCTION hierarchy_fast_input_versions_v1.reject_update() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Immutable fast admission evidence' USING ERRCODE='P2103'; END $$;
CREATE TRIGGER fast_artifact_immutable BEFORE UPDATE OR DELETE ON hierarchy_fast_input_versions_v1.artifact
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.reject_update();
CREATE TRIGGER fast_retirement_immutable BEFORE UPDATE OR DELETE ON hierarchy_fast_input_versions_v1.retired_operations
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.reject_update();
CREATE TRIGGER fast_input_immutable BEFORE UPDATE ON hierarchy_fast_input_versions_v1.input_versions
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.reject_update();
CREATE TRIGGER fast_decision_immutable BEFORE UPDATE ON hierarchy_fast_input_versions_v1.decisions
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.reject_update();
CREATE TRIGGER fast_snapshot_immutable BEFORE UPDATE ON hierarchy_fast_input_versions_v1.root_snapshots
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.reject_update();

CREATE FUNCTION hierarchy_fast_input_versions_v1.publish(p_identity jsonb,p_nodes jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_identity IS NULL OR jsonb_typeof(p_identity)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_identity))<>6 OR
    NOT p_identity ?& ARRAY['builderHash','encoderHash','representationHash','modelHash','policyHash','modelId'] OR
    EXISTS(SELECT 1 FROM jsonb_each(p_identity) x WHERE jsonb_typeof(x.value)<>'string') OR
    EXISTS(SELECT 1 FROM jsonb_each_text(p_identity) x WHERE x.key<>'modelId' AND x.value !~ '^[a-f0-9]{64}$') OR
    p_identity->>'modelId' IS DISTINCT FROM 'e5-small-q8-browser-main-prefix-v1' OR
    p_nodes IS NULL OR jsonb_typeof(p_nodes)<>'array' OR jsonb_array_length(p_nodes) NOT BETWEEN 1 AND 128 OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(p_nodes) n WHERE jsonb_typeof(n)<>'string' OR NOT canonical_v4.runtime_safe_text(n#>>'{}',128,false)) THEN
  RAISE EXCEPTION 'Invalid root-only artifact' USING ERRCODE='P2101';
 END IF;
 INSERT INTO hierarchy_fast_input_versions_v1.artifact VALUES(true,p_identity,hierarchy_fast_input_versions_v1.sha(jsonb_build_object('identity',p_identity,'rootNodes',p_nodes)::text));
 INSERT INTO hierarchy_fast_input_versions_v1.nodes(node_id) SELECT n#>>'{}' FROM jsonb_array_elements(p_nodes) n;
END $$;

CREATE FUNCTION hierarchy_fast_input_versions_v1.assert_witness(p_source text,p_witness text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s canonical_v4.sources%ROWTYPE; i hierarchy_fast_input_versions_v1.inputs%ROWTYPE;
 e canonical_v4.embeddings%ROWTYPE; r canonical_v4.runtime_state%ROWTYPE; m jsonb;
BEGIN
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source FOR SHARE;
 SELECT * INTO i FROM hierarchy_fast_input_versions_v1.inputs WHERE source_id=p_source;
 SELECT * INTO e FROM canonical_v4.embeddings WHERE source_id=p_source FOR SHARE;
 SELECT * INTO r FROM canonical_v4.runtime_state WHERE singleton;
 m:=i.material::jsonb;
 IF s.id IS NULL OR i.source_id IS NULL OR e.source_id IS NULL OR
    p_witness IS DISTINCT FROM i.witness_hash OR s.policy_version<>'source-local-versioned-container/v1' OR
    i.generation IS DISTINCT FROM r.generation OR i.source_version IS DISTINCT FROM s.write_version OR
    NOT s.has_embedding OR s.provenance<>'owner-local-page-embedding/v1' OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_source_stamps st WHERE st.source_id=s.id AND st.stamp=i.source_stamp AND st.postable) OR
    NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.containers c JOIN canonical_v4.source_links l ON l.source_id=c.source_id AND l.topic_id=c.topic_id
      JOIN canonical_v4.topic_memberships tm ON tm.source_id=c.source_id AND tm.topic_id=c.topic_id
      WHERE c.source_id=s.id AND l.payload::jsonb=jsonb_build_object('sourceId',s.id,'topicId',c.topic_id,'method',l.method)
      AND s.payload::jsonb->'topicIds'=jsonb_build_array(c.topic_id)
      AND (SELECT count(*) FROM canonical_v4.topic_memberships t WHERE t.source_id=s.id)=1) OR
    s.payload::jsonb IS DISTINCT FROM jsonb_build_object('id',s.id,'url',s.url,'title',s.title,'embedding',e.payload::jsonb,
      'provenance',s.provenance,'extractorVersion',s.extractor_version,'operationId',s.operation_id,
      'operationDigest',(SELECT operation_digest FROM canonical_v4.operation_receipts WHERE source_id=s.id),
      'policyVersion',s.policy_version,'topicIds',s.payload::jsonb->'topicIds') OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.operation_receipts op WHERE op.source_id=s.id AND op.operation_id=s.operation_id) OR
    e.payload::jsonb IS DISTINCT FROM jsonb_build_object('modelId',e.model_id,'values',to_jsonb(e.values_double)) OR
    hierarchy_fast_input_versions_v1.wire_hash(i.body_values) IS DISTINCT FROM i.body_wire_hash OR
    s.url IS DISTINCT FROM m->>'url' OR s.title IS DISTINCT FROM m->>'title' OR
    s.extractor_version IS DISTINCT FROM m->>'extractorVersion' OR
    hierarchy_fast_input_versions_v1.sha(s.title) IS DISTINCT FROM m->>'titleHash' OR
    e.model_id IS DISTINCT FROM m->>'modelId' OR e.dimensions<>384 OR
    hierarchy_fast_input_versions_v1.wire_hash(e.values_double) IS DISTINCT FROM i.body_wire_hash OR
    hierarchy_fast_input_versions_v1.wire_hash(i.title_values) IS DISTINCT FROM i.title_wire_hash OR
    hierarchy_fast_input_versions_v1.sha(i.material) IS DISTINCT FROM i.input_hash THEN
  RAISE EXCEPTION 'Stale canonical paired witness' USING ERRCODE='P2102';
 END IF;
END $$;

CREATE FUNCTION hierarchy_fast_input_versions_v1.admit_new(
 p_generation text,p_revision bigint,p_operation text,p_material text,p_source text,p_topic text,p_discussion text,
 p_created text,p_stamp text,p_body double precision[],p_title double precision[],p_node text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb; a hierarchy_fast_input_versions_v1.artifact%ROWTYPE; runtime canonical_v4.runtime_state%ROWTYPE;
 prior hierarchy_fast_input_versions_v1.receipts%ROWTYPE; input_hash text; witness text; accepted bigint; result jsonb; embedding jsonb;
BEGIN
 IF p_material IS NULL OR octet_length(p_material)>32768 OR NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR
    p_revision IS NULL OR p_revision<0 OR NOT canonical_v4.runtime_safe_text(p_operation,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_source,128,false) OR NOT canonical_v4.runtime_safe_text(p_topic,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_discussion,128,false) OR NOT canonical_v4.runtime_safe_text(p_created,64,false) OR
    p_stamp IS NULL OR p_stamp !~ '^[a-f0-9]{64}$' OR
    p_body IS NULL OR p_title IS NULL OR NOT canonical_v4.ingest_valid_unit_vector(p_body) OR NOT canonical_v4.ingest_valid_unit_vector(p_title) THEN
  RAISE EXCEPTION 'Invalid fast admission' USING ERRCODE='P2101';
 END IF;
 m:=p_material::jsonb;input_hash:=hierarchy_fast_input_versions_v1.sha(p_material);
 SELECT * INTO a FROM hierarchy_fast_input_versions_v1.artifact WHERE singleton;
 IF NOT FOUND OR jsonb_typeof(m)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(m))<>12 OR
    NOT m ?& ARRAY['url','title','extractorVersion','modelId','bodyHash','titleHash','builderHash','encoderHash','representationHash','documentHash','bodyWireHash','titleWireHash'] OR
    EXISTS(SELECT 1 FROM jsonb_each(m) x WHERE jsonb_typeof(x.value)<>'string') OR
    NOT canonical_v4.runtime_safe_text(m->>'url',2048,false) OR m->>'url' !~ '^https://' OR
    NOT canonical_v4.runtime_safe_text(m->>'title',200,false) OR m->>'extractorVersion' NOT IN('main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1') OR
    EXISTS(SELECT 1 FROM jsonb_each_text(m) x WHERE x.key LIKE '%Hash' AND x.value !~ '^[a-f0-9]{64}$') OR
    m->>'titleHash' IS DISTINCT FROM hierarchy_fast_input_versions_v1.sha(m->>'title') OR
    m->>'bodyWireHash' IS DISTINCT FROM hierarchy_fast_input_versions_v1.wire_hash(p_body) OR
    m->>'titleWireHash' IS DISTINCT FROM hierarchy_fast_input_versions_v1.wire_hash(p_title) OR
    EXISTS(SELECT 1 FROM unnest(ARRAY['builderHash','encoderHash','representationHash','modelId']) k WHERE m->>k IS DISTINCT FROM a.identity->>k) OR
    p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid fast paired input or artifact' USING ERRCODE='P2101';
 END IF;
 -- Same brief queue-growth namespace as008/009. Never the Ridge catalog lane.
 PERFORM pg_advisory_xact_lock(914092008,1);
 SELECT * INTO runtime FROM canonical_v4.runtime_state WHERE singleton FOR SHARE;
 IF runtime.generation IS DISTINCT FROM p_generation OR p_revision>runtime.revision THEN
  RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2102';END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.retired_operations WHERE generation=p_generation AND operation_id=p_operation) THEN
  RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2102';END IF;
 SELECT * INTO prior FROM hierarchy_fast_input_versions_v1.receipts WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.operation_digest<>input_hash THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2102';END IF;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.sources WHERE id=prior.source_id) THEN RAISE EXCEPTION 'Erased replay' USING ERRCODE='P2102';END IF;
  RETURN prior.receipt;
 END IF;
 IF runtime.source_absence_revision>p_revision OR EXISTS(SELECT 1 FROM canonical_v4.sources WHERE url COLLATE "C"=(m->>'url') COLLATE "C") OR
    EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.operations WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE source_url=m->>'url' AND state IN('pending','leased')) THEN
  RAISE EXCEPTION 'Not an absent unqueued new Source' USING ERRCODE='P2102';END IF;
 INSERT INTO canonical_v4.id_registry VALUES(p_source,'sources'),(p_topic,'topics'),(p_discussion,'discussions');
 INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at,provenance,retain_tight,write_version)
 VALUES(p_topic,nextval('canonical_v4.topic_ordinal_sequence'),jsonb_build_object('id',p_topic,'kind','general','title','Page discussion','createdAt',p_created,
 'provenance','owner-local-learned-topic/v1','retainTight',false)::text,'general','Page discussion',p_created,'owner-local-learned-topic/v1',false,1);
 INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload,write_version) VALUES(p_discussion,p_topic,nextval('canonical_v4.discussion_ordinal_sequence'),jsonb_build_object('id',p_discussion,'topicId',p_topic)::text,0);
 embedding:=jsonb_build_object('modelId',m->>'modelId','values',to_jsonb(p_body));
 INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding,write_version)
 VALUES(p_source,nextval('canonical_v4.source_ordinal_sequence'),jsonb_build_object('id',p_source,'url',m->>'url','title',m->>'title','embedding',embedding,
 'provenance','owner-local-page-embedding/v1','extractorVersion',m->>'extractorVersion','operationId',p_operation,'operationDigest',input_hash,
 'policyVersion','source-local-versioned-container/v1','topicIds',jsonb_build_array(p_topic))::text,m->>'url',m->>'title','owner-local-page-embedding/v1',m->>'extractorVersion','source-local-versioned-container/v1',p_operation,true,1);
 INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES(p_source,embedding::text,m->>'modelId',384,p_body);
 INSERT INTO canonical_v4.runtime_source_stamps(source_id,stamp,postable) VALUES(p_source,p_stamp,true);
 INSERT INTO canonical_v4.operation_receipts VALUES(p_source,p_operation,input_hash);
 INSERT INTO canonical_v4.topic_memberships VALUES(p_source,p_topic,0);
 INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES(p_source,p_topic,nextval('canonical_v4.source_link_ordinal_sequence'),jsonb_build_object('sourceId',p_source,'topicId',p_topic,'method','learned-provisional')::text,'learned-provisional');
 INSERT INTO hierarchy_fast_input_versions_v1.containers VALUES(p_topic,p_discussion,p_source);
 witness:=hierarchy_fast_input_versions_v1.sha(jsonb_build_array(p_generation,p_source,1,input_hash,m->>'bodyWireHash',m->>'titleWireHash')::text);
 INSERT INTO hierarchy_fast_input_versions_v1.input_versions VALUES(p_source,p_generation,1,p_material,input_hash,witness,m->>'bodyWireHash',m->>'titleWireHash',p_body,p_title,p_stamp);
 INSERT INTO hierarchy_fast_input_versions_v1.decisions VALUES(p_source,1,hierarchy_fast_input_versions_v1.sha(jsonb_build_array(witness,a.artifact_hash,p_node)::text),a.artifact_hash,p_node);
 INSERT INTO hierarchy_fast_input_versions_v1.current_inputs SELECT source_id,source_version,decision_hash FROM hierarchy_fast_input_versions_v1.decisions WHERE source_id=p_source;
 UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1 WHERE singleton RETURNING revision INTO accepted;
 UPDATE canonical_v4.runtime_source_stamps SET catalog_revision=accepted WHERE source_id=p_source;
 result:=jsonb_build_object('schema','source-local-versioned-receipt/v1','policyVersion','source-local-versioned-container/v1',
 'version',jsonb_build_object('generation',p_generation,'revision',accepted),'sourceId',p_source,'sourceVersion','1','topicId',p_topic,'discussionId',p_discussion,
 'inputHash',input_hash,'witnessHash',witness,'decisionHash',hierarchy_fast_input_versions_v1.sha(jsonb_build_array(witness,a.artifact_hash,p_node)::text),'semanticNodeId',p_node,'artifactHash',a.artifact_hash,'experimental',true,'productionValidated',false,'assignmentAuthority',false);
 INSERT INTO hierarchy_fast_input_versions_v1.receipts VALUES(p_operation,input_hash,p_source,result);
 RETURN result;
END $$;

-- Only the exact private addressed command may rewrite these Sources.
CREATE FUNCTION hierarchy_fast_input_versions_v1.guard_legacy_queue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.state IN('pending','leased') AND (EXISTS(SELECT 1 FROM canonical_v4.sources s
 JOIN hierarchy_fast_input_versions_v1.containers c ON c.source_id=s.id WHERE s.url=NEW.source_url)
 OR EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.receipts WHERE operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.operations WHERE operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.retired_operations WHERE generation=NEW.generation AND operation_id=NEW.operation_id)) THEN
  RAISE EXCEPTION 'Source-local policy requires versioned admission' USING ERRCODE='P2103';END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_legacy_queue BEFORE INSERT OR UPDATE ON canonical_v4.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.guard_legacy_queue();
CREATE FUNCTION hierarchy_fast_input_versions_v1.retire_source_operations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 -- BEFORE Source deletion: all immutable versions and operation rows still
 -- exist before Source-FK cascades. Never acquire growth or lane locks here.
 INSERT INTO hierarchy_fast_input_versions_v1.retired_operations(generation,operation_id,kind)
 SELECT DISTINCT i.generation,r.operation_id,'admission'
 FROM hierarchy_fast_input_versions_v1.input_versions i JOIN hierarchy_fast_input_versions_v1.receipts r ON r.source_id=i.source_id
 WHERE i.source_id=OLD.id ON CONFLICT DO NOTHING;
 INSERT INTO hierarchy_fast_input_versions_v1.retired_operations(generation,operation_id,kind)
 SELECT DISTINCT i.generation,o.operation_id,CASE WHEN o.receipt->>'renewed'='true' THEN 'renewal' ELSE 'update' END
 FROM hierarchy_fast_input_versions_v1.input_versions i JOIN hierarchy_fast_input_versions_v1.operations o ON o.source_id=i.source_id
 WHERE i.source_id=OLD.id ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;
CREATE TRIGGER fast_retire_before_source_erasure BEFORE DELETE ON canonical_v4.sources
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.retire_source_operations();
CREATE FUNCTION hierarchy_fast_input_versions_v1.guard_source_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.policy_version='source-local-versioned-container/v1' THEN
  DELETE FROM hierarchy_fast_input_versions_v1.update_intents WHERE source_id=OLD.id AND old_version=OLD.write_version
   AND new_payload=NEW.payload AND NEW.write_version=OLD.write_version+1
   AND NEW.id=OLD.id AND NEW.url=OLD.url AND NEW.ordinal=OLD.ordinal
   AND NEW.policy_version=OLD.policy_version AND NEW.provenance=OLD.provenance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing exact private update intent' USING ERRCODE='P2103';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_source_rewrite BEFORE UPDATE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.guard_source_update();

CREATE FUNCTION hierarchy_fast_input_versions_v1.root_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c hierarchy_fast_input_versions_v1.containers%ROWTYPE; i hierarchy_fast_input_versions_v1.root_intents%ROWTYPE;
 w hierarchy_fast_input_versions_v1.inputs%ROWTYPE; n text; a text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.root_id IS NULL AND EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.containers WHERE discussion_id=OLD.discussion_id) AND
    (NEW.discussion_id IS DISTINCT FROM OLD.discussion_id OR NEW.root_id IS DISTINCT FROM OLD.root_id) THEN
   RAISE EXCEPTION 'Immutable root destination' USING ERRCODE='P2103';END IF;
  IF NEW.withdrawn AND NOT OLD.withdrawn THEN
   DELETE FROM hierarchy_fast_input_versions_v1.root_snapshots WHERE root_id=OLD.id;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.root_id IS NOT NULL THEN RETURN NEW;END IF;
 SELECT * INTO c FROM hierarchy_fast_input_versions_v1.containers WHERE discussion_id=NEW.discussion_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT * INTO i FROM hierarchy_fast_input_versions_v1.root_intents WHERE root_id=NEW.id;
 IF NOT FOUND OR i.source_id IS DISTINCT FROM c.source_id OR NEW.origin_source_id IS DISTINCT FROM c.source_id THEN
  RAISE EXCEPTION 'Missing canonical atomic root intent' USING ERRCODE='P2103';END IF;
 PERFORM hierarchy_fast_input_versions_v1.assert_witness(i.source_id,i.witness_hash);
 IF NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.current_inputs WHERE source_id=i.source_id AND decision_hash=i.decision_hash) THEN
 RAISE EXCEPTION 'Stale root intent' USING ERRCODE='P2102';END IF;
 SELECT * INTO w FROM hierarchy_fast_input_versions_v1.inputs WHERE source_id=i.source_id;
 SELECT d.node_id INTO n FROM hierarchy_fast_input_versions_v1.decisions d JOIN hierarchy_fast_input_versions_v1.current_inputs c USING(source_id,source_version,decision_hash) WHERE d.source_id=i.source_id;
 SELECT artifact_hash INTO a FROM hierarchy_fast_input_versions_v1.artifact WHERE singleton;
 INSERT INTO hierarchy_fast_input_versions_v1.root_snapshots VALUES(NEW.id,i.source_id,c.topic_id,c.discussion_id,w.witness_hash,w.source_version,a,n,w.decision_hash);
 UPDATE hierarchy_fast_input_versions_v1.nodes SET feed_version=feed_version+1 WHERE node_id=n;
 DELETE FROM hierarchy_fast_input_versions_v1.root_intents WHERE root_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER fast_atomic_root AFTER INSERT ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.root_hook();
CREATE TRIGGER fast_stable_root BEFORE UPDATE ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.root_hook();

CREATE FUNCTION hierarchy_fast_input_versions_v1.create_root(p_actor text,p_request text,p_digest text,p_material text,p_generation text,
 p_topic text,p_body text,p_source text,p_root text,p_created text,p_witness text,p_decision text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE prepared record;
BEGIN
 IF canonical_v4.runtime_safe_text(p_actor,128,false) THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_actor,914092006));END IF;
 PERFORM hierarchy_fast_input_versions_v1.assert_witness(p_source,p_witness);
 IF NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.containers WHERE source_id=p_source AND topic_id=p_topic) THEN
  RAISE EXCEPTION 'Source-local destination mismatch' USING ERRCODE='P2102';END IF;
 IF NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.current_inputs WHERE source_id=p_source AND decision_hash=p_decision) THEN
  RAISE EXCEPTION 'Stale decision' USING ERRCODE='P2102';END IF;
 INSERT INTO hierarchy_fast_input_versions_v1.root_intents VALUES(p_root,p_source,p_witness,p_decision);
 SELECT * INTO prepared FROM canonical_v4.runtime_prepare_command(p_actor,p_request,p_digest,p_material,p_generation,'create-root',p_topic,NULL,NULL,NULL,p_body,p_source,p_root,p_created);
 IF prepared.replayed THEN DELETE FROM hierarchy_fast_input_versions_v1.root_intents WHERE root_id=p_root;RETURN prepared.response_text;END IF;
 RETURN canonical_v4.runtime_complete_command(p_actor,p_request,p_generation,prepared.discussion_id,prepared.contribution_id,prepared.discussion_version);
END $$;

CREATE FUNCTION hierarchy_fast_input_versions_v1.reclassify(p_source text,p_witness text,p_decision text,p_node text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i hierarchy_fast_input_versions_v1.inputs%ROWTYPE; a text; d text; BEGIN
 -- Exclusive Source lock first avoids concurrent shared-lock upgrades and
 -- keeps create-root's shared Source witness stable through canonical commit.
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=p_source FOR UPDATE;
 PERFORM 1 FROM hierarchy_fast_input_versions_v1.current_inputs WHERE source_id=p_source FOR UPDATE;
 PERFORM hierarchy_fast_input_versions_v1.assert_witness(p_source,p_witness);
 SELECT * INTO i FROM hierarchy_fast_input_versions_v1.inputs WHERE source_id=p_source;
 IF i.decision_hash IS DISTINCT FROM p_decision THEN RAISE EXCEPTION 'Stale decision' USING ERRCODE='P2102';END IF;
 SELECT artifact_hash INTO a FROM hierarchy_fast_input_versions_v1.artifact WHERE singleton;
 d:=hierarchy_fast_input_versions_v1.sha(jsonb_build_array(p_witness,a,p_node,p_decision)::text);
 INSERT INTO hierarchy_fast_input_versions_v1.decisions VALUES(p_source,i.source_version,d,a,p_node);
 UPDATE hierarchy_fast_input_versions_v1.current_inputs SET decision_hash=d WHERE source_id=p_source;
 RETURN jsonb_build_object('sourceId',p_source,'sourceVersion',i.source_version::text,'witnessHash',p_witness,'decisionHash',d);
END $$;
CREATE FUNCTION hierarchy_fast_input_versions_v1.erasure_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE hierarchy_fast_input_versions_v1.nodes SET feed_version=feed_version+1 WHERE node_id=OLD.node_id;
 RETURN OLD;
END $$;
CREATE TRIGGER fast_origin_erasure BEFORE DELETE ON hierarchy_fast_input_versions_v1.root_snapshots FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_input_versions_v1.erasure_hook();

CREATE FUNCTION hierarchy_fast_input_versions_v1.forget_local(p_generation text,p_source text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.containers WHERE source_id=p_source) THEN
  RAISE EXCEPTION 'Not a Source-local origin' USING ERRCODE='P2102';END IF;
 RETURN canonical_v4.ingest_forget_source(p_generation,p_source);
END $$;


-- One addressed synchronous command, no queued/worker authority.
CREATE FUNCTION hierarchy_fast_input_versions_v1.update_source(
 p_generation text,p_revision bigint,p_operation text,p_material text,p_source text,p_topic text,p_discussion text,
 p_created text,p_stamp text,p_body double precision[],p_title double precision[],p_node text,
 p_version bigint,p_witness text,p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb; a hierarchy_fast_input_versions_v1.artifact%ROWTYPE; input_hash text;
 i hierarchy_fast_input_versions_v1.inputs%ROWTYPE; previous hierarchy_fast_input_versions_v1.operations%ROWTYPE; s canonical_v4.sources%ROWTYPE;
 command_hash text; witness text; decision text; result jsonb; embedding jsonb; next_version bigint; accepted bigint; new_payload_text text;
BEGIN
 IF p_material IS NULL OR octet_length(p_material)>32768 OR p_stamp IS NULL OR p_stamp !~ '^[a-f0-9]{64}$'
 OR NOT canonical_v4.ingest_valid_unit_vector(p_body) OR NOT canonical_v4.ingest_valid_unit_vector(p_title)
 OR NOT canonical_v4.runtime_safe_text(p_operation,128,false) THEN RAISE EXCEPTION 'Invalid update' USING ERRCODE='P2101';END IF;
 m:=p_material::jsonb;input_hash:=hierarchy_fast_input_versions_v1.sha(p_material);
 SELECT * INTO a FROM hierarchy_fast_input_versions_v1.artifact WHERE singleton;
 IF NOT FOUND OR jsonb_typeof(m)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(m))<>12 OR
    NOT m ?& ARRAY['url','title','extractorVersion','modelId','bodyHash','titleHash','builderHash','encoderHash','representationHash','documentHash','bodyWireHash','titleWireHash'] OR
    EXISTS(SELECT 1 FROM jsonb_each(m) x WHERE jsonb_typeof(x.value)<>'string') OR
    NOT canonical_v4.runtime_safe_text(m->>'url',2048,false) OR m->>'url' !~ '^https://' OR
    NOT canonical_v4.runtime_safe_text(m->>'title',200,false) OR m->>'extractorVersion' NOT IN('main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1') OR
    EXISTS(SELECT 1 FROM jsonb_each_text(m) x WHERE x.key LIKE '%Hash' AND x.value !~ '^[a-f0-9]{64}$') OR
    m->>'titleHash' IS DISTINCT FROM hierarchy_fast_input_versions_v1.sha(m->>'title') OR
    m->>'bodyWireHash' IS DISTINCT FROM hierarchy_fast_input_versions_v1.wire_hash(p_body) OR
    m->>'titleWireHash' IS DISTINCT FROM hierarchy_fast_input_versions_v1.wire_hash(p_title) OR
    EXISTS(SELECT 1 FROM unnest(ARRAY['builderHash','encoderHash','representationHash','modelId']) k WHERE m->>k IS DISTINCT FROM a.identity->>k) OR
    p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid fast paired input or artifact' USING ERRCODE='P2101';
 END IF;

 command_hash:=hierarchy_fast_input_versions_v1.sha(jsonb_build_array(p_generation,p_revision,p_operation,p_material,p_source,p_topic,p_discussion,p_created,
  p_stamp,m->>'bodyWireHash',m->>'titleWireHash',p_node,p_version,p_witness,p_decision)::text);
 -- Reserve operation identity with admission/legacy enqueue before taking the
 -- lifecycle lane. No trigger, lane-owned apply or forget acquires growth here.
 PERFORM pg_advisory_xact_lock(914092008,1);
 -- Canonical lifecycle ordering: lane -> receipt -> Source -> pointer -> destinations -> roots.
 PERFORM canonical_v4.ingest_require_idle_lane(p_generation);
 IF EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.retired_operations WHERE generation=p_generation AND operation_id=p_operation) THEN
  RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2102';END IF;
 SELECT * INTO previous FROM hierarchy_fast_input_versions_v1.operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF previous.command_hash IS DISTINCT FROM command_hash THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2102';END IF;
  RETURN previous.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.receipts WHERE operation_id=p_operation)
 OR EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=p_operation)
 OR EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=p_operation) THEN
 RAISE EXCEPTION 'Operation reserved' USING ERRCODE='P2102';END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR UPDATE;
 SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source FOR UPDATE;
 PERFORM 1 FROM hierarchy_fast_input_versions_v1.current_inputs WHERE source_id=p_source FOR UPDATE;
 PERFORM hierarchy_fast_input_versions_v1.assert_witness(p_source,p_witness);
 SELECT * INTO i FROM hierarchy_fast_input_versions_v1.inputs WHERE source_id=p_source;
 IF p_version IS DISTINCT FROM i.source_version OR p_decision IS DISTINCT FROM i.decision_hash OR
  m->>'url' IS DISTINCT FROM s.url OR NOT EXISTS(SELECT 1 FROM hierarchy_fast_input_versions_v1.containers
    WHERE source_id=p_source AND topic_id=p_topic AND discussion_id=p_discussion) OR
  NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation AND revision>=p_revision) THEN
  RAISE EXCEPTION 'Stale addressed update' USING ERRCODE='P2102';END IF;
 -- JSON object order is not input material; every immutable value and both wire hashes are.
 IF m=i.material::jsonb AND p_stamp=i.source_stamp THEN
  SELECT receipt INTO result FROM hierarchy_fast_input_versions_v1.receipts WHERE source_id=p_source ORDER BY operation_id LIMIT 1;
  result:=result || jsonb_build_object('version',(SELECT jsonb_build_object('generation',generation,'revision',revision) FROM canonical_v4.runtime_state WHERE singleton),
   'sourceVersion',i.source_version::text,'inputHash',i.input_hash,'witnessHash',i.witness_hash,
   'decisionHash',i.decision_hash,'semanticNodeId',(SELECT node_id FROM hierarchy_fast_input_versions_v1.decisions
     WHERE source_id=p_source AND source_version=i.source_version AND decision_hash=i.decision_hash),'renewed',true);
 ELSE
  PERFORM 1 FROM canonical_v4.embeddings WHERE source_id=p_source FOR UPDATE;
  PERFORM 1 FROM canonical_v4.source_links WHERE source_id=p_source FOR UPDATE;
  PERFORM 1 FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source FOR UPDATE;
  PERFORM 1 FROM canonical_v4.discussions d WHERE d.id=p_discussion OR d.id IN(
   SELECT discussion_id FROM canonical_v4.contributions WHERE root_id IS NULL AND anchor_source_id=p_source)
   ORDER BY d.id COLLATE "C" FOR NO KEY UPDATE;
  PERFORM 1 FROM canonical_v4.topics t WHERE t.id=p_topic OR t.id IN(
   SELECT d.topic_id FROM canonical_v4.discussions d JOIN canonical_v4.contributions c ON c.discussion_id=d.id
    WHERE c.root_id IS NULL AND c.anchor_source_id=p_source) ORDER BY t.id COLLATE "C" FOR SHARE;
  PERFORM 1 FROM canonical_v4.contributions WHERE root_id IS NULL AND anchor_source_id=p_source ORDER BY id COLLATE "C" FOR UPDATE;
  IF p_stamp IS DISTINCT FROM i.source_stamp THEN
   WITH pinned AS (
    UPDATE canonical_v4.contributions root SET anchor_source_id=NULL,
     payload=(root.payload::jsonb || jsonb_build_object('anchor',jsonb_build_object('kind','topic','topicId',d.topic_id)))::text,
     write_version=root.write_version+1 FROM canonical_v4.discussions d
     WHERE root.discussion_id=d.id AND root.root_id IS NULL AND root.anchor_source_id=p_source RETURNING root.discussion_id)
   UPDATE canonical_v4.discussions d SET write_version=d.write_version+1 WHERE d.id IN(SELECT discussion_id FROM pinned);
  END IF;
  next_version:=s.write_version+1;
  witness:=hierarchy_fast_input_versions_v1.sha(jsonb_build_array(p_generation,p_source,next_version,input_hash,m->>'bodyWireHash',m->>'titleWireHash')::text);
  decision:=hierarchy_fast_input_versions_v1.sha(jsonb_build_array(witness,a.artifact_hash,p_node)::text);
  INSERT INTO hierarchy_fast_input_versions_v1.input_versions VALUES(p_source,p_generation,next_version,p_material,input_hash,witness,
   m->>'bodyWireHash',m->>'titleWireHash',p_body,p_title,p_stamp);
  INSERT INTO hierarchy_fast_input_versions_v1.decisions VALUES(p_source,next_version,decision,a.artifact_hash,p_node);
  embedding:=jsonb_build_object('modelId',m->>'modelId','values',to_jsonb(p_body));
  new_payload_text:=(s.payload::jsonb || jsonb_build_object('title',m->>'title','extractorVersion',m->>'extractorVersion',
   'embedding',embedding,'operationId',p_operation,'operationDigest',command_hash))::text;
  INSERT INTO hierarchy_fast_input_versions_v1.update_intents VALUES(p_source,s.write_version,new_payload_text);
  UPDATE canonical_v4.sources SET payload=new_payload_text,title=m->>'title',extractor_version=m->>'extractorVersion',
   operation_id=p_operation,write_version=next_version WHERE id=p_source;
  UPDATE canonical_v4.embeddings SET payload=embedding::text,model_id=m->>'modelId',values_double=p_body WHERE source_id=p_source;
  UPDATE canonical_v4.operation_receipts SET operation_id=p_operation,operation_digest=command_hash WHERE source_id=p_source;
  UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1 WHERE singleton RETURNING revision INTO accepted;
  UPDATE canonical_v4.runtime_source_stamps SET stamp=p_stamp,catalog_revision=accepted WHERE source_id=p_source;
  UPDATE hierarchy_fast_input_versions_v1.current_inputs SET source_version=next_version,decision_hash=decision WHERE source_id=p_source;
  result:=jsonb_build_object('schema','source-local-versioned-receipt/v1','policyVersion','source-local-versioned-container/v1',
   'version',jsonb_build_object('generation',p_generation,'revision',accepted),'sourceId',p_source,'sourceVersion',next_version::text,
   'topicId',p_topic,'discussionId',p_discussion,'inputHash',input_hash,'witnessHash',witness,'decisionHash',decision,
   'semanticNodeId',p_node,'artifactHash',a.artifact_hash,'experimental',true,'assignmentAuthority',false,'productionValidated',false);
 END IF;
 INSERT INTO hierarchy_fast_input_versions_v1.operations VALUES(p_operation,command_hash,p_source,result);
 RETURN result;
END $$;

REVOKE ALL ON SCHEMA hierarchy_fast_input_versions_v1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_fast_input_versions_v1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_fast_input_versions_v1 FROM PUBLIC;
-- NO application/worker grants. Future migration/dispatch/role review required.
