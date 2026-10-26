-- Additive, unregistered production source. No legacy-root backfill, destination
-- changes, model execution or native capture claims. Requires ordinary 010.
CREATE TABLE canonical_v4.semantic_root_snapshots (
  root_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.contributions(id) ON DELETE CASCADE,
  source_id text COLLATE "C" NOT NULL,
  source_version bigint NOT NULL CHECK(source_version>0),
  matcher_hash text COLLATE "C" NOT NULL,
  generation text NOT NULL CHECK(canonical_v4.runtime_safe_text(generation,128,false)),
  operation_id text NOT NULL,operation_digest text NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
  topic_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.topics(id) ON DELETE CASCADE,
  discussion_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.discussions(id) ON DELETE CASCADE,
  root_ordinal bigint NOT NULL CHECK(root_ordinal>=0),
  supported_path text[] NOT NULL CHECK(array_ndims(supported_path)=1 AND array_lower(supported_path,1)=1 AND cardinality(supported_path) BETWEEN 1 AND 8),
  UNIQUE(root_id,root_ordinal),
  FOREIGN KEY(source_id,source_version,matcher_hash) REFERENCES canonical_v4.semantic_observations ON DELETE CASCADE
);
CREATE TABLE canonical_v4.semantic_root_edges (
  root_id text COLLATE "C" NOT NULL,node_id text COLLATE "C" NOT NULL,
  root_ordinal bigint NOT NULL CHECK(root_ordinal>=0),
  PRIMARY KEY(root_id,node_id),
  FOREIGN KEY(root_id,root_ordinal) REFERENCES canonical_v4.semantic_root_snapshots(root_id,root_ordinal) ON DELETE CASCADE
);
CREATE INDEX semantic_root_feed_order ON canonical_v4.semantic_root_edges(node_id,root_ordinal DESC,root_id COLLATE "C");
CREATE TRIGGER semantic_root_snapshot_immutable BEFORE UPDATE ON canonical_v4.semantic_root_snapshots
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_immutable();
CREATE TRIGGER semantic_root_edge_immutable BEFORE UPDATE ON canonical_v4.semantic_root_edges
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_immutable();

