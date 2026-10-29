-- Unregistered hierarchy18 background retrieval. Requires automatic named
-- subjects and installed pgvector0.8.2 in public. No live/startup installation.
-- Float32 HNSW is a candidate generator; protected float8 body/title values
-- are returned only to the trusted worker for exact bounded re-ranking.
CREATE TABLE canonical_v4.named_retrieval_inputs (
 source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 index_ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 source_ordinal bigint NOT NULL,
 generation text NOT NULL,
 matcher_hash text COLLATE "C" NOT NULL REFERENCES canonical_v4.semantic_matchers,
 representation_hash text COLLATE "C" NOT NULL,
 operation_digest text COLLATE "C" NOT NULL,
 body_wire_hash text COLLATE "C" NOT NULL,
 title_wire_hash text COLLATE "C" NOT NULL,
 mirror public.vector(384),
 exclusion text CHECK(exclusion IS NULL OR exclusion='zero-paired-norm'),
 title_terms text[] NOT NULL CHECK(cardinality(title_terms)<=8),
 completed_at timestamptz,
 CHECK((mirror IS NULL)=(exclusion IS NOT NULL))
);
CREATE INDEX named_retrieval_hnsw ON canonical_v4.named_retrieval_inputs USING hnsw(mirror public.vector_cosine_ops) WITH(m=16,ef_construction=64);
CREATE TABLE canonical_v4.named_retrieval_terms (
 term text COLLATE "C" NOT NULL,
 source_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.named_retrieval_inputs(source_id) ON DELETE CASCADE,
 source_ordinal bigint NOT NULL,
 PRIMARY KEY(term,source_id)
);
CREATE INDEX named_retrieval_term_recent ON canonical_v4.named_retrieval_terms(term,source_ordinal DESC,source_id);
CREATE TABLE canonical_v4.named_index_requests (
 source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 generation text NOT NULL,
 matcher_hash text COLLATE "C" NOT NULL,
 priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2)
);
CREATE INDEX named_index_requests_work ON canonical_v4.named_index_requests(generation,matcher_hash,ordinal);
CREATE INDEX named_index_requests_urgent ON canonical_v4.named_index_requests(generation,matcher_hash,priority DESC,ordinal DESC);
CREATE TABLE canonical_v4.named_discovery_requests (
 source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.named_retrieval_inputs(source_id) ON DELETE CASCADE,
 ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 generation text NOT NULL,
 matcher_hash text COLLATE "C" NOT NULL,
 priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2)
);
CREATE INDEX named_discovery_urgent ON canonical_v4.named_discovery_requests(generation,matcher_hash,priority DESC,ordinal DESC);
CREATE INDEX named_discovery_oldest ON canonical_v4.named_discovery_requests(generation,matcher_hash,ordinal);

-- One current protected preparation per Source. This internal view is never
-- granted to app/crawler roles. It is not a claim of original capture authority.
CREATE VIEW canonical_v4.named_indexable_sources AS
 SELECT s.id source_id,s.ordinal source_ordinal,s.write_version source_version,s.url,s.title,s.operation_id,
  r.operation_digest,st.stamp source_stamp,o.generation,i.matcher_hash,m.identity_text::jsonb->>'representationHash' representation_hash,
  i.body_wire_hash,i.title_wire_hash,i.body_values,i.title_values,i.supported_path
 FROM canonical_v4.sources s JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id
 JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
 JOIN canonical_v4.runtime_state runtime_ ON runtime_.singleton
 JOIN canonical_v4.semantic_installation install_ ON install_.singleton
 JOIN canonical_v4.semantic_observations o ON o.source_id=s.id AND o.source_version=s.write_version AND o.generation=runtime_.generation
  AND o.matcher_hash=install_.matcher_hash AND o.operation_id=s.operation_id AND o.operation_digest=r.operation_digest
 JOIN canonical_v4.semantic_inputs i ON i.source_id=s.id AND i.operation_digest=r.operation_digest AND i.matcher_hash=o.matcher_hash
 JOIN canonical_v4.semantic_matchers m ON m.matcher_hash=i.matcher_hash
 JOIN canonical_v4.embeddings e ON e.source_id=s.id AND e.model_id='e5-small-q8-browser-main-prefix-v1' AND e.dimensions=384
 WHERE s.provenance='owner-local-page-embedding/v1' AND s.has_embedding AND i.semantic_eligible
  AND s.payload::jsonb->>'operationDigest'=r.operation_digest
  AND s.payload::jsonb->>'title'=s.title AND s.payload::jsonb->>'url'=s.url
  AND i.body_wire_hash=encode(sha256(array_send(e.values_double)),'hex')
  AND i.title_wire_hash=encode(sha256(array_send(i.title_values)),'hex');

