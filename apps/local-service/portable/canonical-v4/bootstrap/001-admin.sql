CREATE EXTENSION IF NOT EXISTS vector;

DO $canonical_v4_bootstrap$
DECLARE
  existing_owner text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'murmingle_owner') THEN
    RAISE EXCEPTION 'Canonical v4 owner role is unavailable';
  END IF;
  SELECT pg_get_userbyid(nspowner) INTO existing_owner
    FROM pg_namespace WHERE nspname = 'canonical_v4';
  IF existing_owner IS NULL THEN
    EXECUTE 'CREATE SCHEMA canonical_v4 AUTHORIZATION murmingle_owner';
  ELSIF existing_owner <> 'murmingle_owner' THEN
    RAISE EXCEPTION 'Canonical v4 schema owner mismatch';
  END IF;
  REVOKE ALL ON SCHEMA canonical_v4 FROM PUBLIC;
END
$canonical_v4_bootstrap$;
