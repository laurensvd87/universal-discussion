-- OPT-IN DISPOSABLE PROTOTYPE ONLY. Never registered as migration 010.
-- Actual queued canonical FKs/writes; no serving grant, classifier or activation.
CREATE SCHEMA hierarchy_scoped_ingestion_v1;
-- Gate functions read intrinsic granted lock state; no caller-settable flag.
CREATE FUNCTION hierarchy_scoped_ingestion_v1.enter_gate(p_exclusive boolean) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF pg_catalog.pg_trigger_depth()<>0 THEN RAISE EXCEPTION 'External trigger entry rejected' USING ERRCODE='P2301';END IF;
 IF p_exclusive AND EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory'
  AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
  AND classid=914092165 AND objid=1 AND objsubid=2 AND granted AND mode='ShareLock')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory'
  AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
  AND classid=914092165 AND objid=1 AND objsubid=2 AND granted AND mode='ExclusiveLock') THEN
 RAISE EXCEPTION 'Shared lifecycle gate cannot upgrade' USING ERRCODE='P2301';END IF;
 IF p_exclusive THEN PERFORM pg_catalog.pg_advisory_xact_lock(914092165,1);
 ELSE PERFORM pg_catalog.pg_advisory_xact_lock_shared(914092165,1);END IF;
END $$;

CREATE TABLE hierarchy_scoped_ingestion_v1.artifact (
 singleton boolean PRIMARY KEY CHECK(singleton), identity jsonb NOT NULL,
 artifact_hash text NOT NULL UNIQUE CHECK(artifact_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE hierarchy_scoped_ingestion_v1.nodes (
 node_id text PRIMARY KEY CHECK(canonical_v4.runtime_safe_text(node_id,128,false)),
 feed_version bigint NOT NULL DEFAULT 0 CHECK(feed_version>=0)
);
CREATE TABLE hierarchy_scoped_ingestion_v1.containers (
 topic_id text PRIMARY KEY REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL UNIQUE REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 source_id text UNIQUE REFERENCES canonical_v4.sources(id) ON DELETE SET NULL
);
CREATE TABLE hierarchy_scoped_ingestion_v1.input_versions (
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 generation text NOT NULL, source_version bigint NOT NULL CHECK(source_version>0),
 material text NOT NULL CHECK(pg_catalog.octet_length(material)<=32768), input_hash text NOT NULL,
 witness_hash text NOT NULL UNIQUE, body_wire_hash text NOT NULL, title_wire_hash text NOT NULL,
 body_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(body_values)),
 title_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(title_values)),
 source_stamp text NOT NULL,
 PRIMARY KEY(source_id,source_version)
);
CREATE TABLE hierarchy_scoped_ingestion_v1.decisions (
 source_id text NOT NULL, source_version bigint NOT NULL, decision_hash text NOT NULL,
 artifact_hash text NOT NULL REFERENCES hierarchy_scoped_ingestion_v1.artifact(artifact_hash), node_id text REFERENCES hierarchy_scoped_ingestion_v1.nodes(node_id),
 PRIMARY KEY(source_id,source_version,decision_hash),
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_scoped_ingestion_v1.input_versions ON DELETE CASCADE
);
CREATE TABLE hierarchy_scoped_ingestion_v1.current_inputs (
 source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 source_version bigint NOT NULL, decision_hash text NOT NULL,
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_scoped_ingestion_v1.input_versions ON DELETE CASCADE,
 FOREIGN KEY(source_id,source_version,decision_hash) REFERENCES hierarchy_scoped_ingestion_v1.decisions ON DELETE CASCADE
);
CREATE VIEW hierarchy_scoped_ingestion_v1.inputs AS SELECT i.*,c.decision_hash FROM hierarchy_scoped_ingestion_v1.input_versions i JOIN hierarchy_scoped_ingestion_v1.current_inputs c USING(source_id,source_version);
CREATE TABLE hierarchy_scoped_ingestion_v1.update_intents (
 source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 old_version bigint NOT NULL, new_payload text NOT NULL
);
CREATE TABLE hierarchy_scoped_ingestion_v1.operations (
 operation_id text PRIMARY KEY, command_hash text NOT NULL,
 source_id text REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 receipt jsonb NOT NULL
);
CREATE TABLE hierarchy_scoped_ingestion_v1.receipts (
 operation_id text PRIMARY KEY, operation_digest text NOT NULL,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 receipt jsonb NOT NULL
);
-- Minimal operation retirement survives erasure; intentionally no Source FK,
-- URL, input hash/material, vector, receipt, credential or destination.
CREATE TABLE hierarchy_scoped_ingestion_v1.retired_operations (
 generation text NOT NULL CHECK(canonical_v4.runtime_safe_text(generation,128,false)),
 operation_id text NOT NULL CHECK(canonical_v4.runtime_safe_text(operation_id,128,false)),
 kind text NOT NULL CHECK(kind IN('admission','update','renewal')),
 PRIMARY KEY(generation,operation_id)
);
-- Protected one-command intent is not caller-mirrored canonical existence.
-- Its deferred FK must resolve to the root created in this SAME transaction.
CREATE TABLE hierarchy_scoped_ingestion_v1.root_intents (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) DEFERRABLE INITIALLY DEFERRED,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 witness_hash text NOT NULL, decision_hash text NOT NULL
);
CREATE TABLE hierarchy_scoped_ingestion_v1.root_snapshots (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) ON DELETE CASCADE,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 topic_id text NOT NULL REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 witness_hash text NOT NULL, source_version bigint NOT NULL,
 artifact_hash text NOT NULL REFERENCES hierarchy_scoped_ingestion_v1.artifact(artifact_hash), node_id text REFERENCES hierarchy_scoped_ingestion_v1.nodes(node_id),
 decision_hash text NOT NULL,
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_scoped_ingestion_v1.input_versions ON DELETE CASCADE,
 FOREIGN KEY(source_id,source_version,decision_hash) REFERENCES hierarchy_scoped_ingestion_v1.decisions ON DELETE CASCADE
);
CREATE INDEX fast_root_feed ON hierarchy_scoped_ingestion_v1.root_snapshots(node_id,root_id);
CREATE INDEX fast_root_origin ON hierarchy_scoped_ingestion_v1.root_snapshots(source_id,root_id);

CREATE FUNCTION hierarchy_scoped_ingestion_v1.sha(v text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v,'UTF8')),'hex') $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.wire_hash(v double precision[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.array_send(v)),'hex') $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.reject_update() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Immutable fast admission evidence' USING ERRCODE='P2103'; END $$;
CREATE TRIGGER fast_artifact_immutable BEFORE UPDATE OR DELETE ON hierarchy_scoped_ingestion_v1.artifact
FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.reject_update();
CREATE TRIGGER fast_retirement_immutable BEFORE UPDATE OR DELETE ON hierarchy_scoped_ingestion_v1.retired_operations
FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.reject_update();
CREATE TRIGGER fast_input_immutable BEFORE UPDATE ON hierarchy_scoped_ingestion_v1.input_versions
FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.reject_update();
CREATE TRIGGER fast_decision_immutable BEFORE UPDATE ON hierarchy_scoped_ingestion_v1.decisions
FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.reject_update();
CREATE TRIGGER fast_snapshot_immutable BEFORE UPDATE ON hierarchy_scoped_ingestion_v1.root_snapshots
FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.reject_update();

CREATE FUNCTION hierarchy_scoped_ingestion_v1.publish(p_identity jsonb,p_nodes jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_identity IS NULL OR pg_catalog.jsonb_typeof(p_identity)<>'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_identity))<>6 OR
    NOT p_identity ?& ARRAY['builderHash','encoderHash','representationHash','modelHash','policyHash','modelId'] OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(p_identity) x WHERE pg_catalog.jsonb_typeof(x.value)<>'string') OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(p_identity) x WHERE x.key<>'modelId' AND x.value !~ '^[a-f0-9]{64}$') OR
    p_identity->>'modelId' IS DISTINCT FROM 'e5-small-q8-browser-main-prefix-v1' OR
    p_nodes IS NULL OR pg_catalog.jsonb_typeof(p_nodes)<>'array' OR pg_catalog.jsonb_array_length(p_nodes) NOT BETWEEN 1 AND 128 OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_nodes) n WHERE pg_catalog.jsonb_typeof(n)<>'string' OR NOT canonical_v4.runtime_safe_text(n#>>'{}',128,false)) THEN
  RAISE EXCEPTION 'Invalid root-only artifact' USING ERRCODE='P2101';
 END IF;
 INSERT INTO hierarchy_scoped_ingestion_v1.artifact VALUES(true,p_identity,hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_object('identity',p_identity,'rootNodes',p_nodes)::text));
 INSERT INTO hierarchy_scoped_ingestion_v1.nodes(node_id) SELECT n#>>'{}' FROM pg_catalog.jsonb_array_elements(p_nodes) n;
END $$;

