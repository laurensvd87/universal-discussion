-- OPT-IN DISPOSABLE PROTOTYPE ONLY. Never registered as migration 010.
-- Actual canonical FKs/writes; no queue, role grant, classifier or runtime hook.
CREATE SCHEMA hierarchy_fast_admission_v1;
CREATE TABLE hierarchy_fast_admission_v1.artifact (
 singleton boolean PRIMARY KEY CHECK(singleton), identity jsonb NOT NULL,
 artifact_hash text NOT NULL CHECK(artifact_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE hierarchy_fast_admission_v1.nodes (
 node_id text PRIMARY KEY CHECK(canonical_v4.runtime_safe_text(node_id,128,false)),
 feed_version bigint NOT NULL DEFAULT 0 CHECK(feed_version>=0)
);
CREATE TABLE hierarchy_fast_admission_v1.containers (
 topic_id text PRIMARY KEY REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL UNIQUE REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 source_id text UNIQUE REFERENCES canonical_v4.sources(id) ON DELETE SET NULL
);
CREATE TABLE hierarchy_fast_admission_v1.inputs (
 source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 generation text NOT NULL, source_version bigint NOT NULL CHECK(source_version>0),
 material text NOT NULL CHECK(octet_length(material)<=32768),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 witness_hash text NOT NULL UNIQUE CHECK(witness_hash ~ '^[a-f0-9]{64}$'),
 body_wire_hash text NOT NULL, title_wire_hash text NOT NULL,
 title_values double precision[] NOT NULL CHECK(cardinality(title_values)=384)
);
CREATE TABLE hierarchy_fast_admission_v1.decisions (
 source_id text PRIMARY KEY REFERENCES hierarchy_fast_admission_v1.inputs(source_id) ON DELETE CASCADE,
 node_id text REFERENCES hierarchy_fast_admission_v1.nodes(node_id)
);
CREATE TABLE hierarchy_fast_admission_v1.receipts (
 operation_id text PRIMARY KEY, operation_digest text NOT NULL,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 receipt jsonb NOT NULL
);
-- Protected one-command intent is not caller-mirrored canonical existence.
-- Its deferred FK must resolve to the root created in this SAME transaction.
CREATE TABLE hierarchy_fast_admission_v1.root_intents (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) DEFERRABLE INITIALLY DEFERRED,
 source_id text NOT NULL REFERENCES hierarchy_fast_admission_v1.inputs(source_id) ON DELETE CASCADE,
 witness_hash text NOT NULL
);
CREATE TABLE hierarchy_fast_admission_v1.root_snapshots (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) ON DELETE CASCADE,
 source_id text NOT NULL REFERENCES hierarchy_fast_admission_v1.inputs(source_id) ON DELETE CASCADE,
 topic_id text NOT NULL REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 witness_hash text NOT NULL, source_version bigint NOT NULL,
 artifact_hash text NOT NULL, node_id text REFERENCES hierarchy_fast_admission_v1.nodes(node_id)
);
CREATE INDEX fast_root_feed ON hierarchy_fast_admission_v1.root_snapshots(node_id,root_id);
CREATE INDEX fast_root_origin ON hierarchy_fast_admission_v1.root_snapshots(source_id,root_id);

