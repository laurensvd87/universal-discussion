-- Unregistered hierarchy18 building block. Install ONLY in a separately owned
-- fixture until the complete profile, roles, Source/erasure/context and UI join
-- are ready. No Source/embedding/route/contribution DML or provider requests.
-- Provider IDs identify public entities; these UUIDs are aggregation identities,
-- not replacements for canonical topics/discussions or posting authorization.
CREATE TABLE canonical_v4.public_subjects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_key text COLLATE "C" NOT NULL UNIQUE CHECK(provider_key ~ '^Q[1-9][0-9]{0,10}$'),
 current_revision bigint NOT NULL CHECK(current_revision>0)
);
CREATE TABLE canonical_v4.public_subject_versions (
 subject_id uuid NOT NULL REFERENCES canonical_v4.public_subjects(id),
 revision bigint NOT NULL CHECK(revision>0),
 record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
 first_response_hash text COLLATE "C" NOT NULL CHECK(first_response_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(subject_id,revision)
);
ALTER TABLE canonical_v4.public_subjects ADD CONSTRAINT public_subject_current_version
 FOREIGN KEY(id,current_revision) REFERENCES canonical_v4.public_subject_versions(subject_id,revision)
 DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE canonical_v4.public_subject_sitelinks (
 site text COLLATE "C" NOT NULL CHECK(site IN ('enwiki','dewiki','nlwiki')),
 title text COLLATE "C" NOT NULL,
 subject_id uuid NOT NULL,
 revision bigint NOT NULL,
 PRIMARY KEY(site,title),
 FOREIGN KEY(subject_id,revision) REFERENCES canonical_v4.public_subject_versions(subject_id,revision)
);
CREATE INDEX public_subject_sitelinks_subject ON canonical_v4.public_subject_sitelinks(subject_id);

CREATE FUNCTION canonical_v4.subject_import_wikipedia(p_response_hash text,p_records jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $subject_import$
DECLARE r jsonb;entry_ jsonb;key_ text;revision_ bigint;subject_ uuid;current_ bigint;
 old_ jsonb;result_ jsonb:='[]'::jsonb;seen_ text[]:=ARRAY[]::text[];names_ text[];lock_ integer;
BEGIN
 IF p_response_hash IS NULL OR p_response_hash !~ '^[a-f0-9]{64}$' OR
    jsonb_typeof(p_records) IS DISTINCT FROM 'array' OR
    octet_length(p_records::text)>1048576 THEN
  RAISE EXCEPTION 'Invalid public subject import' USING ERRCODE='P1263';END IF;
 IF jsonb_array_length(p_records) NOT BETWEEN 1 AND 64 THEN
  RAISE EXCEPTION 'Invalid public subject capacity' USING ERRCODE='P1263';END IF;
 -- All lock numbers are acquired in one global order. This serializes overlapping writes
 -- without row locks or advisory locks on ordinary reads. Hash collisions only
 -- add conservative serialization; they cannot merge identities.
 FOR key_ IN SELECT value->>'providerKey' FROM jsonb_array_elements(p_records) LOOP
  IF key_ IS NULL OR key_ !~ '^Q[1-9][0-9]{0,10}$' OR key_=ANY(seen_) THEN
   RAISE EXCEPTION 'Invalid public subject identity' USING ERRCODE='P1263';END IF;
  seen_:=array_append(seen_,key_);
 END LOOP;
 FOR lock_ IN SELECT DISTINCT hashtext(k) FROM unnest(seen_) k ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(914092018,lock_);
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_records) ORDER BY value->>'providerKey' COLLATE "C" LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid public subject record' USING ERRCODE='P1263';END IF;
  SELECT array_agg(key ORDER BY key COLLATE "C") INTO names_ FROM jsonb_object_keys(r) key;
  IF names_ IS DISTINCT FROM ARRAY['descriptions','labels','providerKey','revision','sitelinks']::text[] OR
     jsonb_typeof(r->'providerKey') IS DISTINCT FROM 'string' OR
     jsonb_typeof(r->'revision') IS DISTINCT FROM 'string' OR
     (r->>'revision') !~ '^[1-9][0-9]{0,15}$' OR
     jsonb_typeof(r->'labels') IS DISTINCT FROM 'object' OR
     jsonb_typeof(r->'descriptions') IS DISTINCT FROM 'object' OR
     jsonb_typeof(r->'sitelinks') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Invalid public subject fields' USING ERRCODE='P1263';END IF;
  key_:=r->>'providerKey';revision_:=(r->>'revision')::bigint;
  IF revision_>9007199254740991 OR jsonb_array_length(r->'sitelinks')>3 OR
     EXISTS(SELECT 1 FROM jsonb_each(r->'labels') WHERE key NOT IN ('en','de','nl','mul') OR
       jsonb_typeof(value)<>'string' OR length(value#>>'{}') NOT BETWEEN 1 AND 200 OR
       btrim(value#>>'{}')<>(value#>>'{}') OR (value#>>'{}') ~ '[[:cntrl:]]' OR
       (value#>>'{}') ~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]') OR
     EXISTS(SELECT 1 FROM jsonb_each(r->'descriptions') WHERE key NOT IN ('en','de','nl') OR
       jsonb_typeof(value)<>'string' OR length(value#>>'{}') NOT BETWEEN 1 AND 400 OR
       btrim(value#>>'{}')<>(value#>>'{}') OR (value#>>'{}') ~ '[[:cntrl:]]' OR
       (value#>>'{}') ~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]') THEN
   RAISE EXCEPTION 'Invalid public subject text' USING ERRCODE='P1263';END IF;
  seen_:=ARRAY[]::text[];
  FOR entry_ IN SELECT value FROM jsonb_array_elements(r->'sitelinks') LOOP
   IF jsonb_typeof(entry_) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid public subject sitelink' USING ERRCODE='P1263';END IF;
   SELECT array_agg(key ORDER BY key COLLATE "C") INTO names_ FROM jsonb_object_keys(entry_) key;
   IF names_ IS DISTINCT FROM ARRAY['site','title']::text[] OR
      jsonb_typeof(entry_->'site') IS DISTINCT FROM 'string' OR
      (entry_->>'site') NOT IN ('enwiki','dewiki','nlwiki') OR (entry_->>'site')=ANY(seen_) OR
      jsonb_typeof(entry_->'title') IS DISTINCT FROM 'string' OR
      length(entry_->>'title') NOT BETWEEN 1 AND 200 OR btrim(entry_->>'title')<>(entry_->>'title') OR
      (entry_->>'title') ~ '[[:cntrl:]]' OR (entry_->>'title') ~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]' OR
      normalize(entry_->>'title',NFC)<>(entry_->>'title') THEN
    RAISE EXCEPTION 'Invalid public subject sitelink fields' USING ERRCODE='P1263';END IF;
   seen_:=array_append(seen_,entry_->>'site');
  END LOOP;
  -- Array order is not provider meaning. Canonicalize links before comparing
  -- same-revision imports across differently ordered batch responses.
  SELECT jsonb_set(r,'{sitelinks}',coalesce(jsonb_agg(value ORDER BY value->>'site' COLLATE "C"),'[]'::jsonb)) INTO r
   FROM jsonb_array_elements(r->'sitelinks');
  SELECT id,current_revision INTO subject_,current_ FROM canonical_v4.public_subjects WHERE provider_key=key_;
  IF FOUND THEN
   IF revision_<current_ THEN RAISE EXCEPTION 'Stale public subject revision' USING ERRCODE='P1261';END IF;
   SELECT record INTO old_ FROM canonical_v4.public_subject_versions WHERE subject_id=subject_ AND revision=revision_;
   IF FOUND AND old_ IS DISTINCT FROM r THEN
    RAISE EXCEPTION 'Conflicting public subject revision' USING ERRCODE='P1261';END IF;
   IF revision_=current_ THEN
    result_:=result_||jsonb_build_array(jsonb_build_object('providerKey',key_,'revision',revision_::text,'subjectId',subject_::text));
    CONTINUE;
   END IF;
  ELSE
   INSERT INTO canonical_v4.public_subjects(provider_key,current_revision) VALUES(key_,revision_) RETURNING id INTO subject_;
  END IF;
  INSERT INTO canonical_v4.public_subject_versions(subject_id,revision,record,first_response_hash)
   VALUES(subject_,revision_,r,p_response_hash) ON CONFLICT(subject_id,revision) DO NOTHING;
  DELETE FROM canonical_v4.public_subject_sitelinks WHERE subject_id=subject_;
  FOR entry_ IN SELECT value FROM jsonb_array_elements(r->'sitelinks') LOOP
   -- A title already owned by a different entity is an explicit conflict. Do
   -- not silently steal it or merge discussions when the provider rearranges it.
   INSERT INTO canonical_v4.public_subject_sitelinks(site,title,subject_id,revision)
    VALUES(entry_->>'site',entry_->>'title',subject_,revision_);
  END LOOP;
  UPDATE canonical_v4.public_subjects SET current_revision=revision_ WHERE id=subject_;
  result_:=result_||jsonb_build_array(jsonb_build_object('providerKey',key_,'revision',revision_::text,'subjectId',subject_::text));
 END LOOP;
 RETURN result_;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'Conflicting public subject sitelink' USING ERRCODE='P1261';
END $subject_import$;

CREATE FUNCTION canonical_v4.subject_read_wikipedia(p_site text,p_title text,p_language text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $subject_read$
DECLARE r jsonb;subject_ uuid;key_ text;revision_ bigint;label_ text;description_ text;language_ text;description_language_ text;
BEGIN
 IF p_site IS NULL OR p_site NOT IN ('enwiki','dewiki','nlwiki') OR p_language IS NULL OR p_language NOT IN ('en','de','nl') OR
    p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 200 OR btrim(p_title)<>p_title OR
    p_title ~ '[[:cntrl:]]' OR normalize(p_title,NFC)<>p_title THEN
  RAISE EXCEPTION 'Invalid public subject read' USING ERRCODE='P1263';END IF;
 SELECT v.record,s.id,s.provider_key,s.current_revision INTO r,subject_,key_,revision_
  FROM canonical_v4.public_subject_sitelinks l JOIN canonical_v4.public_subjects s ON s.id=l.subject_id AND s.current_revision=l.revision
  JOIN canonical_v4.public_subject_versions v ON v.subject_id=s.id AND v.revision=s.current_revision
  WHERE l.site=p_site AND l.title=p_title;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT l INTO language_ FROM unnest(ARRAY[p_language,'mul','en',left(p_site,2)]) WITH ORDINALITY a(l,n)
  WHERE r->'labels' ? l ORDER BY n LIMIT 1;
 SELECT l INTO description_language_ FROM unnest(ARRAY[p_language,'en',left(p_site,2)]) WITH ORDINALITY a(l,n)
  WHERE r->'descriptions' ? l ORDER BY n LIMIT 1;
 label_:=coalesce(r->'labels'->>language_,p_title);description_:=r->'descriptions'->>description_language_;
 RETURN jsonb_build_object('subjectId',subject_::text,'providerKey',key_,'revision',revision_::text,'articleTitle',p_title,
  'label',label_,'labelLanguage',language_,'description',description_,'descriptionLanguage',description_language_);
END $subject_read$;

REVOKE ALL ON TABLE canonical_v4.public_subjects,canonical_v4.public_subject_versions,canonical_v4.public_subject_sitelinks FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.subject_import_wikipedia(text,jsonb),canonical_v4.subject_read_wikipedia(text,text,text) FROM PUBLIC;
DO $subject_permissions$
DECLARE role_ text;
BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON TABLE canonical_v4.public_subjects,canonical_v4.public_subject_versions,canonical_v4.public_subject_sitelinks FROM %I',role_);
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.subject_import_wikipedia(text,jsonb),canonical_v4.subject_read_wikipedia(text,text,text) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.subject_read_wikipedia(text,text,text) TO murmingle_app;
 END IF;
END $subject_permissions$;
