-- Preserve the exhaustive binary64 radius decision while removing repeated
-- candidate/reference validation and duplicate dot products from each row.
-- Existing public predicate/similarity functions and all admission/apply
-- boundaries remain unchanged. This migration rewrites no canonical records.
CREATE OR REPLACE FUNCTION canonical_v4.ingest_ridge_scan(
  candidate double precision[], p_parameter_sha256 text
)
RETURNS TABLE(topic_id text, similarity double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $ingest_ridge_scan$
DECLARE
  stored record;
  reference_values double precision[];
  axis integer;
  dot_value double precision;
BEGIN
  IF p_parameter_sha256 IS DISTINCT FROM
      '593a52ba9a5495a49ef00f4dae38770684389632f961b60ec07067fd8784b3e4'
      OR NOT canonical_v4.ingest_valid_unit_vector(candidate) THEN
    RAISE EXCEPTION 'Invalid Ridge scan request' USING ERRCODE = 'P1203';
  END IF;
  FOR stored IN
    SELECT reference.topic_id,reference.parameter_sha256,reference.values_double
    FROM canonical_v4.fixed_references AS reference
    WHERE reference.source_id IS NOT NULL
    ORDER BY reference.topic_id COLLATE "C"
  LOOP
    reference_values := stored.values_double;
    IF stored.parameter_sha256 IS DISTINCT FROM p_parameter_sha256
        OR NOT canonical_v4.ingest_valid_unit_vector(reference_values) THEN
      RAISE EXCEPTION 'Invalid stored Ridge reference' USING ERRCODE = 'P1204';
    END IF;
    dot_value := 0;
    FOR axis IN 1..384 LOOP
      -- Same sequential multiply/add order as ingest_ridge_similarity. Never
      -- substitute float32 vector operators or an aggregate/reordered sum.
      dot_value := dot_value + candidate[axis]*reference_values[axis];
    END LOOP;
    IF dot_value::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Invalid Ridge similarity' USING ERRCODE = 'P1203';
    END IF;
    dot_value := greatest(-1.0,least(1.0,dot_value));
    IF dot_value >= 0.8639003810829322::double precision THEN
      topic_id := stored.topic_id;
      similarity := dot_value;
      -- PL/pgSQL accumulates this function's result until it completes. A bad
      -- later reference aborts the entire statement; no partial scan escapes.
      RETURN NEXT;
    END IF;
  END LOOP;
END
$ingest_ridge_scan$;

-- CREATE OR REPLACE preserves the existing owner and role-specific grants.
-- Reassert the existing PUBLIC prohibition without expanding any role scope.
REVOKE ALL ON FUNCTION canonical_v4.ingest_ridge_scan(double precision[],text) FROM PUBLIC;