CREATE FUNCTION hierarchy_scoped_ingestion_v1.assert_witness(p_source text,p_witness text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s canonical_v4.sources%ROWTYPE; i hierarchy_scoped_ingestion_v1.inputs%ROWTYPE;
 e canonical_v4.embeddings%ROWTYPE; r canonical_v4.runtime_state%ROWTYPE; m jsonb;
BEGIN
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source FOR SHARE;
 SELECT * INTO i FROM hierarchy_scoped_ingestion_v1.inputs WHERE source_id=p_source;
 SELECT * INTO e FROM canonical_v4.embeddings WHERE source_id=p_source FOR SHARE;
 SELECT * INTO r FROM canonical_v4.runtime_state WHERE singleton;
 m:=i.material::jsonb;
 IF s.id IS NULL OR i.source_id IS NULL OR e.source_id IS NULL OR
    p_witness IS DISTINCT FROM i.witness_hash OR s.policy_version<>'source-local-scoped-container/v1' OR
    i.generation IS DISTINCT FROM r.generation OR i.source_version IS DISTINCT FROM s.write_version OR
    NOT s.has_embedding OR s.provenance<>'owner-local-page-embedding/v1' OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_source_stamps st WHERE st.source_id=s.id AND st.stamp=i.source_stamp AND st.postable) OR
    NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.containers c JOIN canonical_v4.source_links l ON l.source_id=c.source_id AND l.topic_id=c.topic_id
      JOIN canonical_v4.topic_memberships tm ON tm.source_id=c.source_id AND tm.topic_id=c.topic_id
      WHERE c.source_id=s.id AND l.payload::jsonb=pg_catalog.jsonb_build_object('sourceId',s.id,'topicId',c.topic_id,'method',l.method)
      AND s.payload::jsonb->'topicIds'=pg_catalog.jsonb_build_array(c.topic_id)
      AND (SELECT pg_catalog.count(*) FROM canonical_v4.topic_memberships t WHERE t.source_id=s.id)=1) OR
    s.payload::jsonb IS DISTINCT FROM pg_catalog.jsonb_build_object('id',s.id,'url',s.url,'title',s.title,'embedding',e.payload::jsonb,
      'provenance',s.provenance,'extractorVersion',s.extractor_version,'operationId',s.operation_id,
      'operationDigest',(SELECT operation_digest FROM canonical_v4.operation_receipts WHERE source_id=s.id),
      'policyVersion',s.policy_version,'topicIds',s.payload::jsonb->'topicIds') OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.operation_receipts op WHERE op.source_id=s.id AND op.operation_id=s.operation_id) OR
    e.payload::jsonb IS DISTINCT FROM pg_catalog.jsonb_build_object('modelId',e.model_id,'values',pg_catalog.to_jsonb(e.values_double)) OR
    hierarchy_scoped_ingestion_v1.wire_hash(i.body_values) IS DISTINCT FROM i.body_wire_hash OR
    s.url IS DISTINCT FROM m->>'url' OR s.title IS DISTINCT FROM m->>'title' OR
    s.extractor_version IS DISTINCT FROM m->>'extractorVersion' OR
    hierarchy_scoped_ingestion_v1.sha(s.title) IS DISTINCT FROM m->>'titleHash' OR
    e.model_id IS DISTINCT FROM m->>'modelId' OR e.dimensions<>384 OR
    hierarchy_scoped_ingestion_v1.wire_hash(e.values_double) IS DISTINCT FROM i.body_wire_hash OR
    hierarchy_scoped_ingestion_v1.wire_hash(i.title_values) IS DISTINCT FROM i.title_wire_hash OR
    hierarchy_scoped_ingestion_v1.sha(i.material) IS DISTINCT FROM i.input_hash THEN
  RAISE EXCEPTION 'Stale canonical paired witness' USING ERRCODE='P2102';
 END IF;
END $$;

CREATE FUNCTION hierarchy_scoped_ingestion_v1.admit_new(
 p_generation text,p_revision bigint,p_operation text,p_material text,p_source text,p_topic text,p_discussion text,
 p_created text,p_stamp text,p_body double precision[],p_title double precision[],p_node text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb; a hierarchy_scoped_ingestion_v1.artifact%ROWTYPE; runtime canonical_v4.runtime_state%ROWTYPE;
 prior hierarchy_scoped_ingestion_v1.receipts%ROWTYPE; input_hash text; witness text; accepted bigint; result jsonb; embedding jsonb;
BEGIN
 IF p_material IS NULL OR pg_catalog.octet_length(p_material)>32768 OR NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR
    p_revision IS NULL OR p_revision<0 OR NOT canonical_v4.runtime_safe_text(p_operation,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_source,128,false) OR NOT canonical_v4.runtime_safe_text(p_topic,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_discussion,128,false) OR NOT canonical_v4.runtime_safe_text(p_created,64,false) OR
    p_stamp IS NULL OR p_stamp !~ '^[a-f0-9]{64}$' OR
    p_body IS NULL OR p_title IS NULL OR NOT canonical_v4.ingest_valid_unit_vector(p_body) OR NOT canonical_v4.ingest_valid_unit_vector(p_title) THEN
  RAISE EXCEPTION 'Invalid fast admission' USING ERRCODE='P2101';
 END IF;
 m:=p_material::jsonb;input_hash:=hierarchy_scoped_ingestion_v1.sha(p_material);
 SELECT * INTO a FROM hierarchy_scoped_ingestion_v1.artifact WHERE singleton;
 IF NOT FOUND OR pg_catalog.jsonb_typeof(m)<>'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(m))<>12 OR
    NOT m ?& ARRAY['url','title','extractorVersion','modelId','bodyHash','titleHash','builderHash','encoderHash','representationHash','documentHash','bodyWireHash','titleWireHash'] OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(m) x WHERE pg_catalog.jsonb_typeof(x.value)<>'string') OR
    NOT canonical_v4.runtime_safe_text(m->>'url',2048,false) OR m->>'url' !~ '^https://' OR
    NOT canonical_v4.runtime_safe_text(m->>'title',200,false) OR m->>'extractorVersion' NOT IN('main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1') OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(m) x WHERE x.key LIKE '%Hash' AND x.value !~ '^[a-f0-9]{64}$') OR
    m->>'titleHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.sha(m->>'title') OR
    m->>'bodyWireHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.wire_hash(p_body) OR
    m->>'titleWireHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.wire_hash(p_title) OR
    EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['builderHash','encoderHash','representationHash','modelId']) k WHERE m->>k IS DISTINCT FROM a.identity->>k) OR
    p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid fast paired input or artifact' USING ERRCODE='P2101';
 END IF;
 -- Reservation was committed by enqueue; completion never acquires growth.
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 SELECT * INTO runtime FROM canonical_v4.runtime_state WHERE singleton;
 IF runtime.generation IS DISTINCT FROM p_generation OR p_revision>runtime.revision THEN
  RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2102';END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.retired_operations WHERE generation=p_generation AND operation_id=p_operation) THEN
  RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2102';END IF;
 SELECT * INTO prior FROM hierarchy_scoped_ingestion_v1.receipts WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.operation_digest<>input_hash THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2102';END IF;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.sources WHERE id=prior.source_id) THEN RAISE EXCEPTION 'Erased replay' USING ERRCODE='P2102';END IF;
  RETURN prior.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.sources WHERE url COLLATE "C"=(m->>'url') COLLATE "C") OR
    EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.operations WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE source_url=m->>'url' AND state IN('pending','leased')) THEN
  RAISE EXCEPTION 'Not an absent unqueued new Source' USING ERRCODE='P2102';END IF;
 INSERT INTO canonical_v4.id_registry VALUES(p_source,'sources'),(p_topic,'topics'),(p_discussion,'discussions');
 INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at,provenance,retain_tight,write_version)
 VALUES(p_topic,pg_catalog.nextval('canonical_v4.topic_ordinal_sequence'),pg_catalog.jsonb_build_object('id',p_topic,'kind','general','title','Page discussion','createdAt',p_created,
 'provenance','owner-local-learned-topic/v1','retainTight',false)::text,'general','Page discussion',p_created,'owner-local-learned-topic/v1',false,1);
 INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload,write_version) VALUES(p_discussion,p_topic,pg_catalog.nextval('canonical_v4.discussion_ordinal_sequence'),pg_catalog.jsonb_build_object('id',p_discussion,'topicId',p_topic)::text,0);
 embedding:=pg_catalog.jsonb_build_object('modelId',m->>'modelId','values',pg_catalog.to_jsonb(p_body));
 INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding,write_version)
 VALUES(p_source,pg_catalog.nextval('canonical_v4.source_ordinal_sequence'),pg_catalog.jsonb_build_object('id',p_source,'url',m->>'url','title',m->>'title','embedding',embedding,
 'provenance','owner-local-page-embedding/v1','extractorVersion',m->>'extractorVersion','operationId',p_operation,'operationDigest',input_hash,
 'policyVersion','source-local-scoped-container/v1','topicIds',pg_catalog.jsonb_build_array(p_topic))::text,m->>'url',m->>'title','owner-local-page-embedding/v1',m->>'extractorVersion','source-local-scoped-container/v1',p_operation,true,1);
 INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES(p_source,embedding::text,m->>'modelId',384,p_body);
 INSERT INTO canonical_v4.runtime_source_stamps(source_id,stamp,postable) VALUES(p_source,p_stamp,true);
 INSERT INTO canonical_v4.operation_receipts VALUES(p_source,p_operation,input_hash);
 INSERT INTO canonical_v4.topic_memberships VALUES(p_source,p_topic,0);
 INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES(p_source,p_topic,pg_catalog.nextval('canonical_v4.source_link_ordinal_sequence'),pg_catalog.jsonb_build_object('sourceId',p_source,'topicId',p_topic,'method','learned-provisional')::text,'learned-provisional');
 INSERT INTO hierarchy_scoped_ingestion_v1.containers VALUES(p_topic,p_discussion,p_source);
 witness:=hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(p_generation,p_source,1,input_hash,m->>'bodyWireHash',m->>'titleWireHash')::text);
 INSERT INTO hierarchy_scoped_ingestion_v1.input_versions VALUES(p_source,p_generation,1,p_material,input_hash,witness,m->>'bodyWireHash',m->>'titleWireHash',p_body,p_title,p_stamp);
 INSERT INTO hierarchy_scoped_ingestion_v1.decisions VALUES(p_source,1,hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(witness,a.artifact_hash,p_node)::text),a.artifact_hash,p_node);
 INSERT INTO hierarchy_scoped_ingestion_v1.current_inputs SELECT source_id,source_version,decision_hash FROM hierarchy_scoped_ingestion_v1.decisions WHERE source_id=p_source;
 PERFORM hierarchy_scoped_ingestion_v1.before_publish();
 UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1 WHERE singleton AND generation=p_generation RETURNING revision INTO accepted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation changed at publication' USING ERRCODE='P2102';END IF;
 UPDATE canonical_v4.runtime_source_stamps SET catalog_revision=accepted WHERE source_id=p_source;
 result:=pg_catalog.jsonb_build_object('schema','source-local-scoped-receipt/v1','policyVersion','source-local-scoped-container/v1',
 'version',pg_catalog.jsonb_build_object('generation',p_generation,'revision',accepted),'sourceId',p_source,'sourceVersion','1','topicId',p_topic,'discussionId',p_discussion,
 'inputHash',input_hash,'witnessHash',witness,'decisionHash',hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(witness,a.artifact_hash,p_node)::text),'semanticNodeId',p_node,'artifactHash',a.artifact_hash,'experimental',true,'productionValidated',false,'assignmentAuthority',false);
 INSERT INTO hierarchy_scoped_ingestion_v1.receipts VALUES(p_operation,input_hash,p_source,result);
 RETURN result;
