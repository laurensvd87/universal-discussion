-- OPT-IN DISPOSABLE PROTOTYPE ONLY. Never registered as migration 010.
-- Actual queued canonical FKs/writes; no serving grant, classifier or activation.
CREATE SCHEMA hierarchy_native_scoped_ingestion_v2;
-- Gate functions read intrinsic granted lock state; no caller-settable flag.
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.enter_gate(p_exclusive boolean) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF pg_catalog.pg_trigger_depth()<>0 THEN RAISE EXCEPTION 'External trigger entry rejected' USING ERRCODE='P2301';END IF;
 IF p_exclusive AND EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory'
  AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
  AND classid=914092220 AND objid=1 AND objsubid=2 AND granted AND mode='ShareLock')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory'
  AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
  AND classid=914092220 AND objid=1 AND objsubid=2 AND granted AND mode='ExclusiveLock') THEN
 RAISE EXCEPTION 'Shared lifecycle gate cannot upgrade' USING ERRCODE='P2301';END IF;
 IF p_exclusive THEN PERFORM pg_catalog.pg_advisory_xact_lock(914092220,1);
 ELSE
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(914092220,1);
  -- Every ordinary/legacy wrapper calls this before any domain lock. These
  -- shared locks permit concurrent writers and exclude lineage control changes.
  PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.lineages ORDER BY lineage_id COLLATE "C" FOR SHARE;
 END IF;
END $$;