CREATE FUNCTION canonical_v4.semantic_capture_root() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source_ canonical_v4.sources%ROWTYPE;receipt_ canonical_v4.operation_receipts%ROWTYPE;
  stamp_ canonical_v4.runtime_source_stamps%ROWTYPE;head_ canonical_v4.semantic_installation%ROWTYPE;
  observation_ canonical_v4.semantic_observations%ROWTYPE;path_ text[];generation_ text;topic_ text;payload_ jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.withdrawn IS DISTINCT FROM OLD.withdrawn OR NEW.visibility IS DISTINCT FROM OLD.visibility THEN
      DELETE FROM canonical_v4.semantic_root_snapshots WHERE root_id=OLD.id;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.root_id IS NOT NULL OR NEW.origin_source_id IS NULL OR NEW.withdrawn OR NEW.visibility<>'local-public' THEN RETURN NEW;END IF;
  -- Runtime append and generated-root paths already lock receipt -> Source ->
  -- Discussion -> Topic before their INSERT. Re-taking those shared locks is
  -- compatible and also protects owner-originated ordinary canonical inserts.
  SELECT * INTO receipt_ FROM canonical_v4.operation_receipts WHERE source_id=NEW.origin_source_id FOR SHARE;
  IF NOT FOUND THEN RETURN NEW;END IF;
  SELECT * INTO source_ FROM canonical_v4.sources WHERE id=NEW.origin_source_id FOR SHARE;
  IF NOT FOUND OR source_.provenance<>'owner-local-page-embedding/v1' OR
      receipt_.operation_id IS DISTINCT FROM source_.operation_id OR
      receipt_.operation_digest IS DISTINCT FROM source_.payload::jsonb->>'operationDigest' THEN RETURN NEW;END IF;
  SELECT * INTO stamp_ FROM canonical_v4.runtime_source_stamps WHERE source_id=source_.id FOR SHARE;
  IF NOT FOUND OR stamp_.postable IS DISTINCT FROM true THEN RETURN NEW;END IF;
  SELECT generation INTO generation_ FROM canonical_v4.runtime_state WHERE singleton;
  SELECT topic_id INTO topic_ FROM canonical_v4.discussions WHERE id=NEW.discussion_id;
  IF generation_ IS NULL OR topic_ IS NULL OR NOT EXISTS(
      SELECT 1 FROM canonical_v4.source_links l JOIN canonical_v4.topic_memberships m USING(source_id,topic_id)
      WHERE l.source_id=source_.id AND l.topic_id=topic_) THEN RETURN NEW;END IF;
  payload_:=NEW.payload::jsonb;
  IF NEW.anchor_source_id IS DISTINCT FROM NEW.origin_source_id OR
      payload_->>'id' IS DISTINCT FROM NEW.id OR payload_->>'discussionId' IS DISTINCT FROM NEW.discussion_id OR
      payload_->'rootId' IS DISTINCT FROM 'null'::jsonb OR payload_->>'originSourceId' IS DISTINCT FROM source_.id OR
      payload_->'anchor'->>'kind' IS DISTINCT FROM 'source' OR payload_->'anchor'->>'sourceId' IS DISTINCT FROM source_.id OR
      payload_->'anchor'->>'stamp' IS DISTINCT FROM stamp_.stamp OR payload_->>'originalTopicId' IS DISTINCT FROM topic_ OR
      payload_->'learnedOrigin' IS DISTINCT FROM 'true'::jsonb OR
      payload_->'visibility' IS DISTINCT FROM to_jsonb(NEW.visibility) OR payload_->'withdrawn' IS DISTINCT FROM to_jsonb(NEW.withdrawn) THEN RETURN NEW;END IF;
  -- Plain MVCC head read: this is a historical Source-context snapshot, not a
  -- linearizable CURRENT-activation claim. A queued owner head writer must not
  -- sit between root Source -> head and ingestion head -> Source lock orders.
  -- Use the matcher visible here; missing current-version observation leaves
  -- the root unclassified. Later activation never rewrites a captured path.
  -- Source/receipt shared locks plus immutable observation/input FKs bind its
  -- exact accepted material without acquiring any root-domain -> head lock.
  SELECT * INTO head_ FROM canonical_v4.semantic_installation WHERE singleton;
  IF head_.matcher_hash IS NULL THEN RETURN NEW;END IF;
  SELECT o.* INTO observation_ FROM canonical_v4.semantic_observations o
    WHERE o.source_id=source_.id AND o.source_version=source_.write_version AND o.matcher_hash=head_.matcher_hash
      AND o.generation=generation_ AND o.operation_id=source_.operation_id AND o.operation_digest=receipt_.operation_digest;
  IF NOT FOUND THEN RETURN NEW;END IF;
  SELECT i.supported_path INTO path_ FROM canonical_v4.semantic_inputs i
    WHERE i.source_id=observation_.source_id AND i.operation_digest=observation_.operation_digest AND i.matcher_hash=observation_.matcher_hash
      AND i.semantic_eligible AND cardinality(i.supported_path) BETWEEN 1 AND 8
      AND EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n WHERE n.matcher_hash=i.matcher_hash
        AND n.node_id=i.supported_path[cardinality(i.supported_path)] AND n.path=i.supported_path);
  IF NOT FOUND THEN RETURN NEW;END IF;
  INSERT INTO canonical_v4.semantic_root_snapshots VALUES(NEW.id,source_.id,source_.write_version,observation_.matcher_hash,
    generation_,observation_.operation_id,observation_.operation_digest,topic_,NEW.discussion_id,NEW.ordinal,path_);
  INSERT INTO canonical_v4.semantic_root_edges(root_id,node_id,root_ordinal) SELECT NEW.id,node,NEW.ordinal FROM unnest(path_) node;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'Invalid canonical semantic root mirror' USING ERRCODE='P1224';