CREATE FUNCTION canonical_v4.named_enqueue_index(p_source text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $enqueue$
 INSERT INTO canonical_v4.named_index_requests(source_id,generation,matcher_hash,priority)
 SELECT i.source_id,i.generation,i.matcher_hash,1 FROM canonical_v4.named_indexable_sources i
 LEFT JOIN canonical_v4.named_retrieval_inputs done_ ON done_.source_id=i.source_id AND done_.generation=i.generation
  AND done_.matcher_hash=i.matcher_hash AND done_.operation_digest=i.operation_digest
  AND done_.body_wire_hash=i.body_wire_hash AND done_.title_wire_hash=i.title_wire_hash
 WHERE i.source_id=p_source AND done_.source_id IS NULL
 ON CONFLICT(source_id) DO UPDATE SET generation=excluded.generation,matcher_hash=excluded.matcher_hash,ordinal=DEFAULT,
  priority=greatest(named_index_requests.priority,excluded.priority)
$enqueue$;
CREATE FUNCTION canonical_v4.named_prepared_index_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $prepared$
BEGIN PERFORM canonical_v4.named_enqueue_index(NEW.source_id);RETURN NEW;END $prepared$;
CREATE TRIGGER named_prepared_index_request AFTER INSERT ON canonical_v4.semantic_observations
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_prepared_index_request();

CREATE FUNCTION canonical_v4.named_invalidate_retrieval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $invalidate$
DECLARE source_ text;
BEGIN
 source_:=to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='sources' THEN 'id' ELSE 'source_id' END;
 IF TG_OP='DELETE' THEN DELETE FROM canonical_v4.named_retrieval_inputs WHERE source_id=source_;RETURN OLD;END IF;
 IF TG_TABLE_NAME='sources' THEN
  IF (NEW.url,NEW.title,NEW.provenance,NEW.extractor_version,NEW.policy_version,NEW.has_embedding) IS NOT DISTINCT FROM
     (OLD.url,OLD.title,OLD.provenance,OLD.extractor_version,OLD.policy_version,OLD.has_embedding) AND
     NEW.payload::jsonb->>'operationDigest' IS NOT DISTINCT FROM OLD.payload::jsonb->>'operationDigest' THEN RETURN NEW;END IF;
 ELSIF TG_TABLE_NAME='operation_receipts' THEN
  IF NEW.operation_digest=OLD.operation_digest THEN RETURN NEW;END IF;
 ELSIF TG_TABLE_NAME='runtime_source_stamps' THEN
  IF (NEW.stamp,NEW.postable) IS NOT DISTINCT FROM (OLD.stamp,OLD.postable) THEN RETURN NEW;END IF;
 ELSIF TG_TABLE_NAME='embeddings' THEN
  IF (NEW.model_id,NEW.dimensions,array_send(NEW.values_double),NEW.payload) IS NOT DISTINCT FROM
    (OLD.model_id,OLD.dimensions,array_send(OLD.values_double),OLD.payload) THEN RETURN NEW;END IF;
 END IF;
 DELETE FROM canonical_v4.named_retrieval_inputs WHERE source_id=source_;
 -- Usually the new observation follows later in the same canonical operation.
 -- This also handles an eligibility restoration without a new observation row.
 PERFORM canonical_v4.named_enqueue_index(source_);RETURN NEW;
END $invalidate$;
CREATE TRIGGER named_retrieval_source AFTER UPDATE ON canonical_v4.sources FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();
CREATE TRIGGER named_retrieval_receipt AFTER UPDATE OR DELETE ON canonical_v4.operation_receipts FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();
CREATE TRIGGER named_retrieval_stamp AFTER UPDATE OR DELETE ON canonical_v4.runtime_source_stamps FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();
CREATE TRIGGER named_retrieval_embedding AFTER UPDATE OR DELETE ON canonical_v4.embeddings FOR EACH ROW EXECUTE FUNCTION canonical_v4.named_invalidate_retrieval();

-- One-time additive backfill of already prepared material, not a catalog scan
-- on page reads or on every worker tick. Later work is fed by Source triggers.
INSERT INTO canonical_v4.named_index_requests(source_id,generation,matcher_hash)
 SELECT source_id,generation,matcher_hash FROM canonical_v4.named_indexable_sources;

CREATE FUNCTION canonical_v4.named_index_tasks(p_generation text,p_matcher text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $tasks$
DECLARE result_ jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) OR
    NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_installation WHERE singleton AND matcher_hash=p_matcher) THEN
  RAISE EXCEPTION 'Named retrieval generation or matcher changed' USING ERRCODE='P1291';END IF;
 WITH urgent_ AS MATERIALIZED(SELECT * FROM canonical_v4.named_index_requests WHERE generation=p_generation AND matcher_hash=p_matcher ORDER BY priority DESC,ordinal DESC LIMIT 6),
 oldest_ AS MATERIALIZED(SELECT * FROM canonical_v4.named_index_requests WHERE generation=p_generation AND matcher_hash=p_matcher ORDER BY ordinal LIMIT 2),
 selected_ AS(SELECT DISTINCT ON(source_id) * FROM(SELECT * FROM urgent_ UNION ALL SELECT * FROM oldest_) all_)
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',q.source_id,'queueOrdinal',q.ordinal::text,
  'snapshot',CASE WHEN i.source_id IS NULL THEN NULL ELSE jsonb_build_object('sourceId',i.source_id,'sourceVersion',i.source_version::text,
   'operationId',i.operation_id,'operationDigest',i.operation_digest,'sourceStamp',i.source_stamp,'title',i.title) END) ORDER BY q.ordinal),'[]'::jsonb)
 INTO result_ FROM selected_ q
 LEFT JOIN canonical_v4.named_indexable_sources i ON i.source_id=q.source_id AND i.generation=q.generation AND i.matcher_hash=q.matcher_hash;
 RETURN result_;