-- One protected owner-wide lineage for this source slice. Installation takes
-- lifecycle exclusive, so no empty-registry phantom can bypass ordinary locks.
CREATE TABLE hierarchy_native_scoped_ingestion_v2.lineages (
 lineage_id text PRIMARY KEY, singleton boolean NOT NULL UNIQUE DEFAULT true CHECK(singleton),
 visibility_epoch bigint NOT NULL DEFAULT 1 CHECK(visibility_epoch>0)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.publications (
 record_hash text PRIMARY KEY CHECK(record_hash ~ '^[a-f0-9]{64}$'), publication_id text NOT NULL,
 incarnation text NOT NULL, revision bigint NOT NULL CHECK(revision>0), lineage_id text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.lineages,
 record jsonb NOT NULL, UNIQUE(publication_id,incarnation,revision)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.publication_heads (
 publication_id text PRIMARY KEY, record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications,
 head_revision bigint NOT NULL CHECK(head_revision>0), status text NOT NULL CHECK(status IN('accepted','revoked'))
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.publication_epochs (
 publication_id text NOT NULL, head_revision bigint NOT NULL, PRIMARY KEY(publication_id,head_revision)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.canonical_nodes (
 node_id text PRIMARY KEY, lineage_id text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.lineages,
 parent_id text REFERENCES hierarchy_native_scoped_ingestion_v2.canonical_nodes DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.publication_nodes (
 record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications,
 native_id text NOT NULL, node_id text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.canonical_nodes,
 parent_id text, depth integer NOT NULL CHECK(depth BETWEEN 1 AND 8),
 PRIMARY KEY(record_hash,node_id), UNIQUE(record_hash,native_id),
 FOREIGN KEY(record_hash,parent_id) REFERENCES hierarchy_native_scoped_ingestion_v2.publication_nodes(record_hash,node_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.ancestors (
 record_hash text NOT NULL, ancestor_id text NOT NULL, descendant_id text NOT NULL,
 distance integer NOT NULL CHECK(distance BETWEEN 0 AND 7), PRIMARY KEY(record_hash,ancestor_id,descendant_id),
 FOREIGN KEY(record_hash,ancestor_id) REFERENCES hierarchy_native_scoped_ingestion_v2.publication_nodes(record_hash,node_id),
 FOREIGN KEY(record_hash,descendant_id) REFERENCES hierarchy_native_scoped_ingestion_v2.publication_nodes(record_hash,node_id)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.owner_policies (
 principal text NOT NULL,lineage_id text PRIMARY KEY REFERENCES hierarchy_native_scoped_ingestion_v2.lineages,
 revision bigint NOT NULL CHECK(revision>0),settings jsonb NOT NULL,grouping_hash text NOT NULL CHECK(grouping_hash ~ '^[a-f0-9]{64}$'),
 record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.attestations (
 id text PRIMARY KEY, generation text NOT NULL, operation_id text NOT NULL, principal text NOT NULL,
 authority jsonb, deadline timestamptz NOT NULL, consumed_by text,revoked boolean NOT NULL DEFAULT false,
 UNIQUE(generation,operation_id)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.owner_policy_versions (
 record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications,
 revision bigint NOT NULL, lineage_id text NOT NULL,principal text NOT NULL,settings jsonb NOT NULL,grouping_hash text NOT NULL,
 PRIMARY KEY(record_hash,revision)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.issued_commands (
 id text PRIMARY KEY, attestation_id text NOT NULL UNIQUE REFERENCES hierarchy_native_scoped_ingestion_v2.attestations,
 generation text NOT NULL,operation_id text NOT NULL,principal text NOT NULL,request_hash text NOT NULL,
 record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications,
 head_revision bigint NOT NULL,kind text NOT NULL,mode text NOT NULL CHECK(mode IN('admission','update')),
 owner_revision bigint NOT NULL,description jsonb,params jsonb,deadline timestamptz NOT NULL,
 terminal_state text CHECK(terminal_state IN('expired','cancelled','erased')),
 UNIQUE(generation,operation_id), CHECK(description IS NOT NULL OR params IS NULL)
);
-- Transaction-local association is private table state, never a caller GUC.
CREATE TABLE hierarchy_native_scoped_ingestion_v2.issuance_context (
 tx bigint PRIMARY KEY,issued_id text NOT NULL
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.artifact (
 singleton boolean NOT NULL CHECK(singleton), identity jsonb NOT NULL,
 artifact_hash text PRIMARY KEY CHECK(artifact_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.nodes (
 node_id text PRIMARY KEY CHECK(canonical_v4.runtime_safe_text(node_id,128,false)),
 feed_version bigint NOT NULL DEFAULT 0 CHECK(feed_version>=0)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.containers (
 topic_id text PRIMARY KEY REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL UNIQUE REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 source_id text UNIQUE REFERENCES canonical_v4.sources(id) ON DELETE SET NULL,
 incarnation text
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.input_versions (
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 generation text NOT NULL, source_version bigint NOT NULL CHECK(source_version>0),
 material text NOT NULL CHECK(pg_catalog.octet_length(material)<=32768), input_hash text NOT NULL,
 witness_hash text NOT NULL UNIQUE, body_wire_hash text NOT NULL, title_wire_hash text NOT NULL,
 body_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(body_values)),
 title_values double precision[] NOT NULL CHECK(canonical_v4.ingest_valid_unit_vector(title_values)),
 source_stamp text NOT NULL,
 PRIMARY KEY(source_id,source_version)
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.decisions (
 source_id text NOT NULL, source_version bigint NOT NULL, decision_hash text NOT NULL,
 artifact_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.artifact(artifact_hash), node_id text REFERENCES hierarchy_native_scoped_ingestion_v2.nodes(node_id),
 PRIMARY KEY(source_id,source_version,decision_hash),
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_native_scoped_ingestion_v2.input_versions ON DELETE CASCADE
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.current_inputs (
 source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 source_version bigint NOT NULL, decision_hash text NOT NULL,
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_native_scoped_ingestion_v2.input_versions ON DELETE CASCADE,
 FOREIGN KEY(source_id,source_version,decision_hash) REFERENCES hierarchy_native_scoped_ingestion_v2.decisions ON DELETE CASCADE
);
CREATE VIEW hierarchy_native_scoped_ingestion_v2.inputs AS SELECT i.*,c.decision_hash FROM hierarchy_native_scoped_ingestion_v2.input_versions i JOIN hierarchy_native_scoped_ingestion_v2.current_inputs c USING(source_id,source_version);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.update_intents (
 source_id text PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 old_version bigint NOT NULL, new_payload text NOT NULL
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.operations (
 operation_id text PRIMARY KEY, command_hash text NOT NULL,
 source_id text REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 receipt jsonb NOT NULL
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.receipts (
 operation_id text PRIMARY KEY, operation_digest text NOT NULL,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 receipt jsonb NOT NULL
);
-- Minimal operation retirement survives erasure; intentionally no Source FK,
-- URL, input hash/material, vector, receipt, credential or destination.
CREATE TABLE hierarchy_native_scoped_ingestion_v2.retired_operations (
 generation text NOT NULL CHECK(canonical_v4.runtime_safe_text(generation,128,false)),
 operation_id text NOT NULL CHECK(canonical_v4.runtime_safe_text(operation_id,128,false)),
 kind text NOT NULL CHECK(kind IN('admission','update','renewal')),
 PRIMARY KEY(generation,operation_id)
);
-- Protected one-command intent is not caller-mirrored canonical existence.
-- Its deferred FK must resolve to the root created in this SAME transaction.
CREATE TABLE hierarchy_native_scoped_ingestion_v2.root_intents (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) DEFERRABLE INITIALLY DEFERRED,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 witness_hash text NOT NULL, decision_hash text NOT NULL
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.root_snapshots (
 root_id text PRIMARY KEY REFERENCES canonical_v4.contributions(id) ON DELETE CASCADE,
 source_id text NOT NULL REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 topic_id text NOT NULL REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
 discussion_id text NOT NULL REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
 witness_hash text NOT NULL, source_version bigint NOT NULL,
 artifact_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.artifact(artifact_hash), node_id text REFERENCES hierarchy_native_scoped_ingestion_v2.nodes(node_id),
 decision_hash text NOT NULL,
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_native_scoped_ingestion_v2.input_versions ON DELETE CASCADE,
 FOREIGN KEY(source_id,source_version,decision_hash) REFERENCES hierarchy_native_scoped_ingestion_v2.decisions ON DELETE CASCADE
);
CREATE INDEX fast_root_feed ON hierarchy_native_scoped_ingestion_v2.root_snapshots(node_id,root_id);
CREATE INDEX fast_root_origin ON hierarchy_native_scoped_ingestion_v2.root_snapshots(source_id,root_id);

CREATE TABLE hierarchy_native_scoped_ingestion_v2.observations (
 observation_id text PRIMARY KEY,source_id text NOT NULL,source_version bigint NOT NULL,
 nonce text NOT NULL,source_input_hash text NOT NULL,native_witness_hash text NOT NULL,rights_hash text NOT NULL,
 FOREIGN KEY(source_id,source_version) REFERENCES hierarchy_native_scoped_ingestion_v2.input_versions ON DELETE CASCADE
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.native_decisions (
 source_id text NOT NULL,source_version bigint NOT NULL,decision_hash text NOT NULL,
 observation_id text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.observations ON DELETE CASCADE,
 record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications,
 semantic jsonb NOT NULL,supported_path text[] NOT NULL,owner_revision bigint NOT NULL,grouping jsonb NOT NULL,
 PRIMARY KEY(source_id,source_version,decision_hash),
 FOREIGN KEY(record_hash,owner_revision) REFERENCES hierarchy_native_scoped_ingestion_v2.owner_policy_versions,
 FOREIGN KEY(source_id,source_version,decision_hash) REFERENCES hierarchy_native_scoped_ingestion_v2.decisions ON DELETE CASCADE
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.root_edges (
 root_id text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.root_snapshots ON DELETE CASCADE,
 record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications,
 ancestor_id text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.nodes,
 PRIMARY KEY(root_id,ancestor_id)
);
CREATE INDEX native_ancestor_root_feed ON hierarchy_native_scoped_ingestion_v2.root_edges(ancestor_id,root_id);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.root_native_bindings (
 root_id text PRIMARY KEY REFERENCES hierarchy_native_scoped_ingestion_v2.root_snapshots ON DELETE CASCADE,
 observation_id text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.observations ON DELETE CASCADE,
 record_hash text NOT NULL REFERENCES hierarchy_native_scoped_ingestion_v2.publications,
 owner_revision bigint NOT NULL,selected_path text[] NOT NULL,
 FOREIGN KEY(record_hash,owner_revision) REFERENCES hierarchy_native_scoped_ingestion_v2.owner_policy_versions
);

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.sha(v text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v,'UTF8')),'hex') $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.wire_hash(v double precision[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.array_send(v)),'hex') $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.active_artifact_hash() RETURNS text LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE result text; BEGIN
 SELECT i.record_hash INTO result FROM hierarchy_native_scoped_ingestion_v2.issuance_context c
 JOIN hierarchy_native_scoped_ingestion_v2.issued_commands i ON i.id=c.issued_id WHERE c.tx=pg_catalog.txid_current();
 IF result IS NULL THEN
 SELECT i.record_hash INTO result FROM hierarchy_native_scoped_ingestion_v2.apply_context c
 JOIN hierarchy_native_scoped_ingestion_v2.issued_commands i USING(generation,operation_id) WHERE c.tx=pg_catalog.txid_current();
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Immutable fast admission evidence' USING ERRCODE='P2103'; END $$;
CREATE TRIGGER fast_artifact_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.artifact
FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER fast_retirement_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.retired_operations
FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER fast_input_immutable BEFORE UPDATE ON hierarchy_native_scoped_ingestion_v2.input_versions
FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER fast_decision_immutable BEFORE UPDATE ON hierarchy_native_scoped_ingestion_v2.decisions
FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER fast_snapshot_immutable BEFORE UPDATE ON hierarchy_native_scoped_ingestion_v2.root_snapshots
FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.publish(p_identity jsonb,p_nodes jsonb) RETURNS void
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
 INSERT INTO hierarchy_native_scoped_ingestion_v2.artifact VALUES(true,p_identity,hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_object('identity',p_identity,'rootNodes',p_nodes)::text));
 INSERT INTO hierarchy_native_scoped_ingestion_v2.nodes(node_id) SELECT n#>>'{}' FROM pg_catalog.jsonb_array_elements(p_nodes) n;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.assert_witness(p_source text,p_witness text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s canonical_v4.sources%ROWTYPE; i hierarchy_native_scoped_ingestion_v2.inputs%ROWTYPE;
 e canonical_v4.embeddings%ROWTYPE; r canonical_v4.runtime_state%ROWTYPE; m jsonb;
BEGIN
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source FOR SHARE;
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=p_source;
 SELECT * INTO e FROM canonical_v4.embeddings WHERE source_id=p_source FOR SHARE;
 SELECT * INTO r FROM canonical_v4.runtime_state WHERE singleton;
 m:=i.material::jsonb;
 IF s.id IS NULL OR i.source_id IS NULL OR e.source_id IS NULL OR
    p_witness IS DISTINCT FROM i.witness_hash OR s.policy_version<>'source-local-scoped-container/v1' OR
    i.generation IS DISTINCT FROM r.generation OR i.source_version IS DISTINCT FROM s.write_version OR
    NOT s.has_embedding OR s.provenance<>'owner-local-page-embedding/v1' OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_source_stamps st WHERE st.source_id=s.id AND st.stamp=i.source_stamp AND st.postable) OR
    NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers c JOIN canonical_v4.source_links l ON l.source_id=c.source_id AND l.topic_id=c.topic_id
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
    hierarchy_native_scoped_ingestion_v2.wire_hash(i.body_values) IS DISTINCT FROM i.body_wire_hash OR
    s.url IS DISTINCT FROM m->>'url' OR s.title IS DISTINCT FROM m->>'title' OR
    s.extractor_version IS DISTINCT FROM m->>'extractorVersion' OR
    hierarchy_native_scoped_ingestion_v2.sha(s.title) IS DISTINCT FROM m->>'titleHash' OR
    e.model_id IS DISTINCT FROM m->>'modelId' OR e.dimensions<>384 OR
    hierarchy_native_scoped_ingestion_v2.wire_hash(e.values_double) IS DISTINCT FROM i.body_wire_hash OR
    hierarchy_native_scoped_ingestion_v2.wire_hash(i.title_values) IS DISTINCT FROM i.title_wire_hash OR
    hierarchy_native_scoped_ingestion_v2.sha(i.material) IS DISTINCT FROM i.input_hash THEN
  RAISE EXCEPTION 'Stale canonical paired witness' USING ERRCODE='P2102';
 END IF;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.admit_new(
 p_generation text,p_revision bigint,p_operation text,p_material text,p_source text,p_topic text,p_discussion text,
 p_created text,p_stamp text,p_body double precision[],p_title double precision[],p_node text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb; a hierarchy_native_scoped_ingestion_v2.artifact%ROWTYPE; runtime canonical_v4.runtime_state%ROWTYPE;
 prior hierarchy_native_scoped_ingestion_v2.receipts%ROWTYPE; input_hash text; witness text; accepted bigint; result jsonb; embedding jsonb;
BEGIN
 IF p_material IS NULL OR pg_catalog.octet_length(p_material)>32768 OR NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR
    p_revision IS NULL OR p_revision<0 OR NOT canonical_v4.runtime_safe_text(p_operation,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_source,128,false) OR NOT canonical_v4.runtime_safe_text(p_topic,128,false) OR
    NOT canonical_v4.runtime_safe_text(p_discussion,128,false) OR NOT canonical_v4.runtime_safe_text(p_created,64,false) OR
    p_stamp IS NULL OR p_stamp !~ '^[a-f0-9]{64}$' OR
    p_body IS NULL OR p_title IS NULL OR NOT canonical_v4.ingest_valid_unit_vector(p_body) OR NOT canonical_v4.ingest_valid_unit_vector(p_title) THEN
  RAISE EXCEPTION 'Invalid fast admission' USING ERRCODE='P2101';
 END IF;
 m:=p_material::jsonb;input_hash:=hierarchy_native_scoped_ingestion_v2.sha(p_material);
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.artifact WHERE artifact_hash=hierarchy_native_scoped_ingestion_v2.active_artifact_hash();
 IF NOT FOUND OR pg_catalog.jsonb_typeof(m)<>'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(m))<>12 OR
    NOT m ?& ARRAY['url','title','extractorVersion','modelId','bodyHash','titleHash','builderHash','encoderHash','representationHash','documentHash','bodyWireHash','titleWireHash'] OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(m) x WHERE pg_catalog.jsonb_typeof(x.value)<>'string') OR
    NOT canonical_v4.runtime_safe_text(m->>'url',2048,false) OR m->>'url' !~ '^https://' OR
    NOT canonical_v4.runtime_safe_text(m->>'title',200,false) OR m->>'extractorVersion' NOT IN('main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1') OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(m) x WHERE x.key LIKE '%Hash' AND x.value !~ '^[a-f0-9]{64}$') OR
    m->>'titleHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.sha(m->>'title') OR
    m->>'bodyWireHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.wire_hash(p_body) OR
    m->>'titleWireHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.wire_hash(p_title) OR
    EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['builderHash','encoderHash','representationHash','modelId']) k WHERE m->>k IS DISTINCT FROM a.identity->>k) OR
    p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid fast paired input or artifact' USING ERRCODE='P2101';
 END IF;
 -- Reservation was committed by enqueue; completion never acquires growth.
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 SELECT * INTO runtime FROM canonical_v4.runtime_state WHERE singleton;
 IF runtime.generation IS DISTINCT FROM p_generation OR p_revision>runtime.revision THEN
  RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2102';END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=p_generation AND operation_id=p_operation) THEN
  RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2102';END IF;
 SELECT * INTO prior FROM hierarchy_native_scoped_ingestion_v2.receipts WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.operation_digest<>input_hash THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2102';END IF;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.sources WHERE id=prior.source_id) THEN RAISE EXCEPTION 'Erased replay' USING ERRCODE='P2102';END IF;
  RETURN prior.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.sources WHERE url COLLATE "C"=(m->>'url') COLLATE "C") OR
    EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=p_operation) OR
    EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.operations WHERE operation_id=p_operation) OR
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
 INSERT INTO hierarchy_native_scoped_ingestion_v2.containers VALUES(p_topic,p_discussion,p_source);
 witness:=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(p_generation,p_source,1,input_hash,m->>'bodyWireHash',m->>'titleWireHash')::text);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.input_versions VALUES(p_source,p_generation,1,p_material,input_hash,witness,m->>'bodyWireHash',m->>'titleWireHash',p_body,p_title,p_stamp);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.decisions VALUES(p_source,1,hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(witness,a.artifact_hash,p_node)::text),a.artifact_hash,p_node);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.current_inputs SELECT source_id,source_version,decision_hash FROM hierarchy_native_scoped_ingestion_v2.decisions WHERE source_id=p_source;
 PERFORM hierarchy_native_scoped_ingestion_v2.before_publish();
 UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1 WHERE singleton AND generation=p_generation RETURNING revision INTO accepted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation changed at publication' USING ERRCODE='P2102';END IF;
 UPDATE canonical_v4.runtime_source_stamps SET catalog_revision=accepted WHERE source_id=p_source;
 result:=pg_catalog.jsonb_build_object('schema','source-local-scoped-receipt/v1','policyVersion','source-local-scoped-container/v1',
 'version',pg_catalog.jsonb_build_object('generation',p_generation,'revision',accepted),'sourceId',p_source,'sourceVersion','1','topicId',p_topic,'discussionId',p_discussion,
 'inputHash',input_hash,'witnessHash',witness,'decisionHash',hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(witness,a.artifact_hash,p_node)::text),'semanticNodeId',p_node,'artifactHash',a.artifact_hash,'experimental',true,'productionValidated',false,'assignmentAuthority',false);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.receipts VALUES(p_operation,input_hash,p_source,result);
 RETURN result;
END $$;

-- Only the exact private addressed command may rewrite these Sources.
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.guard_legacy_queue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.state IN('pending','leased') AND (EXISTS(SELECT 1 FROM canonical_v4.sources s
 JOIN hierarchy_native_scoped_ingestion_v2.containers c ON c.source_id=s.id WHERE s.url=NEW.source_url)
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.receipts WHERE operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.operations WHERE operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=NEW.generation AND operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.issued_commands i WHERE i.operation_id=NEW.operation_id OR i.params IS NOT NULL AND (i.params->>3)::jsonb->>'url'=NEW.source_url)
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs j WHERE j.operation_id=NEW.operation_id OR j.state IN('pending','leased') AND j.source_url=NEW.source_url)) THEN
  RAISE EXCEPTION 'Source-local policy requires versioned admission' USING ERRCODE='P2103';END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_legacy_queue BEFORE INSERT OR UPDATE ON canonical_v4.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.guard_legacy_queue();
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.retire_source_operations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 -- BEFORE Source deletion: all immutable versions and operation rows still
 -- exist before Source-FK cascades. Never acquire growth or lane locks here.
 INSERT INTO hierarchy_native_scoped_ingestion_v2.retired_operations(generation,operation_id,kind)
 SELECT DISTINCT i.generation,r.operation_id,'admission'
 FROM hierarchy_native_scoped_ingestion_v2.input_versions i JOIN hierarchy_native_scoped_ingestion_v2.receipts r ON r.source_id=i.source_id
 WHERE i.source_id=OLD.id ON CONFLICT DO NOTHING;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.retired_operations(generation,operation_id,kind)
 SELECT DISTINCT i.generation,o.operation_id,CASE WHEN o.receipt->>'renewed'='true' THEN 'renewal' ELSE 'update' END
 FROM hierarchy_native_scoped_ingestion_v2.input_versions i JOIN hierarchy_native_scoped_ingestion_v2.operations o ON o.source_id=i.source_id
 WHERE i.source_id=OLD.id ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;
CREATE TRIGGER fast_retire_before_source_erasure BEFORE DELETE ON canonical_v4.sources
FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.retire_source_operations();
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.guard_source_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.policy_version='source-local-scoped-container/v1' THEN
  DELETE FROM hierarchy_native_scoped_ingestion_v2.update_intents WHERE source_id=OLD.id AND old_version=OLD.write_version
   AND new_payload=NEW.payload AND NEW.write_version=OLD.write_version+1
   AND NEW.id=OLD.id AND NEW.url=OLD.url AND NEW.ordinal=OLD.ordinal
   AND NEW.policy_version=OLD.policy_version AND NEW.provenance=OLD.provenance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing exact private update intent' USING ERRCODE='P2103';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER fast_no_source_rewrite BEFORE UPDATE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.guard_source_update();

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.root_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c hierarchy_native_scoped_ingestion_v2.containers%ROWTYPE; i hierarchy_native_scoped_ingestion_v2.root_intents%ROWTYPE;
 w hierarchy_native_scoped_ingestion_v2.inputs%ROWTYPE; n text; a text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.root_id IS NULL AND EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers WHERE discussion_id=OLD.discussion_id) AND
    (NEW.discussion_id IS DISTINCT FROM OLD.discussion_id OR NEW.root_id IS DISTINCT FROM OLD.root_id) THEN
   RAISE EXCEPTION 'Immutable root destination' USING ERRCODE='P2103';END IF;
  IF NEW.withdrawn AND NOT OLD.withdrawn THEN
   DELETE FROM hierarchy_native_scoped_ingestion_v2.root_snapshots WHERE root_id=OLD.id;
  END IF;
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
   PERFORM hierarchy_native_scoped_ingestion_v2.dirty_feed((SELECT node_id FROM hierarchy_native_scoped_ingestion_v2.root_snapshots WHERE root_id=OLD.id));
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.root_id IS NOT NULL THEN RETURN NEW;END IF;
 SELECT * INTO c FROM hierarchy_native_scoped_ingestion_v2.containers WHERE discussion_id=NEW.discussion_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.root_intents WHERE root_id=NEW.id;
 IF NOT FOUND OR i.source_id IS DISTINCT FROM c.source_id OR NEW.origin_source_id IS DISTINCT FROM c.source_id THEN
  RAISE EXCEPTION 'Missing canonical atomic root intent' USING ERRCODE='P2103';END IF;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_witness(i.source_id,i.witness_hash);
 IF NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.current_inputs WHERE source_id=i.source_id AND decision_hash=i.decision_hash) THEN
 RAISE EXCEPTION 'Stale root intent' USING ERRCODE='P2102';END IF;
 SELECT * INTO w FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=i.source_id;
 SELECT d.node_id INTO n FROM hierarchy_native_scoped_ingestion_v2.decisions d JOIN hierarchy_native_scoped_ingestion_v2.current_inputs c USING(source_id,source_version,decision_hash) WHERE d.source_id=i.source_id;
 SELECT artifact_hash INTO a FROM hierarchy_native_scoped_ingestion_v2.decisions
 WHERE source_id=w.source_id AND source_version=w.source_version AND decision_hash=w.decision_hash;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.root_snapshots VALUES(NEW.id,i.source_id,c.topic_id,c.discussion_id,w.witness_hash,w.source_version,a,n,w.decision_hash);
 PERFORM hierarchy_native_scoped_ingestion_v2.dirty_feed(n);
 DELETE FROM hierarchy_native_scoped_ingestion_v2.root_intents WHERE root_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER fast_atomic_root AFTER INSERT ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.root_hook();
CREATE TRIGGER fast_stable_root BEFORE UPDATE ON canonical_v4.contributions FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.root_hook();

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.create_root(p_actor text,p_request text,p_digest text,p_material text,p_generation text,
 p_topic text,p_body text,p_source text,p_root text,p_created text,p_witness text,p_decision text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE prepared record;historical canonical_v4.command_receipts%ROWTYPE;
BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF canonical_v4.runtime_safe_text(p_actor,128,false) THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor,914092006));END IF;
 SELECT * INTO historical FROM canonical_v4.command_receipts WHERE actor_id=p_actor AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
 IF historical.command_type IS DISTINCT FROM 'create-root' OR historical.response_text IS NULL THEN RAISE EXCEPTION 'Root replay unavailable' USING ERRCODE='P2102';END IF;
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.root_snapshots s WHERE s.root_id=historical.contribution_id
 AND s.source_id=p_source AND s.topic_id=p_topic AND s.discussion_id=historical.discussion_id
 AND s.witness_hash=p_witness AND s.decision_hash=p_decision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Historical root binding unavailable' USING ERRCODE='P2102';END IF;
 -- Actual canonical prepare validates exact material/digest/generation and
 -- returns the existing receipt BEFORE Source/domain access. No fresh intent,
 -- allocation, current-decision authority or root insertion is minted here.
 SELECT * INTO prepared FROM canonical_v4.runtime_prepare_command(p_actor,p_request,p_digest,p_material,p_generation,'create-root',p_topic,NULL,NULL,NULL,p_body,p_source,p_root,p_created);
 IF prepared.replayed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Root replay changed' USING ERRCODE='P2102';END IF;
 RETURN prepared.response_text;
 END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers WHERE source_id=p_source AND topic_id=p_topic) THEN
  RAISE EXCEPTION 'Source-local destination mismatch' USING ERRCODE='P2102';END IF;
 IF NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.current_inputs WHERE source_id=p_source AND decision_hash=p_decision) THEN
  RAISE EXCEPTION 'Stale decision' USING ERRCODE='P2102';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.root_intents VALUES(p_root,p_source,p_witness,p_decision);
 SELECT * INTO prepared FROM canonical_v4.runtime_prepare_command(p_actor,p_request,p_digest,p_material,p_generation,'create-root',p_topic,NULL,NULL,NULL,p_body,p_source,p_root,p_created);
 IF prepared.replayed THEN DELETE FROM hierarchy_native_scoped_ingestion_v2.root_intents WHERE root_id=p_root;RETURN prepared.response_text;END IF;
 RETURN canonical_v4.runtime_complete_command(p_actor,p_request,p_generation,prepared.discussion_id,prepared.contribution_id,prepared.discussion_version);
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.reclassify(p_source text,p_witness text,p_decision text,p_node text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i hierarchy_native_scoped_ingestion_v2.inputs%ROWTYPE; a text; d text; BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 -- Exclusive Source lock first avoids concurrent shared-lock upgrades and
 -- keeps create-root's shared Source witness stable through canonical commit.
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=p_source FOR UPDATE;
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.current_inputs WHERE source_id=p_source FOR UPDATE;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_witness(p_source,p_witness);
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=p_source;
 IF i.decision_hash IS DISTINCT FROM p_decision THEN RAISE EXCEPTION 'Stale decision' USING ERRCODE='P2102';END IF;
 SELECT artifact_hash INTO a FROM hierarchy_native_scoped_ingestion_v2.artifact WHERE singleton;
 d:=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(p_witness,a,p_node,p_decision)::text);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.decisions VALUES(p_source,i.source_version,d,a,p_node);
 UPDATE hierarchy_native_scoped_ingestion_v2.current_inputs SET decision_hash=d WHERE source_id=p_source;
 RETURN pg_catalog.jsonb_build_object('sourceId',p_source,'sourceVersion',i.source_version::text,'witnessHash',p_witness,'decisionHash',d);
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.erasure_hook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.dirty_feed(OLD.node_id);
 RETURN OLD;
END $$;
CREATE TRIGGER fast_origin_erasure BEFORE DELETE ON hierarchy_native_scoped_ingestion_v2.root_snapshots FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.erasure_hook();

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.forget_local(p_generation text,p_source text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers WHERE source_id=p_source) THEN
  RAISE EXCEPTION 'Not a Source-local origin' USING ERRCODE='P2102';END IF;
 RETURN hierarchy_native_scoped_ingestion_v2.scoped_forget(p_generation,p_source);
END $$;


-- One addressed synchronous command, no queued/worker authority.
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.update_source(
 p_generation text,p_revision bigint,p_operation text,p_material text,p_source text,p_topic text,p_discussion text,
 p_created text,p_stamp text,p_body double precision[],p_title double precision[],p_node text,
 p_version bigint,p_witness text,p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb; a hierarchy_native_scoped_ingestion_v2.artifact%ROWTYPE; input_hash text;
 i hierarchy_native_scoped_ingestion_v2.inputs%ROWTYPE; previous hierarchy_native_scoped_ingestion_v2.operations%ROWTYPE; s canonical_v4.sources%ROWTYPE;
 command_hash text; witness text; decision text; result jsonb; embedding jsonb; next_version bigint; accepted bigint; new_payload_text text;
BEGIN
 IF p_material IS NULL OR pg_catalog.octet_length(p_material)>32768 OR p_stamp IS NULL OR p_stamp !~ '^[a-f0-9]{64}$'
 OR NOT canonical_v4.ingest_valid_unit_vector(p_body) OR NOT canonical_v4.ingest_valid_unit_vector(p_title)
 OR NOT canonical_v4.runtime_safe_text(p_operation,128,false) THEN RAISE EXCEPTION 'Invalid update' USING ERRCODE='P2101';END IF;
 m:=p_material::jsonb;input_hash:=hierarchy_native_scoped_ingestion_v2.sha(p_material);
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.artifact WHERE artifact_hash=hierarchy_native_scoped_ingestion_v2.active_artifact_hash();
 IF NOT FOUND OR pg_catalog.jsonb_typeof(m)<>'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(m))<>12 OR
    NOT m ?& ARRAY['url','title','extractorVersion','modelId','bodyHash','titleHash','builderHash','encoderHash','representationHash','documentHash','bodyWireHash','titleWireHash'] OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(m) x WHERE pg_catalog.jsonb_typeof(x.value)<>'string') OR
    NOT canonical_v4.runtime_safe_text(m->>'url',2048,false) OR m->>'url' !~ '^https://' OR
    NOT canonical_v4.runtime_safe_text(m->>'title',200,false) OR m->>'extractorVersion' NOT IN('main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1') OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(m) x WHERE x.key LIKE '%Hash' AND x.value !~ '^[a-f0-9]{64}$') OR
    m->>'titleHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.sha(m->>'title') OR
    m->>'bodyWireHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.wire_hash(p_body) OR
    m->>'titleWireHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.wire_hash(p_title) OR
    EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['builderHash','encoderHash','representationHash','modelId']) k WHERE m->>k IS DISTINCT FROM a.identity->>k) OR
    p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.nodes WHERE node_id=p_node) THEN
  RAISE EXCEPTION 'Invalid fast paired input or artifact' USING ERRCODE='P2101';
 END IF;

 command_hash:=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(p_generation,p_revision,p_operation,p_material,p_source,p_topic,p_discussion,p_created,
  p_stamp,m->>'bodyWireHash',m->>'titleWireHash',p_node,p_version,p_witness,p_decision)::text);
 -- Enqueue already committed the operation reservation. Completion takes no
 -- growth or legacy lane; receipt -> Source -> pointer -> destinations -> roots.
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=p_generation AND operation_id=p_operation) THEN
  RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2102';END IF;
 SELECT * INTO previous FROM hierarchy_native_scoped_ingestion_v2.operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF previous.command_hash IS DISTINCT FROM command_hash THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2102';END IF;
  RETURN previous.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.receipts WHERE operation_id=p_operation)
 OR EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=p_operation)
 OR EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=p_operation) THEN
 RAISE EXCEPTION 'Operation reserved' USING ERRCODE='P2102';END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR UPDATE;
 SELECT * INTO s FROM canonical_v4.sources WHERE id=p_source FOR UPDATE;
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.current_inputs WHERE source_id=p_source FOR UPDATE;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_witness(p_source,p_witness);
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=p_source;
 IF p_version IS DISTINCT FROM i.source_version OR p_decision IS DISTINCT FROM i.decision_hash OR
  m->>'url' IS DISTINCT FROM s.url OR NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers
    WHERE source_id=p_source AND topic_id=p_topic AND discussion_id=p_discussion) OR
  NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation AND revision>=p_revision) THEN
  RAISE EXCEPTION 'Stale addressed update' USING ERRCODE='P2102';END IF;
 -- JSON object order is not input material; every immutable value and both wire hashes are.
 IF m=i.material::jsonb AND p_stamp=i.source_stamp THEN
  SELECT receipt INTO result FROM hierarchy_native_scoped_ingestion_v2.receipts WHERE source_id=p_source ORDER BY operation_id LIMIT 1;
  result:=result || pg_catalog.jsonb_build_object('version',(SELECT pg_catalog.jsonb_build_object('generation',generation,'revision',revision) FROM canonical_v4.runtime_state WHERE singleton),
   'sourceVersion',i.source_version::text,'inputHash',i.input_hash,'witnessHash',i.witness_hash,
   'decisionHash',i.decision_hash,'semanticNodeId',(SELECT node_id FROM hierarchy_native_scoped_ingestion_v2.decisions
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
  witness:=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(p_generation,p_source,next_version,input_hash,m->>'bodyWireHash',m->>'titleWireHash')::text);
  decision:=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(witness,a.artifact_hash,p_node)::text);
  INSERT INTO hierarchy_native_scoped_ingestion_v2.input_versions VALUES(p_source,p_generation,next_version,p_material,input_hash,witness,
   m->>'bodyWireHash',m->>'titleWireHash',p_body,p_title,p_stamp);
  INSERT INTO hierarchy_native_scoped_ingestion_v2.decisions VALUES(p_source,next_version,decision,a.artifact_hash,p_node);
  embedding:=pg_catalog.jsonb_build_object('modelId',m->>'modelId','values',pg_catalog.to_jsonb(p_body));
  new_payload_text:=(s.payload::jsonb || pg_catalog.jsonb_build_object('title',m->>'title','extractorVersion',m->>'extractorVersion',
   'embedding',embedding,'operationId',p_operation,'operationDigest',command_hash))::text;
  INSERT INTO hierarchy_native_scoped_ingestion_v2.update_intents VALUES(p_source,s.write_version,new_payload_text);
  UPDATE canonical_v4.sources SET payload=new_payload_text,title=m->>'title',extractor_version=m->>'extractorVersion',
   operation_id=p_operation,write_version=next_version WHERE id=p_source;
  UPDATE canonical_v4.embeddings SET payload=embedding::text,model_id=m->>'modelId',values_double=p_body WHERE source_id=p_source;
  UPDATE canonical_v4.operation_receipts SET operation_id=p_operation,operation_digest=command_hash WHERE source_id=p_source;
  PERFORM hierarchy_native_scoped_ingestion_v2.before_publish();
 UPDATE canonical_v4.runtime_state SET revision=revision+1,catalog_version=catalog_version+1 WHERE singleton AND generation=p_generation RETURNING revision INTO accepted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation changed at publication' USING ERRCODE='P2102';END IF;
  UPDATE canonical_v4.runtime_source_stamps SET stamp=p_stamp,catalog_revision=accepted WHERE source_id=p_source;
  UPDATE hierarchy_native_scoped_ingestion_v2.current_inputs SET source_version=next_version,decision_hash=decision WHERE source_id=p_source;
  result:=pg_catalog.jsonb_build_object('schema','source-local-scoped-receipt/v1','policyVersion','source-local-scoped-container/v1',
   'version',pg_catalog.jsonb_build_object('generation',p_generation,'revision',accepted),'sourceId',p_source,'sourceVersion',next_version::text,
   'topicId',p_topic,'discussionId',p_discussion,'inputHash',input_hash,'witnessHash',witness,'decisionHash',decision,
   'semanticNodeId',p_node,'artifactHash',a.artifact_hash,'experimental',true,'assignmentAuthority',false,'productionValidated',false);
 END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.operations VALUES(p_operation,command_hash,p_source,result);
 RETURN result;
