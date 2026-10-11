#!/bin/sh
set -eu
# Compose file-backed secret uid/mode is not portable. Root copies only the
# three DB secrets into a private tmpfs, then upstream drops to postgres.
mkdir -p /run/udl-db-secrets
chmod 0700 /run/udl-db-secrets
for name in admin_db_password owner_db_password app_db_password; do
  cp "/run/secrets/$name" "/run/udl-db-secrets/$name"
  chmod 0600 "/run/udl-db-secrets/$name"
  chown postgres:postgres "/run/udl-db-secrets/$name"
done
chown postgres:postgres /run/udl-db-secrets
export POSTGRES_PASSWORD_FILE=/run/udl-db-secrets/admin_db_password
exec /usr/local/bin/docker-entrypoint.sh "$@"