END $tasks$;

CREATE FUNCTION canonical_v4.named_index_source(p_generation text,p_matcher text,p_source text,p_queue bigint,p_witness jsonb,p_terms jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $index$
DECLARE i record;weights_ jsonb;body_weight_ double precision;title_weight_ double precision;values_ double precision[];
 maximum_ double precision;norm_ double precision;mirror_ public.vector(384);terms_ text[];term_ text;index_ bigint;priority_ smallint;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_queue IS NULL OR p_queue<1 OR
    canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true OR jsonb_typeof(p_terms) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_terms)>8 OR octet_length(p_terms::text)>4096 THEN
  RAISE EXCEPTION 'Invalid named indexing task' USING ERRCODE='P1293';END IF;
 IF p_witness IS NULL OR p_witness='null'::jsonb THEN
  DELETE FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue AND generation=p_generation AND matcher_hash=p_matcher;
  RETURN 'obsolete';
 END IF;
 PERFORM 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Named indexing generation changed' USING ERRCODE='P1291';END IF;
 PERFORM 1 FROM canonical_v4.semantic_installation WHERE singleton AND matcher_hash=p_matcher FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Named indexing matcher changed' USING ERRCODE='P1291';END IF;
 -- Same receipt/Source/embedding/stamp order as stored preparation. The urgency
 -- row is locked LAST, never before a Source held by its enqueue trigger.
 PERFORM 1 FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 PERFORM 1 FROM canonical_v4.sources WHERE id=p_source FOR SHARE;
 PERFORM 1 FROM canonical_v4.embeddings WHERE source_id=p_source FOR SHARE;
 PERFORM 1 FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source FOR SHARE;
 SELECT priority INTO priority_ FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue AND generation=p_generation AND matcher_hash=p_matcher FOR UPDATE;
 IF NOT FOUND THEN RETURN 'retired';END IF;
 SELECT * INTO i FROM canonical_v4.named_indexable_sources WHERE source_id=p_source AND generation=p_generation AND matcher_hash=p_matcher;
 IF NOT FOUND OR p_witness IS DISTINCT FROM jsonb_build_object('sourceId',i.source_id,'sourceVersion',i.source_version::text,'operationId',i.operation_id,
     'operationDigest',i.operation_digest,'sourceStamp',i.source_stamp,'title',i.title) THEN
  RAISE EXCEPTION 'Named indexing Source changed' USING ERRCODE='P1291';END IF;
 IF EXISTS(SELECT 1 FROM canonical_v4.named_retrieval_inputs done_ WHERE done_.source_id=p_source AND done_.generation=p_generation AND done_.matcher_hash=p_matcher
   AND done_.operation_digest=i.operation_digest AND done_.body_wire_hash=i.body_wire_hash AND done_.title_wire_hash=i.title_wire_hash) THEN
  DELETE FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue;RETURN 'retired';
 END IF;
 SELECT identity_text::jsonb->'inputDefinition' INTO weights_ FROM canonical_v4.semantic_matchers WHERE matcher_hash=p_matcher;
 body_weight_:=(weights_->>'bodyWeight')::double precision;title_weight_:=(weights_->>'titleWeight')::double precision;
 IF body_weight_ IS NULL OR title_weight_ IS NULL OR body_weight_ NOT BETWEEN 0 AND 1 OR title_weight_ NOT BETWEEN 0 AND 1 OR body_weight_+title_weight_<>1 THEN
  RAISE EXCEPTION 'Invalid protected paired weights' USING ERRCODE='P1293';END IF;
 SELECT array_agg(body_weight_*i.body_values[n]+title_weight_*i.title_values[n] ORDER BY n) INTO values_ FROM generate_series(1,384) n;
 SELECT max(abs(value)) INTO maximum_ FROM unnest(values_) value;
 IF maximum_>0 THEN
  SELECT sqrt(sum((value/maximum_)*(value/maximum_))) INTO norm_ FROM unnest(values_) value;
  SELECT array_agg((value/maximum_)/norm_ ORDER BY n) INTO values_ FROM unnest(values_) WITH ORDINALITY q(value,n);
  mirror_:=values_::public.vector(384);
 END IF;
 SELECT coalesce(array_agg(value ORDER BY n),ARRAY[]::text[]) INTO terms_ FROM jsonb_array_elements_text(p_terms) WITH ORDINALITY q(value,n);
 IF (SELECT count(DISTINCT value) FROM unnest(terms_) value)<>cardinality(terms_) OR
    EXISTS(SELECT 1 FROM unnest(terms_) value WHERE length(value) NOT BETWEEN 1 AND 80 OR value ~ '[[:cntrl:][:space:]]') THEN
  RAISE EXCEPTION 'Invalid named retrieval terms' USING ERRCODE='P1293';END IF;
 DELETE FROM canonical_v4.named_retrieval_inputs WHERE source_id=p_source;
 INSERT INTO canonical_v4.named_retrieval_inputs(source_id,source_ordinal,generation,matcher_hash,representation_hash,operation_digest,body_wire_hash,title_wire_hash,mirror,exclusion,title_terms)
 VALUES(i.source_id,i.source_ordinal,i.generation,i.matcher_hash,i.representation_hash,i.operation_digest,i.body_wire_hash,i.title_wire_hash,mirror_,
  CASE WHEN mirror_ IS NULL THEN 'zero-paired-norm' ELSE NULL END,CASE WHEN mirror_ IS NULL THEN ARRAY[]::text[] ELSE terms_ END) RETURNING index_ordinal INTO index_;
 IF mirror_ IS NOT NULL THEN
  FOREACH term_ IN ARRAY terms_ LOOP INSERT INTO canonical_v4.named_retrieval_terms VALUES(term_,p_source,i.source_ordinal);END LOOP;
  INSERT INTO canonical_v4.named_discovery_requests(source_id,generation,matcher_hash,priority) VALUES(p_source,p_generation,p_matcher,priority_);
 END IF;
 DELETE FROM canonical_v4.named_index_requests WHERE source_id=p_source AND ordinal=p_queue;
 RETURN CASE WHEN mirror_ IS NULL THEN 'zero-paired-norm' ELSE 'indexed' END;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN
 RAISE EXCEPTION 'Invalid named index encoding' USING ERRCODE='P1293';