CREATE FUNCTION hierarchy_fast_admission_v1.sha(v text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT encode(sha256(convert_to(v,'UTF8')),'hex') $$;
CREATE FUNCTION hierarchy_fast_admission_v1.wire_hash(v double precision[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT encode(sha256(array_send(v)),'hex') $$;
CREATE FUNCTION hierarchy_fast_admission_v1.reject_update() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Immutable fast admission evidence' USING ERRCODE='P2103'; END $$;
CREATE TRIGGER fast_artifact_immutable BEFORE UPDATE OR DELETE ON hierarchy_fast_admission_v1.artifact
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.reject_update();
CREATE TRIGGER fast_input_immutable BEFORE UPDATE ON hierarchy_fast_admission_v1.inputs
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.reject_update();
CREATE TRIGGER fast_snapshot_immutable BEFORE UPDATE ON hierarchy_fast_admission_v1.root_snapshots
FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.reject_update();

CREATE FUNCTION hierarchy_fast_admission_v1.publish(p_identity jsonb,p_nodes jsonb) RETURNS void
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
 INSERT INTO hierarchy_fast_admission_v1.artifact VALUES(true,p_identity,hierarchy_fast_admission_v1.sha(jsonb_build_object('identity',p_identity,'rootNodes',p_nodes)::text));
 INSERT INTO hierarchy_fast_admission_v1.nodes(node_id) SELECT n#>>'{}' FROM jsonb_array_elements(p_nodes) n;
END $$;

CREATE FUNCTION hierarchy_fast_admission_v1.assert_witness(p_source text,p_witness text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s canonical_v4.sources%ROWTYPE; i hierarchy_fast_admission_v1.inputs%ROWTYPE;
 e canonical_v4.embeddings%ROWTYPE; r canonical_v4.runtime_state%ROWTYPE; m jsonb;
BEGIN
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source FOR SHARE;
 SELECT * INTO i FROM hierarchy_fast_admission_v1.inputs WHERE source_id=p_source;
 SELECT * INTO e FROM canonical_v4.embeddings WHERE source_id=p_source FOR SHARE;
 SELECT * INTO r FROM canonical_v4.runtime_state WHERE singleton;
 m:=i.material::jsonb;
 IF s.id IS NULL OR i.source_id IS NULL OR e.source_id IS NULL OR
    p_witness IS DISTINCT FROM i.witness_hash OR s.policy_version<>'source-local-canonical-container/v1' OR
    i.generation IS DISTINCT FROM r.generation OR i.source_version IS DISTINCT FROM s.write_version OR
    s.url IS DISTINCT FROM m->>'url' OR s.title IS DISTINCT FROM m->>'title' OR
    s.extractor_version IS DISTINCT FROM m->>'extractorVersion' OR
    hierarchy_fast_admission_v1.sha(s.title) IS DISTINCT FROM m->>'titleHash' OR
    e.model_id IS DISTINCT FROM m->>'modelId' OR e.dimensions<>384 OR
    hierarchy_fast_admission_v1.wire_hash(e.values_double) IS DISTINCT FROM i.body_wire_hash OR
    hierarchy_fast_admission_v1.wire_hash(i.title_values) IS DISTINCT FROM i.title_wire_hash OR
    hierarchy_fast_admission_v1.sha(i.material) IS DISTINCT FROM i.input_hash THEN
  RAISE EXCEPTION 'Stale canonical paired witness' USING ERRCODE='P2102';
 END IF;
END $$;

CREATE FUNCTION hierarchy_fast_admission_v1.admit_new(
 p_generation text,p_revision bigint,p_operation text,p_material text,p_source text,p_topic text,p_discussion text,
 p_created text,p_stamp text,p_body double precision[],p_title double precision[],p_node text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb; a hierarchy_fast_admission_v1.artifact%ROWTYPE; runtime canonical_v4.runtime_state%ROWTYPE;
 prior hierarchy_fast_admission_v1.receipts%ROWTYPE; input_hash text; witness text; accepted bigint; result jsonb; embedding jsonb;
BEGIN
 IF p_material IS NULL OR octet_length(p_material)>32768 OR NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR
    p_revision IS NULL OR p_revision<0 OR NOT canonical_v4.runtime_safe_text(p_operation,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_source,128,false) OR NOT canonical_v4.runtime_safe_text(p_topic,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_discussion,128,false) OR NOT canonical_v4.runtime_safe_text(p_created,64,false) OR
    p_stamp IS NULL OR p_stamp !~ '^[a-f0-9]{64}$' OR
    p_body IS NULL OR p_title IS NULL OR NOT canonical_v4.ingest_valid_unit_vector(p_body) OR NOT canonical_v4.ingest_valid_unit_vector(p_title) THEN
  RAISE EXCEPTION 'Invalid fast admission' USING ERRCODE='P2101';
 END IF;
 m:=p_material::jsonb;input_hash:=hierarchy_fast_admission_v1.sha(p_material);
 SELECT * INTO a FROM hierarchy_fast_admission_v1.artifact WHERE singleton;
 IF NOT FOUND OR jsonb_typeof(m)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(m))<>12 OR
    NOT m ?& ARRAY['url','title','extractorVersion','modelId','bodyHash','titleHash','builderHash','encoderHash','representationHash','documentHash','bodyWireHash','titleWireHash'] OR
    EXISTS(SELECT 1 FROM jsonb_each(m) x WHERE jsonb_typeof(x.value)<>'string') OR
    NOT canonical_v4.runtime_safe_text(m->>'url',2048,false) OR m->>'url' !~ '^https://' OR
    NOT canonical_v4.runtime_safe_text(m->>'title',200,false) OR m->>'extractorVersion' NOT IN('main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1') OR
    EXISTS(SELECT 1 FROM jsonb_each_text(m) x WHERE x.key LIKE '%Hash' AND x.value !~ '^[a-f0-9]{64}$') OR
    m->>'titleHash' IS DISTINCT FROM hierarchy_fast_admission_v1.sha(m->>'title') OR
    m->>'bodyWireHash' IS DISTINCT FROM hierarchy_fast_admission_v1.wire_hash(p_body) OR
    m->>'titleWireHash' IS DISTINCT FROM hierarchy_fast_admission_v1.wire_hash(p_title) OR
    EXISTS(SELECT 1 FROM unnest(ARRAY['builderHash','encoderHash','representationHash','modelId']) k WHERE m->>k IS DISTINCT FROM a.identity->>k) OR
    p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_fast_admission_v1.nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid fast paired input or artifact' USING ERRCODE='P2101';
 END IF;
 -- Same brief queue-growth namespace as008/009. Never the Ridge catalog lane.
 PERFORM pg_advisory_xact_lock(914092008,1);
 SELECT * INTO runtime FROM canonical_v4.runtime_state WHERE singleton FOR SHARE;
 IF runtime.generation IS DISTINCT FROM p_generation OR p_revision>runtime.revision THEN
  RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2102';END IF;
 SELECT * INTO prior FROM hierarchy_fast_admission_v1.receipts WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.operation_digest<>input_hash THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2102';END IF;
  PERFORM hierarchy_fast_admission_v1.assert_witness(prior.source_id,prior.receipt->>'witnessHash');
  RETURN prior.receipt;
 END IF;
 IF runtime.source_absence_revision>p_revision OR EXISTS(SELECT 1 FROM canonical_v4.sources WHERE url COLLATE "C"=(m->>'url') COLLATE "C") OR
    EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE source_url=m->>'url' AND state IN('pending','leased')) THEN
  RAISE EXCEPTION 'Not an absent unqueued new Source' USING ERRCODE='P2102';END IF;
 INSERT INTO canonical_v4.id_registry VALUES(p_source,'sources'),(p_topic,'topics'),(p_discussion,'discussions');
 INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at,provenance,retain_tight,write_version)
 VALUES(p_topic,nextval('canonical_v4.topic_ordinal_sequence'),jsonb_build_object('id',p_topic,'kind','general','title','Page discussion','createdAt',p_created,
 'provenance','owner-local-learned-topic/v1','retainTight',false,'reference',NULL)::text,'general','Page discussion',p_created,'owner-local-learned-topic/v1',false,1);
 INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload,write_version) VALUES(p_discussion,p_topic,nextval('canonical_v4.discussion_ordinal_sequence'),jsonb_build_object('id',p_discussion,'topicId',p_topic)::text,0);
 INSERT INTO canonical_v4.fixed_references(topic_id,payload) VALUES(p_topic,'null');
 embedding:=jsonb_build_object('modelId',m->>'modelId','values',to_jsonb(p_body));
 INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding,write_version)
 VALUES(p_source,nextval('canonical_v4.source_ordinal_sequence'),jsonb_build_object('id',p_source,'url',m->>'url','title',m->>'title','embedding',embedding,
 'provenance','owner-local-page-embedding/v1','extractorVersion',m->>'extractorVersion','operationId',p_operation,'operationDigest',input_hash,
 'policyVersion','source-local-canonical-container/v1','topicIds',jsonb_build_array(p_topic))::text,m->>'url',m->>'title','owner-local-page-embedding/v1',m->>'extractorVersion','source-local-canonical-container/v1',p_operation,true,1);
 INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES(p_source,embedding::text,m->>'modelId',384,p_body);
 INSERT INTO canonical_v4.runtime_source_stamps(source_id,stamp,postable) VALUES(p_source,p_stamp,true);
 INSERT INTO canonical_v4.operation_receipts VALUES(p_source,p_operation,input_hash);
 INSERT INTO canonical_v4.topic_memberships VALUES(p_source,p_topic,0);
 INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES(p_source,p_topic,nextval('canonical_v4.source_link_ordinal_sequence'),jsonb_build_object('sourceId',p_source,'topicId',p_topic,'method','learned-provisional')::text,'learned-provisional');
 INSERT INTO hierarchy_fast_admission_v1.containers VALUES(p_topic,p_discussion,p_source);
 witness:=hierarchy_fast_admission_v1.sha(jsonb_build_array(p_generation,p_source,1,input_hash,m->>'bodyWireHash',m->>'titleWireHash')::text);
 INSERT INTO hierarchy_fast_admission_v1.inputs VALUES(p_source,p_generation,1,p_material,input_hash,witness,m->>'bodyWireHash',m->>'titleWireHash',p_title);
 INSERT INTO hierarchy_fast_admission_v1.decisions VALUES(p_source,p_node);
 UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1 WHERE singleton RETURNING revision INTO accepted;
 UPDATE canonical_v4.runtime_source_stamps SET catalog_revision=accepted WHERE source_id=p_source;
 result:=jsonb_build_object('schema','source-local-ingestion-receipt/v1','policyVersion','source-local-canonical-container/v1',
 'version',jsonb_build_object('generation',p_generation,'revision',accepted),'sourceId',p_source,'sourceVersion','1','topicId',p_topic,'discussionId',p_discussion,
 'inputHash',input_hash,'witnessHash',witness,'semanticNodeId',p_node,'artifactHash',a.artifact_hash,'experimental',true,'productionValidated',false,'assignmentAuthority',false);
 INSERT INTO hierarchy_fast_admission_v1.receipts VALUES(p_operation,input_hash,p_source,result);
 RETURN result;
