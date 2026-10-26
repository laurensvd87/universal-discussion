-- Isolated additive boundary. Applied001-009 source bytes remain unchanged.
CREATE SCHEMA hierarchy_scoped_legacy_v1;
CREATE FUNCTION hierarchy_scoped_ingestion_v1.scoped_forget(
  p_generation text,p_source_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_forget_source$
DECLARE
  source canonical_v4.sources%ROWTYPE;
  runtime canonical_v4.runtime_state%ROWTYPE;
  source_ids text[] := ARRAY[p_source_id];
BEGIN
  IF NOT canonical_v4.runtime_safe_text(p_source_id,128,false) THEN
    RAISE EXCEPTION 'Invalid learned Source forget request' USING ERRCODE = 'P1203';
  END IF;
  PERFORM hierarchy_scoped_ingestion_v1.enter_gate(false);
  PERFORM 1 FROM canonical_v4.operation_receipts
    WHERE source_id=p_source_id FOR UPDATE;
  SELECT * INTO source FROM canonical_v4.sources
    WHERE id=p_source_id FOR UPDATE;
  IF NOT FOUND OR source.provenance<>'owner-local-page-embedding/v1' THEN
    RAISE EXCEPTION 'Learned Source unavailable' USING ERRCODE = 'P1206';
  END IF;
  PERFORM hierarchy_scoped_ingestion_v1.retire_jobs(ARRAY[p_source_id],NULL,false,ARRAY[]::text[]);
  PERFORM 1 FROM canonical_v4.source_links WHERE source_id=p_source_id FOR UPDATE;
  PERFORM 1 FROM canonical_v4.discussions AS discussion
    WHERE discussion.id IN (
      SELECT contribution.discussion_id FROM canonical_v4.contributions AS contribution
      WHERE contribution.origin_source_id=p_source_id OR contribution.anchor_source_id=p_source_id
    ) ORDER BY discussion.id COLLATE "C" FOR NO KEY UPDATE;
  PERFORM 1 FROM canonical_v4.topics AS topic
    WHERE topic.id IN (
      SELECT reference.topic_id FROM canonical_v4.fixed_references AS reference
      WHERE reference.source_id=p_source_id
      UNION
      SELECT discussion.topic_id FROM canonical_v4.discussions AS discussion
      JOIN canonical_v4.contributions AS contribution ON contribution.discussion_id=discussion.id
      WHERE contribution.origin_source_id=p_source_id OR contribution.anchor_source_id=p_source_id
    ) ORDER BY topic.id COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM canonical_v4.contributions AS contribution
    WHERE contribution.origin_source_id=p_source_id OR contribution.anchor_source_id=p_source_id
    ORDER BY contribution.id COLLATE "C" FOR UPDATE;
  PERFORM canonical_v4.ingest_forget_sources_internal(source_ids);
  UPDATE canonical_v4.runtime_state SET revision=revision+1,
    catalog_version=catalog_version+1,matching_version=matching_version+1,
    source_absence_revision=revision+1
    WHERE singleton=true AND generation=p_generation
    RETURNING * INTO runtime;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State generation changed' USING ERRCODE = 'P1201';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'version',pg_catalog.jsonb_build_object('generation',runtime.generation,'revision',runtime.revision),
    'result',pg_catalog.jsonb_build_object('sourceId',p_source_id)
  )::text;
END
$ingest_forget_source$;


