-- Unregistered hierarchy18 building block, owned fixtures only. Requires the
-- public subject registry draft. No provider IO, model, canonical route change,
-- contribution mutation or authority to create a human/AI contribution.
CREATE FUNCTION canonical_v4.subject_wikipedia_url(p_site text,p_title text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $subject_url$
DECLARE bytes_ bytea;result_ text:='';n_ integer;c_ integer;
BEGIN
 IF p_site NOT IN ('enwiki','dewiki','nlwiki') OR length(p_title) NOT BETWEEN 1 AND 200 OR
    btrim(p_title)<>p_title OR normalize(p_title,NFC)<>p_title OR p_title ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'Invalid public sitelink URL' USING ERRCODE='P1273';END IF;
 bytes_:=convert_to(replace(p_title,' ','_'),'UTF8');
 FOR n_ IN 0..length(bytes_)-1 LOOP
  c_:=get_byte(bytes_,n_);
  -- Same component spelling as ECMAScript encodeURIComponent, including the
  -- literal parentheses/apostrophe used in ordinary Wikipedia article URLs.
  IF c_ BETWEEN 48 AND 57 OR c_ BETWEEN 65 AND 90 OR c_ BETWEEN 97 AND 122 OR
      c_ IN (45,95,46,33,126,42,39,40,41) THEN result_:=result_||chr(c_);
  ELSE result_:=result_||'%'||upper(lpad(to_hex(c_),2,'0'));END IF;
 END LOOP;
 RETURN 'https://'||left(p_site,2)||'.wikipedia.org/wiki/'||result_;
END $subject_url$;
REVOKE ALL ON FUNCTION canonical_v4.subject_wikipedia_url(text,text) FROM PUBLIC;

-- Match title identity, not one URL spelling: encoded/unencoded path slashes,
-- percent hex case and underscores must not split the same Wikipedia article.
-- This is a closed Wikipedia parser, not a general URL/redirect canonicalizer.
CREATE FUNCTION canonical_v4.subject_wikipedia_url_key(p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $subject_url_key$
DECLARE parts_ text[];path_ text;bytes_ bytea:=''::bytea;title_ text;n_ integer:=1;c_ text;
BEGIN
 IF length(p_url)>2048 OR p_url ~ '[^!-~]' OR p_url ~ '["<>\\]' THEN RETURN NULL;END IF;
 parts_:=regexp_match(p_url,'^https://(en|de|nl)\.wikipedia\.org/wiki/([^?#]+)$');
 IF parts_ IS NULL THEN RETURN NULL;END IF;path_:=parts_[2];
 WHILE n_<=length(path_) LOOP
  c_:=substr(path_,n_,1);
  IF c_='%' THEN
   IF substr(path_,n_+1,2) !~ '^[0-9a-fA-F]{2}$' THEN RETURN NULL;END IF;
   bytes_:=bytes_||decode(substr(path_,n_+1,2),'hex');n_:=n_+3;
  ELSE bytes_:=bytes_||convert_to(c_,'UTF8');n_:=n_+1;END IF;
 END LOOP;
 title_:=normalize(replace(convert_from(bytes_,'UTF8'),'_',' '),NFC);
 IF length(title_) NOT BETWEEN 1 AND 200 OR btrim(title_)<>title_ OR title_ ~ '[[:cntrl:]]' OR
    title_ ~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]' OR title_ ~ '(^|/)[.]{1,2}(/|$)' THEN RETURN NULL;END IF;
 RETURN canonical_v4.subject_wikipedia_url(parts_[1]||'wiki',title_);
EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character OR invalid_text_representation THEN RETURN NULL;
END $subject_url_key$;
REVOKE ALL ON FUNCTION canonical_v4.subject_wikipedia_url_key(text) FROM PUBLIC;

ALTER TABLE canonical_v4.public_subject_sitelinks ADD COLUMN canonical_url text COLLATE "C"
 GENERATED ALWAYS AS (canonical_v4.subject_wikipedia_url(site,title)) STORED;
CREATE UNIQUE INDEX public_subject_sitelinks_url ON canonical_v4.public_subject_sitelinks(canonical_url);
CREATE INDEX public_subject_sources_wiki_url ON canonical_v4.sources(canonical_v4.subject_wikipedia_url_key(url))
 WHERE provenance='owner-local-page-embedding/v1' AND has_embedding AND canonical_v4.subject_wikipedia_url_key(url) IS NOT NULL;

-- PostgreSQL KEY SHARE protects generation as a key, while ordinary revision
-- updates remain NO KEY UPDATE and compatible. No global FOR UPDATE/SHARE lock
-- on the runtime row is added to this background operation.
CREATE UNIQUE INDEX public_subject_runtime_generation_key ON canonical_v4.runtime_state(generation);

CREATE TABLE canonical_v4.public_subject_source_bindings (
 source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) ON DELETE CASCADE,
 generation text NOT NULL,
 source_version bigint NOT NULL CHECK(source_version>=0),
 operation_id text COLLATE "C" NOT NULL,
 operation_digest text COLLATE "C" NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
 source_stamp text COLLATE "C" NOT NULL CHECK(source_stamp ~ '^[a-f0-9]{64}$'),
 subject_id uuid NOT NULL,
 subject_revision bigint NOT NULL,
 site text COLLATE "C" NOT NULL CHECK(site IN ('enwiki','dewiki','nlwiki')),
 title text COLLATE "C" NOT NULL,
 FOREIGN KEY(subject_id,subject_revision) REFERENCES canonical_v4.public_subject_versions(subject_id,revision)
);
CREATE INDEX public_subject_bindings_subject ON canonical_v4.public_subject_source_bindings(subject_id,source_id);