END $$;
CREATE TRIGGER semantic_capture_new_root AFTER INSERT ON canonical_v4.contributions
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_capture_root();
CREATE TRIGGER semantic_retire_changed_visibility AFTER UPDATE OF withdrawn,visibility ON canonical_v4.contributions
FOR EACH ROW EXECUTE FUNCTION canonical_v4.semantic_capture_root();

CREATE TABLE canonical_v4.semantic_owner_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  revision bigint NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
  default_max_depth integer NOT NULL CHECK(default_max_depth BETWEEN 1 AND 8),
  overrides jsonb NOT NULL CHECK(jsonb_typeof(overrides)='array' AND jsonb_array_length(overrides)<=512 AND octet_length(overrides::text)<=131072)
);
INSERT INTO canonical_v4.semantic_owner_policy VALUES(true,0,1,'[]'::jsonb);

-- Owner-only control of this one policy row. No Source/root/watermark locks.
-- Most-specific matching override along a full supported path wins. A rule
-- cannot cut above its own node; presentation never extends semantic support.
CREATE FUNCTION canonical_v4.semantic_set_owner_policy(p_expected_revision bigint,p_default_max_depth integer,p_overrides jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE policy_ canonical_v4.semantic_owner_policy%ROWTYPE;entry_ jsonb;node_ text;depth_ integer;normalized_ jsonb;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR
      p_default_max_depth IS NULL OR p_default_max_depth NOT BETWEEN 1 AND 8 OR p_overrides IS NULL OR
      jsonb_typeof(p_overrides) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid semantic owner policy' USING ERRCODE='P1223';
  END IF;
  IF jsonb_array_length(p_overrides)>512 OR octet_length(p_overrides::text)>131072 THEN
    RAISE EXCEPTION 'Semantic owner policy capacity exceeded' USING ERRCODE='P1223';
  END IF;
  SELECT * INTO policy_ FROM canonical_v4.semantic_owner_policy WHERE singleton FOR UPDATE;
  IF policy_.revision IS DISTINCT FROM p_expected_revision OR policy_.revision=9007199254740991 THEN
    RAISE EXCEPTION 'Semantic owner policy changed or exhausted' USING ERRCODE='P1221';
  END IF;
  FOR entry_ IN SELECT value FROM jsonb_array_elements(p_overrides) LOOP
    IF jsonb_typeof(entry_) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid semantic owner override' USING ERRCODE='P1223';
    END IF;
    IF NOT entry_ ?& ARRAY['nodeId','maxDepth'] OR
        (SELECT count(*) FROM jsonb_object_keys(entry_))<>2 OR jsonb_typeof(entry_->'nodeId') IS DISTINCT FROM 'string' OR
        NOT canonical_v4.runtime_safe_text(entry_->>'nodeId',160,false) OR jsonb_typeof(entry_->'maxDepth') IS DISTINCT FROM 'number' OR
        (entry_->>'maxDepth' ~ '^[1-8]$') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Invalid semantic owner override' USING ERRCODE='P1223';
    END IF;
    node_:=entry_->>'nodeId';depth_:=(entry_->>'maxDepth')::integer;
    IF NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes WHERE node_id=node_) OR
        EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes WHERE node_id=node_ AND cardinality(path)>depth_) THEN
      RAISE EXCEPTION 'Unknown semantic node or override above its ancestry' USING ERRCODE='P1223';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT e->>'nodeId') FROM jsonb_array_elements(p_overrides) e)<>jsonb_array_length(p_overrides) THEN
    RAISE EXCEPTION 'Duplicate semantic owner override' USING ERRCODE='P1223';
  END IF;
  SELECT coalesce(jsonb_agg(e ORDER BY (e->>'nodeId') COLLATE "C"),'[]'::jsonb) INTO normalized_ FROM jsonb_array_elements(p_overrides) e;
  UPDATE canonical_v4.semantic_owner_policy SET revision=revision+1,default_max_depth=p_default_max_depth,overrides=normalized_ WHERE singleton;
  RETURN policy_.revision+1;