END $$;

-- Only the exact private addressed command may rewrite these Sources.
CREATE FUNCTION hierarchy_scoped_ingestion_v1.guard_legacy_queue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.state IN('pending','leased') AND (EXISTS(SELECT 1 FROM canonical_v4.sources s
 JOIN hierarchy_scoped_ingestion_v1.containers c ON c.source_id=s.id WHERE s.url=NEW.source_url)
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.receipts WHERE operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.operations WHERE operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.retired_operations WHERE generation=NEW.generation AND operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.jobs j WHERE j.operation_id=NEW.operation_id OR j.state IN('pending','leased') AND j.source_url=NEW.source_url)) THEN
  RAISE EXCEPTION 'Source-local policy requires versioned admission' USING ERRCODE='P2103';END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_legacy_queue BEFORE INSERT OR UPDATE ON canonical_v4.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.guard_legacy_queue();
CREATE FUNCTION hierarchy_scoped_ingestion_v1.retire_source_operations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 -- BEFORE Source deletion: all immutable versions and operation rows still
 -- exist before Source-FK cascades. Never acquire growth or lane locks here.
 INSERT INTO hierarchy_scoped_ingestion_v1.retired_operations(generation,operation_id,kind)
 SELECT DISTINCT i.generation,r.operation_id,'admission'
 FROM hierarchy_scoped_ingestion_v1.input_versions i JOIN hierarchy_scoped_ingestion_v1.receipts r ON r.source_id=i.source_id
 WHERE i.source_id=OLD.id ON CONFLICT DO NOTHING;
 INSERT INTO hierarchy_scoped_ingestion_v1.retired_operations(generation,operation_id,kind)
 SELECT DISTINCT i.generation,o.operation_id,CASE WHEN o.receipt->>'renewed'='true' THEN 'renewal' ELSE 'update' END
 FROM hierarchy_scoped_ingestion_v1.input_versions i JOIN hierarchy_scoped_ingestion_v1.operations o ON o.source_id=i.source_id
 WHERE i.source_id=OLD.id ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;
CREATE TRIGGER fast_retire_before_source_erasure BEFORE DELETE ON canonical_v4.sources
FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.retire_source_operations();
CREATE FUNCTION hierarchy_scoped_ingestion_v1.guard_source_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.policy_version='source-local-scoped-container/v1' THEN
  DELETE FROM hierarchy_scoped_ingestion_v1.update_intents WHERE source_id=OLD.id AND old_version=OLD.write_version
   AND new_payload=NEW.payload AND NEW.write_version=OLD.write_version+1
   AND NEW.id=OLD.id AND NEW.url=OLD.url AND NEW.ordinal=OLD.ordinal
   AND NEW.policy_version=OLD.policy_version AND NEW.provenance=OLD.provenance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing exact private update intent' USING ERRCODE='P2103';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_source_rewrite BEFORE UPDATE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.guard_source_update();

CREATE FUNCTION hierarchy_scoped_ingestion_v1.root_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c hierarchy_scoped_ingestion_v1.containers%ROWTYPE; i hierarchy_scoped_ingestion_v1.root_intents%ROWTYPE;
 w hierarchy_scoped_ingestion_v1.inputs%ROWTYPE; n text; a text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.root_id IS NULL AND EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.containers WHERE discussion_id=OLD.discussion_id) AND
    (NEW.discussion_id IS DISTINCT FROM OLD.discussion_id OR NEW.root_id IS DISTINCT FROM OLD.root_id) THEN
   RAISE EXCEPTION 'Immutable root destination' USING ERRCODE='P2103';END IF;
  IF NEW.withdrawn AND NOT OLD.withdrawn THEN
   DELETE FROM hierarchy_scoped_ingestion_v1.root_snapshots WHERE root_id=OLD.id;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.root_id IS NOT NULL THEN RETURN NEW;END IF;
 SELECT * INTO c FROM hierarchy_scoped_ingestion_v1.containers WHERE discussion_id=NEW.discussion_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT * INTO i FROM hierarchy_scoped_ingestion_v1.root_intents WHERE root_id=NEW.id;
 IF NOT FOUND OR i.source_id IS DISTINCT FROM c.source_id OR NEW.origin_source_id IS DISTINCT FROM c.source_id THEN
  RAISE EXCEPTION 'Missing canonical atomic root intent' USING ERRCODE='P2103';END IF;
 PERFORM hierarchy_scoped_ingestion_v1.assert_witness(i.source_id,i.witness_hash);
 IF NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.current_inputs WHERE source_id=i.source_id AND decision_hash=i.decision_hash) THEN
 RAISE EXCEPTION 'Stale root intent' USING ERRCODE='P2102';END IF;
 SELECT * INTO w FROM hierarchy_scoped_ingestion_v1.inputs WHERE source_id=i.source_id;
 SELECT d.node_id INTO n FROM hierarchy_scoped_ingestion_v1.decisions d JOIN hierarchy_scoped_ingestion_v1.current_inputs c USING(source_id,source_version,decision_hash) WHERE d.source_id=i.source_id;
 SELECT artifact_hash INTO a FROM hierarchy_scoped_ingestion_v1.artifact WHERE singleton;
 INSERT INTO hierarchy_scoped_ingestion_v1.root_snapshots VALUES(NEW.id,i.source_id,c.topic_id,c.discussion_id,w.witness_hash,w.source_version,a,n,w.decision_hash);
 PERFORM hierarchy_scoped_ingestion_v1.dirty_feed(n);
 DELETE FROM hierarchy_scoped_ingestion_v1.root_intents WHERE root_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER fast_atomic_root AFTER INSERT ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.root_hook();
CREATE TRIGGER fast_stable_root BEFORE UPDATE ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.root_hook();

