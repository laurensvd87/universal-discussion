-- EXPLICIT OPT-IN SYNTHETIC SHADOW ONLY. Not a canonical migration or authority.
-- No Source bodies, vectors, posts, principals, grants, runtime hooks or worker.
CREATE SCHEMA hierarchy_shadow;
CREATE TABLE hierarchy_shadow.revisions (
  revision text PRIMARY KEY, artifact_hash text NOT NULL, model_hash text NOT NULL, policy_hash text NOT NULL,
  CHECK (artifact_hash ~ '^[a-f0-9]{64}$' AND model_hash ~ '^[a-f0-9]{64}$' AND policy_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE hierarchy_shadow.state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  current_revision text REFERENCES hierarchy_shadow.revisions(revision)
);
INSERT INTO hierarchy_shadow.state(singleton,current_revision) VALUES(true,NULL);
CREATE TABLE hierarchy_shadow.nodes (
  revision text NOT NULL REFERENCES hierarchy_shadow.revisions(revision), node_id text NOT NULL,
  parent_id text, label text NOT NULL, PRIMARY KEY(revision,node_id),
  FOREIGN KEY(revision,parent_id) REFERENCES hierarchy_shadow.nodes(revision,node_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE hierarchy_shadow.ancestors (
  revision text NOT NULL, node_id text NOT NULL, ancestor_id text NOT NULL, distance integer NOT NULL CHECK(distance BETWEEN 0 AND 7),
  PRIMARY KEY(revision,node_id,ancestor_id),
  FOREIGN KEY(revision,node_id) REFERENCES hierarchy_shadow.nodes(revision,node_id),
  FOREIGN KEY(revision,ancestor_id) REFERENCES hierarchy_shadow.nodes(revision,node_id)
);
CREATE INDEX shadow_ancestor_feed ON hierarchy_shadow.ancestors(revision,ancestor_id,node_id);
CREATE SEQUENCE hierarchy_shadow.feed_versions_sequence;
CREATE TABLE hierarchy_shadow.feed_versions (
  revision text NOT NULL,node_id text NOT NULL,version bigint NOT NULL UNIQUE
    DEFAULT nextval('hierarchy_shadow.feed_versions_sequence'),
  PRIMARY KEY(revision,node_id),
  FOREIGN KEY(revision,node_id) REFERENCES hierarchy_shadow.nodes(revision,node_id)
);
CREATE TABLE hierarchy_shadow.sealed_revisions (revision text PRIMARY KEY REFERENCES hierarchy_shadow.revisions(revision));
CREATE TABLE hierarchy_shadow.revoked_revisions (revision text PRIMARY KEY REFERENCES hierarchy_shadow.revisions(revision));
CREATE SEQUENCE hierarchy_shadow.source_witness_versions;
CREATE TABLE hierarchy_shadow.source_witnesses (
  source_id text PRIMARY KEY, input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  witness_version bigint NOT NULL UNIQUE DEFAULT nextval('hierarchy_shadow.source_witness_versions')
);
CREATE TABLE hierarchy_shadow.decisions (
  source_id text PRIMARY KEY REFERENCES hierarchy_shadow.source_witnesses(source_id) ON DELETE CASCADE,
  input_hash text NOT NULL, witness_version bigint NOT NULL,
  revision text NOT NULL REFERENCES hierarchy_shadow.revisions(revision), node_id text,
  FOREIGN KEY(revision,node_id) REFERENCES hierarchy_shadow.nodes(revision,node_id)
);
CREATE INDEX shadow_decision_feed ON hierarchy_shadow.decisions(revision,node_id,source_id);
CREATE TABLE hierarchy_shadow.root_registry (
  canonical_root_id text PRIMARY KEY, canonical_destination_id text NOT NULL,
  semantic_revision text NOT NULL,semantic_node_id text NOT NULL,
  FOREIGN KEY(semantic_revision,semantic_node_id) REFERENCES hierarchy_shadow.nodes(revision,node_id)
);
CREATE INDEX shadow_root_semantic_feed ON hierarchy_shadow.root_registry(semantic_revision,semantic_node_id,canonical_root_id);
CREATE TABLE hierarchy_shadow.source_root_bindings (
  source_id text NOT NULL REFERENCES hierarchy_shadow.source_witnesses(source_id) ON DELETE CASCADE,
  canonical_root_id text NOT NULL REFERENCES hierarchy_shadow.root_registry(canonical_root_id) ON DELETE CASCADE,
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  witness_version bigint NOT NULL CHECK(witness_version>0),
  PRIMARY KEY(source_id,canonical_root_id)
);

CREATE FUNCTION hierarchy_shadow.safe_text(v text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
  SELECT v IS NOT NULL AND char_length(v) BETWEEN 1 AND 160 AND octet_length(v)<=640
    AND btrim(v)=v AND v !~ '[[:cntrl:]]'
$$;
-- Scoped thread-feed tokens, not page-classification or catalog revisions.
-- Root/link changes hold state first and advance their snapshot-node ancestors.
CREATE FUNCTION hierarchy_shadow.bump_shadow_paths(p_nodes text[]) RETURNS void LANGUAGE sql
SET search_path=pg_catalog AS $$
  UPDATE hierarchy_shadow.feed_versions f
    SET version=nextval('hierarchy_shadow.feed_versions_sequence')
    WHERE f.revision=(SELECT current_revision FROM hierarchy_shadow.state WHERE singleton)
      AND f.node_id IN(SELECT a.ancestor_id FROM hierarchy_shadow.ancestors a
        WHERE a.revision=f.revision AND a.node_id=ANY(p_nodes))
$$;
CREATE FUNCTION hierarchy_shadow.reject_mutation() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Immutable shadow artifact' USING ERRCODE='P2003'; END $$;
CREATE FUNCTION hierarchy_shadow.reject_sealed_insert() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$ BEGIN
  IF EXISTS(SELECT 1 FROM hierarchy_shadow.sealed_revisions WHERE revision=NEW.revision) THEN
    RAISE EXCEPTION 'Sealed shadow revision' USING ERRCODE='P2003';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shadow_revision_immutable BEFORE UPDATE OR DELETE ON hierarchy_shadow.revisions FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_mutation();
CREATE TRIGGER shadow_node_immutable BEFORE UPDATE OR DELETE ON hierarchy_shadow.nodes FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_mutation();
CREATE TRIGGER shadow_ancestor_immutable BEFORE UPDATE OR DELETE ON hierarchy_shadow.ancestors FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_mutation();
CREATE TRIGGER shadow_seal_immutable BEFORE UPDATE OR DELETE ON hierarchy_shadow.sealed_revisions FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_mutation();
CREATE TRIGGER shadow_revocation_immutable BEFORE UPDATE OR DELETE ON hierarchy_shadow.revoked_revisions FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_mutation();
CREATE TRIGGER shadow_node_sealed BEFORE INSERT ON hierarchy_shadow.nodes FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_sealed_insert();
CREATE TRIGGER shadow_ancestor_sealed BEFORE INSERT ON hierarchy_shadow.ancestors FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_sealed_insert();
-- Both route and explicit semantic snapshot are immutable for an extant root.
-- Source reassignment never moves that root; erasure may remove the entry.
CREATE TRIGGER shadow_root_destination_immutable BEFORE UPDATE ON hierarchy_shadow.root_registry FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_mutation();
CREATE TRIGGER shadow_binding_origin_immutable BEFORE UPDATE ON hierarchy_shadow.source_root_bindings FOR EACH ROW EXECUTE FUNCTION hierarchy_shadow.reject_mutation();

CREATE FUNCTION hierarchy_shadow.publish_shadow_hierarchy(
  p_expected text,p_revision text,p_artifact text,p_model text,p_policy text,p_nodes jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_current text; v_invalid boolean; v_depth integer;
BEGIN
  SELECT current_revision INTO v_current FROM hierarchy_shadow.state WHERE singleton FOR UPDATE;
  IF p_expected IS DISTINCT FROM v_current THEN RETURN jsonb_build_object('status','stale-revision','revision',v_current); END IF;
  IF NOT hierarchy_shadow.safe_text(p_revision) OR p_artifact IS NULL OR p_model IS NULL OR p_policy IS NULL OR
    p_artifact !~ '^[a-f0-9]{64}$' OR p_model !~ '^[a-f0-9]{64}$' OR p_policy !~ '^[a-f0-9]{64}$' OR
    p_nodes IS NULL OR jsonb_typeof(p_nodes)<>'array' THEN
    RAISE EXCEPTION 'Invalid shadow publication' USING ERRCODE='P2001';
  END IF;
  IF jsonb_array_length(p_nodes)>128 THEN RAISE EXCEPTION 'Shadow node capacity' USING ERRCODE='P2002'; END IF;
  IF jsonb_array_length(p_nodes)=0 THEN RAISE EXCEPTION 'Empty shadow taxonomy' USING ERRCODE='P2001'; END IF;
  FOR v_invalid IN SELECT true FROM jsonb_array_elements(p_nodes) e WHERE
    jsonb_typeof(e)<>'object' OR NOT (e ?& ARRAY['id','parentId','label']) LOOP
    RAISE EXCEPTION 'Invalid shadow node fields' USING ERRCODE='P2001';
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_nodes) e WHERE
      (SELECT count(*) FROM jsonb_object_keys(e))<>3 OR jsonb_typeof(e->'id')<>'string' OR
      jsonb_typeof(e->'label')<>'string' OR NOT hierarchy_shadow.safe_text(e->>'id') OR
      NOT hierarchy_shadow.safe_text(e->>'label') OR
      NOT (e->'parentId'='null'::jsonb OR jsonb_typeof(e->'parentId')='string' AND hierarchy_shadow.safe_text(e->>'parentId'))) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(p_nodes) e GROUP BY e->>'id' HAVING count(*)>1) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(p_nodes) e WHERE e->'parentId'<>'null'::jsonb AND
      NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_nodes) p WHERE p->>'id'=e->>'parentId')) THEN
    RAISE EXCEPTION 'Invalid shadow forest' USING ERRCODE='P2001';
  END IF;
  WITH RECURSIVE walk(node_id,parent_id,path,cycle) AS (
    SELECT e->>'id',e->>'parentId',ARRAY[e->>'id'],false FROM jsonb_array_elements(p_nodes) e
    UNION ALL
    SELECT p->>'id',p->>'parentId',w.path||(p->>'id'),(p->>'id')=ANY(w.path)
      FROM walk w JOIN jsonb_array_elements(p_nodes) p ON p->>'id'=w.parent_id
      WHERE NOT w.cycle AND cardinality(w.path)<=8
  ) SELECT bool_or(cycle),max(cardinality(path)) INTO v_invalid,v_depth FROM walk;
  IF v_invalid THEN RAISE EXCEPTION 'Shadow taxonomy cycle' USING ERRCODE='P2001'; END IF;
  IF v_depth>8 THEN RAISE EXCEPTION 'Shadow taxonomy depth capacity' USING ERRCODE='P2002'; END IF;
  IF EXISTS(SELECT 1 FROM hierarchy_shadow.revisions WHERE revision=p_revision) THEN
    RAISE EXCEPTION 'Immutable shadow revision already exists' USING ERRCODE='P2003';
  END IF;
  INSERT INTO hierarchy_shadow.revisions VALUES(p_revision,p_artifact,p_model,p_policy);
  INSERT INTO hierarchy_shadow.nodes(revision,node_id,parent_id,label)
    SELECT p_revision,e->>'id',e->>'parentId',e->>'label' FROM jsonb_array_elements(p_nodes) e;
  WITH RECURSIVE closure(node_id,ancestor_id,parent_id,distance) AS (
    SELECT node_id,node_id,parent_id,0 FROM hierarchy_shadow.nodes WHERE revision=p_revision
    UNION ALL
    SELECT c.node_id,p.node_id,p.parent_id,c.distance+1 FROM closure c
      JOIN hierarchy_shadow.nodes p ON p.revision=p_revision AND p.node_id=c.parent_id
  ) INSERT INTO hierarchy_shadow.ancestors SELECT p_revision,node_id,ancestor_id,distance FROM closure;
  INSERT INTO hierarchy_shadow.feed_versions(revision,node_id)
    SELECT p_revision,node_id FROM hierarchy_shadow.nodes WHERE revision=p_revision ORDER BY node_id COLLATE "C";
  INSERT INTO hierarchy_shadow.sealed_revisions VALUES(p_revision);
  UPDATE hierarchy_shadow.state SET current_revision=p_revision WHERE singleton;
  RETURN jsonb_build_object('status','published','revision',p_revision);