END $$;

-- Source-local rows are append-only in this first slice. No implicit adoption,
-- update/revisit route, legacy worker material or historical binding is supported.
CREATE FUNCTION hierarchy_fast_admission_v1.guard_legacy_queue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.state IN('pending','leased') AND EXISTS(SELECT 1 FROM canonical_v4.sources s
 JOIN hierarchy_fast_admission_v1.containers c ON c.source_id=s.id WHERE s.url=NEW.source_url) THEN
  RAISE EXCEPTION 'Source-local policy requires versioned admission' USING ERRCODE='P2103';END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_legacy_queue BEFORE INSERT OR UPDATE ON canonical_v4.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.guard_legacy_queue();
CREATE FUNCTION hierarchy_fast_admission_v1.guard_source_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.policy_version='source-local-canonical-container/v1' THEN
  RAISE EXCEPTION 'Source-local update route not implemented' USING ERRCODE='P2103';END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_source_rewrite BEFORE UPDATE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.guard_source_update();

CREATE FUNCTION hierarchy_fast_admission_v1.root_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c hierarchy_fast_admission_v1.containers%ROWTYPE; i hierarchy_fast_admission_v1.root_intents%ROWTYPE;
 w hierarchy_fast_admission_v1.inputs%ROWTYPE; n text; a text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.root_id IS NULL AND EXISTS(SELECT 1 FROM hierarchy_fast_admission_v1.containers WHERE discussion_id=OLD.discussion_id) AND
    (NEW.discussion_id IS DISTINCT FROM OLD.discussion_id OR NEW.root_id IS DISTINCT FROM OLD.root_id) THEN
   RAISE EXCEPTION 'Immutable root destination' USING ERRCODE='P2103';END IF;
  IF NEW.withdrawn AND NOT OLD.withdrawn THEN
   DELETE FROM hierarchy_fast_admission_v1.root_snapshots WHERE root_id=OLD.id;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.root_id IS NOT NULL THEN RETURN NEW;END IF;
 SELECT * INTO c FROM hierarchy_fast_admission_v1.containers WHERE discussion_id=NEW.discussion_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT * INTO i FROM hierarchy_fast_admission_v1.root_intents WHERE root_id=NEW.id;
 IF NOT FOUND OR i.source_id IS DISTINCT FROM c.source_id OR NEW.origin_source_id IS DISTINCT FROM c.source_id THEN
  RAISE EXCEPTION 'Missing canonical atomic root intent' USING ERRCODE='P2103';END IF;
 PERFORM hierarchy_fast_admission_v1.assert_witness(i.source_id,i.witness_hash);
 SELECT * INTO w FROM hierarchy_fast_admission_v1.inputs WHERE source_id=i.source_id;
 SELECT node_id INTO n FROM hierarchy_fast_admission_v1.decisions WHERE source_id=i.source_id;
 SELECT artifact_hash INTO a FROM hierarchy_fast_admission_v1.artifact WHERE singleton;
 INSERT INTO hierarchy_fast_admission_v1.root_snapshots VALUES(NEW.id,i.source_id,c.topic_id,c.discussion_id,w.witness_hash,w.source_version,a,n);
 UPDATE hierarchy_fast_admission_v1.nodes SET feed_version=feed_version+1 WHERE node_id=n;
 DELETE FROM hierarchy_fast_admission_v1.root_intents WHERE root_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER fast_atomic_root AFTER INSERT ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.root_hook();