CREATE FUNCTION hierarchy_scoped_ingestion_v1.create_root(p_actor text,p_request text,p_digest text,p_material text,p_generation text,
 p_topic text,p_body text,p_source text,p_root text,p_created text,p_witness text,p_decision text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE prepared record;
BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 IF canonical_v4.runtime_safe_text(p_actor,128,false) THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor,914092006));END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.containers WHERE source_id=p_source AND topic_id=p_topic) THEN
  RAISE EXCEPTION 'Source-local destination mismatch' USING ERRCODE='P2102';END IF;
 IF NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.current_inputs WHERE source_id=p_source AND decision_hash=p_decision) THEN
  RAISE EXCEPTION 'Stale decision' USING ERRCODE='P2102';END IF;
 INSERT INTO hierarchy_scoped_ingestion_v1.root_intents VALUES(p_root,p_source,p_witness,p_decision);
 SELECT * INTO prepared FROM canonical_v4.runtime_prepare_command(p_actor,p_request,p_digest,p_material,p_generation,'create-root',p_topic,NULL,NULL,NULL,p_body,p_source,p_root,p_created);
 IF prepared.replayed THEN DELETE FROM hierarchy_scoped_ingestion_v1.root_intents WHERE root_id=p_root;RETURN prepared.response_text;END IF;
 RETURN canonical_v4.runtime_complete_command(p_actor,p_request,p_generation,prepared.discussion_id,prepared.contribution_id,prepared.discussion_version);
END $$;

CREATE FUNCTION hierarchy_scoped_ingestion_v1.reclassify(p_source text,p_witness text,p_decision text,p_node text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i hierarchy_scoped_ingestion_v1.inputs%ROWTYPE; a text; d text; BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 -- Exclusive Source lock first avoids concurrent shared-lock upgrades and
 -- keeps create-root's shared Source witness stable through canonical commit.
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=p_source FOR UPDATE;
 PERFORM 1 FROM hierarchy_scoped_ingestion_v1.current_inputs WHERE source_id=p_source FOR UPDATE;
 PERFORM hierarchy_scoped_ingestion_v1.assert_witness(p_source,p_witness);
 SELECT * INTO i FROM hierarchy_scoped_ingestion_v1.inputs WHERE source_id=p_source;
 IF i.decision_hash IS DISTINCT FROM p_decision THEN RAISE EXCEPTION 'Stale decision' USING ERRCODE='P2102';END IF;
 SELECT artifact_hash INTO a FROM hierarchy_scoped_ingestion_v1.artifact WHERE singleton;
 d:=hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(p_witness,a,p_node,p_decision)::text);
 INSERT INTO hierarchy_scoped_ingestion_v1.decisions VALUES(p_source,i.source_version,d,a,p_node);
 UPDATE hierarchy_scoped_ingestion_v1.current_inputs SET decision_hash=d WHERE source_id=p_source;
 RETURN pg_catalog.jsonb_build_object('sourceId',p_source,'sourceVersion',i.source_version::text,'witnessHash',p_witness,'decisionHash',d);
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.erasure_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.dirty_feed(OLD.node_id);
 RETURN OLD;
END $$;
CREATE TRIGGER fast_origin_erasure BEFORE DELETE ON hierarchy_scoped_ingestion_v1.root_snapshots FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.erasure_hook();

CREATE FUNCTION hierarchy_scoped_ingestion_v1.forget_local(p_generation text,p_source text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.containers WHERE source_id=p_source) THEN
  RAISE EXCEPTION 'Not a Source-local origin' USING ERRCODE='P2102';END IF;
 RETURN hierarchy_scoped_ingestion_v1.scoped_forget(p_generation,p_source);
END $$;


-- One addressed synchronous command, no queued/worker authority.
CREATE FUNCTION hierarchy_scoped_ingestion_v1.update_source(
 p_generation text,p_revision bigint,p_operation text,p_material text,p_source text,p_topic text,p_discussion text,
 p_created text,p_stamp text,p_body double precision[],p_title double precision[],p_node text,
 p_version bigint,p_witness text,p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb; a hierarchy_scoped_ingestion_v1.artifact%ROWTYPE; input_hash text;
 i hierarchy_scoped_ingestion_v1.inputs%ROWTYPE; previous hierarchy_scoped_ingestion_v1.operations%ROWTYPE; s canonical_v4.sources%ROWTYPE;
 command_hash text; witness text; decision text; result jsonb; embedding jsonb; next_version bigint; accepted bigint; new_payload_text text;
BEGIN
 IF p_material IS NULL OR pg_catalog.octet_length(p_material)>32768 OR p_stamp IS NULL OR p_stamp !~ '^[a-f0-9]{64}$'
 OR NOT canonical_v4.ingest_valid_unit_vector(p_body) OR NOT canonical_v4.ingest_valid_unit_vector(p_title)
 OR NOT canonical_v4.runtime_safe_text(p_operation,128,false) THEN RAISE EXCEPTION 'Invalid update' USING ERRCODE='P2101';END IF;
 m:=p_material::jsonb;input_hash:=hierarchy_scoped_ingestion_v1.sha(p_material);
 SELECT * INTO a FROM hierarchy_scoped_ingestion_v1.artifact WHERE singleton;
 IF NOT FOUND OR pg_catalog.jsonb_typeof(m)<>'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(m))<>12 OR
    NOT m ?& ARRAY['url','title','extractorVersion','modelId','bodyHash','titleHash','builderHash','encoderHash','representationHash','documentHash','bodyWireHash','titleWireHash'] OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(m) x WHERE pg_catalog.jsonb_typeof(x.value)<>'string') OR
    NOT canonical_v4.runtime_safe_text(m->>'url',2048,false) OR m->>'url' !~ '^https://' OR
    NOT canonical_v4.runtime_safe_text(m->>'title',200,false) OR m->>'extractorVersion' NOT IN('main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1') OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(m) x WHERE x.key LIKE '%Hash' AND x.value !~ '^[a-f0-9]{64}$') OR
    m->>'titleHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.sha(m->>'title') OR
    m->>'bodyWireHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.wire_hash(p_body) OR
    m->>'titleWireHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.wire_hash(p_title) OR
    EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['builderHash','encoderHash','representationHash','modelId']) k WHERE m->>k IS DISTINCT FROM a.identity->>k) OR
    p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid fast paired input or artifact' USING ERRCODE='P2101';
 END IF;

 command_hash:=hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(p_generation,p_revision,p_operation,p_material,p_source,p_topic,p_discussion,p_created,
  p_stamp,m->>'bodyWireHash',m->>'titleWireHash',p_node,p_version,p_witness,p_decision)::text);
 -- Enqueue already committed the operation reservation. Completion takes no
 -- growth or legacy lane; receipt -> Source -> pointer -> destinations -> roots.
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 IF EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.retired_operations WHERE generation=p_generation AND operation_id=p_operation) THEN
  RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2102';END IF;
 SELECT * INTO previous FROM hierarchy_scoped_ingestion_v1.operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF previous.command_hash IS DISTINCT FROM command_hash THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2102';END IF;
  RETURN previous.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.receipts WHERE operation_id=p_operation)
 OR EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=p_operation)
 OR EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=p_operation) THEN
 RAISE EXCEPTION 'Operation reserved' USING ERRCODE='P2102';END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR UPDATE;
 SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source FOR UPDATE;
 PERFORM 1 FROM hierarchy_scoped_ingestion_v1.current_inputs WHERE source_id=p_source FOR UPDATE;
 PERFORM hierarchy_scoped_ingestion_v1.assert_witness(p_source,p_witness);
 SELECT * INTO i FROM hierarchy_scoped_ingestion_v1.inputs WHERE source_id=p_source;
 IF p_version IS DISTINCT FROM i.source_version OR p_decision IS DISTINCT FROM i.decision_hash OR
  m->>'url' IS DISTINCT FROM s.url OR NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.containers
    WHERE source_id=p_source AND topic_id=p_topic AND discussion_id=p_discussion) OR
  NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation AND revision>=p_revision) THEN
  RAISE EXCEPTION 'Stale addressed update' USING ERRCODE='P2102';END IF;
 -- JSON object order is not input material; every immutable value and both wire hashes are.
 IF m=i.material::jsonb AND p_stamp=i.source_stamp THEN
  SELECT receipt INTO result FROM hierarchy_scoped_ingestion_v1.receipts WHERE source_id=p_source ORDER BY operation_id LIMIT 1;
  result:=result || pg_catalog.jsonb_build_object('version',(SELECT pg_catalog.jsonb_build_object('generation',generation,'revision',revision) FROM canonical_v4.runtime_state WHERE singleton),
   'sourceVersion',i.source_version::text,'inputHash',i.input_hash,'witnessHash',i.witness_hash,
   'decisionHash',i.decision_hash,'semanticNodeId',(SELECT node_id FROM hierarchy_scoped_ingestion_v1.decisions
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
     payload=(root.payload::jsonb || pg_catalog.jsonb_build_object('anchor',pg_catalog.jsonb_build_object('kind','topic','topicId',d.topic_id)))::text,
     write_version=root.write_version+1 FROM canonical_v4.discussions d
     WHERE root.discussion_id=d.id AND root.root_id IS NULL AND root.anchor_source_id=p_source RETURNING root.discussion_id)
   UPDATE canonical_v4.discussions d SET write_version=d.write_version+1 WHERE d.id IN(SELECT discussion_id FROM pinned);
  END IF;
  next_version:=s.write_version+1;
  witness:=hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(p_generation,p_source,next_version,input_hash,m->>'bodyWireHash',m->>'titleWireHash')::text);
  decision:=hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(witness,a.artifact_hash,p_node)::text);
  INSERT INTO hierarchy_scoped_ingestion_v1.input_versions VALUES(p_source,p_generation,next_version,p_material,input_hash,witness,
   m->>'bodyWireHash',m->>'titleWireHash',p_body,p_title,p_stamp);
  INSERT INTO hierarchy_scoped_ingestion_v1.decisions VALUES(p_source,next_version,decision,a.artifact_hash,p_node);
  embedding:=pg_catalog.jsonb_build_object('modelId',m->>'modelId','values',pg_catalog.to_jsonb(p_body));
  new_payload_text:=(s.payload::jsonb || pg_catalog.jsonb_build_object('title',m->>'title','extractorVersion',m->>'extractorVersion',
   'embedding',embedding,'operationId',p_operation,'operationDigest',command_hash))::text;
  INSERT INTO hierarchy_scoped_ingestion_v1.update_intents VALUES(p_source,s.write_version,new_payload_text);
  UPDATE canonical_v4.sources SET payload=new_payload_text,title=m->>'title',extractor_version=m->>'extractorVersion',
   operation_id=p_operation,write_version=next_version WHERE id=p_source;
  UPDATE canonical_v4.embeddings SET payload=embedding::text,model_id=m->>'modelId',values_double=p_body WHERE source_id=p_source;
  UPDATE canonical_v4.operation_receipts SET operation_id=p_operation,operation_digest=command_hash WHERE source_id=p_source;
  PERFORM hierarchy_scoped_ingestion_v1.before_publish();
 UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1 WHERE singleton AND generation=p_generation RETURNING revision INTO accepted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation changed at publication' USING ERRCODE='P2102';END IF;
  UPDATE canonical_v4.runtime_source_stamps SET stamp=p_stamp,catalog_revision=accepted WHERE source_id=p_source;
  UPDATE hierarchy_scoped_ingestion_v1.current_inputs SET source_version=next_version,decision_hash=decision WHERE source_id=p_source;
  result:=pg_catalog.jsonb_build_object('schema','source-local-scoped-receipt/v1','policyVersion','source-local-scoped-container/v1',
   'version',pg_catalog.jsonb_build_object('generation',p_generation,'revision',accepted),'sourceId',p_source,'sourceVersion',next_version::text,
   'topicId',p_topic,'discussionId',p_discussion,'inputHash',input_hash,'witnessHash',witness,'decisionHash',decision,
   'semanticNodeId',p_node,'artifactHash',a.artifact_hash,'experimental',true,'assignmentAuthority',false,'productionValidated',false);
 END IF;
 INSERT INTO hierarchy_scoped_ingestion_v1.operations VALUES(p_operation,command_hash,p_source,result);
 RETURN result;