END $$;

CREATE FUNCTION hierarchy_shadow.register_shadow_source(p_source text,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_source record; v_revision text; v_changed boolean; v_needed boolean;
BEGIN
  SELECT current_revision INTO v_revision FROM hierarchy_shadow.state WHERE singleton FOR UPDATE;
  IF NOT hierarchy_shadow.safe_text(p_source) OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid shadow Source witness' USING ERRCODE='P2001';
  END IF;
  SELECT * INTO v_source FROM hierarchy_shadow.source_witnesses WHERE source_id=p_source FOR UPDATE;
  v_changed := NOT FOUND OR v_source.input_hash IS DISTINCT FROM p_hash;
  IF v_changed THEN
    DELETE FROM hierarchy_shadow.decisions WHERE source_id=p_source;
    INSERT INTO hierarchy_shadow.source_witnesses(source_id,input_hash) VALUES(p_source,p_hash)
      ON CONFLICT(source_id) DO UPDATE SET input_hash=excluded.input_hash,witness_version=excluded.witness_version;
  END IF;
  SELECT * INTO v_source FROM hierarchy_shadow.source_witnesses WHERE source_id=p_source;
  v_needed := NOT EXISTS(SELECT 1 FROM hierarchy_shadow.decisions d WHERE d.source_id=p_source AND
    d.input_hash=p_hash AND d.witness_version=v_source.witness_version AND d.revision=v_revision);
  RETURN jsonb_build_object('status','registered','changed',v_changed,'requiresAssignment',v_needed,
    'sourceWitnessVersion',v_source.witness_version::text);
END $$;

CREATE FUNCTION hierarchy_shadow.commit_shadow_decision(p_revision text,p_artifact text,p_model text,p_policy text,
  p_source text,p_hash text,p_witness text,p_node text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_current text; v_revision record; v_source record;
BEGIN
  SELECT current_revision INTO v_current FROM hierarchy_shadow.state WHERE singleton FOR UPDATE;
  IF EXISTS(SELECT 1 FROM hierarchy_shadow.revoked_revisions WHERE revision=p_revision) THEN RETURN jsonb_build_object('status','revoked'); END IF;
  SELECT * INTO v_revision FROM hierarchy_shadow.revisions WHERE revision=v_current;
  IF NOT FOUND OR p_revision IS DISTINCT FROM v_current OR p_artifact IS DISTINCT FROM v_revision.artifact_hash OR
    p_model IS DISTINCT FROM v_revision.model_hash OR p_policy IS DISTINCT FROM v_revision.policy_hash THEN
    RETURN jsonb_build_object('status','stale-model');
  END IF;
  SELECT * INTO v_source FROM hierarchy_shadow.source_witnesses WHERE source_id=p_source FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','missing-source'); END IF;
  IF p_hash IS DISTINCT FROM v_source.input_hash OR p_witness IS DISTINCT FROM v_source.witness_version::text THEN
    RETURN jsonb_build_object('status','stale-source');
  END IF;
  IF p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hierarchy_shadow.nodes WHERE revision=p_revision AND node_id=p_node) THEN
    RAISE EXCEPTION 'Unknown shadow decision node' USING ERRCODE='P2001';
  END IF;
  IF EXISTS(SELECT 1 FROM hierarchy_shadow.decisions WHERE source_id=p_source AND input_hash=p_hash
      AND witness_version=v_source.witness_version AND revision=p_revision AND node_id IS NOT DISTINCT FROM p_node) THEN
    RETURN jsonb_build_object('status','accepted','revision',p_revision,'nodeId',p_node);
  END IF;
  INSERT INTO hierarchy_shadow.decisions(source_id,input_hash,witness_version,revision,node_id)
    VALUES(p_source,p_hash,v_source.witness_version,p_revision,p_node)
    ON CONFLICT(source_id) DO UPDATE SET input_hash=excluded.input_hash,witness_version=excluded.witness_version,
      revision=excluded.revision,node_id=excluded.node_id;
  RETURN jsonb_build_object('status','accepted','revision',p_revision,'nodeId',p_node);
END $$;

CREATE FUNCTION hierarchy_shadow.bind_shadow_root(p_expected_revision text,p_expected_node text,
  p_source text,p_hash text,p_witness text,p_root text,p_destination text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_existing record; v_source record; v_count integer; v_node text; v_revision text;
BEGIN
  SELECT current_revision INTO v_revision FROM hierarchy_shadow.state WHERE singleton FOR UPDATE;
  IF NOT hierarchy_shadow.safe_text(p_expected_revision) OR NOT hierarchy_shadow.safe_text(p_expected_node) OR
    NOT hierarchy_shadow.safe_text(p_source) OR NOT hierarchy_shadow.safe_text(p_root) OR NOT hierarchy_shadow.safe_text(p_destination) OR
    p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_witness IS NULL OR p_witness !~ '^[1-9][0-9]{0,18}$' THEN
    RAISE EXCEPTION 'Invalid shadow binding' USING ERRCODE='P2001';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_revision THEN RETURN jsonb_build_object('status','stale-revision'); END IF;
  SELECT * INTO v_source FROM hierarchy_shadow.source_witnesses WHERE source_id=p_source;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','stale-source'); END IF;
  IF p_hash IS DISTINCT FROM v_source.input_hash OR p_witness IS DISTINCT FROM v_source.witness_version::text THEN
    RETURN jsonb_build_object('status','stale-source');
  END IF;
  SELECT d.node_id INTO v_node FROM hierarchy_shadow.decisions d
    JOIN hierarchy_shadow.source_witnesses w ON w.source_id=d.source_id AND w.input_hash=d.input_hash AND w.witness_version=d.witness_version
    WHERE d.source_id=p_source AND d.revision=v_revision AND d.node_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM hierarchy_shadow.revoked_revisions r WHERE r.revision=d.revision);
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unassigned-source'); END IF;
  IF p_expected_node IS DISTINCT FROM v_node THEN RETURN jsonb_build_object('status','stale-decision'); END IF;
  SELECT * INTO v_existing FROM hierarchy_shadow.root_registry WHERE canonical_root_id=p_root;
  IF FOUND THEN
    IF v_existing.canonical_destination_id<>p_destination THEN RETURN jsonb_build_object('status','destination-conflict'); END IF;
    IF v_existing.semantic_revision<>v_revision OR v_existing.semantic_node_id<>v_node THEN
      RETURN jsonb_build_object('status','semantic-binding-conflict');
    END IF;
  END IF;
  INSERT INTO hierarchy_shadow.root_registry(canonical_root_id,canonical_destination_id,semantic_revision,semantic_node_id)
    VALUES(p_root,p_destination,v_revision,v_node) ON CONFLICT DO NOTHING;
  -- The original explicit-bind proof is immutable and intentionally has no FK
  -- to the mutable current Source hash/incarnation. A fresh same-node proof may
  -- repeat the bind, but cannot rewrite its historical origin.
  INSERT INTO hierarchy_shadow.source_root_bindings(source_id,canonical_root_id,input_hash,witness_version)
    VALUES(p_source,p_root,p_hash,v_source.witness_version) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=1 THEN
    PERFORM hierarchy_shadow.bump_shadow_paths(ARRAY[v_node]);
  END IF;
  RETURN jsonb_build_object('status','bound','changed',v_count=1);
END $$;

CREATE FUNCTION hierarchy_shadow.delete_shadow_source(p_source text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_count integer; v_nodes text[];
BEGIN
  PERFORM 1 FROM hierarchy_shadow.state WHERE singleton FOR UPDATE;
  SELECT array_agg(DISTINCT r.semantic_node_id) INTO v_nodes FROM hierarchy_shadow.source_root_bindings b
    JOIN hierarchy_shadow.root_registry r ON r.canonical_root_id=b.canonical_root_id
    JOIN hierarchy_shadow.state s ON s.singleton AND r.semantic_revision=s.current_revision WHERE b.source_id=p_source;
  DELETE FROM hierarchy_shadow.source_witnesses WHERE source_id=p_source;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=1 THEN PERFORM hierarchy_shadow.bump_shadow_paths(v_nodes); END IF;
  DELETE FROM hierarchy_shadow.root_registry r WHERE NOT EXISTS(SELECT 1 FROM hierarchy_shadow.source_root_bindings b WHERE b.canonical_root_id=r.canonical_root_id);
  RETURN jsonb_build_object('status','deleted','changed',v_count=1);
END $$;
CREATE FUNCTION hierarchy_shadow.delete_shadow_root(p_root text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_count integer; v_nodes text[];
BEGIN
  PERFORM 1 FROM hierarchy_shadow.state WHERE singleton FOR UPDATE;
  SELECT array_agg(r.semantic_node_id) INTO v_nodes FROM hierarchy_shadow.root_registry r
    JOIN hierarchy_shadow.state s ON s.singleton AND r.semantic_revision=s.current_revision
    WHERE r.canonical_root_id=p_root;
  DELETE FROM hierarchy_shadow.root_registry WHERE canonical_root_id=p_root;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=1 THEN PERFORM hierarchy_shadow.bump_shadow_paths(v_nodes); END IF;
  RETURN jsonb_build_object('status','deleted','changed',v_count=1);
END $$;
CREATE FUNCTION hierarchy_shadow.revoke_shadow_revision(p_revision text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM 1 FROM hierarchy_shadow.state WHERE singleton FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM hierarchy_shadow.revisions WHERE revision=p_revision) THEN RETURN jsonb_build_object('status','missing-revision'); END IF;
  INSERT INTO hierarchy_shadow.revoked_revisions VALUES(p_revision) ON CONFLICT DO NOTHING;
  DELETE FROM hierarchy_shadow.root_registry WHERE semantic_revision=p_revision;
  DELETE FROM hierarchy_shadow.decisions WHERE revision=p_revision;
  DELETE FROM hierarchy_shadow.root_registry r WHERE NOT EXISTS(SELECT 1 FROM hierarchy_shadow.source_root_bindings b WHERE b.canonical_root_id=r.canonical_root_id);
  UPDATE hierarchy_shadow.state SET current_revision=NULL WHERE singleton AND current_revision=p_revision;
  RETURN jsonb_build_object('status','revoked','revision',p_revision);
END $$;

-- No application roles or grants are created. Future integration must define its
-- own canonical transaction proof and narrowly reviewed execution permissions.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_shadow FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hierarchy_shadow FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hierarchy_shadow FROM PUBLIC;