END $index$;

CREATE FUNCTION canonical_v4.named_discovery_tasks(p_generation text,p_matcher text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $work$
 WITH urgent_ AS MATERIALIZED(
  SELECT q.* FROM canonical_v4.named_discovery_requests q
  WHERE q.generation=p_generation AND q.matcher_hash=p_matcher ORDER BY q.priority DESC,q.ordinal DESC LIMIT 3
 ), oldest_ AS MATERIALIZED(
  SELECT q.* FROM canonical_v4.named_discovery_requests q
  WHERE q.generation=p_generation AND q.matcher_hash=p_matcher ORDER BY q.ordinal LIMIT 1
 ), selected_ AS(SELECT DISTINCT ON(source_id) * FROM(SELECT * FROM urgent_ UNION ALL SELECT * FROM oldest_) all_)
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',q.source_id,'indexOrdinal',i.index_ordinal::text) ORDER BY q.ordinal),'[]'::jsonb)
 FROM selected_ q JOIN canonical_v4.named_retrieval_inputs i USING(source_id)
$work$;

CREATE FUNCTION canonical_v4.named_neighbours(p_generation text,p_matcher text,p_source text,p_index bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
 SET hnsw.ef_search='128' SET hnsw.iterative_scan='off' AS $neighbours$
DECLARE seed_ canonical_v4.named_retrieval_inputs%ROWTYPE;result_ jsonb;
BEGIN
 SELECT * INTO seed_ FROM canonical_v4.named_retrieval_inputs WHERE source_id=p_source AND index_ordinal=p_index AND generation=p_generation AND matcher_hash=p_matcher;
 IF NOT FOUND OR seed_.mirror IS NULL OR NOT EXISTS(SELECT 1 FROM canonical_v4.named_indexable_sources WHERE source_id=p_source AND generation=p_generation AND matcher_hash=p_matcher
   AND operation_digest=seed_.operation_digest AND body_wire_hash=seed_.body_wire_hash AND title_wire_hash=seed_.title_wire_hash) THEN RETURN NULL;END IF;
 -- 95 approximate + at most8*4 indexed lexical postings + explicit seed =128.
 -- Do not add iterative refill, full-scan fallback or a global fit here.
 WITH approximate_ AS MATERIALIZED (
  SELECT source_id,false lexical FROM canonical_v4.named_retrieval_inputs WHERE mirror IS NOT NULL
   ORDER BY mirror OPERATOR(public.<=>) seed_.mirror LIMIT 95
 ), lexical_ AS MATERIALIZED (
  SELECT posting_.source_id,true lexical FROM unnest(seed_.title_terms) term_
   CROSS JOIN LATERAL(SELECT t.source_id FROM canonical_v4.named_retrieval_terms t WHERE t.term=term_
    ORDER BY t.source_ordinal DESC,t.source_id LIMIT 4) posting_
 ), candidates_ AS MATERIALIZED (
  SELECT source_id,bool_or(lexical) lexical FROM (
   SELECT * FROM approximate_ UNION ALL SELECT * FROM lexical_ UNION ALL SELECT p_source,false
  ) all_ GROUP BY source_id
 ), eligible_ AS (
  SELECT current_.*,c.lexical FROM candidates_ c JOIN canonical_v4.named_retrieval_inputs cached_ ON cached_.source_id=c.source_id
  JOIN canonical_v4.named_indexable_sources current_ ON current_.source_id=c.source_id AND current_.generation=p_generation AND current_.matcher_hash=p_matcher
   AND current_.operation_digest=cached_.operation_digest AND current_.body_wire_hash=cached_.body_wire_hash AND current_.title_wire_hash=cached_.title_wire_hash
  WHERE cached_.generation=p_generation AND cached_.representation_hash=seed_.representation_hash AND cached_.mirror IS NOT NULL
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'sourceVersion',source_version::text,'ordinal',source_ordinal::text,
  'operationId',operation_id,'operationDigest',operation_digest,'sourceStamp',source_stamp,'url',url,'title',title,
  'bodyWireHash',body_wire_hash,'titleWireHash',title_wire_hash,'bodyBase64',replace(encode(array_send(body_values),'base64'),chr(10),''),
  'titleBase64',replace(encode(array_send(title_values),'base64'),chr(10),''),'supportedPath',supported_path,'lexical',lexical) ORDER BY source_id),'[]'::jsonb)
 INTO result_ FROM eligible_;
 IF jsonb_array_length(result_)>128 OR octet_length(result_::text)>4194304 THEN RAISE EXCEPTION 'Named neighbour capacity' USING ERRCODE='P1293';END IF;
 RETURN result_;