CREATE TRIGGER fast_stable_root BEFORE UPDATE ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.root_hook();

CREATE FUNCTION hierarchy_fast_admission_v1.create_root(p_actor text,p_request text,p_digest text,p_material text,p_generation text,
 p_topic text,p_body text,p_source text,p_root text,p_created text,p_witness text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE prepared record;
BEGIN
 IF canonical_v4.runtime_safe_text(p_actor,128,false) THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_actor,914092006));END IF;
 PERFORM hierarchy_fast_admission_v1.assert_witness(p_source,p_witness);
 IF NOT EXISTS(SELECT 1 FROM hierarchy_fast_admission_v1.containers WHERE source_id=p_source AND topic_id=p_topic) THEN
  RAISE EXCEPTION 'Source-local destination mismatch' USING ERRCODE='P2102';END IF;
 INSERT INTO hierarchy_fast_admission_v1.root_intents VALUES(p_root,p_source,p_witness);
 SELECT * INTO prepared FROM canonical_v4.runtime_prepare_command(p_actor,p_request,p_digest,p_material,p_generation,'create-root',p_topic,NULL,NULL,NULL,p_body,p_source,p_root,p_created);
 IF prepared.replayed THEN DELETE FROM hierarchy_fast_admission_v1.root_intents WHERE root_id=p_root;RETURN prepared.response_text;END IF;
 RETURN canonical_v4.runtime_complete_command(p_actor,p_request,p_generation,prepared.discussion_id,prepared.contribution_id,prepared.discussion_version);
