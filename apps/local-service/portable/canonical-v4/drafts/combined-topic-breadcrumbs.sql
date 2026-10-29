-- Public display metadata only. Preserve the original bounded search and its
-- navigation identities; never classify a Source or infer an authored scope.
CREATE FUNCTION canonical_v4.combined_search_topics(p_generation text,p_terms text[],p_after jsonb,p_limit integer)
RETURNS TABLE(scope_kind text,scope_id text,caption text,path text[],human boolean,root_ordinal text,occupied boolean,breadcrumbs jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $breadcrumbs$
DECLARE row_ record;ids_ uuid[];named_path_ text[];fixed_path_ text[];fixed_ jsonb;topic_ jsonb;node_ text;
BEGIN
 FOR row_ IN SELECT * FROM canonical_v4.unified_search_topics(p_generation,p_terms,p_after,p_limit) LOOP
  fixed_:='[]'::jsonb;topic_:='[]'::jsonb;fixed_path_:=ARRAY[]::text[];
  IF row_.scope_kind='fixed' THEN
   fixed_path_:=row_.path;
  ELSE
   node_:=CASE row_.scope_kind WHEN 'named' THEN 'subject-' WHEN 'page' THEN 'page-' ELSE 'legacy-' END||row_.scope_id;
   topic_:=jsonb_build_array(jsonb_build_object('nodeId',node_,'label',row_.caption));
   IF row_.scope_kind='named' THEN
    ids_:=canonical_v4.named_current_subject_path(p_generation,row_.scope_id::uuid);
    SELECT coalesce(array_agg('subject-'||v::text ORDER BY n),ARRAY[]::text[]) INTO named_path_
     FROM unnest(ids_) WITH ORDINALITY a(v,n);
    -- A retired or not-yet-repaired public card keeps its own caption. Do not
    -- attach a new ancestry to a conversation merely from a stale card path.
    IF cardinality(ids_)>0 AND named_path_=row_.path THEN
     fixed_path_:=canonical_v4.combined_named_prefix(p_generation,row_.scope_id::uuid);
     SELECT jsonb_agg(jsonb_build_object('nodeId','subject-'||h.subject_id,
       'label',CASE WHEN h.subject_id::text=row_.scope_id THEN row_.caption ELSE h.label END) ORDER BY a.n)
      INTO topic_ FROM unnest(ids_) WITH ORDINALITY a(v,n)
      JOIN canonical_v4.named_subject_heads h ON h.subject_id=a.v AND h.generation=p_generation;
     IF jsonb_array_length(topic_) IS DISTINCT FROM cardinality(ids_) THEN
      RAISE EXCEPTION 'Invalid public topic ancestry' USING ERRCODE='P1304';
     END IF;
    END IF;
   END IF;
  END IF;
  IF cardinality(fixed_path_)>8 OR jsonb_array_length(topic_)>8 THEN
   RAISE EXCEPTION 'Public topic ancestry capacity' USING ERRCODE='P1304';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('nodeId',n.node_id,'label',canonical_v4.unified_public_label(n.node_id)) ORDER BY a.ord),'[]'::jsonb)
   INTO fixed_ FROM unnest(fixed_path_) WITH ORDINALITY a(id,ord)
   JOIN canonical_v4.semantic_nodes n ON n.node_id=a.id
   JOIN canonical_v4.semantic_installation i ON i.singleton AND i.matcher_hash=n.matcher_hash;
  IF jsonb_array_length(fixed_)<>cardinality(fixed_path_) THEN
   RAISE EXCEPTION 'Invalid public fixed ancestry' USING ERRCODE='P1304';
  END IF;
  scope_kind:=row_.scope_kind;scope_id:=row_.scope_id;caption:=row_.caption;path:=row_.path;
  human:=row_.human;root_ordinal:=row_.root_ordinal;occupied:=row_.occupied;
  breadcrumbs:=jsonb_build_object('fixed',fixed_,'topic',topic_);RETURN NEXT;
 END LOOP;
END $breadcrumbs$;
REVOKE ALL ON FUNCTION canonical_v4.combined_search_topics(text,text[],jsonb,integer) FROM PUBLIC;
DO $permissions$ DECLARE role_ text;BEGIN
 FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION canonical_v4.combined_search_topics(text,text[],jsonb,integer) FROM %I',role_);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
  GRANT EXECUTE ON FUNCTION canonical_v4.combined_search_topics(text,text[],jsonb,integer) TO murmingle_app;
 END IF;
END $permissions$;
