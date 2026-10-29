-- Unregistered hierarchy18 public-read additions. No startup installation,
-- canonical destination rewrite, provider, model or new foreground mutex.
CREATE TABLE canonical_v4.named_feed_clock (
 singleton boolean PRIMARY KEY CHECK(singleton),revision bigint NOT NULL CHECK(revision>=0)
);
INSERT INTO canonical_v4.named_feed_clock VALUES(true,0);

-- Preferred editor scope can change without a canonical revision. Each change
-- appends its own opaque event, never updating a worker-owned clock row.
ALTER TABLE canonical_v4.named_feed_events DROP CONSTRAINT named_feed_events_kind_check;
ALTER TABLE canonical_v4.named_feed_events ADD CONSTRAINT named_feed_events_kind_check CHECK(kind IN ('root','scope','subject','context'));
CREATE FUNCTION canonical_v4.named_schedule_context_read()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $context$
DECLARE source_ text;generation_ text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.subject_id=OLD.subject_id THEN RETURN NEW;END IF;
 source_:=CASE WHEN TG_OP='DELETE' THEN OLD.source_id ELSE NEW.source_id END;
 SELECT generation INTO STRICT generation_ FROM canonical_v4.runtime_state WHERE singleton;
 INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id) VALUES(generation_,'context','page',source_);
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $context$;
CREATE TRIGGER named_schedule_context_read AFTER INSERT OR UPDATE OR DELETE ON canonical_v4.named_subject_selections
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_schedule_context_read();

-- Preserve the reviewed core byte-for-byte. Only this worker wrapper advances
-- the coalescing signature. Taking the clock first with SKIP LOCKED avoids a
-- worker waiting for a clock while holding a context/head needed by a writer.
ALTER FUNCTION canonical_v4.named_process_feed_event(text,bigint) RENAME TO named_process_feed_core;
CREATE FUNCTION canonical_v4.named_process_feed_event(p_generation text,p_event bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $process$
DECLARE outcome_ text;
BEGIN
 IF p_event IS NULL OR p_event<1 OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 PERFORM 1 FROM canonical_v4.named_feed_clock WHERE singleton FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RAISE EXCEPTION 'Feed clock busy' USING ERRCODE='P1301';END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.named_feed_events WHERE event_id=p_event AND generation=p_generation AND kind='context') THEN
  -- Independent event deletion cannot acknowledge later concurrent changes.
  DELETE FROM canonical_v4.named_feed_events WHERE event_id=p_event AND generation=p_generation AND kind='context';
  outcome_:='completed';
 ELSE outcome_:=canonical_v4.named_process_feed_core(p_generation,p_event);END IF;
 UPDATE canonical_v4.named_feed_clock SET revision=revision+1 WHERE singleton;
 RETURN outcome_;
END $process$;

CREATE FUNCTION canonical_v4.named_read_revision()
RETURNS TABLE(generation text,revision text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $revision$
 SELECT legacy.generation,encode(sha256(convert_to(jsonb_build_array(legacy.revision,c.revision,
  (SELECT max(event_id) FROM canonical_v4.named_feed_events WHERE generation=legacy.generation))::text,'UTF8')),'hex')
 FROM canonical_v4.semantic_read_revision() legacy CROSS JOIN canonical_v4.named_feed_clock c WHERE c.singleton;
$revision$;

-- One bounded read for a public root page. Explicit author titles survive Source
-- withdrawal; absent contexts remain absent, including every legacy root.
CREATE FUNCTION canonical_v4.named_read_root_contexts(p_generation text,p_roots text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $roots$
BEGIN
 IF p_roots IS NULL OR cardinality(p_roots)>100 OR cardinality(p_roots)>0 AND
    (array_ndims(p_roots)<>1 OR array_lower(p_roots,1)<>1) OR EXISTS(SELECT 1 FROM unnest(p_roots) id WHERE canonical_v4.runtime_safe_text(id,128,false) IS DISTINCT FROM true) OR
    cardinality(p_roots)<>(SELECT count(DISTINCT id) FROM unnest(p_roots) id) THEN
  RAISE EXCEPTION 'Invalid root context page' USING ERRCODE='P1303';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Feed generation changed' USING ERRCODE='P1301';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('rootId',ctx.root_id,'scope',jsonb_build_object('kind',ctx.scope_kind,'id',ctx.scope_id,'caption',ctx.caption)) ORDER BY ctx.root_id)
  FROM canonical_v4.named_root_contexts ctx JOIN canonical_v4.contributions c ON c.id=ctx.root_id
  WHERE ctx.generation=p_generation AND ctx.root_id=ANY(p_roots) AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public'),'[]'::jsonb);
END $roots$;

REVOKE ALL ON TABLE canonical_v4.named_feed_clock FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_schedule_context_read(),canonical_v4.named_process_feed_core(text,bigint),canonical_v4.named_process_feed_event(text,bigint),
 canonical_v4.named_read_revision(),canonical_v4.named_read_root_contexts(text,text[]) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_feed_clock FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_schedule_context_read(),canonical_v4.named_process_feed_core(text,bigint),canonical_v4.named_process_feed_event(text,bigint),canonical_v4.named_read_revision(),canonical_v4.named_read_root_contexts(text,text[]) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_read_revision(),canonical_v4.named_read_root_contexts(text,text[]) TO murmingle_app;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_process_feed_event(text,bigint) TO murmingle_ingest_worker;END IF;
END $permissions$;