END $$;


CREATE TABLE hierarchy_scoped_ingestion_v1.jobs (
 generation text NOT NULL, operation_id text NOT NULL, origin_kind text NOT NULL CHECK(origin_kind IN('actor','crawler')),
 principal text NOT NULL, command_hash text NOT NULL, mode text NOT NULL CHECK(mode IN('admission','update')),
 source_id text NOT NULL CHECK(canonical_v4.runtime_safe_text(source_id,128,false)),
 topic_id text NOT NULL CHECK(canonical_v4.runtime_safe_text(topic_id,128,false)),source_url text,
 params jsonb CHECK(pg_catalog.octet_length(params::text)<=49152),
 material text CHECK(pg_catalog.octet_length(material)<=32768), body_values double precision[],title_values double precision[],
 state text NOT NULL CHECK(state IN('pending','leased','complete','failed','cancelled','expired','erased')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), epoch integer NOT NULL DEFAULT 0,
 worker text, token text, lease_until timestamptz, receipt jsonb, completed_token_hash text, code text,
 PRIMARY KEY(generation,operation_id),
 CHECK((state IN('pending','leased'))=(params IS NOT NULL AND material IS NOT NULL AND body_values IS NOT NULL AND title_values IS NOT NULL)),
 CHECK(body_values IS NULL OR canonical_v4.ingest_valid_unit_vector(body_values)),
 CHECK(title_values IS NULL OR canonical_v4.ingest_valid_unit_vector(title_values))
);
CREATE UNIQUE INDEX scoped_live_source ON hierarchy_scoped_ingestion_v1.jobs(source_id) WHERE state IN('pending','leased');
CREATE UNIQUE INDEX scoped_live_url ON hierarchy_scoped_ingestion_v1.jobs(source_url) WHERE state IN('pending','leased');
CREATE FUNCTION hierarchy_scoped_ingestion_v1.job_summary(j hierarchy_scoped_ingestion_v1.jobs) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pg_catalog.jsonb_build_object('generation',j.generation,'operationId',j.operation_id,'command_hash',j.command_hash,
 'state',j.state,'epoch',j.epoch,'receipt',j.receipt,'code',j.code)