CREATE FUNCTION canonical_v4.subject_invalidate_source_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $subject_invalidate$
BEGIN
 DELETE FROM canonical_v4.public_subject_source_bindings WHERE source_id=
  (to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='sources' THEN 'id' ELSE 'source_id' END);
 RETURN NULL;
END $subject_invalidate$;
CREATE TRIGGER subject_source_changed AFTER UPDATE ON canonical_v4.sources
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.subject_invalidate_source_binding();
CREATE TRIGGER subject_receipt_changed AFTER UPDATE OR DELETE ON canonical_v4.operation_receipts
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.subject_invalidate_source_binding();
CREATE TRIGGER subject_stamp_changed AFTER UPDATE OR DELETE ON canonical_v4.runtime_source_stamps
 FOR EACH ROW EXECUTE FUNCTION canonical_v4.subject_invalidate_source_binding();

CREATE FUNCTION canonical_v4.subject_bind_source(p_generation text,p_source text,p_version bigint,p_operation text,p_digest text,p_stamp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $subject_bind$
DECLARE source_ canonical_v4.sources%ROWTYPE;receipt_ canonical_v4.operation_receipts%ROWTYPE;
 stamp_ canonical_v4.runtime_source_stamps%ROWTYPE;subject_ uuid;revision_ bigint;site_ text;title_ text;result_ jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR
    canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
    canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true OR
    canonical_v4.runtime_safe_text(p_operation,128,false) IS DISTINCT FROM true OR p_version IS NULL OR p_version<0 OR
    (p_digest ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (p_stamp ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid public Source binding' USING ERRCODE='P1273';END IF;
 PERFORM 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source generation changed' USING ERRCODE='P1271';END IF;
 -- Receipt -> Source -> stamp is the existing renewal/erasure lock order.
 SELECT * INTO receipt_ FROM canonical_v4.operation_receipts WHERE source_id=p_source FOR SHARE;
 SELECT * INTO source_ FROM canonical_v4.sources WHERE id=p_source FOR SHARE;
 IF source_.id IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='P1272';END IF;
 SELECT * INTO stamp_ FROM canonical_v4.runtime_source_stamps WHERE source_id=p_source FOR SHARE;
 IF source_.write_version IS DISTINCT FROM p_version OR source_.operation_id IS DISTINCT FROM p_operation OR
    receipt_.operation_id IS DISTINCT FROM p_operation OR receipt_.operation_digest IS DISTINCT FROM p_digest OR
    stamp_.stamp IS DISTINCT FROM p_stamp THEN
  RAISE EXCEPTION 'Source material changed' USING ERRCODE='P1271';END IF;
 IF source_.provenance IS DISTINCT FROM 'owner-local-page-embedding/v1' OR NOT source_.has_embedding OR
    source_.payload::jsonb->>'operationDigest' IS DISTINCT FROM p_digest THEN
  RAISE EXCEPTION 'Invalid protected Source mirrors' USING ERRCODE='P1274';END IF;
 PERFORM canonical_v4.ingest_source_response(p_source);
 result_:=jsonb_build_object('sourceId',p_source,'sourceVersion',p_version::text,'subjectId',NULL,'subjectRevision',NULL);
 IF stamp_.postable IS DISTINCT FROM true THEN
  DELETE FROM canonical_v4.public_subject_source_bindings WHERE source_id=p_source;
  RETURN result_||jsonb_build_object('status','ineligible');END IF;
 -- Only the actual stored URL can select an entity. No caller-supplied name,
 -- nearest vector, subject ID or path is accepted. Lock this entity's head;
 -- metadata imports never acquire Source rows, so they cannot invert that order.
 SELECT s.id,s.current_revision,l.site,l.title INTO subject_,revision_,site_,title_
  FROM canonical_v4.public_subject_sitelinks l JOIN canonical_v4.public_subjects s
   ON s.id=l.subject_id AND s.current_revision=l.revision
  WHERE l.canonical_url=canonical_v4.subject_wikipedia_url_key(source_.url) FOR SHARE OF s;
 IF NOT FOUND THEN
  DELETE FROM canonical_v4.public_subject_source_bindings WHERE source_id=p_source;
  RETURN result_||jsonb_build_object('status','unresolved');END IF;
 INSERT INTO canonical_v4.public_subject_source_bindings(source_id,generation,source_version,operation_id,operation_digest,source_stamp,
   subject_id,subject_revision,site,title)
  VALUES(p_source,p_generation,p_version,p_operation,p_digest,p_stamp,subject_,revision_,site_,title_)
  ON CONFLICT(source_id) DO UPDATE SET generation=excluded.generation,source_version=excluded.source_version,
   operation_id=excluded.operation_id,operation_digest=excluded.operation_digest,source_stamp=excluded.source_stamp,
   subject_id=excluded.subject_id,subject_revision=excluded.subject_revision,site=excluded.site,title=excluded.title
  WHERE (public_subject_source_bindings.generation,public_subject_source_bindings.source_version,
   public_subject_source_bindings.operation_id,public_subject_source_bindings.operation_digest,public_subject_source_bindings.source_stamp,
   public_subject_source_bindings.subject_id,public_subject_source_bindings.subject_revision,public_subject_source_bindings.site,public_subject_source_bindings.title)
   IS DISTINCT FROM (excluded.generation,excluded.source_version,excluded.operation_id,excluded.operation_digest,excluded.source_stamp,
    excluded.subject_id,excluded.subject_revision,excluded.site,excluded.title);
 RETURN result_||jsonb_build_object('status','bound','subjectId',subject_::text,'subjectRevision',revision_::text);
END $subject_bind$;

CREATE FUNCTION canonical_v4.subject_read_source(p_generation text,p_source text,p_language text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $subject_context$
DECLARE result_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
    canonical_v4.runtime_safe_text(p_source,128,false) IS DISTINCT FROM true OR p_language IS NULL OR p_language NOT IN ('en','de','nl') THEN
  RAISE EXCEPTION 'Invalid public Source context' USING ERRCODE='P1273';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Source generation changed' USING ERRCODE='P1271';END IF;
 SELECT jsonb_build_object('sourceId',s.id,'sourceVersion',s.write_version::text,
   'status',CASE WHEN s.provenance<>'owner-local-page-embedding/v1' OR NOT s.has_embedding OR st.postable IS DISTINCT FROM true THEN 'ineligible'
    WHEN b.source_id IS NOT NULL AND h.id IS NOT NULL AND l.subject_id IS NOT NULL THEN 'bound' ELSE 'pending' END,
   'subject',CASE WHEN b.source_id IS NOT NULL AND h.id IS NOT NULL AND l.subject_id IS NOT NULL
    THEN canonical_v4.subject_read_wikipedia(l.site,l.title,p_language) ELSE NULL END)
 INTO result_ FROM canonical_v4.sources s
 LEFT JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id
 LEFT JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
 LEFT JOIN canonical_v4.public_subject_source_bindings b ON b.source_id=s.id AND b.generation=p_generation
  AND b.source_version=s.write_version AND b.operation_id=r.operation_id AND b.operation_digest=r.operation_digest
  AND b.operation_digest=s.payload::jsonb->>'operationDigest' AND b.source_stamp=st.stamp
 LEFT JOIN canonical_v4.public_subjects h ON h.id=b.subject_id AND h.current_revision=b.subject_revision
 LEFT JOIN canonical_v4.public_subject_sitelinks l ON l.subject_id=h.id AND l.revision=h.current_revision AND l.canonical_url=canonical_v4.subject_wikipedia_url_key(s.url)
  AND l.site=b.site AND l.title=b.title
 WHERE s.id=p_source;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='P1272';END IF;
 RETURN result_;
END $subject_context$;

CREATE FUNCTION canonical_v4.subject_binding_candidates(p_generation text,p_after bigint,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $subject_candidates$
DECLARE result_ jsonb;
BEGIN
 IF canonical_v4.runtime_safe_text(p_generation,128,false) IS DISTINCT FROM true OR
    p_after<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'Invalid public Source candidate request' USING ERRCODE='P1273';END IF;
 IF NOT EXISTS(SELECT 1 FROM canonical_v4.runtime_state WHERE singleton AND generation=p_generation) THEN
  RAISE EXCEPTION 'Source generation changed' USING ERRCODE='P1271';END IF;
 SELECT coalesce(jsonb_agg(candidate ORDER BY ordinal),'[]'::jsonb) INTO result_ FROM (
  SELECT s.ordinal,jsonb_build_object('generation',p_generation,'sourceId',s.id,'sourceVersion',s.write_version::text,'ordinal',s.ordinal::text,
    'operationId',r.operation_id,'operationDigest',r.operation_digest,'sourceStamp',st.stamp) candidate
   FROM canonical_v4.sources s JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id
   JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
   JOIN canonical_v4.public_subject_sitelinks l ON l.canonical_url=canonical_v4.subject_wikipedia_url_key(s.url)
   JOIN canonical_v4.public_subjects h ON h.id=l.subject_id AND h.current_revision=l.revision
   WHERE s.provenance='owner-local-page-embedding/v1' AND s.has_embedding AND canonical_v4.subject_wikipedia_url_key(s.url) IS NOT NULL
    AND (p_after IS NULL OR s.ordinal>p_after)
    AND NOT EXISTS(SELECT 1 FROM canonical_v4.public_subject_source_bindings b WHERE b.source_id=s.id AND b.generation=p_generation
     AND b.source_version=s.write_version AND b.operation_id=r.operation_id AND b.operation_digest=r.operation_digest AND b.source_stamp=st.stamp
     AND b.subject_id=h.id AND b.subject_revision=h.current_revision)
   ORDER BY s.ordinal LIMIT p_limit
 ) bounded_;
 RETURN result_;
END $subject_candidates$;

REVOKE ALL ON TABLE canonical_v4.public_subject_source_bindings FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.subject_invalidate_source_binding(),canonical_v4.subject_bind_source(text,text,bigint,text,text,text),
 canonical_v4.subject_read_source(text,text,text),canonical_v4.subject_binding_candidates(text,bigint,integer) FROM PUBLIC;
DO $subject_binding_permissions$
DECLARE role_ text;
BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.public_subject_source_bindings FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.subject_wikipedia_url(text,text),canonical_v4.subject_wikipedia_url_key(text),canonical_v4.subject_invalidate_source_binding(),canonical_v4.subject_bind_source(text,text,bigint,text,text,text),canonical_v4.subject_read_source(text,text,text),canonical_v4.subject_binding_candidates(text,bigint,integer) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_ingest_worker') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.subject_bind_source(text,text,bigint,text,text,text),canonical_v4.subject_binding_candidates(text,bigint,integer) TO murmingle_ingest_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.subject_read_source(text,text,text) TO murmingle_app;
 END IF;
END $subject_binding_permissions$;