DO $wrappers$
DECLARE sig text; oid_ oid; def text; name_ text; args text; result_ text; calls text; body_ text; role_ text;
BEGIN
 FOREACH sig IN ARRAY ARRAY[
 'runtime_append_command(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
 'runtime_lifecycle_command(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text)',
 'runtime_withdraw_account_contributions(text)',
 'ingest_enqueue_interactive(text,text,text,text,bigint,text,integer)',
 'ingest_enqueue_crawler(text,text,text,text,bigint,text,integer)',
 'ingest_renew_authority(text,text,text,integer)',
 'ingest_revoke_authority(text,text,text)',
 'ingest_claim(text,text,integer)',
 'ingest_renew_lease(text,text,text,integer)',
 'ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean)',
 'ingest_fail_claim(text,text,text,text)',
 'ingest_correct_source(text,text,text,text,text,text)',
 'ingest_forget_source(text,text)',
 'ingest_delete_learned_topic(text,text,text)',
 'ingest_clear_learned_data(text,text)',
 -- Private split helpers are gated too, without serving grants.
 'runtime_prepare_command(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
 'runtime_complete_command(text,text,text,text,text,bigint)'
 ] LOOP
  oid_:=pg_catalog.to_regprocedure('canonical_v4.'||sig);
  IF oid_ IS NULL THEN RAISE EXCEPTION 'Exact legacy signature missing: %',sig;END IF;
  SELECT p.proname,pg_catalog.pg_get_functiondef(p.oid),pg_catalog.pg_get_function_arguments(p.oid),
   pg_catalog.pg_get_function_result(p.oid),
   (SELECT pg_catalog.string_agg('$'||n,',' ORDER BY n) FROM pg_catalog.generate_series(1,p.pronargs) n)
   INTO name_,def,args,result_,calls FROM pg_catalog.pg_proc p WHERE p.oid=oid_;
  -- The original body is copied byte-for-byte apart from its qualified header.
  EXECUTE pg_catalog.replace(def,'FUNCTION canonical_v4.'||name_||'(','FUNCTION hierarchy_scoped_legacy_v1.'||name_||'(');
  body_:='BEGIN PERFORM hierarchy_scoped_ingestion_v1.enter_gate('||
    CASE WHEN name_ IN('ingest_delete_learned_topic','ingest_clear_learned_data') THEN 'true' ELSE 'false' END||'); ';
  IF name_='ingest_forget_source' THEN
   body_:=body_||'IF EXISTS(SELECT 1 FROM hierarchy_scoped_ingestion_v1.containers WHERE source_id=$2) THEN RETURN hierarchy_scoped_ingestion_v1.scoped_forget($1,$2);END IF; ';
  ELSIF name_='runtime_withdraw_account_contributions' THEN
   body_:=body_||'IF (canonical_v4.runtime_safe_text($1,128,false) AND $1 ~ ''^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'') IS DISTINCT FROM true THEN RAISE EXCEPTION ''Actor unavailable'' USING ERRCODE=''P1006'';END IF; '||
    'PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,914092006)); '||
    'PERFORM 1 FROM canonical_v4.command_receipts WHERE actor_id=$1 ORDER BY request_id COLLATE "C" FOR UPDATE; '||
    'PERFORM hierarchy_scoped_ingestion_v1.retire_jobs(ARRAY[]::text[],$1,false,ARRAY[]::text[]); ';
  ELSIF name_='ingest_delete_learned_topic' THEN
   body_:=body_||'PERFORM hierarchy_scoped_ingestion_v1.retire_jobs(ARRAY[]::text[],NULL,false,ARRAY[$2]); ';
  ELSIF name_='ingest_clear_learned_data' THEN
   body_:=body_||'PERFORM hierarchy_scoped_ingestion_v1.retire_jobs(ARRAY[]::text[],NULL,true,ARRAY[]::text[]); ';
  END IF;
  body_:=body_||CASE WHEN result_ LIKE 'TABLE(%' THEN 'RETURN QUERY SELECT * FROM ' ELSE 'RETURN ' END||
    'hierarchy_scoped_legacy_v1.'||name_||'('||calls||'); END';
  EXECUTE pg_catalog.format('CREATE OR REPLACE FUNCTION canonical_v4.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS %L',name_,args,result_,body_);
  -- Canonical wrappers retain their original explicit execute grants. Copies
  -- are private even when an original serving role existed before installation.
  EXECUTE 'REVOKE ALL ON FUNCTION hierarchy_scoped_legacy_v1.'||sig||' FROM PUBLIC';
  FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'] LOOP
   IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION hierarchy_scoped_legacy_v1.'||sig||' FROM '||pg_catalog.quote_ident(role_);
   END IF;
  END LOOP;
 END LOOP;
END $wrappers$;
REVOKE ALL ON SCHEMA hierarchy_scoped_legacy_v1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hierarchy_scoped_ingestion_v1 FROM PUBLIC;