$$;
CREATE TABLE hierarchy_scoped_ingestion_v1.authorities (
 generation text NOT NULL,operation_id text NOT NULL, deadline timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false,
 accepted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(generation,operation_id), FOREIGN KEY(generation,operation_id) REFERENCES hierarchy_scoped_ingestion_v1.jobs ON DELETE CASCADE
);
-- Fixed private slots make the proof bound race-safe without a global mutex.
CREATE TABLE hierarchy_scoped_ingestion_v1.finalization_slots(slot integer PRIMARY KEY CHECK(slot BETWEEN 1 AND 4096));
INSERT INTO hierarchy_scoped_ingestion_v1.finalization_slots SELECT pg_catalog.generate_series(1,4096);
CREATE TABLE hierarchy_scoped_ingestion_v1.final_intents(
 generation text NOT NULL,operation_id text NOT NULL,epoch integer NOT NULL,lease_until timestamptz NOT NULL,
 slot integer NOT NULL UNIQUE REFERENCES hierarchy_scoped_ingestion_v1.finalization_slots,
 tx bigint NOT NULL DEFAULT pg_catalog.txid_current(), deadline timestamptz NOT NULL,receipt_hash text NOT NULL, finalized_at timestamptz,
 PRIMARY KEY(generation,operation_id),FOREIGN KEY(generation,operation_id) REFERENCES hierarchy_scoped_ingestion_v1.jobs ON DELETE CASCADE
);
CREATE TABLE hierarchy_scoped_ingestion_v1.feed_dirty(tx bigint NOT NULL,node_id text NOT NULL,delta bigint NOT NULL,PRIMARY KEY(tx,node_id));
CREATE FUNCTION hierarchy_scoped_ingestion_v1.dirty_feed(p_node text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_node IS NOT NULL THEN INSERT INTO hierarchy_scoped_ingestion_v1.feed_dirty VALUES(pg_catalog.txid_current(),p_node,1)
 ON CONFLICT(tx,node_id) DO UPDATE SET delta=hierarchy_scoped_ingestion_v1.feed_dirty.delta+1;END IF;
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.flush_feed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF (pg_catalog.current_query() IN('COMMIT','COMMIT;')) IS DISTINCT FROM true OR pg_catalog.pg_trigger_depth()<>1 THEN
  RAISE EXCEPTION 'Feed flush requires outer literal commit' USING ERRCODE='P2305';END IF;
 PERFORM 1 FROM hierarchy_scoped_ingestion_v1.nodes n WHERE node_id IN(SELECT d.node_id FROM hierarchy_scoped_ingestion_v1.feed_dirty d WHERE tx=pg_catalog.txid_current())
 ORDER BY node_id COLLATE "C" FOR UPDATE;
 UPDATE hierarchy_scoped_ingestion_v1.nodes n SET feed_version=n.feed_version+d.delta FROM hierarchy_scoped_ingestion_v1.feed_dirty d
 WHERE d.tx=pg_catalog.txid_current() AND d.node_id=n.node_id;
 DELETE FROM hierarchy_scoped_ingestion_v1.feed_dirty WHERE tx=pg_catalog.txid_current();
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER scoped_feed_commit AFTER INSERT ON hierarchy_scoped_ingestion_v1.feed_dirty DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.flush_feed();
CREATE FUNCTION hierarchy_scoped_ingestion_v1.finalize_commit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a hierarchy_scoped_ingestion_v1.authorities%ROWTYPE; j hierarchy_scoped_ingestion_v1.jobs%ROWTYPE;
 proof hierarchy_scoped_ingestion_v1.final_intents%ROWTYPE; final_time timestamptz;
BEGIN
 IF (pg_catalog.current_query() IN('COMMIT','COMMIT;')) IS DISTINCT FROM true OR pg_catalog.pg_trigger_depth()<>1 THEN
  RAISE EXCEPTION 'Authorization requires outer literal commit' USING ERRCODE='P2305';END IF;
 SELECT * INTO a FROM hierarchy_scoped_ingestion_v1.authorities WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 SELECT * INTO j FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 SELECT * INTO proof FROM hierarchy_scoped_ingestion_v1.final_intents WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 IF proof.tx IS DISTINCT FROM pg_catalog.txid_current() OR proof.tx IS DISTINCT FROM NEW.tx
 OR proof.slot IS DISTINCT FROM NEW.slot OR proof.deadline IS DISTINCT FROM NEW.deadline OR proof.receipt_hash IS DISTINCT FROM NEW.receipt_hash
 OR proof.epoch IS DISTINCT FROM NEW.epoch OR j.epoch IS DISTINCT FROM NEW.epoch
 OR j.state IS DISTINCT FROM 'complete' OR a.revoked IS DISTINCT FROM false OR a.accepted IS DISTINCT FROM true
 OR proof.deadline IS DISTINCT FROM a.deadline OR proof.lease_until IS DISTINCT FROM NEW.lease_until
 OR proof.receipt_hash IS DISTINCT FROM hierarchy_scoped_ingestion_v1.sha(j.receipt::text) THEN
 RAISE EXCEPTION 'Invalid server finalization identity' USING ERRCODE='P2306';END IF;
 -- SET CONSTRAINTS inside a prior deferred callback can leave the outer event
 -- iterator with a duplicate invocation. Only a timely same-tx server proof
 -- permits idempotence, after the intrinsic context/depth guard above.
 IF proof.finalized_at IS NOT NULL THEN
  IF (proof.finalized_at<a.deadline AND proof.finalized_at<proof.lease_until) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid finalized deadline proof' USING ERRCODE='P2306';END IF;
  RETURN NULL;
 END IF;
 final_time:=pg_catalog.clock_timestamp();
 IF (a.operation_id IS NOT NULL AND NOT a.revoked AND a.deadline>final_time AND NEW.lease_until>final_time
 AND j.state='complete' AND j.epoch=NEW.epoch) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Authorization expired at commit' USING ERRCODE='P2306';END IF;
 UPDATE hierarchy_scoped_ingestion_v1.final_intents SET finalized_at=final_time
 WHERE generation=NEW.generation AND operation_id=NEW.operation_id AND tx=pg_catalog.txid_current();
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER scoped_authorized_commit AFTER INSERT ON hierarchy_scoped_ingestion_v1.final_intents
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.finalize_commit();
CREATE FUNCTION hierarchy_scoped_ingestion_v1.cleanup_finalizations() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer;BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 DELETE FROM hierarchy_scoped_ingestion_v1.final_intents WHERE (generation,operation_id) IN(
 SELECT generation,operation_id FROM hierarchy_scoped_ingestion_v1.final_intents
 WHERE tx<>pg_catalog.txid_current() AND finalized_at IS NOT NULL ORDER BY generation COLLATE "C",operation_id COLLATE "C" LIMIT 100);
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;

CREATE FUNCTION hierarchy_scoped_ingestion_v1.scrub_job(p_generation text,p_operation text,p_state text,p_code text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE hierarchy_scoped_ingestion_v1.jobs SET state=p_state,params=NULL,material=NULL,source_url=NULL,body_values=NULL,title_values=NULL,
 worker=NULL,token=NULL,lease_until=NULL,receipt=NULL,completed_token_hash=NULL,code=p_code
 WHERE generation=p_generation AND operation_id=p_operation
$$;
-- Validate primitive types and finite encoded input BEFORE vector casts, hashes,
-- locks or storage. Vector wire text is temporary, not duplicated in params.
CREATE FUNCTION hierarchy_scoped_ingestion_v1.validate_params(p_mode text,p_params jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k integer;v text;kind text;BEGIN
 IF pg_catalog.jsonb_typeof(p_params) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid parameter array' USING ERRCODE='P2301';END IF;
 IF pg_catalog.jsonb_array_length(p_params)<>(CASE WHEN p_mode='admission' THEN 12 ELSE 15 END) THEN RAISE EXCEPTION 'Invalid parameter count' USING ERRCODE='P2301';END IF;
 FOR k IN 0..pg_catalog.jsonb_array_length(p_params)-1 LOOP
  kind:=pg_catalog.jsonb_typeof(p_params->k);v:=p_params->>k;
  IF k=1 THEN
   IF kind IS DISTINCT FROM 'number' OR pg_catalog.octet_length(v)>16 OR v !~ '^(0|[1-9][0-9]{0,15})$' THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='P2301';END IF;
   IF v::numeric>9007199254740991 THEN RAISE EXCEPTION 'Unbounded revision' USING ERRCODE='P2301';END IF;
  ELSIF k=11 AND kind='null' THEN NULL;
  ELSE
   IF kind IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid parameter primitive' USING ERRCODE='P2301';END IF;
   IF k=3 THEN
    IF pg_catalog.octet_length(v) NOT BETWEEN 1 AND 32768 THEN RAISE EXCEPTION 'Unbounded material' USING ERRCODE='P2301';END IF;
   ELSIF k IN(9,10) THEN
    IF pg_catalog.octet_length(v) NOT BETWEEN 1 AND 16384 THEN RAISE EXCEPTION 'Unbounded vector wire text' USING ERRCODE='P2301';END IF;
   ELSIF k IN(8,13,14) THEN
    IF pg_catalog.octet_length(v)<>64 OR v !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid parameter digest' USING ERRCODE='P2301';END IF;
   ELSIF k=12 THEN
    IF pg_catalog.octet_length(v)>16 OR v !~ '^[1-9][0-9]{0,15}$' THEN RAISE EXCEPTION 'Invalid prior version' USING ERRCODE='P2301';END IF;
    IF v::numeric>9007199254740991 THEN RAISE EXCEPTION 'Unbounded prior version' USING ERRCODE='P2301';END IF;
   ELSIF NOT canonical_v4.runtime_safe_text(v,CASE WHEN k=7 THEN 64 ELSE 128 END,false) THEN
    RAISE EXCEPTION 'Unbounded parameter identifier/time' USING ERRCODE='P2301';
   END IF;
  END IF;
 END LOOP;
 IF pg_catalog.octet_length(pg_catalog.jsonb_set(pg_catalog.jsonb_set(p_params,'{9}','null'),'{10}','null')::text)>49152 THEN
  RAISE EXCEPTION 'Aggregate parameter budget' USING ERRCODE='P2301';END IF;
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.enqueue(p_kind text,p_principal text,p_mode text,p_params jsonb,p_seconds integer,p_proof text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g text; op text; src text; topic text; m jsonb; h text; old hierarchy_scoped_ingestion_v1.jobs%ROWTYPE;
 body double precision[]; title double precision[]; r canonical_v4.runtime_state%ROWTYPE; i hierarchy_scoped_ingestion_v1.inputs%ROWTYPE;
BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 IF p_kind IS NULL OR p_principal IS NULL OR p_mode IS NULL OR p_seconds IS NULL OR p_proof IS NULL OR p_params IS NULL
 OR p_kind NOT IN('actor','crawler') OR p_kind='crawler' AND p_principal<>'crawler-public/v1'
 OR p_kind='actor' AND p_principal !~ '^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR p_mode NOT IN('admission','update') OR p_seconds NOT BETWEEN 1 AND 30 OR pg_catalog.octet_length(p_proof)<>64 OR p_proof !~ '^[a-f0-9]{64}$' THEN
 RAISE EXCEPTION 'Invalid scoped command' USING ERRCODE='P2301';END IF;
 PERFORM hierarchy_scoped_ingestion_v1.validate_params(p_mode,p_params);
 g:=p_params->>0;op:=p_params->>2;src:=p_params->>4;topic:=p_params->>5;m:=(p_params->>3)::jsonb;
 IF p_params->>1 IS NULL OR p_params->>3 IS NULL OR pg_catalog.octet_length(p_params->>3)>32768 OR NOT canonical_v4.runtime_safe_text(op,128,false)
 OR NOT canonical_v4.runtime_safe_text(src,128,false) THEN RAISE EXCEPTION 'Unbounded command' USING ERRCODE='P2301';END IF;
 body:=(p_params->>9)::double precision[];title:=(p_params->>10)::double precision[];
 IF NOT canonical_v4.ingest_valid_unit_vector(body) OR NOT canonical_v4.ingest_valid_unit_vector(title)
 OR m->>'bodyWireHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.wire_hash(body)
 OR m->>'titleWireHash' IS DISTINCT FROM hierarchy_scoped_ingestion_v1.wire_hash(title)
 OR ((p_params->>11) IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.nodes WHERE node_id=p_params->>11))
 OR NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.artifact a WHERE a.singleton
 AND a.identity->>'builderHash'=m->>'builderHash' AND a.identity->>'encoderHash'=m->>'encoderHash'
 AND a.identity->>'representationHash'=m->>'representationHash' AND a.identity->>'modelId'=m->>'modelId') THEN
 RAISE EXCEPTION 'Invalid paired artifact' USING ERRCODE='P2301';END IF;
 -- First server allocations/time are retained, never minted again on replay.
 h:=hierarchy_scoped_ingestion_v1.sha(pg_catalog.jsonb_build_array(p_kind,p_principal,p_mode,
  CASE WHEN p_mode='admission' THEN pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(p_params,'{4}','null'),'{5}','null'),'{6}','null'),'{7}','null') ELSE p_params END,p_proof)::text);
 IF p_kind='actor' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_principal,914092006));END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(914092008,1);
 SELECT * INTO r FROM canonical_v4.runtime_state WHERE singleton;
 IF r.generation IS DISTINCT FROM g OR (p_params->>1)::bigint>r.revision
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.retired_operations WHERE generation=g AND operation_id=op) THEN
 RAISE EXCEPTION 'Stale generation or retired operation' USING ERRCODE='P2302';END IF;
 SELECT * INTO old FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=g AND operation_id=op FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF old.command_hash IS DISTINCT FROM h OR old.principal IS DISTINCT FROM p_principal THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2302';END IF;
  RETURN hierarchy_scoped_ingestion_v1.job_summary(old);
 END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=op OR source_url=m->>'url' AND state IN('pending','leased'))
 OR EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=op)
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.jobs j WHERE j.operation_id=op OR j.state IN('pending','leased') AND
  (j.source_url=m->>'url' OR j.source_id=src))
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.receipts WHERE operation_id=op)
 OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.operations WHERE operation_id=op) THEN
 RAISE EXCEPTION 'Operation or URL reserved' USING ERRCODE='P2302';END IF;
 IF p_mode='admission' THEN
  IF r.source_absence_revision>(p_params->>1)::bigint OR EXISTS(SELECT 1 FROM canonical_v4.sources WHERE url=m->>'url')
  OR EXISTS(SELECT 1 FROM canonical_v4.id_registry WHERE id IN(src,topic,p_params->>6))
  OR EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.jobs j WHERE state IN('pending','leased') AND
   (j.source_id IN(src,topic,p_params->>6) OR j.topic_id IN(src,topic,p_params->>6) OR (j.params->>6) IN(src,topic,p_params->>6))) THEN
   RAISE EXCEPTION 'New Source required' USING ERRCODE='P2302';END IF;
 ELSE
  PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=src FOR SHARE NOWAIT;
  PERFORM 1 FROM canonical_v4.sources WHERE id=src FOR SHARE NOWAIT;
  PERFORM 1 FROM canonical_v4.embeddings WHERE source_id=src FOR SHARE NOWAIT;
  PERFORM hierarchy_scoped_ingestion_v1.assert_witness(src,p_params->>13);
  SELECT * INTO i FROM hierarchy_scoped_ingestion_v1.inputs WHERE source_id=src;
  IF i.source_version IS DISTINCT FROM (p_params->>12)::bigint OR i.decision_hash IS DISTINCT FROM p_params->>14 THEN
  RAISE EXCEPTION 'Stale prior' USING ERRCODE='P2302';END IF;
 END IF;
 IF (SELECT pg_catalog.count(*) FROM hierarchy_scoped_ingestion_v1.jobs WHERE state IN('pending','leased'))>=4096
 OR (SELECT pg_catalog.count(*) FROM hierarchy_scoped_ingestion_v1.jobs WHERE state IN('pending','leased') AND principal=p_principal)>=
 (CASE WHEN p_kind='actor' THEN 32 ELSE 1024 END) THEN RAISE EXCEPTION 'Queue capacity' USING ERRCODE='P2303';END IF;
 INSERT INTO hierarchy_scoped_ingestion_v1.jobs(generation,operation_id,origin_kind,principal,command_hash,mode,source_id,topic_id,source_url,params,material,body_values,title_values,state)
 VALUES(g,op,p_kind,p_principal,h,p_mode,src,topic,m->>'url',pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(p_params,'{3}','null'),'{9}','null'),'{10}','null'),p_params->>3,body,title,'pending');
 INSERT INTO hierarchy_scoped_ingestion_v1.authorities(generation,operation_id,deadline,revoked) VALUES(g,op,pg_catalog.clock_timestamp()+p_seconds*interval '1 second',false);
 RETURN pg_catalog.jsonb_build_object('generation',g,'operationId',op,'commandHash',h,'state','pending');
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.claim(p_generation text,p_operation text,p_principal text,p_hash text,p_worker text,p_token text,p_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j hierarchy_scoped_ingestion_v1.jobs%ROWTYPE; a hierarchy_scoped_ingestion_v1.authorities%ROWTYPE;BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 IF p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 15 OR NOT canonical_v4.runtime_safe_text(p_worker,128,false)
 OR NOT canonical_v4.runtime_safe_text(p_token,128,false) THEN RAISE EXCEPTION 'Invalid claim' USING ERRCODE='P2301';END IF;
 SELECT * INTO j FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF NOT FOUND OR j.principal IS DISTINCT FROM p_principal OR j.command_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Job identity' USING ERRCODE='P2302';END IF;
 SELECT * INTO a FROM hierarchy_scoped_ingestion_v1.authorities WHERE generation=p_generation AND operation_id=p_operation;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2302';END IF;
 IF j.state NOT IN('pending','leased') THEN RETURN hierarchy_scoped_ingestion_v1.job_summary(j);END IF;
 IF (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp()) IS DISTINCT FROM true OR j.attempts>=3 AND j.lease_until<=pg_catalog.clock_timestamp() THEN
 PERFORM hierarchy_scoped_ingestion_v1.scrub_job(p_generation,p_operation,'expired','authority-expired');RETURN pg_catalog.jsonb_build_object('state','expired');END IF;
 IF j.state='leased' AND j.lease_until>pg_catalog.clock_timestamp() THEN
 IF j.worker IS DISTINCT FROM p_worker OR j.token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'Live lease held' USING ERRCODE='P2302';END IF;
 ELSE
 IF j.token=p_token THEN RAISE EXCEPTION 'New token required' USING ERRCODE='P2302';END IF;
 UPDATE hierarchy_scoped_ingestion_v1.jobs SET state='leased',attempts=attempts+1,epoch=epoch+1,worker=p_worker,token=p_token,
 lease_until=least(a.deadline,pg_catalog.clock_timestamp()+p_seconds*interval '1 second')
 WHERE generation=p_generation AND operation_id=p_operation RETURNING * INTO j;
 END IF;
 RETURN pg_catalog.jsonb_build_object('state',j.state,'epoch',j.epoch,'leaseUntil',j.lease_until,'deadline',a.deadline);
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.heartbeat(p_generation text,p_operation text,p_principal text,p_hash text,p_worker text,p_token text,p_epoch integer,p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 IF p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 15 THEN RAISE EXCEPTION 'Invalid lease interval' USING ERRCODE='P2301';END IF;
 UPDATE hierarchy_scoped_ingestion_v1.jobs j SET lease_until=least(a.deadline,pg_catalog.clock_timestamp()+p_seconds*interval '1 second')
 FROM hierarchy_scoped_ingestion_v1.authorities a WHERE j.generation=p_generation AND j.operation_id=p_operation AND a.generation=j.generation
 AND a.operation_id=j.operation_id AND j.principal=p_principal AND j.command_hash=p_hash AND j.state='leased'
 AND j.worker=p_worker AND j.token=p_token AND j.epoch=p_epoch AND j.lease_until>pg_catalog.clock_timestamp()
 AND NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp();
 RETURN FOUND;
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.revoke(p_generation text,p_operation text,p_principal text,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 UPDATE hierarchy_scoped_ingestion_v1.authorities a SET revoked=true WHERE generation=p_generation AND operation_id=p_operation AND NOT accepted
 AND EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.jobs j WHERE j.generation=a.generation AND j.operation_id=a.operation_id
 AND j.principal=p_principal AND j.command_hash=p_hash);
 RETURN FOUND;
END $$;

CREATE TABLE hierarchy_scoped_ingestion_v1.apply_context(tx bigint PRIMARY KEY,generation text NOT NULL,operation_id text NOT NULL,epoch integer NOT NULL,lease_until timestamptz NOT NULL);
CREATE FUNCTION hierarchy_scoped_ingestion_v1.before_publish() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c hierarchy_scoped_ingestion_v1.apply_context%ROWTYPE;a hierarchy_scoped_ingestion_v1.authorities%ROWTYPE;BEGIN
 SELECT * INTO c FROM hierarchy_scoped_ingestion_v1.apply_context WHERE tx=pg_catalog.txid_current();
 IF NOT FOUND THEN RETURN;END IF;
 SELECT * INTO a FROM hierarchy_scoped_ingestion_v1.authorities WHERE generation=c.generation AND operation_id=c.operation_id FOR UPDATE;
 IF NOT FOUND OR (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp() AND c.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Authority lost before publication' USING ERRCODE='P2306';END IF;
END $$;

CREATE FUNCTION hierarchy_scoped_ingestion_v1.complete(p_generation text,p_operation text,p_principal text,p_hash text,p_worker text,p_token text,p_epoch integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE address hierarchy_scoped_ingestion_v1.jobs%ROWTYPE;j hierarchy_scoped_ingestion_v1.jobs%ROWTYPE;a hierarchy_scoped_ingestion_v1.authorities%ROWTYPE;
 p jsonb;result jsonb; b double precision[];t double precision[];proof_slot integer;
 visited_slots integer[]:=ARRAY[]::integer[];reservation_try integer;BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 SELECT * INTO address FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=p_generation AND operation_id=p_operation;
 IF NOT FOUND OR address.principal IS DISTINCT FROM p_principal OR address.command_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Job identity' USING ERRCODE='P2302';END IF;
 IF address.origin_kind='actor' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(address.principal,914092006));END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=address.source_id FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=address.source_id FOR UPDATE;
 SELECT * INTO j FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF j.principal IS DISTINCT FROM p_principal OR j.command_hash IS DISTINCT FROM p_hash OR j.source_id IS DISTINCT FROM address.source_id THEN RAISE EXCEPTION 'Job changed' USING ERRCODE='P2302';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2302';END IF;
 IF j.state='complete' THEN
 IF j.completed_token_hash IS DISTINCT FROM hierarchy_scoped_ingestion_v1.sha(p_token) OR j.epoch IS DISTINCT FROM p_epoch THEN RAISE EXCEPTION 'Lease replay mismatch' USING ERRCODE='P2302';END IF;
 RETURN j.receipt;END IF;
 IF (j.state='leased' AND j.worker=p_worker AND j.token=p_token AND j.epoch=p_epoch AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Stale lease' USING ERRCODE='P2302';END IF;
 p:=pg_catalog.jsonb_set(j.params,'{3}',pg_catalog.to_jsonb(j.material));
 IF j.mode='update' AND NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.inputs WHERE source_id=j.source_id
 AND source_version=(p->>12)::bigint AND witness_hash=p->>13 AND decision_hash=p->>14) THEN
 PERFORM hierarchy_scoped_ingestion_v1.scrub_job(p_generation,p_operation,'failed','stale-prior');
 RETURN pg_catalog.jsonb_build_object('state','failed','code','stale-prior');END IF;
 SELECT * INTO a FROM hierarchy_scoped_ingestion_v1.authorities WHERE generation=p_generation AND operation_id=p_operation;
 IF (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 PERFORM hierarchy_scoped_ingestion_v1.scrub_job(p_generation,p_operation,'cancelled','authority-revoked');
 RETURN pg_catalog.jsonb_build_object('state','cancelled');END IF;
 FOR reservation_try IN 1..4096 LOOP
  IF (a.deadline>pg_catalog.clock_timestamp() AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Expired during finalization reservation' USING ERRCODE='P2306';END IF;
  SELECT s.slot INTO proof_slot FROM hierarchy_scoped_ingestion_v1.finalization_slots s
  WHERE NOT(s.slot=ANY(visited_slots)) AND NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.final_intents i WHERE i.slot=s.slot)
  ORDER BY s.slot FOR UPDATE OF s SKIP LOCKED LIMIT 1;
  IF proof_slot IS NULL THEN RAISE EXCEPTION 'Finalization capacity' USING ERRCODE='P2303';END IF;
  visited_slots:=pg_catalog.array_append(visited_slots,proof_slot);
  -- Separate fresh SQL statement AFTER the candidate lock. Its selection
  -- snapshot may predate the prior owner's commit; never reuse that candidate.
  IF NOT EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.final_intents WHERE slot=proof_slot) THEN EXIT;END IF;
  proof_slot:=NULL;
 END LOOP;
 IF proof_slot IS NULL THEN RAISE EXCEPTION 'Finalization capacity' USING ERRCODE='P2303';END IF;
 IF (a.deadline>pg_catalog.clock_timestamp() AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Expired after finalization reservation' USING ERRCODE='P2306';END IF;
 INSERT INTO hierarchy_scoped_ingestion_v1.apply_context VALUES(pg_catalog.txid_current(),p_generation,p_operation,j.epoch,j.lease_until);
 -- Domain locks below precede the final authority row lock.
 IF j.mode='admission' THEN
 result:=hierarchy_scoped_ingestion_v1.admit_new(p->>0,(p->>1)::bigint,p->>2,p->>3,p->>4,p->>5,p->>6,p->>7,p->>8,j.body_values,j.title_values,p->>11);
 ELSE
 result:=hierarchy_scoped_ingestion_v1.update_source(p->>0,(p->>1)::bigint,p->>2,p->>3,p->>4,p->>5,p->>6,p->>7,p->>8,j.body_values,j.title_values,p->>11,
 (p->>12)::bigint,p->>13,p->>14);
 END IF;
 PERFORM hierarchy_scoped_ingestion_v1.before_publish();
 SELECT * INTO a FROM hierarchy_scoped_ingestion_v1.authorities WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp() AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Expired after mutation' USING ERRCODE='P2306';END IF;
 UPDATE hierarchy_scoped_ingestion_v1.authorities SET accepted=true WHERE generation=p_generation AND operation_id=p_operation;
 UPDATE hierarchy_scoped_ingestion_v1.jobs SET state='complete',params=NULL,material=NULL,source_url=NULL,body_values=NULL,title_values=NULL,
 worker=NULL,token=NULL,lease_until=NULL,receipt=result,completed_token_hash=hierarchy_scoped_ingestion_v1.sha(p_token)
 WHERE generation=p_generation AND operation_id=p_operation;
 INSERT INTO hierarchy_scoped_ingestion_v1.final_intents(generation,operation_id,epoch,lease_until,deadline,receipt_hash,slot)
 VALUES(p_generation,p_operation,j.epoch,j.lease_until,a.deadline,hierarchy_scoped_ingestion_v1.sha(result::text),proof_slot);
 DELETE FROM hierarchy_scoped_ingestion_v1.apply_context WHERE tx=pg_catalog.txid_current();
 RETURN result;
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.cleanup(p_generation text,p_operation text,p_principal text,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE address hierarchy_scoped_ingestion_v1.jobs%ROWTYPE;j hierarchy_scoped_ingestion_v1.jobs%ROWTYPE;BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
 SELECT * INTO address FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=p_generation AND operation_id=p_operation;
 IF NOT FOUND OR address.principal IS DISTINCT FROM p_principal OR address.command_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Job identity' USING ERRCODE='P2302';END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=address.source_id FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=address.source_id FOR UPDATE;
 SELECT * INTO j FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF j.state IN('pending','leased') AND EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.authorities WHERE generation=p_generation
 AND operation_id=p_operation AND (revoked OR deadline<=pg_catalog.clock_timestamp())) THEN
 PERFORM hierarchy_scoped_ingestion_v1.scrub_job(p_generation,p_operation,'cancelled','revoked-or-expired');END IF;
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.list_jobs(p_generation text,p_principal text,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'List capacity' USING ERRCODE='P2301';END IF;
 RETURN (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('operationId',operation_id,'state',state,'epoch',epoch)),'[]'::jsonb)
 FROM(SELECT operation_id,state,epoch FROM hierarchy_scoped_ingestion_v1.jobs WHERE generation=p_generation AND principal=p_principal ORDER BY operation_id COLLATE "C" LIMIT p_limit) j);
END $$;

CREATE FUNCTION hierarchy_scoped_ingestion_v1.retire_jobs(p_sources text[],p_actor text,p_all boolean,p_topics text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ids text[];BEGIN
 SELECT pg_catalog.array_agg(DISTINCT source_id COLLATE "C" ORDER BY source_id COLLATE "C") INTO ids FROM hierarchy_scoped_ingestion_v1.jobs
 WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics);
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=ANY(ids) ORDER BY source_id COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=ANY(ids) ORDER BY id COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM hierarchy_scoped_ingestion_v1.jobs WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics)
 ORDER BY generation COLLATE "C",operation_id COLLATE "C" FOR UPDATE;
 INSERT INTO hierarchy_scoped_ingestion_v1.retired_operations(generation,operation_id,kind)
 SELECT generation,operation_id,CASE WHEN mode='admission' THEN 'admission' WHEN receipt->>'renewed'='true' THEN 'renewal' ELSE 'update' END
 FROM hierarchy_scoped_ingestion_v1.jobs WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics) ON CONFLICT DO NOTHING;
 DELETE FROM hierarchy_scoped_ingestion_v1.jobs WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics);
END $$;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.queue_source_erasure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_scoped_ingestion_v1.retire_jobs(ARRAY[OLD.id],NULL,false,ARRAY[]::text[]);RETURN OLD;END $$;
CREATE TRIGGER scoped_queue_source_erasure BEFORE DELETE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION hierarchy_scoped_ingestion_v1.queue_source_erasure();

REVOKE ALL ON SCHEMA hierarchy_scoped_ingestion_v1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_scoped_ingestion_v1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_scoped_ingestion_v1 FROM PUBLIC;