END $$;


CREATE TABLE hierarchy_native_scoped_ingestion_v2.jobs (
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
CREATE UNIQUE INDEX scoped_live_source ON hierarchy_native_scoped_ingestion_v2.jobs(source_id) WHERE state IN('pending','leased');
CREATE UNIQUE INDEX scoped_live_url ON hierarchy_native_scoped_ingestion_v2.jobs(source_url) WHERE state IN('pending','leased');
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.job_summary(j hierarchy_native_scoped_ingestion_v2.jobs) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pg_catalog.jsonb_build_object('generation',j.generation,'operationId',j.operation_id,'command_hash',j.command_hash,
 'state',j.state,'epoch',j.epoch,'receipt',j.receipt,'code',j.code)
$$;
CREATE TABLE hierarchy_native_scoped_ingestion_v2.authorities (
 generation text NOT NULL,operation_id text NOT NULL, deadline timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false,
 accepted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(generation,operation_id), FOREIGN KEY(generation,operation_id) REFERENCES hierarchy_native_scoped_ingestion_v2.jobs ON DELETE CASCADE
);
-- Fixed private slots make the proof bound race-safe without a global mutex.
CREATE TABLE hierarchy_native_scoped_ingestion_v2.finalization_slots(slot integer PRIMARY KEY CHECK(slot BETWEEN 1 AND 4096));
INSERT INTO hierarchy_native_scoped_ingestion_v2.finalization_slots SELECT pg_catalog.generate_series(1,4096);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.final_intents(
 generation text NOT NULL,operation_id text NOT NULL,epoch integer NOT NULL,lease_until timestamptz NOT NULL,
 slot integer NOT NULL UNIQUE REFERENCES hierarchy_native_scoped_ingestion_v2.finalization_slots,
 tx bigint NOT NULL DEFAULT pg_catalog.txid_current(), deadline timestamptz NOT NULL,receipt_hash text NOT NULL, finalized_at timestamptz,
 PRIMARY KEY(generation,operation_id),FOREIGN KEY(generation,operation_id) REFERENCES hierarchy_native_scoped_ingestion_v2.jobs ON DELETE CASCADE
);
CREATE TABLE hierarchy_native_scoped_ingestion_v2.feed_dirty(tx bigint NOT NULL,node_id text NOT NULL,delta bigint NOT NULL,PRIMARY KEY(tx,node_id));
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.dirty_feed(p_node text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_node IS NOT NULL THEN INSERT INTO hierarchy_native_scoped_ingestion_v2.feed_dirty VALUES(pg_catalog.txid_current(),p_node,1)
 ON CONFLICT(tx,node_id) DO UPDATE SET delta=hierarchy_native_scoped_ingestion_v2.feed_dirty.delta+1;END IF;
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.flush_feed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF (pg_catalog.current_query() IN('COMMIT','COMMIT;')) IS DISTINCT FROM true OR pg_catalog.pg_trigger_depth()<>1 THEN
  RAISE EXCEPTION 'Feed flush requires outer literal commit' USING ERRCODE='P2305';END IF;
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.nodes n WHERE node_id IN(SELECT d.node_id FROM hierarchy_native_scoped_ingestion_v2.feed_dirty d WHERE tx=pg_catalog.txid_current())
 ORDER BY node_id COLLATE "C" FOR UPDATE;
 UPDATE hierarchy_native_scoped_ingestion_v2.nodes n SET feed_version=n.feed_version+d.delta FROM hierarchy_native_scoped_ingestion_v2.feed_dirty d
 WHERE d.tx=pg_catalog.txid_current() AND d.node_id=n.node_id;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.feed_dirty WHERE tx=pg_catalog.txid_current();
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER scoped_feed_commit AFTER INSERT ON hierarchy_native_scoped_ingestion_v2.feed_dirty DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.flush_feed();
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.finalize_commit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a hierarchy_native_scoped_ingestion_v2.authorities%ROWTYPE; j hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE;
 proof hierarchy_native_scoped_ingestion_v2.final_intents%ROWTYPE; final_time timestamptz;
BEGIN
 IF (pg_catalog.current_query() IN('COMMIT','COMMIT;')) IS DISTINCT FROM true OR pg_catalog.pg_trigger_depth()<>1 THEN
  RAISE EXCEPTION 'Authorization requires outer literal commit' USING ERRCODE='P2305';END IF;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.authorities WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 SELECT * INTO j FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 SELECT * INTO proof FROM hierarchy_native_scoped_ingestion_v2.final_intents WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 IF proof.tx IS DISTINCT FROM pg_catalog.txid_current() OR proof.tx IS DISTINCT FROM NEW.tx
 OR proof.slot IS DISTINCT FROM NEW.slot OR proof.deadline IS DISTINCT FROM NEW.deadline OR proof.receipt_hash IS DISTINCT FROM NEW.receipt_hash
 OR proof.epoch IS DISTINCT FROM NEW.epoch OR j.epoch IS DISTINCT FROM NEW.epoch
 OR j.state IS DISTINCT FROM 'complete' OR a.revoked IS DISTINCT FROM false OR a.accepted IS DISTINCT FROM true
 OR proof.deadline IS DISTINCT FROM a.deadline OR proof.lease_until IS DISTINCT FROM NEW.lease_until
 OR proof.receipt_hash IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.sha(j.receipt::text) THEN
 RAISE EXCEPTION 'Invalid server finalization identity' USING ERRCODE='P2306';END IF;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_publication(NEW.generation,NEW.operation_id);
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
 UPDATE hierarchy_native_scoped_ingestion_v2.final_intents SET finalized_at=final_time
 WHERE generation=NEW.generation AND operation_id=NEW.operation_id AND tx=pg_catalog.txid_current();
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER scoped_authorized_commit AFTER INSERT ON hierarchy_native_scoped_ingestion_v2.final_intents
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.finalize_commit();
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.cleanup_finalizations() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 DELETE FROM hierarchy_native_scoped_ingestion_v2.final_intents WHERE (generation,operation_id) IN(
 SELECT generation,operation_id FROM hierarchy_native_scoped_ingestion_v2.final_intents
 WHERE tx<>pg_catalog.txid_current() AND finalized_at IS NOT NULL ORDER BY generation COLLATE "C",operation_id COLLATE "C" LIMIT 100);
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.scrub_job(p_generation text,p_operation text,p_state text,p_code text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE hierarchy_native_scoped_ingestion_v2.jobs SET state=p_state,params=NULL,material=NULL,source_url=NULL,body_values=NULL,title_values=NULL,
 worker=NULL,token=NULL,lease_until=NULL,receipt=NULL,completed_token_hash=NULL,code=p_code
 WHERE generation=p_generation AND operation_id=p_operation
$$;
-- Validate primitive types and finite encoded input BEFORE vector casts, hashes,
-- locks or storage. Vector wire text is temporary, not duplicated in params.
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.validate_params(p_mode text,p_params jsonb) RETURNS void
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
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.enqueue(p_kind text,p_principal text,p_mode text,p_params jsonb,p_seconds integer,p_proof text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g text; op text; src text; topic text; m jsonb; h text; old hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE;
 body double precision[]; title double precision[]; r canonical_v4.runtime_state%ROWTYPE; i hierarchy_native_scoped_ingestion_v2.inputs%ROWTYPE;
BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF p_kind IS NULL OR p_principal IS NULL OR p_mode IS NULL OR p_seconds IS NULL OR p_proof IS NULL OR p_params IS NULL
 OR p_kind NOT IN('actor','crawler') OR p_kind='crawler' AND p_principal<>'crawler-public/v1'
 OR p_kind='actor' AND p_principal !~ '^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR p_mode NOT IN('admission','update') OR p_seconds NOT BETWEEN 1 AND 30 OR pg_catalog.octet_length(p_proof)<>64 OR p_proof !~ '^[a-f0-9]{64}$' THEN
 RAISE EXCEPTION 'Invalid scoped command' USING ERRCODE='P2301';END IF;
 PERFORM hierarchy_native_scoped_ingestion_v2.validate_params(p_mode,p_params);
 g:=p_params->>0;op:=p_params->>2;src:=p_params->>4;topic:=p_params->>5;m:=(p_params->>3)::jsonb;
 IF p_params->>1 IS NULL OR p_params->>3 IS NULL OR pg_catalog.octet_length(p_params->>3)>32768 OR NOT canonical_v4.runtime_safe_text(op,128,false)
 OR NOT canonical_v4.runtime_safe_text(src,128,false) THEN RAISE EXCEPTION 'Unbounded command' USING ERRCODE='P2301';END IF;
 body:=(p_params->>9)::double precision[];title:=(p_params->>10)::double precision[];
 IF NOT canonical_v4.ingest_valid_unit_vector(body) OR NOT canonical_v4.ingest_valid_unit_vector(title)
 OR m->>'bodyWireHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.wire_hash(body)
 OR m->>'titleWireHash' IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.wire_hash(title)
 OR ((p_params->>11) IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.nodes WHERE node_id=p_params->>11))
 OR NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.artifact a WHERE a.artifact_hash=hierarchy_native_scoped_ingestion_v2.active_artifact_hash()
 AND a.identity->>'builderHash'=m->>'builderHash' AND a.identity->>'encoderHash'=m->>'encoderHash'
 AND a.identity->>'representationHash'=m->>'representationHash' AND a.identity->>'modelId'=m->>'modelId') THEN
 RAISE EXCEPTION 'Invalid paired artifact' USING ERRCODE='P2301';END IF;
 -- First server allocations/time are retained, never minted again on replay.
 h:=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(p_kind,p_principal,p_mode,
  CASE WHEN p_mode='admission' THEN pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(p_params,'{4}','null'),'{5}','null'),'{6}','null'),'{7}','null') ELSE p_params END,p_proof)::text);
 IF p_kind='actor' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_principal,914092006));END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(914092008,1);
 SELECT * INTO r FROM canonical_v4.runtime_state WHERE singleton;
 IF r.generation IS DISTINCT FROM g OR (p_params->>1)::bigint>r.revision
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=g AND operation_id=op) THEN
 RAISE EXCEPTION 'Stale generation or retired operation' USING ERRCODE='P2302';END IF;
 SELECT * INTO old FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=g AND operation_id=op FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF old.command_hash IS DISTINCT FROM h OR old.principal IS DISTINCT FROM p_principal THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2302';END IF;
  RETURN hierarchy_native_scoped_ingestion_v2.job_summary(old);
 END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=op OR source_url=m->>'url' AND state IN('pending','leased'))
 OR EXISTS(SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=op)
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs j WHERE j.operation_id=op OR j.state IN('pending','leased') AND
  (j.source_url=m->>'url' OR j.source_id=src))
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.receipts WHERE operation_id=op)
 OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.operations WHERE operation_id=op) THEN
 RAISE EXCEPTION 'Operation or URL reserved' USING ERRCODE='P2302';END IF;
 IF p_mode='admission' THEN
  IF r.source_absence_revision>(p_params->>1)::bigint OR EXISTS(SELECT 1 FROM canonical_v4.sources WHERE url=m->>'url')
  OR EXISTS(SELECT 1 FROM canonical_v4.id_registry WHERE id IN(src,topic,p_params->>6))
  OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs j WHERE state IN('pending','leased') AND
   (j.source_id IN(src,topic,p_params->>6) OR j.topic_id IN(src,topic,p_params->>6) OR (j.params->>6) IN(src,topic,p_params->>6))) THEN
   RAISE EXCEPTION 'New Source required' USING ERRCODE='P2302';END IF;
 ELSE
  PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=src FOR SHARE NOWAIT;
  PERFORM 1 FROM canonical_v4.sources WHERE id=src FOR SHARE NOWAIT;
  PERFORM 1 FROM canonical_v4.embeddings WHERE source_id=src FOR SHARE NOWAIT;
  PERFORM hierarchy_native_scoped_ingestion_v2.assert_witness(src,p_params->>13);
  SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=src;
  IF i.source_version IS DISTINCT FROM (p_params->>12)::bigint OR i.decision_hash IS DISTINCT FROM p_params->>14 THEN
  RAISE EXCEPTION 'Stale prior' USING ERRCODE='P2302';END IF;
 END IF;
 IF (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE state IN('pending','leased'))>=4096
 OR (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE state IN('pending','leased') AND principal=p_principal)>=
 (CASE WHEN p_kind='actor' THEN 32 ELSE 1024 END) THEN RAISE EXCEPTION 'Queue capacity' USING ERRCODE='P2303';END IF;
 -- Original reservation/NOWAIT Source checks precede private issuer locks.
 PERFORM hierarchy_native_scoped_ingestion_v2.lock_issued_enqueue(g,op,p_principal,p_params);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.jobs(generation,operation_id,origin_kind,principal,command_hash,mode,source_id,topic_id,source_url,params,material,body_values,title_values,state)
 VALUES(g,op,p_kind,p_principal,h,p_mode,src,topic,m->>'url',pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(p_params,'{3}','null'),'{9}','null'),'{10}','null'),p_params->>3,body,title,'pending');
 INSERT INTO hierarchy_native_scoped_ingestion_v2.authorities(generation,operation_id,deadline,revoked)
 SELECT g,op,i.deadline,false FROM hierarchy_native_scoped_ingestion_v2.issuance_context c JOIN hierarchy_native_scoped_ingestion_v2.issued_commands i ON i.id=c.issued_id WHERE c.tx=pg_catalog.txid_current();
 UPDATE hierarchy_native_scoped_ingestion_v2.issued_commands SET params=NULL WHERE generation=g AND operation_id=op;
 RETURN pg_catalog.jsonb_build_object('generation',g,'operationId',op,'commandHash',h,'state','pending');
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.claim(p_generation text,p_operation text,p_principal text,p_hash text,p_worker text,p_token text,p_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE; a hierarchy_native_scoped_ingestion_v2.authorities%ROWTYPE;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 15 OR NOT canonical_v4.runtime_safe_text(p_worker,128,false)
 OR NOT canonical_v4.runtime_safe_text(p_token,128,false) THEN RAISE EXCEPTION 'Invalid claim' USING ERRCODE='P2301';END IF;
 SELECT * INTO j FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF NOT FOUND OR j.principal IS DISTINCT FROM p_principal OR j.command_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Job identity' USING ERRCODE='P2302';END IF;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.authorities WHERE generation=p_generation AND operation_id=p_operation;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2302';END IF;
 IF j.state NOT IN('pending','leased') THEN RETURN hierarchy_native_scoped_ingestion_v2.job_summary(j);END IF;
 IF (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp()) IS DISTINCT FROM true OR NOT hierarchy_native_scoped_ingestion_v2.native_live(p_generation,p_operation) OR j.attempts>=3 AND j.lease_until<=pg_catalog.clock_timestamp() THEN
 PERFORM hierarchy_native_scoped_ingestion_v2.scrub_job(p_generation,p_operation,'expired','authority-expired');RETURN pg_catalog.jsonb_build_object('state','expired');END IF;
 IF j.state='leased' AND j.lease_until>pg_catalog.clock_timestamp() THEN
 IF j.worker IS DISTINCT FROM p_worker OR j.token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'Live lease held' USING ERRCODE='P2302';END IF;
 ELSE
 IF j.token=p_token THEN RAISE EXCEPTION 'New token required' USING ERRCODE='P2302';END IF;
 UPDATE hierarchy_native_scoped_ingestion_v2.jobs SET state='leased',attempts=attempts+1,epoch=epoch+1,worker=p_worker,token=p_token,
 lease_until=least(a.deadline,pg_catalog.clock_timestamp()+p_seconds*interval '1 second')
 WHERE generation=p_generation AND operation_id=p_operation RETURNING * INTO j;
 END IF;
 RETURN pg_catalog.jsonb_build_object('state',j.state,'epoch',j.epoch,'leaseUntil',j.lease_until,'deadline',a.deadline);
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.heartbeat(p_generation text,p_operation text,p_principal text,p_hash text,p_worker text,p_token text,p_epoch integer,p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 15 THEN RAISE EXCEPTION 'Invalid lease interval' USING ERRCODE='P2301';END IF;
 UPDATE hierarchy_native_scoped_ingestion_v2.jobs j SET lease_until=least(a.deadline,pg_catalog.clock_timestamp()+p_seconds*interval '1 second')
 FROM hierarchy_native_scoped_ingestion_v2.authorities a WHERE j.generation=p_generation AND j.operation_id=p_operation AND a.generation=j.generation
 AND a.operation_id=j.operation_id AND j.principal=p_principal AND j.command_hash=p_hash AND j.state='leased'
 AND j.worker=p_worker AND j.token=p_token AND j.epoch=p_epoch AND j.lease_until>pg_catalog.clock_timestamp()
 AND NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp() AND hierarchy_native_scoped_ingestion_v2.native_live(p_generation,p_operation);
 RETURN FOUND;
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.revoke(p_generation text,p_operation text,p_principal text,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 UPDATE hierarchy_native_scoped_ingestion_v2.authorities a SET revoked=true WHERE generation=p_generation AND operation_id=p_operation AND NOT accepted
 AND EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs j WHERE j.generation=a.generation AND j.operation_id=a.operation_id
 AND j.principal=p_principal AND j.command_hash=p_hash);
 RETURN FOUND;
END $$;

CREATE TABLE hierarchy_native_scoped_ingestion_v2.apply_context(tx bigint PRIMARY KEY,generation text NOT NULL,operation_id text NOT NULL,epoch integer NOT NULL,lease_until timestamptz NOT NULL);
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.before_publish() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c hierarchy_native_scoped_ingestion_v2.apply_context%ROWTYPE;a hierarchy_native_scoped_ingestion_v2.authorities%ROWTYPE;BEGIN
 SELECT * INTO c FROM hierarchy_native_scoped_ingestion_v2.apply_context WHERE tx=pg_catalog.txid_current();
 IF NOT FOUND THEN RETURN;END IF;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.authorities WHERE generation=c.generation AND operation_id=c.operation_id FOR UPDATE;
 IF NOT FOUND OR (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp() AND c.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Authority lost before publication' USING ERRCODE='P2306';END IF;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_publication(c.generation,c.operation_id);
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.complete(p_generation text,p_operation text,p_principal text,p_hash text,p_worker text,p_token text,p_epoch integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE address hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE;j hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE;a hierarchy_native_scoped_ingestion_v2.authorities%ROWTYPE;
 p jsonb;result jsonb; b double precision[];t double precision[];proof_slot integer;
 visited_slots integer[]:=ARRAY[]::integer[];reservation_try integer;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 SELECT * INTO address FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=p_generation AND operation_id=p_operation;
 IF NOT FOUND OR address.principal IS DISTINCT FROM p_principal OR address.command_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Job identity' USING ERRCODE='P2302';END IF;
 IF address.origin_kind='actor' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(address.principal,914092006));END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=address.source_id FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=address.source_id FOR UPDATE;
 SELECT * INTO j FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF j.principal IS DISTINCT FROM p_principal OR j.command_hash IS DISTINCT FROM p_hash OR j.source_id IS DISTINCT FROM address.source_id THEN RAISE EXCEPTION 'Job changed' USING ERRCODE='P2302';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2302';END IF;
 IF j.state='complete' THEN
 IF j.completed_token_hash IS DISTINCT FROM hierarchy_native_scoped_ingestion_v2.sha(p_token) OR j.epoch IS DISTINCT FROM p_epoch THEN RAISE EXCEPTION 'Lease replay mismatch' USING ERRCODE='P2302';END IF;
 RETURN j.receipt;END IF;
 IF (j.state='leased' AND j.worker=p_worker AND j.token=p_token AND j.epoch=p_epoch AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Stale lease' USING ERRCODE='P2302';END IF;
 p:=pg_catalog.jsonb_set(j.params,'{3}',pg_catalog.to_jsonb(j.material));
 IF j.mode='update' AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=j.source_id
 AND source_version=(p->>12)::bigint AND witness_hash=p->>13 AND decision_hash=p->>14) THEN
 PERFORM hierarchy_native_scoped_ingestion_v2.scrub_job(p_generation,p_operation,'failed','stale-prior');
 RETURN pg_catalog.jsonb_build_object('state','failed','code','stale-prior');END IF;
 IF NOT hierarchy_native_scoped_ingestion_v2.native_live(p_generation,p_operation) THEN
 PERFORM hierarchy_native_scoped_ingestion_v2.scrub_job(p_generation,p_operation,'cancelled','native-authority-unavailable');
 RETURN pg_catalog.jsonb_build_object('state','cancelled','code','native-authority-unavailable');END IF;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_issued(p_generation,p_operation);
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.authorities WHERE generation=p_generation AND operation_id=p_operation;
 IF (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 PERFORM hierarchy_native_scoped_ingestion_v2.scrub_job(p_generation,p_operation,'cancelled','authority-revoked');
 RETURN pg_catalog.jsonb_build_object('state','cancelled');END IF;
 FOR reservation_try IN 1..4096 LOOP
  IF (a.deadline>pg_catalog.clock_timestamp() AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Expired during finalization reservation' USING ERRCODE='P2306';END IF;
  SELECT s.slot INTO proof_slot FROM hierarchy_native_scoped_ingestion_v2.finalization_slots s
  WHERE NOT(s.slot=ANY(visited_slots)) AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.final_intents i WHERE i.slot=s.slot)
  ORDER BY s.slot FOR UPDATE OF s SKIP LOCKED LIMIT 1;
  IF proof_slot IS NULL THEN RAISE EXCEPTION 'Finalization capacity' USING ERRCODE='P2303';END IF;
  visited_slots:=pg_catalog.array_append(visited_slots,proof_slot);
  -- Separate fresh SQL statement AFTER the candidate lock. Its selection
  -- snapshot may predate the prior owner's commit; never reuse that candidate.
  IF NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.final_intents WHERE slot=proof_slot) THEN EXIT;END IF;
  proof_slot:=NULL;
 END LOOP;
 IF proof_slot IS NULL THEN RAISE EXCEPTION 'Finalization capacity' USING ERRCODE='P2303';END IF;
 IF (a.deadline>pg_catalog.clock_timestamp() AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Expired after finalization reservation' USING ERRCODE='P2306';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.apply_context VALUES(pg_catalog.txid_current(),p_generation,p_operation,j.epoch,j.lease_until);
 -- Domain locks below precede the final authority row lock.
 IF j.mode='admission' THEN
 result:=hierarchy_native_scoped_ingestion_v2.admit_new(p->>0,(p->>1)::bigint,p->>2,p->>3,p->>4,p->>5,p->>6,p->>7,p->>8,j.body_values,j.title_values,p->>11);
 ELSE
 result:=hierarchy_native_scoped_ingestion_v2.update_source(p->>0,(p->>1)::bigint,p->>2,p->>3,p->>4,p->>5,p->>6,p->>7,p->>8,j.body_values,j.title_values,p->>11,
 (p->>12)::bigint,p->>13,p->>14);
 END IF;
 result:=hierarchy_native_scoped_ingestion_v2.attach_native_decision(p_generation,p_operation,result);
 PERFORM hierarchy_native_scoped_ingestion_v2.before_publish();
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.authorities WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF (NOT a.revoked AND a.deadline>pg_catalog.clock_timestamp() AND j.lease_until>pg_catalog.clock_timestamp()) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Expired after mutation' USING ERRCODE='P2306';END IF;
 UPDATE hierarchy_native_scoped_ingestion_v2.authorities SET accepted=true WHERE generation=p_generation AND operation_id=p_operation;
 UPDATE hierarchy_native_scoped_ingestion_v2.jobs SET state='complete',params=NULL,material=NULL,source_url=NULL,body_values=NULL,title_values=NULL,
 worker=NULL,token=NULL,lease_until=NULL,receipt=result,completed_token_hash=hierarchy_native_scoped_ingestion_v2.sha(p_token)
 WHERE generation=p_generation AND operation_id=p_operation;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.final_intents(generation,operation_id,epoch,lease_until,deadline,receipt_hash,slot)
 VALUES(p_generation,p_operation,j.epoch,j.lease_until,a.deadline,hierarchy_native_scoped_ingestion_v2.sha(result::text),proof_slot);
 UPDATE hierarchy_native_scoped_ingestion_v2.issued_commands SET description=NULL,params=NULL WHERE generation=p_generation AND operation_id=p_operation;
 UPDATE hierarchy_native_scoped_ingestion_v2.attestations SET authority=NULL WHERE generation=p_generation AND operation_id=p_operation;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.apply_context WHERE tx=pg_catalog.txid_current();
 RETURN result;
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.cleanup(p_generation text,p_operation text,p_principal text,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE address hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE;j hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 SELECT * INTO address FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=p_generation AND operation_id=p_operation;
 IF NOT FOUND OR address.principal IS DISTINCT FROM p_principal OR address.command_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Job identity' USING ERRCODE='P2302';END IF;
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=address.source_id FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=address.source_id FOR UPDATE;
 SELECT * INTO j FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=p_generation AND operation_id=p_operation FOR UPDATE;
 IF j.state IN('pending','leased') AND (NOT hierarchy_native_scoped_ingestion_v2.native_live(p_generation,p_operation) OR EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.authorities WHERE generation=p_generation
 AND operation_id=p_operation AND (revoked OR deadline<=pg_catalog.clock_timestamp()))) THEN
 PERFORM hierarchy_native_scoped_ingestion_v2.scrub_job(p_generation,p_operation,'cancelled','revoked-or-expired');END IF;
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.list_jobs(p_generation text,p_principal text,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'List capacity' USING ERRCODE='P2301';END IF;
 RETURN (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('operationId',operation_id,'state',state,'epoch',epoch)),'[]'::jsonb)
 FROM(SELECT operation_id,state,epoch FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=p_generation AND principal=p_principal ORDER BY operation_id COLLATE "C" LIMIT p_limit) j);
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.retire_jobs(p_sources text[],p_actor text,p_all boolean,p_topics text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ids text[];BEGIN
 SELECT pg_catalog.array_agg(DISTINCT source_id COLLATE "C" ORDER BY source_id COLLATE "C") INTO ids FROM hierarchy_native_scoped_ingestion_v2.jobs
 WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics);
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=ANY(ids) ORDER BY source_id COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=ANY(ids) ORDER BY id COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics)
 ORDER BY generation COLLATE "C",operation_id COLLATE "C" FOR UPDATE;
 PERFORM hierarchy_native_scoped_ingestion_v2.retire_native_issued(p_sources,p_actor,p_all,p_topics);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.retired_operations(generation,operation_id,kind)
 SELECT generation,operation_id,CASE WHEN mode='admission' THEN 'admission' WHEN receipt->>'renewed'='true' THEN 'renewal' ELSE 'update' END
 FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics) ON CONFLICT DO NOTHING;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE p_all OR source_id=ANY(p_sources) OR principal=p_actor OR topic_id=ANY(p_topics);
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.queue_source_erasure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.retire_jobs(ARRAY[OLD.id],NULL,false,ARRAY[]::text[]);RETURN OLD;END $$;
CREATE TRIGGER scoped_queue_source_erasure BEFORE DELETE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.queue_source_erasure();

REVOKE ALL ON SCHEMA hierarchy_native_scoped_ingestion_v2 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_native_scoped_ingestion_v2 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_native_scoped_ingestion_v2 FROM PUBLIC;

-- Protected fixture administration. These functions have NO serving EXECUTE
-- grant. The repository exposes them only through its fresh disposable factory.
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.exact_keys(v jsonb,keys text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (pg_catalog.jsonb_typeof(v)='object' AND v ?& keys AND
 (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v))=pg_catalog.cardinality(keys)) IS TRUE
$$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.install_publication(r jsonb,h jsonb,p_lineage text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n jsonb; parent text; row_ record; depth_ integer; cur text; seen text[]; count_ integer; key_ text;
BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(true);
 IF (NOT canonical_v4.runtime_safe_text(p_lineage,128,false) OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(r,ARRAY['schema','publicationId','incarnation','publicationRevision','acceptance','bundleFileSha256','nativeIdentity','mapping']) OR
 r->>'schema' IS DISTINCT FROM 'native-canonical-publication-record/v1' OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(h,ARRAY['schema','publicationId','incarnation','publicationRevision','headRevision','recordFileSha256','status']) OR
 h->>'schema' IS DISTINCT FROM 'native-canonical-publication-head/v1' OR h->>'status' IS DISTINCT FROM 'accepted' OR
 h->>'publicationId' IS DISTINCT FROM r->>'publicationId' OR h->>'incarnation' IS DISTINCT FROM r->>'incarnation' OR
 h->'publicationRevision' IS DISTINCT FROM r->'publicationRevision' OR
 (h->>'recordFileSha256') !~ '^[a-f0-9]{64}$' OR (r->>'bundleFileSha256') !~ '^[a-f0-9]{64}$' OR
 (r->>'publicationRevision') !~ '^[1-9][0-9]{0,15}$' OR (h->>'headRevision') !~ '^[1-9][0-9]{0,15}$' OR
 NOT canonical_v4.runtime_safe_text(r->>'publicationId',160,false) OR NOT canonical_v4.runtime_safe_text(r->>'incarnation',160,false) OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(r->'nativeIdentity',ARRAY['semanticTransferHash','rootTransferHash','rootModelJsonHash','rootPolicyHash','rootTrainingInputConstructionHash','rootRepresentationHash','encoderHash','nativeTargetProducerProfileHash','nativeTargetInputConstructionHash','detailArtifactHash','localBuilderHash','detailRepresentationHash','detailInputConstructionHash','topologyHash']) OR
 EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(r->'nativeIdentity') v WHERE pg_catalog.jsonb_typeof(v.value) IS DISTINCT FROM 'string' OR (v.value#>>'{}') !~ '^[a-f0-9]{64}$') OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(r->'acceptance',ARRAY['studyFreezeFileSha256','sourceMapFileSha256','producerRecipeHash','trainResultFileSha256','trainSupervisorFileSha256','selectionFileSha256','testResultFileSha256','testSupervisorFileSha256','independentQualityAuditFileSha256']) OR
 EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(r->'acceptance') v WHERE pg_catalog.jsonb_typeof(v.value) IS DISTINCT FROM 'string' OR (v.value#>>'{}') !~ '^[a-f0-9]{64}$') OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(r->'mapping',ARRAY['nodes','declaredCanonicalPublication']) OR
 pg_catalog.jsonb_typeof(r->'mapping'->'nodes') IS DISTINCT FROM 'array' OR
 pg_catalog.jsonb_array_length(r->'mapping'->'nodes') NOT BETWEEN 1 AND 143 OR pg_catalog.octet_length(r::text)>262144 OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(r->'mapping'->'declaredCanonicalPublication',ARRAY['builderHash','encoderHash','representationHash','modelHash','policyHash','modelId']) OR
 r->'mapping'->'declaredCanonicalPublication'->>'modelId' IS DISTINCT FROM 'e5-small-q8-browser-main-prefix-v1' OR
 EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(r->'mapping'->'declaredCanonicalPublication') v WHERE pg_catalog.jsonb_typeof(v.value) IS DISTINCT FROM 'string' OR (v.key<>'modelId' AND (v.value#>>'{}') !~ '^[a-f0-9]{64}$')) OR
 (r->>'publicationRevision')::numeric>9007199254740991 OR (h->>'headRevision')::numeric>9007199254740991) IS DISTINCT FROM false THEN
 RAISE EXCEPTION 'Invalid protected publication' USING ERRCODE='P2401';END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.lineages WHERE lineage_id<>p_lineage) THEN
 RAISE EXCEPTION 'Owner lineage is fixed' USING ERRCODE='P2401';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.lineages(lineage_id) VALUES(p_lineage) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.lineages WHERE lineage_id=p_lineage FOR UPDATE;
 key_:=h->>'recordFileSha256';
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publication_heads h0 JOIN hierarchy_native_scoped_ingestion_v2.publications p0 ON p0.record_hash=h0.record_hash
 WHERE h0.publication_id=r->>'publicationId' AND
 ((p0.incarnation IS DISTINCT FROM r->>'incarnation' AND EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publications old_ WHERE old_.publication_id=p0.publication_id AND old_.incarnation=r->>'incarnation')) OR
 (h0.status='revoked' AND p0.incarnation=r->>'incarnation'))) THEN RAISE EXCEPTION 'Retired publication incarnation' USING ERRCODE='P2401';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.publications VALUES(key_,r->>'publicationId',r->>'incarnation',(r->>'publicationRevision')::bigint,p_lineage,r);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.publication_epochs VALUES(r->>'publicationId',(h->>'headRevision')::bigint);
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publication_heads WHERE publication_id=r->>'publicationId' AND head_revision>=(h->>'headRevision')::bigint) THEN
 RAISE EXCEPTION 'Publication epoch rewind' USING ERRCODE='P2401';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.publication_heads VALUES(r->>'publicationId',key_,(h->>'headRevision')::bigint,'accepted')
 ON CONFLICT(publication_id) DO UPDATE SET record_hash=EXCLUDED.record_hash,head_revision=EXCLUDED.head_revision,status='accepted';
 FOR n IN SELECT value FROM pg_catalog.jsonb_array_elements(r->'mapping'->'nodes') LOOP
 IF NOT hierarchy_native_scoped_ingestion_v2.exact_keys(n,ARRAY['nativeNodeId','nativeParentId','canonicalNodeId']) OR
 pg_catalog.jsonb_typeof(n->'nativeNodeId') IS DISTINCT FROM 'string' OR pg_catalog.jsonb_typeof(n->'canonicalNodeId') IS DISTINCT FROM 'string' OR
 (pg_catalog.jsonb_typeof(n->'nativeParentId') NOT IN('null','string')) OR
 NOT canonical_v4.runtime_safe_text(n->>'nativeNodeId',160,false) OR NOT canonical_v4.runtime_safe_text(n->>'canonicalNodeId',128,false) THEN
 RAISE EXCEPTION 'Invalid complete topology' USING ERRCODE='P2401';END IF;
 parent:=NULL;
 IF n->'nativeParentId'<>'null'::jsonb THEN
 SELECT v->>'canonicalNodeId' INTO parent FROM pg_catalog.jsonb_array_elements(r->'mapping'->'nodes') v WHERE v->>'nativeNodeId'=n->>'nativeParentId';
 IF parent IS NULL THEN RAISE EXCEPTION 'Missing parent' USING ERRCODE='P2401';END IF;END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.canonical_nodes WHERE node_id=n->>'canonicalNodeId' AND
 (lineage_id<>p_lineage OR parent_id IS DISTINCT FROM parent)) THEN RAISE EXCEPTION 'Canonical meaning cannot be reparented' USING ERRCODE='P2401';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.canonical_nodes VALUES(n->>'canonicalNodeId',p_lineage,parent) ON CONFLICT DO NOTHING;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.nodes(node_id) VALUES(n->>'canonicalNodeId') ON CONFLICT DO NOTHING;
 cur:=n->>'nativeNodeId';seen:=ARRAY[]::text[];depth_:=0;
 WHILE cur IS NOT NULL LOOP
 IF cur=ANY(seen) OR depth_>=8 THEN RAISE EXCEPTION 'Cycle or depth limit' USING ERRCODE='P2401';END IF;
 seen:=pg_catalog.array_append(seen,cur);depth_:=depth_+1;
 SELECT v->>'nativeParentId' INTO cur FROM pg_catalog.jsonb_array_elements(r->'mapping'->'nodes') v WHERE v->>'nativeNodeId'=cur;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing native ancestry' USING ERRCODE='P2401';END IF;
 END LOOP;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.publication_nodes VALUES(key_,n->>'nativeNodeId',n->>'canonicalNodeId',parent,depth_);
 END LOOP;
 FOR row_ IN SELECT * FROM hierarchy_native_scoped_ingestion_v2.publication_nodes WHERE record_hash=key_ LOOP
 cur:=row_.node_id;seen:=ARRAY[]::text[];depth_:=0;
 WHILE cur IS NOT NULL LOOP
 IF cur=ANY(seen) OR depth_>=8 THEN RAISE EXCEPTION 'Cycle or depth limit' USING ERRCODE='P2401';END IF;
 seen:=pg_catalog.array_append(seen,cur);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.ancestors VALUES(key_,cur,row_.node_id,depth_);
 SELECT p.parent_id INTO cur FROM hierarchy_native_scoped_ingestion_v2.publication_nodes p WHERE p.record_hash=key_ AND p.node_id=cur;
 IF NOT FOUND THEN RAISE EXCEPTION 'Incomplete ancestry' USING ERRCODE='P2401';END IF;depth_:=depth_+1;
 END LOOP;
 IF depth_<>row_.depth THEN RAISE EXCEPTION 'Topology depth mismatch' USING ERRCODE='P2401';END IF;
 END LOOP;
 SELECT pg_catalog.count(*) INTO count_ FROM hierarchy_native_scoped_ingestion_v2.ancestors WHERE record_hash=key_;
 IF count_>1144 THEN RAISE EXCEPTION 'Closure limit' USING ERRCODE='P2401';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.artifact VALUES(true,r->'mapping'->'declaredCanonicalPublication',key_);
 UPDATE hierarchy_native_scoped_ingestion_v2.lineages SET visibility_epoch=visibility_epoch+1 WHERE lineage_id=p_lineage;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.control_publication(p_id text,p_expected bigint,p_status text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE result bigint;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(true);
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.lineages FOR UPDATE;
 IF p_status IS DISTINCT FROM 'revoked' THEN RAISE EXCEPTION 'Revocation only' USING ERRCODE='P2401';END IF;
 UPDATE hierarchy_native_scoped_ingestion_v2.publication_heads SET status='revoked',head_revision=head_revision+1
 WHERE publication_id=p_id AND head_revision=p_expected RETURNING head_revision INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'Publication CAS conflict' USING ERRCODE='P2401';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.publication_epochs VALUES(p_id,result);
 UPDATE hierarchy_native_scoped_ingestion_v2.lineages SET visibility_epoch=visibility_epoch+1;RETURN result;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.set_owner_policy(p_principal text,p_lineage text,p_expected bigint,p_settings jsonb,p_hash text,p_record_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE result bigint;rule_ jsonb;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(true);
 PERFORM 1 FROM hierarchy_native_scoped_ingestion_v2.lineages WHERE lineage_id=p_lineage FOR UPDATE;
 IF (p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_expected<0 OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(p_settings,ARRAY['revision','defaultMaxDepth','overrides']) OR
 pg_catalog.jsonb_typeof(p_settings->'defaultMaxDepth') IS DISTINCT FROM 'number' OR (p_settings->>'defaultMaxDepth') !~ '^[1-8]$' OR
 pg_catalog.jsonb_typeof(p_settings->'overrides') IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(p_settings->'overrides')>144 OR
 NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publications p WHERE p.record_hash=p_record_hash AND p.lineage_id=p_lineage)) IS DISTINCT FROM false THEN
 RAISE EXCEPTION 'Invalid native owner policy' USING ERRCODE='P2401';END IF;
 IF (NOT canonical_v4.runtime_safe_text(p_settings->>'revision',160,false) OR pg_catalog.jsonb_typeof(p_settings->'revision') IS DISTINCT FROM 'string' OR
 (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(p_settings->'overrides'))<>(SELECT pg_catalog.count(DISTINCT value->>'nodeId') FROM pg_catalog.jsonb_array_elements(p_settings->'overrides'))) IS DISTINCT FROM false THEN
 RAISE EXCEPTION 'Invalid native policy revision/duplicates' USING ERRCODE='P2401';END IF;
 FOR rule_ IN SELECT value FROM pg_catalog.jsonb_array_elements(p_settings->'overrides') LOOP
 IF NOT hierarchy_native_scoped_ingestion_v2.exact_keys(rule_,ARRAY['nodeId','maxDepth']) OR
 pg_catalog.jsonb_typeof(rule_->'nodeId') IS DISTINCT FROM 'string' OR pg_catalog.jsonb_typeof(rule_->'maxDepth') IS DISTINCT FROM 'number' OR
 rule_->>'maxDepth' !~ '^[1-8]$' OR NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publication_nodes n
 WHERE n.record_hash=p_record_hash AND n.native_id=rule_->>'nodeId' AND n.depth<=(rule_->>'maxDepth')::integer) THEN
 RAISE EXCEPTION 'Invalid native subtree override' USING ERRCODE='P2401';END IF;END LOOP;
 IF p_expected=0 THEN INSERT INTO hierarchy_native_scoped_ingestion_v2.owner_policies VALUES(p_principal,p_lineage,1,p_settings,p_hash,p_record_hash) RETURNING revision INTO result;
 ELSE UPDATE hierarchy_native_scoped_ingestion_v2.owner_policies SET revision=revision+1,settings=p_settings,grouping_hash=p_hash,record_hash=p_record_hash
 WHERE principal=p_principal AND lineage_id=p_lineage AND revision=p_expected RETURNING revision INTO result;END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'Owner policy CAS conflict' USING ERRCODE='P2401';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.owner_policy_versions VALUES(p_record_hash,result,p_lineage,p_principal,p_settings,p_hash);RETURN result;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.install_attestation(a jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE expires timestamptz;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF (NOT hierarchy_native_scoped_ingestion_v2.exact_keys(a,ARRAY['schema','id','generation','operationId','principal','originKind','publicationId','publicationIncarnation','publicationRevision','headRevision','recordFileSha256','bundleFileSha256','recordBindingHash','mappingHash','sourceId','sourceIncarnation','prior','sourceAbsent','materialHash','bodyWireHash','titleWireHash','observationId','observationNonce','rightsEvidenceHash','sourceInputHash','nativeWitnessHash','requestHash','deadline']) OR
 a->>'schema' IS DISTINCT FROM 'native-scoped-attestation/v1' OR pg_catalog.octet_length(a::text)>16384 OR
 NOT canonical_v4.runtime_safe_text(a->>'id',128,false) OR NOT canonical_v4.runtime_safe_text(a->>'generation',128,false) OR
 NOT canonical_v4.runtime_safe_text(a->>'operationId',128,false) OR NOT canonical_v4.runtime_safe_text(a->>'observationId',160,false) OR
 NOT canonical_v4.runtime_safe_text(a->>'observationNonce',160,false) OR
 a->>'originKind' NOT IN('actor','crawler') OR
 (a->>'originKind'='crawler' AND a->>'principal'<>'crawler-public/v1') OR
 (a->>'originKind'='actor' AND a->>'principal' !~ '^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') OR
 pg_catalog.jsonb_typeof(a->'sourceAbsent') IS DISTINCT FROM 'boolean' OR
 EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['recordFileSha256','bundleFileSha256','recordBindingHash','mappingHash','materialHash','bodyWireHash','titleWireHash','rightsEvidenceHash','sourceInputHash','nativeWitnessHash','requestHash']) k WHERE pg_catalog.jsonb_typeof(a->k) IS DISTINCT FROM 'string' OR (a->>k) !~ '^[a-f0-9]{64}$')) IS DISTINCT FROM false THEN
 RAISE EXCEPTION 'Invalid protected attestation' USING ERRCODE='P2402';END IF;
 IF a->>'originKind'='actor' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a->>'principal',914092006));END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(914092008,1);
 expires:=(a->>'deadline')::timestamptz;
 IF (expires>pg_catalog.clock_timestamp() AND expires<=pg_catalog.clock_timestamp()+interval '30 seconds') IS DISTINCT FROM true OR
 NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=a->>'generation') OR
 NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publications p JOIN hierarchy_native_scoped_ingestion_v2.publication_heads h ON h.publication_id=p.publication_id
 WHERE p.record_hash=a->>'recordFileSha256' AND p.publication_id=a->>'publicationId' AND p.incarnation=a->>'publicationIncarnation'
 AND p.revision=(a->>'publicationRevision')::bigint AND p.record->>'bundleFileSha256'=a->>'bundleFileSha256'
 AND h.record_hash=p.record_hash AND h.status='accepted' AND h.head_revision=(a->>'headRevision')::bigint) THEN
 RAISE EXCEPTION 'Stale protected attestation' USING ERRCODE='P2402';END IF;
 IF a->'sourceAbsent'='true'::jsonb THEN
 IF a->'sourceId'<>'null'::jsonb OR a->'sourceIncarnation'<>'null'::jsonb OR a->'prior'<>'null'::jsonb THEN RAISE EXCEPTION 'New Source absence required' USING ERRCODE='P2402';END IF;
 ELSE
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=a->>'sourceId' FOR SHARE NOWAIT;
 PERFORM 1 FROM canonical_v4.sources WHERE id=a->>'sourceId' FOR SHARE NOWAIT;
 IF NOT hierarchy_native_scoped_ingestion_v2.exact_keys(a->'prior',ARRAY['sourceVersion','witnessHash','decisionHash']) OR
 NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers c JOIN hierarchy_native_scoped_ingestion_v2.inputs i USING(source_id)
 WHERE c.source_id=a->>'sourceId' AND c.incarnation=a->>'sourceIncarnation' AND i.generation=a->>'generation'
 AND i.source_version::text=a->'prior'->>'sourceVersion' AND i.witness_hash=a->'prior'->>'witnessHash' AND i.decision_hash=a->'prior'->>'decisionHash') THEN
 RAISE EXCEPTION 'Stale Source incarnation/prior' USING ERRCODE='P2402';END IF;END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=a->>'generation' AND operation_id=a->>'operationId') OR
 (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE authority IS NOT NULL)>=4096 OR
 (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE authority IS NOT NULL AND principal=a->>'principal')>=CASE WHEN a->>'originKind'='actor' THEN 32 ELSE 1024 END THEN
 RAISE EXCEPTION 'Attestation capacity or retirement' USING ERRCODE='P2402';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.attestations VALUES(a->>'id',a->>'generation',a->>'operationId',a->>'principal',a,expires,NULL);
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.issue_command(v jsonb,p_params jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a hierarchy_native_scoped_ingestion_v2.attestations%ROWTYPE; p hierarchy_native_scoped_ingestion_v2.publications%ROWTYPE;
 h hierarchy_native_scoped_ingestion_v2.publication_heads%ROWTYPE; d jsonb; m jsonb; material jsonb; mode_ text; prior_ jsonb; old_ record; node_ text; k text;
BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF NOT hierarchy_native_scoped_ingestion_v2.exact_keys(v,ARRAY['schema','id','attestationId','description','ownerPolicyRevision','requestHash']) OR
 v->>'schema' IS DISTINCT FROM 'native-scoped-issued-command/v1' OR NOT canonical_v4.runtime_safe_text(v->>'id',128,false) OR
 pg_catalog.jsonb_typeof(v->'ownerPolicyRevision') IS DISTINCT FROM 'number' OR (v->>'ownerPolicyRevision') !~ '^[1-9][0-9]{0,15}$' THEN
 RAISE EXCEPTION 'Invalid private issuance' USING ERRCODE='P2402';END IF;
 -- Nonlocking address read, then actor and capacity fences BEFORE issuer rows.
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=v->>'attestationId';
 IF a.id IS NULL THEN RAISE EXCEPTION 'Attestation unavailable' USING ERRCODE='P2402';END IF;
 IF a.authority->>'originKind'='actor' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a.principal,914092006));END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(914092008,1);
 IF a.authority->'sourceAbsent'='false'::jsonb THEN
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=a.authority->>'sourceId' FOR SHARE NOWAIT;
 PERFORM 1 FROM canonical_v4.sources WHERE id=a.authority->>'sourceId' FOR SHARE NOWAIT;
 END IF;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=v->>'attestationId' FOR UPDATE;
 IF NOT FOUND OR a.authority IS NULL OR a.deadline<=pg_catalog.clock_timestamp() OR a.consumed_by IS NOT NULL OR a.revoked IS DISTINCT FROM false THEN RAISE EXCEPTION 'Attestation unavailable' USING ERRCODE='P2402';END IF;
 IF a.authority->>'requestHash' IS DISTINCT FROM v->>'requestHash' THEN RAISE EXCEPTION 'Changed request' USING ERRCODE='P2402';END IF;
 IF a.authority->'sourceAbsent'='false'::jsonb AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers c JOIN hierarchy_native_scoped_ingestion_v2.inputs i USING(source_id)
 WHERE c.source_id=a.authority->>'sourceId' AND c.incarnation=a.authority->>'sourceIncarnation' AND i.generation=a.generation
 AND i.source_version::text=a.authority->'prior'->>'sourceVersion' AND i.witness_hash=a.authority->'prior'->>'witnessHash' AND i.decision_hash=a.authority->'prior'->>'decisionHash') THEN
 RAISE EXCEPTION 'Source changed before issuance' USING ERRCODE='P2402';END IF;
 SELECT * INTO old_ FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE generation=a.generation AND operation_id=a.operation_id;
 IF FOUND THEN RAISE EXCEPTION 'Reconcile operation before issuing' USING ERRCODE='P2402';END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=a.generation AND operation_id=a.operation_id) OR
 (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.issued_commands i WHERE i.params IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs j WHERE j.generation=i.generation AND j.operation_id=i.operation_id))+
 (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE state IN('pending','leased'))>=4096 OR
 (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE principal=a.principal AND params IS NOT NULL)+
 (SELECT pg_catalog.count(*) FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE principal=a.principal AND state IN('pending','leased'))>=CASE WHEN a.authority->>'originKind'='actor' THEN 32 ELSE 1024 END THEN
 RAISE EXCEPTION 'Issued-command capacity or retirement' USING ERRCODE='P2402';END IF;
 SELECT * INTO p FROM hierarchy_native_scoped_ingestion_v2.publications WHERE record_hash=a.authority->>'recordFileSha256';
 SELECT * INTO h FROM hierarchy_native_scoped_ingestion_v2.publication_heads WHERE publication_id=p.publication_id FOR SHARE;
 d:=v->'description';m:=d->'mapping';mode_:=CASE WHEN a.authority->'sourceAbsent'='true'::jsonb THEN 'admission' ELSE 'update' END;
 PERFORM hierarchy_native_scoped_ingestion_v2.validate_params(mode_,p_params);
 material:=(p_params->>3)::jsonb;
 IF EXISTS(SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=a.operation_id OR state IN('pending','leased') AND source_url=material->>'url') OR
 EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE operation_id=a.operation_id OR state IN('pending','leased') AND source_url=material->>'url') OR
 EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.issued_commands c WHERE c.params IS NOT NULL AND (c.params->>3)::jsonb->>'url'=material->>'url') THEN
 RAISE EXCEPTION 'Operation or live URL reserved' USING ERRCODE='P2402';END IF;
 IF h.status IS DISTINCT FROM 'accepted' OR h.record_hash IS DISTINCT FROM p.record_hash OR h.head_revision IS DISTINCT FROM (a.authority->>'headRevision')::bigint OR
 NOT hierarchy_native_scoped_ingestion_v2.exact_keys(d,ARRAY['schema','publicationBinding','nativeIdentity','mapping','recordBindingHash','evidenceScope','publicationVerified','canonicalAuthority','queueAuthority','assignmentAuthority','productionValidated']) OR
 d->>'schema' IS DISTINCT FROM 'native-canonical-publication-job/v1' OR d->>'recordBindingHash' IS DISTINCT FROM a.authority->>'recordBindingHash' OR
 d->'nativeIdentity' IS DISTINCT FROM p.record->'nativeIdentity' OR m->>'mappingHash' IS DISTINCT FROM a.authority->>'mappingHash' OR
 d->'publicationBinding' IS DISTINCT FROM pg_catalog.jsonb_build_object('publicationId',p.publication_id,'incarnation',p.incarnation,'publicationRevision',p.revision,'headRevisionAtIssuance',h.head_revision,'recordFileSha256',p.record_hash,'bundleFileSha256',p.record->>'bundleFileSha256') OR
 d->>'evidenceScope' IS DISTINCT FROM 'unregistered-source-only-record-binding' OR
 EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['publicationVerified','canonicalAuthority','queueAuthority','assignmentAuthority','productionValidated']) x WHERE d->x IS DISTINCT FROM 'false'::jsonb) OR
 m->'registryArtifactHash' IS DISTINCT FROM 'null'::jsonb OR
 EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['nativeAttested','publicationIdentityChecked','publicationVerified','canonicalAuthority','queueAuthority','assignmentAuthority','productionValidated']) x WHERE m->x IS DISTINCT FROM 'false'::jsonb) OR
 m->'declaredPublication' IS DISTINCT FROM (p.record->'mapping'->'declaredCanonicalPublication'||pg_catalog.jsonb_build_object('claimScope','declared-unverified-unbound')) OR
 (m->'compatibility'->'materialCompatible') IS DISTINCT FROM 'true'::jsonb OR (m->'compatibility'->'priorCompatible') IS DISTINCT FROM 'true'::jsonb OR
 p_params->>0 IS DISTINCT FROM a.generation OR p_params->>2 IS DISTINCT FROM a.operation_id OR
 m->'declaredCanonicalSource'->>'sourceId' IS DISTINCT FROM p_params->>4 OR
 m->'declaredCanonicalSource'->'expected' IS DISTINCT FROM pg_catalog.jsonb_build_object('generation',a.generation,'revision',(p_params->>1)::bigint) OR
 m->'declaredCanonicalSource'->>'documentHash' IS DISTINCT FROM material->>'documentHash' OR
 m->'commitments'->>'materialHash' IS DISTINCT FROM a.authority->>'materialHash' OR
 hierarchy_native_scoped_ingestion_v2.sha(p_params->>3) IS DISTINCT FROM a.authority->>'materialHash' OR
 hierarchy_native_scoped_ingestion_v2.wire_hash((p_params->>9)::double precision[]) IS DISTINCT FROM a.authority->>'bodyWireHash' OR
 hierarchy_native_scoped_ingestion_v2.wire_hash((p_params->>10)::double precision[]) IS DISTINCT FROM a.authority->>'titleWireHash' OR
 m->'commitments'->>'bodyWireHash' IS DISTINCT FROM a.authority->>'bodyWireHash' OR m->'commitments'->>'titleWireHash' IS DISTINCT FROM a.authority->>'titleWireHash' OR
 m->'commitments'->>'sourceInputHash' IS DISTINCT FROM a.authority->>'sourceInputHash' OR m->'commitments'->>'nativeWitnessHash' IS DISTINCT FROM a.authority->>'nativeWitnessHash' OR
 m->'commitments'->>'rightsEvidenceHash' IS DISTINCT FROM a.authority->>'rightsEvidenceHash' OR
 NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.owner_policies o WHERE o.lineage_id=p.lineage_id AND o.record_hash=p.record_hash AND o.revision=(v->>'ownerPolicyRevision')::bigint AND o.grouping_hash=m->'grouping'->>'ownerGroupingHash') OR
 pg_catalog.octet_length(d::text)>16384 OR
 pg_catalog.octet_length(d::text)+pg_catalog.octet_length(a.authority::text)+pg_catalog.octet_length(pg_catalog.jsonb_set(pg_catalog.jsonb_set(p_params,'{9}','null'),'{10}','null')::text)>49152 THEN RAISE EXCEPTION 'Private issuance binding mismatch' USING ERRCODE='P2402';END IF;
 IF mode_='update' THEN
 IF p_params->>4 IS DISTINCT FROM a.authority->>'sourceId' OR a.authority->'prior' IS DISTINCT FROM m->'declaredCanonicalSource'->'prior' OR
 (p_params->>12) IS DISTINCT FROM a.authority->'prior'->>'sourceVersion' OR p_params->>13 IS DISTINCT FROM a.authority->'prior'->>'witnessHash' OR p_params->>14 IS DISTINCT FROM a.authority->'prior'->>'decisionHash' THEN
 RAISE EXCEPTION 'Addressed prior mismatch' USING ERRCODE='P2402';END IF;
 ELSE IF m->'declaredCanonicalSource'->'prior' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'New prior must be null' USING ERRCODE='P2402';END IF;END IF;
 -- Validate the entire supported canonical chain, not the owner cut.
 prior_:='null'::jsonb;
 FOR node_ IN SELECT value FROM pg_catalog.jsonb_array_elements_text(m->'grouping'->'mappedSupportedPath') LOOP
 IF NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publication_nodes n WHERE n.record_hash=p.record_hash AND n.node_id=node_ AND n.parent_id IS NOT DISTINCT FROM (prior_#>>'{}')) THEN
 RAISE EXCEPTION 'Invalid complete semantic path' USING ERRCODE='P2402';END IF;prior_:=pg_catalog.to_jsonb(node_);END LOOP;
 IF pg_catalog.jsonb_array_length(m->'grouping'->'mappedSupportedPath')>8 OR
 m->'semantic'->>'status' NOT IN('candidate','unresolved') OR
 m->'semantic'->>'transferHash' IS DISTINCT FROM p.record->'nativeIdentity'->>'semanticTransferHash' OR
 pg_catalog.jsonb_typeof(m->'semantic'->'reason') IS DISTINCT FROM 'string' OR
 NOT canonical_v4.runtime_safe_text(m->'semantic'->>'reason',160,false) OR
 pg_catalog.jsonb_array_length(m->'semantic'->'supportedPath')<>pg_catalog.jsonb_array_length(m->'grouping'->'mappedSupportedPath') OR
 EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(m->'semantic'->'supportedPath') WITH ORDINALITY t(id,ord)
 WHERE NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publication_nodes n WHERE n.record_hash=p.record_hash AND n.native_id=t.id AND n.node_id=m->'grouping'->'mappedSupportedPath'->>(t.ord::integer-1))) OR
 p_params->>11 IS DISTINCT FROM m->'grouping'->>'deepestSupportedCanonicalNodeId' OR
 p_params->>11 IS DISTINCT FROM prior_#>>'{}' OR
 ((m->'semantic'->>'status'='unresolved') IS DISTINCT FROM (prior_='null'::jsonb)) THEN RAISE EXCEPTION 'Semantic outcome mismatch' USING ERRCODE='P2402';END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.issued_commands VALUES(v->>'id',a.id,a.generation,a.operation_id,a.principal,v->>'requestHash',p.record_hash,h.head_revision,a.authority->>'originKind',mode_,(v->>'ownerPolicyRevision')::bigint,d,p_params,a.deadline);
 UPDATE hierarchy_native_scoped_ingestion_v2.attestations SET consumed_by=v->>'id' WHERE id=a.id;
 RETURN v->>'id';
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.assert_issued(g text,op text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i hierarchy_native_scoped_ingestion_v2.issued_commands%ROWTYPE; a hierarchy_native_scoped_ingestion_v2.attestations%ROWTYPE;BEGIN
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE generation=g AND operation_id=op FOR UPDATE;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=i.attestation_id FOR SHARE;
 IF i.id IS NULL OR i.description IS NULL OR a.authority IS NULL OR a.consumed_by IS DISTINCT FROM i.id OR
 i.deadline<=pg_catalog.clock_timestamp() OR a.deadline IS DISTINCT FROM i.deadline OR a.revoked IS DISTINCT FROM false OR
 NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.owner_policies o WHERE o.record_hash=i.record_hash AND o.revision=i.owner_revision) OR
 NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publications p JOIN hierarchy_native_scoped_ingestion_v2.publication_heads h ON h.publication_id=p.publication_id
 WHERE p.record_hash=i.record_hash AND h.record_hash=p.record_hash AND h.status='accepted' AND h.head_revision=i.head_revision FOR SHARE OF h) THEN
 RAISE EXCEPTION 'Issued authority unavailable' USING ERRCODE='P2402';END IF;
 IF i.mode='update' AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.containers c JOIN hierarchy_native_scoped_ingestion_v2.inputs v USING(source_id)
 WHERE c.source_id=a.authority->>'sourceId' AND c.incarnation=a.authority->>'sourceIncarnation' AND v.generation=g
 AND v.source_version::text=a.authority->'prior'->>'sourceVersion' AND v.witness_hash=a.authority->'prior'->>'witnessHash' AND v.decision_hash=a.authority->'prior'->>'decisionHash') THEN
 RAISE EXCEPTION 'Issued prior changed' USING ERRCODE='P2402';END IF;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.lock_issued_enqueue(g text,op text,p_principal text,p_params jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i hierarchy_native_scoped_ingestion_v2.issued_commands%ROWTYPE;BEGIN
 -- Called only after the inherited queue's actor/capacity/NOWAIT domain checks.
 SELECT c0.* INTO i FROM hierarchy_native_scoped_ingestion_v2.issued_commands c0
 JOIN hierarchy_native_scoped_ingestion_v2.issuance_context c ON c.issued_id=c0.id
 WHERE c.tx=pg_catalog.txid_current() AND c0.generation=g AND c0.operation_id=op FOR UPDATE OF c0;
 IF i.id IS NULL OR i.principal IS DISTINCT FROM p_principal OR i.params IS DISTINCT FROM p_params THEN RAISE EXCEPTION 'Issued enqueue changed' USING ERRCODE='P2402';END IF;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_issued(g,op);
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.enqueue_issued(g text,op text,p_principal text,p_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i hierarchy_native_scoped_ingestion_v2.issued_commands%ROWTYPE; j hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE; result jsonb;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE id=p_id;
 IF i.id IS NULL OR i.generation IS DISTINCT FROM g OR i.operation_id IS DISTINCT FROM op OR i.principal IS DISTINCT FROM p_principal THEN RAISE EXCEPTION 'Foreign issued command' USING ERRCODE='P2402';END IF;
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=g AND operation_id=op) THEN RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2402';END IF;
 SELECT * INTO j FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=g AND operation_id=op;
 IF FOUND THEN RETURN hierarchy_native_scoped_ingestion_v2.job_summary(j);END IF;
 IF i.kind='actor' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(i.principal,914092006));END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.issuance_context VALUES(pg_catalog.txid_current(),p_id);
 result:=hierarchy_native_scoped_ingestion_v2.enqueue(i.kind,i.principal,i.mode,i.params,30,hierarchy_native_scoped_ingestion_v2.sha(i.attestation_id));
 -- The queue now owns the sole material/vector payload. No duplicated issuer
 -- vector-text archive survives enqueue; metadata remains within the same bound.
 DELETE FROM hierarchy_native_scoped_ingestion_v2.issuance_context WHERE tx=pg_catalog.txid_current();RETURN result;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.attach_native_decision(g text,op text,result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i hierarchy_native_scoped_ingestion_v2.issued_commands%ROWTYPE;a hierarchy_native_scoped_ingestion_v2.attestations%ROWTYPE;
 v hierarchy_native_scoped_ingestion_v2.inputs%ROWTYPE;m jsonb;decision_ text;path_ text[];source_ text;BEGIN
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE generation=g AND operation_id=op;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=i.attestation_id FOR SHARE;
 -- The old mutator has now validated/mutated exact canonical material. Its
 -- renewal keeps Source.write_version; observation and decision still append.
 IF i.id IS NULL OR a.authority IS NULL OR NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.apply_context WHERE tx=pg_catalog.txid_current() AND generation=g AND operation_id=op) THEN RAISE EXCEPTION 'Missing private native apply' USING ERRCODE='P2402';END IF;
 source_:=result->>'sourceId';SELECT * INTO v FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=source_;
 m:=i.description->'mapping';
 IF v.source_id IS NULL OR hierarchy_native_scoped_ingestion_v2.sha(v.material) IS DISTINCT FROM a.authority->>'materialHash' THEN RAISE EXCEPTION 'Material join failed' USING ERRCODE='P2402';END IF;
 UPDATE hierarchy_native_scoped_ingestion_v2.containers SET incarnation=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(g,source_,op)::text)
 WHERE source_id=source_ AND incarnation IS NULL;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.observations VALUES(a.authority->>'observationId',source_,v.source_version,a.authority->>'observationNonce',a.authority->>'sourceInputHash',a.authority->>'nativeWitnessHash',a.authority->>'rightsEvidenceHash');
 SELECT coalesce(pg_catalog.array_agg(value ORDER BY ord),ARRAY[]::text[]) INTO path_ FROM pg_catalog.jsonb_array_elements_text(m->'grouping'->'mappedSupportedPath') WITH ORDINALITY t(value,ord);
 decision_:=hierarchy_native_scoped_ingestion_v2.sha(pg_catalog.jsonb_build_array(v.witness_hash,i.record_hash,a.authority->>'observationId',m->'semantic')::text);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.decisions VALUES(source_,v.source_version,decision_,i.record_hash,path_[pg_catalog.cardinality(path_)]);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.native_decisions VALUES(source_,v.source_version,decision_,a.authority->>'observationId',i.record_hash,m->'semantic',path_,i.owner_revision,m->'grouping');
 UPDATE hierarchy_native_scoped_ingestion_v2.current_inputs SET decision_hash=decision_ WHERE source_id=source_;
 RETURN result||pg_catalog.jsonb_build_object('decisionHash',decision_,'observationId',a.authority->>'observationId','semanticNodeId',path_[pg_catalog.cardinality(path_)],'artifactHash',i.record_hash);
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.native_root_edges() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE d hierarchy_native_scoped_ingestion_v2.native_decisions%ROWTYPE;o hierarchy_native_scoped_ingestion_v2.owner_policies%ROWTYPE;cut_ integer;n record;rule_ jsonb;BEGIN
 SELECT * INTO d FROM hierarchy_native_scoped_ingestion_v2.native_decisions WHERE source_id=NEW.source_id AND source_version=NEW.source_version AND decision_hash=NEW.decision_hash;
 IF d.source_id IS NULL OR NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.publications p JOIN hierarchy_native_scoped_ingestion_v2.publication_heads h ON h.publication_id=p.publication_id
 WHERE p.record_hash=d.record_hash AND h.record_hash=p.record_hash AND h.status='accepted' FOR SHARE OF h) THEN RAISE EXCEPTION 'Current native decision required' USING ERRCODE='P2402';END IF;
 SELECT * INTO o FROM hierarchy_native_scoped_ingestion_v2.owner_policies WHERE record_hash=d.record_hash FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner policy requires publication rebind' USING ERRCODE='P2402';END IF;
 cut_:=(o.settings->>'defaultMaxDepth')::integer;
 FOR n IN SELECT p.native_id,p.depth FROM pg_catalog.unnest(d.supported_path) WITH ORDINALITY t(id,ord)
 JOIN hierarchy_native_scoped_ingestion_v2.publication_nodes p ON p.record_hash=d.record_hash AND p.node_id=t.id ORDER BY t.ord LOOP
 FOR rule_ IN SELECT value FROM pg_catalog.jsonb_array_elements(o.settings->'overrides') WHERE value->>'nodeId'=n.native_id LOOP cut_:=(rule_->>'maxDepth')::integer;END LOOP;
 END LOOP;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.root_native_bindings VALUES(NEW.root_id,d.observation_id,d.record_hash,o.revision,d.supported_path[1:cut_]);
 INSERT INTO hierarchy_native_scoped_ingestion_v2.root_edges SELECT NEW.root_id,d.record_hash,a.ancestor_id FROM hierarchy_native_scoped_ingestion_v2.ancestors a
 WHERE a.record_hash=d.record_hash AND a.descendant_id=d.supported_path[pg_catalog.cardinality(d.supported_path)];RETURN NEW;
