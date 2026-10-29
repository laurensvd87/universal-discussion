-- Pre-activation schema18 component. Aggregate metadata only; no vector/text
-- payload, canonical change, foreground model work or shared writer counter.
CREATE FUNCTION canonical_v4.named_schedule_assignment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $schedule$
DECLARE old_ uuid;new_ uuid;id_ uuid;generation_ text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_:=OLD.subject_id;END IF;
 IF TG_OP<>'DELETE' THEN new_:=NEW.subject_id;END IF;
 IF TG_OP='UPDATE' AND old_ IS NOT DISTINCT FROM new_ THEN RETURN NULL;END IF;
 FOR id_ IN SELECT DISTINCT id FROM unnest(ARRAY[old_,new_]) id WHERE id IS NOT NULL ORDER BY id LOOP
  SELECT h.generation INTO generation_ FROM canonical_v4.named_subject_heads h WHERE h.subject_id=id_;
  -- A scope event has no head FK, counter row or child-tree fanout. Do not add
  -- a new lock dependency to a Source/selection writer just to refresh counts.
  IF FOUND THEN INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id)
   VALUES(generation_,'scope','named',id_::text);END IF;
 END LOOP;
 RETURN NULL;
END $schedule$;
CREATE TRIGGER named_schedule_assignment AFTER INSERT OR UPDATE OR DELETE ON canonical_v4.named_subject_selections
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_assignment_change();

CREATE FUNCTION canonical_v4.named_read_dashboard_counts(p_generation text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $counts$
DECLARE matcher_ text;result_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid dashboard generation' USING ERRCODE='P1293';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state r WHERE r.singleton AND r.generation=p_generation) THEN
  RAISE EXCEPTION 'Dashboard generation changed' USING ERRCODE='P1291';END IF;
 SELECT i.matcher_hash INTO matcher_ FROM canonical_v4.semantic_installation i WHERE i.singleton;
 WITH RECURSIVE heads AS MATERIALIZED(
  SELECT h.subject_id,h.parent_id,h.label FROM canonical_v4.named_subject_heads h
  JOIN canonical_v4.named_subject_ids i ON i.id=h.subject_id AND i.revision=h.revision
  WHERE h.generation=p_generation AND h.matcher_hash=matcher_
 ),walk AS(
  SELECT h.subject_id AS origin,h.subject_id,h.parent_id,ARRAY[h.subject_id] AS path FROM heads h
  UNION ALL SELECT w.origin,h.subject_id,h.parent_id,array_append(w.path,h.subject_id)
   FROM walk w JOIN heads h ON h.subject_id=w.parent_id
   WHERE cardinality(w.path)<8 AND NOT h.subject_id=ANY(w.path)
 ),complete AS MATERIALIZED(SELECT w.origin,w.path FROM walk w WHERE w.parent_id IS NULL),
 direct AS MATERIALIZED(
  SELECT selection_.subject_id,count(*) AS sources
  FROM canonical_v4.named_subject_selections selection_
  JOIN complete path_ ON path_.origin=selection_.subject_id
  JOIN canonical_v4.named_subject_members m ON m.subject_id=selection_.subject_id AND m.source_id=selection_.source_id
  JOIN canonical_v4.sources s ON s.id=m.source_id AND s.write_version=m.source_version AND s.operation_id=m.operation_id
  JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id AND r.operation_digest=m.operation_digest
  JOIN canonical_v4.runtime_source_stamps stamp_ ON stamp_.source_id=s.id AND stamp_.stamp=m.source_stamp AND stamp_.postable
  WHERE s.provenance='owner-local-page-embedding/v1' AND s.has_embedding
   AND EXISTS(SELECT 1 FROM canonical_v4.source_links l JOIN canonical_v4.topics t ON t.id=l.topic_id
    JOIN canonical_v4.discussions d ON d.topic_id=t.id WHERE l.source_id=s.id)
  GROUP BY selection_.subject_id
 ),rollup AS MATERIALIZED(
  SELECT id_,sum(d.sources) AS sources FROM direct d JOIN complete p ON p.origin=d.subject_id
  CROSS JOIN LATERAL unnest(p.path) id_ GROUP BY id_
 ),rows_ AS(
  SELECT h.subject_id,h.parent_id,h.label,p.path,coalesce(d.sources,0) AS direct_sources,coalesce(r.sources,0) AS sources
   FROM heads h JOIN complete p ON p.origin=h.subject_id
   LEFT JOIN direct d ON d.subject_id=h.subject_id LEFT JOIN rollup r ON r.id_=h.subject_id
 ),shown AS(
  SELECT * FROM rows_ ORDER BY sources DESC,label COLLATE "C",subject_id LIMIT 200
 ) SELECT jsonb_build_object('schema','automatic-topic-assignment-counts/v1','generation',p_generation,
  'matcherIdentityHash',matcher_,'activeSubjects',(SELECT count(*) FROM rows_),
  'occupiedSubjects',(SELECT count(*) FROM rows_ WHERE sources>0),'matchedSources',(SELECT coalesce(sum(sources),0) FROM direct),
  'truncated',(SELECT count(*)>200 FROM rows_),'topics',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id','subject-'||s.subject_id,'parentId',CASE WHEN s.parent_id IS NULL THEN NULL ELSE 'subject-'||s.parent_id END,
   'title',s.label,'directSources',s.direct_sources,'sources',s.sources,
   'path',(SELECT jsonb_agg(jsonb_build_object('id','subject-'||p.id,'title',h.label) ORDER BY p.n DESC)
    FROM unnest(s.path) WITH ORDINALITY p(id,n) JOIN heads h ON h.subject_id=p.id)
  ) ORDER BY s.sources DESC,s.label COLLATE "C",s.subject_id) FROM shown s),'[]'::jsonb)) INTO result_;
 RETURN result_;
END $counts$;
REVOKE ALL ON FUNCTION canonical_v4.named_schedule_assignment_change(),canonical_v4.named_read_dashboard_counts(text) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_schedule_assignment_change(),canonical_v4.named_read_dashboard_counts(text) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_read_dashboard_counts(text) TO murmingle_app;
 END IF;
END $permissions$;
