#!/bin/sh
set -eu
# The official entrypoint executes this only for a fresh private volume.
# Read secrets server-side; no password is embedded in arguments or SQL text.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
SET log_statement = 'none';
SET log_error_verbosity = 'terse';
DO $roles$
BEGIN
  EXECUTE format('CREATE ROLE udl_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', trim(pg_read_file('/run/udl-db-secrets/owner_db_password')));
  EXECUTE format('CREATE ROLE udl_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', trim(pg_read_file('/run/udl-db-secrets/app_db_password')));
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO udl_owner, udl_app', current_database());
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Synthetic role provisioning failed';
END
$roles$;
CREATE EXTENSION IF NOT EXISTS vector;
ALTER SCHEMA public OWNER TO udl_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO udl_app;
-- Migration grants only the specific table operations required by the runtime.
SQL