END $$;
CREATE TRIGGER native_root_edges AFTER INSERT ON hierarchy_native_scoped_ingestion_v2.root_snapshots FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.native_root_edges();

-- Dirty all stable ancestors once per transaction, never opposite lock orders.
CREATE OR REPLACE FUNCTION hierarchy_native_scoped_ingestion_v2.dirty_feed(p_node text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO hierarchy_native_scoped_ingestion_v2.feed_dirty(tx,node_id,delta)
 WITH RECURSIVE chain(node_id,parent_id,depth) AS (
 SELECT node_id,parent_id,1 FROM hierarchy_native_scoped_ingestion_v2.canonical_nodes WHERE node_id=p_node
 UNION ALL SELECT n.node_id,n.parent_id,c.depth+1 FROM hierarchy_native_scoped_ingestion_v2.canonical_nodes n JOIN chain c ON n.node_id=c.parent_id WHERE c.depth<8)
 SELECT pg_catalog.txid_current(),node_id,1 FROM chain ON CONFLICT(tx,node_id) DO NOTHING;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.read_native_feed(p_lineage text,p_node text,p_epoch bigint,p_version bigint,p_after text,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE epoch_ bigint;version_ bigint;rows_ jsonb;next_ text;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_after IS NOT NULL AND (p_epoch IS NULL OR p_version IS NULL)) THEN RAISE EXCEPTION 'Invalid feed cursor' USING ERRCODE='P2403';END IF;
 SELECT visibility_epoch INTO epoch_ FROM hierarchy_native_scoped_ingestion_v2.lineages WHERE lineage_id=p_lineage FOR SHARE;
 SELECT n.feed_version+coalesce((SELECT delta FROM hierarchy_native_scoped_ingestion_v2.feed_dirty WHERE tx=pg_catalog.txid_current() AND node_id=p_node),0) INTO version_
 FROM hierarchy_native_scoped_ingestion_v2.nodes n JOIN hierarchy_native_scoped_ingestion_v2.canonical_nodes c USING(node_id) WHERE n.node_id=p_node AND c.lineage_id=p_lineage FOR SHARE OF n;
 IF epoch_ IS NULL OR version_ IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','missing-node','rootRefs','[]'::jsonb);END IF;
 IF (p_epoch IS NOT NULL AND p_epoch<>epoch_) OR (p_version IS NOT NULL AND p_version<>version_) THEN RETURN pg_catalog.jsonb_build_object('status','stale-feed','rootRefs','[]'::jsonb);END IF;
 -- Publication-ID family revocation hides all historical revisions. Merely
 -- installing a newer accepted head does NOT hide older bound root edges.
 WITH candidates AS (
 SELECT s.root_id,s.topic_id,s.discussion_id FROM hierarchy_native_scoped_ingestion_v2.root_edges e
 JOIN hierarchy_native_scoped_ingestion_v2.root_snapshots s USING(root_id)
 JOIN hierarchy_native_scoped_ingestion_v2.publications p ON p.record_hash=e.record_hash
 JOIN hierarchy_native_scoped_ingestion_v2.publication_heads h ON h.publication_id=p.publication_id AND h.status='accepted'
 JOIN canonical_v4.contributions c ON c.id=s.root_id JOIN canonical_v4.discussions d ON d.id=s.discussion_id AND d.topic_id=s.topic_id
 WHERE e.ancestor_id=p_node AND p.lineage_id=p_lineage AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
 AND c.discussion_id=s.discussion_id AND (p_after IS NULL OR s.root_id COLLATE "C">p_after COLLATE "C") ORDER BY s.root_id COLLATE "C" LIMIT p_limit+1),
 ranked AS (SELECT *,pg_catalog.row_number() OVER(ORDER BY root_id COLLATE "C") rn FROM candidates)
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('rootId',root_id,'topicId',topic_id,'discussionId',discussion_id) ORDER BY root_id COLLATE "C") FILTER(WHERE rn<=p_limit),'[]'::jsonb),
 CASE WHEN pg_catalog.count(*)>p_limit THEN pg_catalog.max(root_id) FILTER(WHERE rn=p_limit) ELSE NULL END INTO rows_,next_ FROM ranked;
 RETURN pg_catalog.jsonb_build_object('status','ready','lineageId',p_lineage,'nodeId',p_node,'visibilityEpoch',epoch_::text,'feedVersion',version_::text,'rootRefs',rows_,'nextAfterRootId',next_,'assignmentAuthority',false);
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.native_live(g text,op text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.issued_commands i
 JOIN hierarchy_native_scoped_ingestion_v2.attestations a ON a.id=i.attestation_id
 JOIN hierarchy_native_scoped_ingestion_v2.publications p ON p.record_hash=i.record_hash
 JOIN hierarchy_native_scoped_ingestion_v2.publication_heads h ON h.publication_id=p.publication_id
 JOIN hierarchy_native_scoped_ingestion_v2.owner_policies o ON o.record_hash=i.record_hash AND o.revision=i.owner_revision
 WHERE i.generation=g AND i.operation_id=op AND i.description IS NOT NULL AND a.authority IS NOT NULL
 AND a.consumed_by=i.id AND NOT a.revoked AND a.deadline=i.deadline AND i.deadline>pg_catalog.clock_timestamp()
 AND h.record_hash=i.record_hash AND h.head_revision=i.head_revision AND h.status='accepted')
