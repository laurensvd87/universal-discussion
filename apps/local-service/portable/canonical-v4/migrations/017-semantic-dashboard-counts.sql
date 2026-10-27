-- Aggregate protected metadata only. No material re-attestation, posting proof,
-- native capture, inference or quality claim. No vector/body export or DML.
CREATE FUNCTION canonical_v4.semantic_read_dashboard_counts(p_generation text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $semantic_dashboard_counts$
DECLARE head_ text;generation_ text;counts_ jsonb;paths_ jsonb;invalid_ bigint;result_ jsonb;
BEGIN
  IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Invalid semantic dashboard generation' USING ERRCODE='P1253';END IF;
  SELECT generation INTO generation_ FROM canonical_v4.runtime_state WHERE singleton;
  IF generation_ IS DISTINCT FROM p_generation THEN
    RAISE EXCEPTION 'Semantic dashboard generation changed' USING ERRCODE='P1251';END IF;
  SELECT matcher_hash INTO head_ FROM canonical_v4.semantic_installation WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing semantic installation' USING ERRCODE='P1254';END IF;
  WITH learned AS MATERIALIZED (
    SELECT id,write_version,operation_id
      FROM canonical_v4.sources WHERE provenance='owner-local-page-embedding/v1'
  ), states AS MATERIALIZED (
    SELECT s.id,o.source_id observed,o.generation,o.operation_id observed_operation,o.operation_digest,
      s.operation_id source_operation,r.operation_id receipt_operation,r.operation_digest receipt_digest,
      i.source_id input_source,i.semantic_eligible,i.supported_path,
      -- Any retained paired input for this alive canonical learned Source,
      -- including earlier models/versions and inputs without a retained observation.
      EXISTS(SELECT 1 FROM canonical_v4.semantic_inputs prepared WHERE prepared.source_id=s.id) prepared
    FROM learned s LEFT JOIN canonical_v4.semantic_observations o
      ON o.source_id=s.id AND o.source_version=s.write_version AND o.matcher_hash=head_
    LEFT JOIN canonical_v4.semantic_inputs i ON i.source_id=o.source_id
      AND i.operation_digest=o.operation_digest AND i.matcher_hash=o.matcher_hash
    LEFT JOIN canonical_v4.operation_receipts r ON r.source_id=s.id
  ), histogram AS (
    SELECT supported_path,count(*) sources FROM states
      WHERE observed IS NOT NULL AND semantic_eligible AND cardinality(supported_path)>0 GROUP BY supported_path
  ) SELECT jsonb_build_object(
      'learnedSources',count(*),'preparedSources',count(*) FILTER(WHERE prepared),
      'currentHeadClassifiedSources',count(*) FILTER(WHERE observed IS NOT NULL AND semantic_eligible AND cardinality(supported_path)>0),
      'currentHeadAbstainedSources',count(*) FILTER(WHERE observed IS NOT NULL AND semantic_eligible AND cardinality(supported_path)=0),
      'currentHeadExcludedSources',count(*) FILTER(WHERE observed IS NOT NULL AND NOT semantic_eligible),
      'currentHeadPendingSources',count(*) FILTER(WHERE observed IS NULL)),
    count(*) FILTER(WHERE observed IS NOT NULL AND (
      generation IS DISTINCT FROM p_generation OR input_source IS NULL OR semantic_eligible IS NULL OR supported_path IS NULL OR
      observed_operation IS DISTINCT FROM source_operation OR receipt_operation IS DISTINCT FROM source_operation OR
      receipt_digest IS DISTINCT FROM operation_digest OR
      cardinality(supported_path)>8 OR (NOT semantic_eligible AND cardinality(supported_path)<>0) OR
      (cardinality(supported_path)>0 AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_nodes n
        WHERE n.matcher_hash=head_ AND n.node_id=supported_path[cardinality(supported_path)] AND n.path=supported_path)))),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('path',supported_path,'sources',sources) ORDER BY supported_path COLLATE "C"),'[]'::jsonb)
      FROM (SELECT * FROM histogram ORDER BY supported_path COLLATE "C" LIMIT 513) bounded)
    INTO counts_,invalid_,paths_ FROM states;
  IF invalid_<>0 OR jsonb_array_length(paths_)>512 THEN
    RAISE EXCEPTION 'Invalid semantic dashboard observation metadata' USING ERRCODE='P1254';END IF;
  -- Same historical visibility/destination predicates as011 semantic_read_feed.
  -- An edge is active because it still exists, not because its model is CURRENT.
  counts_:=counts_||jsonb_build_object('distinctRoots',(
    SELECT count(DISTINCT s.root_id) FROM canonical_v4.semantic_root_snapshots s
    JOIN canonical_v4.contributions c ON c.id=s.root_id
    JOIN canonical_v4.discussions d ON d.id=s.discussion_id AND d.topic_id=s.topic_id
    JOIN canonical_v4.topics t ON t.id=s.topic_id
    JOIN canonical_v4.runtime_state r ON r.singleton AND r.generation=s.generation
    WHERE s.generation=p_generation AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'
      AND c.discussion_id=s.discussion_id AND c.ordinal=s.root_ordinal
      AND c.payload::jsonb->>'id'=c.id AND c.payload::jsonb->>'discussionId'=c.discussion_id
      AND c.payload::jsonb->'rootId'='null'::jsonb AND c.payload::jsonb->>'visibility'=c.visibility
      AND c.payload::jsonb->'withdrawn'=to_jsonb(c.withdrawn)
      AND d.payload::jsonb->>'id'=d.id AND d.payload::jsonb->>'topicId'=d.topic_id AND t.payload::jsonb->>'id'=t.id
      AND EXISTS(SELECT 1 FROM canonical_v4.semantic_root_edges e WHERE e.root_id=s.root_id AND e.root_ordinal=s.root_ordinal)));
  IF EXISTS(SELECT 1 FROM jsonb_each(counts_) e WHERE (e.value#>>'{}')::numeric>9007199254740991) THEN
    RAISE EXCEPTION 'Semantic dashboard counter capacity' USING ERRCODE='P1254';END IF;
  result_:=jsonb_build_object('generation',generation_,'matcherIdentityHash',head_,'counts',counts_,'paths',paths_);
  IF octet_length(result_::text)>524288 THEN RAISE EXCEPTION 'Semantic dashboard metadata capacity' USING ERRCODE='P1254';END IF;
  RETURN result_;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Invalid semantic dashboard metadata encoding' USING ERRCODE='P1254';
END $semantic_dashboard_counts$;

REVOKE ALL ON FUNCTION canonical_v4.semantic_read_dashboard_counts(text) FROM PUBLIC;
DO $semantic_dashboard_permissions$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
    REVOKE ALL ON FUNCTION canonical_v4.semantic_read_dashboard_counts(text) FROM murmingle_ingest_worker;END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_crawler_submitter') THEN
    REVOKE ALL ON FUNCTION canonical_v4.semantic_read_dashboard_counts(text) FROM murmingle_crawler_submitter;END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_adapter') THEN
    REVOKE ALL ON FUNCTION canonical_v4.semantic_read_dashboard_counts(text) FROM murmingle_adapter;END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT EXECUTE ON FUNCTION canonical_v4.semantic_read_dashboard_counts(text) TO murmingle_app;END IF;
END $semantic_dashboard_permissions$;