END $$;

CREATE FUNCTION hierarchy_fast_admission_v1.reclassify(p_source text,p_witness text,p_node text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_fast_admission_v1.assert_witness(p_source,p_witness);
 UPDATE hierarchy_fast_admission_v1.decisions SET node_id=p_node WHERE source_id=p_source;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing decision' USING ERRCODE='P2102';END IF;
END $$;
CREATE FUNCTION hierarchy_fast_admission_v1.erasure_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE hierarchy_fast_admission_v1.nodes SET feed_version=feed_version+1 WHERE node_id=OLD.node_id;
 RETURN OLD;
END $$;
CREATE TRIGGER fast_origin_erasure BEFORE DELETE ON hierarchy_fast_admission_v1.root_snapshots FOR EACH ROW EXECUTE FUNCTION hierarchy_fast_admission_v1.erasure_hook();

CREATE FUNCTION hierarchy_fast_admission_v1.forget_local(p_generation text,p_source text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hierarchy_fast_admission_v1.containers WHERE source_id=p_source) THEN
  RAISE EXCEPTION 'Not a Source-local origin' USING ERRCODE='P2102';END IF;
 RETURN canonical_v4.ingest_forget_source(p_generation,p_source);
END $$;

REVOKE ALL ON SCHEMA hierarchy_fast_admission_v1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_fast_admission_v1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_fast_admission_v1 FROM PUBLIC;
-- NO application/worker grants. Future migration/dispatch/role review required.