$$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.assert_publication(g text,op text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.issued_commands i
 JOIN hierarchy_native_scoped_ingestion_v2.attestations a ON a.id=i.attestation_id
 JOIN hierarchy_native_scoped_ingestion_v2.publications p ON p.record_hash=i.record_hash
 JOIN hierarchy_native_scoped_ingestion_v2.publication_heads h ON h.publication_id=p.publication_id
 JOIN hierarchy_native_scoped_ingestion_v2.authorities auth ON auth.generation=i.generation AND auth.operation_id=i.operation_id
 WHERE i.generation=g AND i.operation_id=op AND a.consumed_by=i.id AND a.deadline=i.deadline AND auth.deadline=i.deadline
 AND h.record_hash=i.record_hash AND h.head_revision=i.head_revision AND h.status='accepted' AND a.revoked=false FOR SHARE OF h,a) THEN
 RAISE EXCEPTION 'Publication or attestation changed' USING ERRCODE='P2402';END IF;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.lookup_operation(g text,op text,p_principal text,p_request text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i hierarchy_native_scoped_ingestion_v2.issued_commands%ROWTYPE;j hierarchy_native_scoped_ingestion_v2.jobs%ROWTYPE;a hierarchy_native_scoped_ingestion_v2.attestations%ROWTYPE;state_ text;result_ jsonb;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE generation=g AND operation_id=op;
 IF NOT FOUND THEN
 IF EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.retired_operations WHERE generation=g AND operation_id=op) THEN RAISE EXCEPTION 'Retired operation' USING ERRCODE='P2402';END IF;
 -- A committed attestation is already a protected operation reservation, even
 -- before issuance. Never let a retry allocate or compute a second command.
 -- This is an unfinished-state refusal, not fabricated cancellation: the
 -- original concurrent first request remains free to finish its own issuance.
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE generation=g AND operation_id=op;
 IF FOUND THEN
 IF a.principal IS DISTINCT FROM p_principal OR a.authority->>'requestHash' IS DISTINCT FROM p_request THEN
 RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2402';END IF;
 RAISE EXCEPTION 'Unfinished issuance requires reconciliation' USING ERRCODE='P2402';
 END IF;
 RETURN NULL;END IF;
 IF i.principal IS DISTINCT FROM p_principal OR i.request_hash IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='P2402';END IF;
 SELECT * INTO j FROM hierarchy_native_scoped_ingestion_v2.jobs WHERE generation=g AND operation_id=op;
 IF FOUND THEN RETURN pg_catalog.jsonb_build_object('requestHash',i.request_hash,'result',pg_catalog.jsonb_build_object('state',j.state,'commandHash',j.command_hash,'receipt',j.receipt,'code',j.code));END IF;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=i.attestation_id;
 state_:=CASE WHEN i.terminal_state IS NOT NULL THEN i.terminal_state WHEN i.deadline<=pg_catalog.clock_timestamp() THEN 'expired'
 WHEN a.revoked OR i.description IS NULL OR i.params IS NULL OR a.authority IS NULL THEN 'cancelled' ELSE 'issued' END;
 result_:=pg_catalog.jsonb_build_object('requestHash',i.request_hash,'result',pg_catalog.jsonb_build_object('state',state_,'commandHash',NULL,'receipt',NULL,'code',NULL));
 IF state_='issued' THEN result_:=result_||pg_catalog.jsonb_build_object('issuedId',i.id);END IF;RETURN result_;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.resolve_native_source(g text,p_url text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE s canonical_v4.sources%ROWTYPE;i hierarchy_native_scoped_ingestion_v2.inputs%ROWTYPE;c hierarchy_native_scoped_ingestion_v2.containers%ROWTYPE;r canonical_v4.runtime_state%ROWTYPE;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 SELECT * INTO r FROM canonical_v4.runtime_state WHERE singleton AND generation=g;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation changed' USING ERRCODE='P2402';END IF;
 SELECT * INTO s FROM canonical_v4.sources WHERE url=p_url;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('expected',pg_catalog.jsonb_build_object('generation',g,'revision',r.revision),'sourceAbsent',true);END IF;
 SELECT * INTO c FROM hierarchy_native_scoped_ingestion_v2.containers WHERE source_id=s.id;
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.inputs WHERE source_id=s.id;
 IF c.incarnation IS NULL OR i.source_id IS NULL THEN RAISE EXCEPTION 'Legacy adoption not implemented' USING ERRCODE='P2402';END IF;
 PERFORM hierarchy_native_scoped_ingestion_v2.assert_witness(s.id,i.witness_hash);
 RETURN pg_catalog.jsonb_build_object('expected',pg_catalog.jsonb_build_object('generation',g,'revision',r.revision),'sourceId',s.id,'sourceIncarnation',c.incarnation,
 'topicId',c.topic_id,'discussionId',c.discussion_id,'sourceAbsent',false,'prior',pg_catalog.jsonb_build_object('sourceVersion',i.source_version::text,'witnessHash',i.witness_hash,'decisionHash',i.decision_hash));
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.retire_native_issued(p_sources text[],p_actor text,p_all boolean,p_topics text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i record;BEGIN
 -- Callers already hold lifecycle and the original sorted Source/job locks;
 -- account withdrawal owns actor first, Topic/clear owns lifecycle exclusive.
 FOR i IN SELECT c.* FROM hierarchy_native_scoped_ingestion_v2.issued_commands c LEFT JOIN hierarchy_native_scoped_ingestion_v2.jobs j USING(generation,operation_id) WHERE
 (p_all OR c.principal=p_actor OR j.source_id=ANY(p_sources) OR j.topic_id=ANY(p_topics) OR
 c.params->>4=ANY(p_sources) OR c.params->>5=ANY(p_topics) OR c.description->'mapping'->'declaredCanonicalSource'->>'sourceId'=ANY(p_sources))
 ORDER BY c.generation COLLATE "C",c.operation_id COLLATE "C" FOR UPDATE OF c LOOP
 INSERT INTO hierarchy_native_scoped_ingestion_v2.retired_operations VALUES(i.generation,i.operation_id,i.mode) ON CONFLICT DO NOTHING;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE id=i.id;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=i.attestation_id;
 END LOOP;
 FOR i IN SELECT * FROM hierarchy_native_scoped_ingestion_v2.attestations a WHERE a.authority IS NOT NULL AND
 NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.issued_commands c WHERE c.attestation_id=a.id) AND
 (p_all OR a.principal=p_actor OR a.authority->>'sourceId'=ANY(p_sources)) ORDER BY generation COLLATE "C",operation_id COLLATE "C" LOOP
 INSERT INTO hierarchy_native_scoped_ingestion_v2.retired_operations VALUES(i.generation,i.operation_id,CASE WHEN i.authority->'sourceAbsent'='true'::jsonb THEN 'admission' ELSE 'update' END) ON CONFLICT DO NOTHING;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=i.id;
 END LOOP;
END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.scrub_native_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.state NOT IN('pending','leased') THEN
 UPDATE hierarchy_native_scoped_ingestion_v2.issued_commands SET description=NULL,params=NULL WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 UPDATE hierarchy_native_scoped_ingestion_v2.attestations SET authority=NULL WHERE generation=NEW.generation AND operation_id=NEW.operation_id;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER native_terminal_scrub AFTER UPDATE OF state ON hierarchy_native_scoped_ingestion_v2.jobs FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.scrub_native_job();
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.native_source_erasure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.retire_native_issued(ARRAY[OLD.id],NULL,false,ARRAY[]::text[]);RETURN OLD;
END $$;
CREATE TRIGGER native_source_erasure BEFORE DELETE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.native_source_erasure();
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.clear_container_incarnation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.source_id IS NULL THEN NEW.incarnation:=NULL;END IF;RETURN NEW;
END $$;
CREATE TRIGGER native_container_erasure BEFORE UPDATE OF source_id ON hierarchy_native_scoped_ingestion_v2.containers FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.clear_container_incarnation();

-- Disable predecessor caller-selected artifact/decision entrypoints. Actual
-- numerical issuance is the only route to the private mutators above.
CREATE OR REPLACE FUNCTION hierarchy_native_scoped_ingestion_v2.publish(p_identity jsonb,p_nodes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Protected publication required' USING ERRCODE='P2402';END $$;
CREATE OR REPLACE FUNCTION hierarchy_native_scoped_ingestion_v2.reclassify(p_source text,p_witness text,p_decision text,p_node text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION 'Protected native observation required' USING ERRCODE='P2402';END $$;

CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.revoke_attestation(p_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 -- Revocation-only, committed separately by the repository. No Source/job lock.
 UPDATE hierarchy_native_scoped_ingestion_v2.attestations SET revoked=true WHERE id=p_id;
 RETURN FOUND;
END $$;
CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.expire_issued() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE candidate record;i hierarchy_native_scoped_ingestion_v2.issued_commands%ROWTYPE;a hierarchy_native_scoped_ingestion_v2.attestations%ROWTYPE;n integer:=0;BEGIN
 PERFORM hierarchy_native_scoped_ingestion_v2.enter_gate(false);
 -- Never wait for a second actor while retaining the first actor fence.
 -- These are candidate addresses ONLY; all predicates are rechecked under locks.
 FOR candidate IN SELECT c.id,c.principal,c.kind FROM hierarchy_native_scoped_ingestion_v2.issued_commands c JOIN hierarchy_native_scoped_ingestion_v2.attestations a0 ON a0.id=c.attestation_id
 WHERE c.params IS NOT NULL AND (c.deadline<=pg_catalog.clock_timestamp() OR a0.revoked)
 AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs j WHERE j.generation=c.generation AND j.operation_id=c.operation_id)
 ORDER BY c.generation COLLATE "C",c.operation_id COLLATE "C" LIMIT 100 LOOP
 IF candidate.kind='actor' AND NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(candidate.principal,914092006)) THEN CONTINUE;END IF;
 SELECT * INTO i FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN CONTINUE;END IF;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=i.attestation_id FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR i.params IS NULL OR (i.deadline>pg_catalog.clock_timestamp() AND NOT a.revoked) OR
 EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.jobs j WHERE j.generation=i.generation AND j.operation_id=i.operation_id) THEN CONTINUE;END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.retired_operations VALUES(i.generation,i.operation_id,i.mode) ON CONFLICT DO NOTHING;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.issued_commands WHERE id=i.id;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=a.id;n:=n+1;
 END LOOP;
 FOR candidate IN SELECT a0.id,a0.principal,a0.authority->>'originKind' AS kind FROM hierarchy_native_scoped_ingestion_v2.attestations a0
 WHERE a0.authority IS NOT NULL AND (a0.deadline<=pg_catalog.clock_timestamp() OR a0.revoked)
 AND NOT EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.issued_commands c WHERE c.attestation_id=a0.id)
 ORDER BY a0.generation COLLATE "C",a0.operation_id COLLATE "C" LIMIT (100-n) LOOP
 IF candidate.kind='actor' AND NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(candidate.principal,914092006)) THEN CONTINUE;END IF;
 SELECT * INTO a FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR a.authority IS NULL OR (a.deadline>pg_catalog.clock_timestamp() AND NOT a.revoked) OR
 EXISTS(SELECT 1 FROM hierarchy_native_scoped_ingestion_v2.issued_commands c WHERE c.attestation_id=a.id) THEN CONTINUE;END IF;
 INSERT INTO hierarchy_native_scoped_ingestion_v2.retired_operations VALUES(a.generation,a.operation_id,CASE WHEN a.authority->'sourceAbsent'='true'::jsonb THEN 'admission' ELSE 'update' END) ON CONFLICT DO NOTHING;
 DELETE FROM hierarchy_native_scoped_ingestion_v2.attestations WHERE id=a.id;n:=n+1;
 END LOOP;RETURN n;