END $$;

CREATE FUNCTION canonical_v4.semantic_read_owner_policy()
RETURNS TABLE(revision text,default_max_depth integer,overrides jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT p.revision::text,p.default_max_depth,p.overrides FROM canonical_v4.semantic_owner_policy p WHERE p.singleton
$$;

-- Fresh-visibility moving-list keyset: immutable ordinal membership is stable;
-- removals may shorten later pages and new higher ordinals do not shift them.
-- No global runtime revision cursor, frozen multi-page snapshot or body export.
CREATE FUNCTION canonical_v4.semantic_read_feed(p_generation text,p_node_id text,p_before_ordinal bigint,p_limit integer)
RETURNS TABLE(root_id text,discussion_id text,topic_id text,root_ordinal text,generation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_generation,128,false) OR NOT canonical_v4.runtime_safe_text(p_node_id,160,false) OR
      p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_before_ordinal IS NOT NULL AND p_before_ordinal<0) OR
      NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n WHERE n.node_id=p_node_id) THEN
    RAISE EXCEPTION 'Invalid semantic feed request' USING ERRCODE='P1223';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state r WHERE r.singleton AND r.generation=p_generation) THEN
    RAISE EXCEPTION 'Semantic feed generation changed' USING ERRCODE='P1221';
  END IF;
  RETURN QUERY SELECT s.root_id,s.discussion_id,s.topic_id,s.root_ordinal::text,s.generation
    FROM canonical_v4.semantic_root_edges e JOIN canonical_v4.semantic_root_snapshots s USING(root_id,root_ordinal)
    JOIN canonical_v4.contributions c ON c.id=s.root_id
    JOIN canonical_v4.discussions d ON d.id=s.discussion_id AND d.topic_id=s.topic_id
    JOIN canonical_v4.topics t ON t.id=s.topic_id
    JOIN canonical_v4.runtime_state r ON r.singleton AND r.generation=s.generation
    WHERE e.node_id=p_node_id AND s.generation=p_generation AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
      AND c.discussion_id=s.discussion_id AND c.ordinal=s.root_ordinal
      AND c.payload::jsonb->>'id'=c.id AND c.payload::jsonb->>'discussionId'=c.discussion_id
      AND c.payload::jsonb->'rootId'='null'::jsonb AND c.payload::jsonb->>'visibility'=c.visibility
      AND c.payload::jsonb->'withdrawn'=to_jsonb(c.withdrawn)
      AND d.payload::jsonb->>'id'=d.id AND d.payload::jsonb->>'topicId'=d.topic_id AND t.payload::jsonb->>'id'=t.id
      AND (p_before_ordinal IS NULL OR e.root_ordinal<p_before_ordinal)
    ORDER BY e.root_ordinal DESC,e.root_id COLLATE "C" LIMIT p_limit;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'Invalid canonical semantic feed mirror' USING ERRCODE='P1224';
END $$;

REVOKE ALL ON canonical_v4.semantic_root_snapshots,canonical_v4.semantic_root_edges,canonical_v4.semantic_owner_policy FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.semantic_capture_root(),canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb),
  canonical_v4.semantic_read_owner_policy(),canonical_v4.semantic_read_feed(text,text,bigint,integer) FROM PUBLIC;
DO $$ DECLARE role_ text;BEGIN
  FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
      EXECUTE format('REVOKE ALL ON canonical_v4.semantic_root_snapshots,canonical_v4.semantic_root_edges,canonical_v4.semantic_owner_policy FROM %I',role_);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.semantic_capture_root(),canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb),canonical_v4.semantic_read_owner_policy(),canonical_v4.semantic_read_feed(text,text,bigint,integer) FROM %I',role_);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_read_owner_policy(),canonical_v4.semantic_read_feed(text,text,bigint,integer) TO murmingle_app;
  END IF;
END $$;