END $neighbours$;

CREATE FUNCTION canonical_v4.named_complete_discovery(p_generation text,p_matcher text,p_source text,p_index bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $complete$
DECLARE removed_ integer;
BEGIN
 -- Cache before completion queue, matching Source invalidation/indexing. Taking
 -- the queue first could deadlock a concurrent material change deleting cache.
 PERFORM 1 FROM canonical_v4.named_retrieval_inputs WHERE source_id=p_source AND index_ordinal=p_index AND generation=p_generation AND matcher_hash=p_matcher FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 DELETE FROM canonical_v4.named_discovery_requests q USING canonical_v4.named_retrieval_inputs i
 WHERE q.source_id=p_source AND i.source_id=q.source_id AND i.index_ordinal=p_index AND i.generation=p_generation AND i.matcher_hash=p_matcher;
 GET DIAGNOSTICS removed_=ROW_COUNT;
 IF removed_=1 THEN UPDATE canonical_v4.named_retrieval_inputs SET completed_at=statement_timestamp() WHERE source_id=p_source AND index_ordinal=p_index;END IF;
 RETURN removed_=1;
END $complete$;

-- Best-effort urgency only, on a separate app call outside read transactions.
-- It never creates Source/canonical work. Contended rows are skipped and the
-- function-local5ms lock limit bounds insertion/FK contention. A completed seed
-- can be hinted again after30s; frequent context polls do not create a hot loop.
CREATE FUNCTION canonical_v4.named_request_priority(p_generation text,p_source text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5ms' AS $priority$
DECLARE changed_ integer;
BEGIN
 IF canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN RETURN false;END IF;
 WITH selected_ AS(SELECT source_id FROM canonical_v4.named_index_requests WHERE source_id=p_source AND generation=p_generation AND priority<2 FOR UPDATE SKIP LOCKED)
 UPDATE canonical_v4.named_index_requests q SET priority=2 FROM selected_ WHERE q.source_id=selected_.source_id;
 GET DIAGNOSTICS changed_=ROW_COUNT;IF changed_=1 THEN RETURN true;END IF;
 WITH selected_ AS(SELECT source_id FROM canonical_v4.named_discovery_requests WHERE source_id=p_source AND generation=p_generation AND priority<2 FOR UPDATE SKIP LOCKED)
 UPDATE canonical_v4.named_discovery_requests q SET priority=2 FROM selected_ WHERE q.source_id=selected_.source_id;
 GET DIAGNOSTICS changed_=ROW_COUNT;IF changed_=1 THEN RETURN true;END IF;
 INSERT INTO canonical_v4.named_discovery_requests(source_id,generation,matcher_hash,priority)
 SELECT i.source_id,i.generation,i.matcher_hash,2 FROM canonical_v4.named_retrieval_inputs i JOIN canonical_v4.semantic_installation h ON h.singleton AND h.matcher_hash=i.matcher_hash
 WHERE i.source_id=p_source AND i.generation=p_generation AND i.mirror IS NOT NULL AND i.completed_at<statement_timestamp()-interval '30 seconds'
 ON CONFLICT(source_id) DO NOTHING;
 GET DIAGNOSTICS changed_=ROW_COUNT;RETURN changed_=1;
EXCEPTION WHEN lock_not_available THEN RETURN false;
END $priority$;

REVOKE ALL ON TABLE canonical_v4.named_retrieval_inputs,canonical_v4.named_retrieval_terms,canonical_v4.named_index_requests,canonical_v4.named_discovery_requests,canonical_v4.named_indexable_sources FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.named_retrieval_inputs_index_ordinal_seq,canonical_v4.named_index_requests_ordinal_seq,canonical_v4.named_discovery_requests_ordinal_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.named_enqueue_index(text),canonical_v4.named_prepared_index_request(),canonical_v4.named_invalidate_retrieval(),
 canonical_v4.named_index_tasks(text,text),canonical_v4.named_index_source(text,text,text,bigint,jsonb,jsonb),canonical_v4.named_discovery_tasks(text,text),
 canonical_v4.named_neighbours(text,text,text,bigint),canonical_v4.named_complete_discovery(text,text,text,bigint),canonical_v4.named_request_priority(text,text) FROM PUBLIC;
DO $permissions$
DECLARE role_ text;
BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.named_retrieval_inputs,canonical_v4.named_retrieval_terms,canonical_v4.named_index_requests,canonical_v4.named_discovery_requests,canonical_v4.named_indexable_sources FROM %I',role_);
   EXECUTE format('REVOKE ALL ON SEQUENCE canonical_v4.named_retrieval_inputs_index_ordinal_seq,canonical_v4.named_index_requests_ordinal_seq,canonical_v4.named_discovery_requests_ordinal_seq FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.named_enqueue_index(text),canonical_v4.named_prepared_index_request(),canonical_v4.named_invalidate_retrieval(),canonical_v4.named_index_tasks(text,text),canonical_v4.named_index_source(text,text,text,bigint,jsonb,jsonb),canonical_v4.named_discovery_tasks(text,text),canonical_v4.named_neighbours(text,text,text,bigint),canonical_v4.named_complete_discovery(text,text,text,bigint),canonical_v4.named_request_priority(text,text) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.named_index_tasks(text,text),canonical_v4.named_index_source(text,text,text,bigint,jsonb,jsonb),
   canonical_v4.named_discovery_tasks(text,text),canonical_v4.named_neighbours(text,text,text,bigint),canonical_v4.named_complete_discovery(text,text,text,bigint) TO murmingle_ingest_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN GRANT EXECUTE ON FUNCTION canonical_v4.named_request_priority(text,text) TO murmingle_app;END IF;
END $permissions$;