END $$;
CREATE TRIGGER native_publication_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.publications FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_epoch_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.publication_epochs FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_parentage_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.canonical_nodes FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_topology_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.publication_nodes FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_ancestry_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.ancestors FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_owner_version_immutable BEFORE UPDATE OR DELETE ON hierarchy_native_scoped_ingestion_v2.owner_policy_versions FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_observation_immutable BEFORE UPDATE ON hierarchy_native_scoped_ingestion_v2.observations FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_decision_immutable BEFORE UPDATE ON hierarchy_native_scoped_ingestion_v2.native_decisions FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_root_binding_immutable BEFORE UPDATE ON hierarchy_native_scoped_ingestion_v2.root_native_bindings FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();
CREATE TRIGGER native_edge_immutable BEFORE UPDATE ON hierarchy_native_scoped_ingestion_v2.root_edges FOR EACH ROW EXECUTE FUNCTION hierarchy_native_scoped_ingestion_v2.reject_update();

REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_native_scoped_ingestion_v2 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_native_scoped_ingestion_v2 FROM PUBLIC;
DO $native_private_grants$
DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'] LOOP
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_) THEN
 EXECUTE 'REVOKE ALL ON SCHEMA hierarchy_native_scoped_ingestion_v2 FROM '||pg_catalog.quote_ident(role_);
 EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_native_scoped_ingestion_v2 FROM '||pg_catalog.quote_ident(role_);
 EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_native_scoped_ingestion_v2 FROM '||pg_catalog.quote_ident(role_);
 END IF;END LOOP;
END $native_private_grants$;
