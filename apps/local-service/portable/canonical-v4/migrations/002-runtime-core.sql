-- Runtime state is deliberately separate from canonical_v4.meta. The latter is
-- the immutable receipt for the one-time SQLite import and its logical digest.
CREATE TABLE canonical_v4.runtime_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  catalog_version bigint NOT NULL DEFAULT 0 CHECK (catalog_version >= 0),
  matching_version bigint NOT NULL DEFAULT 0 CHECK (matching_version >= 0)
);

ALTER TABLE canonical_v4.topics
  ADD COLUMN write_version bigint NOT NULL DEFAULT 0 CHECK (write_version >= 0);
ALTER TABLE canonical_v4.discussions
  ADD COLUMN write_version bigint NOT NULL DEFAULT 0 CHECK (write_version >= 0);
ALTER TABLE canonical_v4.sources
  ADD COLUMN write_version bigint NOT NULL DEFAULT 0 CHECK (write_version >= 0);
ALTER TABLE canonical_v4.contributions
  ADD COLUMN write_version bigint NOT NULL DEFAULT 0 CHECK (write_version >= 0);

-- Runtime ordinals are stable ordering witnesses, not dense array indexes.
-- PostgreSQL sequences can leave gaps after rollback; imported ordinals remain
-- byte-for-byte unchanged and the allocator always starts above their maximum.
CREATE SEQUENCE canonical_v4.contribution_ordinal_sequence
  AS bigint MINVALUE 0 START WITH 0;

CREATE TABLE canonical_v4.command_receipts (
  actor_id text COLLATE "C" NOT NULL,
  request_id text COLLATE "C" NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  command_type text NOT NULL CHECK (command_type IN ('create-root','reply')),
  discussion_id text,
  contribution_id text,
  response_text text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (actor_id, request_id),
  CHECK (
    (response_text IS NULL AND discussion_id IS NULL AND contribution_id IS NULL)
    OR
    (response_text IS NOT NULL AND discussion_id IS NOT NULL AND contribution_id IS NOT NULL)
  ),
  FOREIGN KEY (discussion_id) REFERENCES canonical_v4.discussions(id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (contribution_id) REFERENCES canonical_v4.contributions(id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX command_receipts_contribution
  ON canonical_v4.command_receipts(contribution_id)
  WHERE contribution_id IS NOT NULL;

-- Cross-discussion identifiers are rejected by storage as well as by the
-- application transaction. These constraints also make future delete/update
-- implementations wait on the exact ancestry protected by an append.
ALTER TABLE canonical_v4.contributions
  ADD CONSTRAINT contributions_id_discussion_unique UNIQUE (id, discussion_id);
ALTER TABLE canonical_v4.contributions
  ADD CONSTRAINT contributions_root_discussion_fk
    FOREIGN KEY (root_id, discussion_id)
    REFERENCES canonical_v4.contributions(id, discussion_id)
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE canonical_v4.contributions
  ADD CONSTRAINT contributions_reply_discussion_fk
    FOREIGN KEY (reply_to_id, discussion_id)
    REFERENCES canonical_v4.contributions(id, discussion_id)
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE canonical_v4.contributions
  ADD CONSTRAINT contributions_runtime_shape CHECK (
    (root_id IS NULL AND reply_to_id IS NULL)
    OR
    (root_id IS NOT NULL AND root_id <> id AND (reply_to_id IS NULL OR reply_to_id <> id))
  );

CREATE FUNCTION canonical_v4.reject_import_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $immutable_import_receipt$
BEGIN
  RAISE EXCEPTION 'Canonical import receipt is immutable' USING ERRCODE = '23514';
END
$immutable_import_receipt$;

CREATE TRIGGER meta_is_immutable
  BEFORE UPDATE OR DELETE ON canonical_v4.meta
  FOR EACH ROW EXECUTE FUNCTION canonical_v4.reject_import_receipt_mutation();
CREATE TRIGGER import_ledger_is_immutable
  BEFORE UPDATE OR DELETE ON canonical_v4.import_ledger
  FOR EACH ROW EXECUTE FUNCTION canonical_v4.reject_import_receipt_mutation();

-- The application role may lock authority rows without receiving UPDATE on
-- their semantic columns. PostgreSQL otherwise requires UPDATE privilege for
-- SELECT ... FOR SHARE. This fixed, non-dynamic SECURITY DEFINER helper reveals
-- only existence, while the repository still reads and validates every row.
CREATE FUNCTION canonical_v4.runtime_lock_row(
  lock_kind text,
  lock_id text,
  lock_related_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $runtime_lock_row$
DECLARE
  locked boolean := false;
BEGIN
  CASE lock_kind
    WHEN 'topic' THEN
      SELECT true INTO locked FROM canonical_v4.topics
        WHERE id=lock_id FOR SHARE;
    WHEN 'discussion' THEN
      SELECT true INTO locked FROM canonical_v4.discussions
        WHERE id=lock_id FOR NO KEY UPDATE;
    WHEN 'contribution' THEN
      SELECT true INTO locked FROM canonical_v4.contributions
        WHERE id=lock_id FOR SHARE;
    WHEN 'source' THEN
      SELECT true INTO locked FROM canonical_v4.sources
        WHERE id=lock_id FOR SHARE;
    WHEN 'source-link' THEN
      SELECT true INTO locked FROM canonical_v4.source_links
        WHERE source_id=lock_id FOR SHARE;
    WHEN 'embedding' THEN
      SELECT true INTO locked FROM canonical_v4.embeddings
        WHERE source_id=lock_id FOR SHARE;
    WHEN 'operation-receipt' THEN
      SELECT true INTO locked FROM canonical_v4.operation_receipts
        WHERE source_id=lock_id FOR SHARE;
    WHEN 'membership' THEN
      SELECT true INTO locked FROM canonical_v4.topic_memberships
        WHERE source_id=lock_id AND topic_id=lock_related_id FOR SHARE;
    ELSE
      RAISE EXCEPTION 'Invalid canonical runtime lock kind' USING ERRCODE = '22023';
  END CASE;
  RETURN COALESCE(locked,false);
END
$runtime_lock_row$;

-- Applying 002 after an already completed 001 import initializes the mutable
-- runtime header and allocator. Applying it before import leaves both empty;
-- the importer performs the same initialization after inserting its baseline.
INSERT INTO canonical_v4.runtime_state(singleton,generation,revision)
  SELECT true,generation,revision FROM canonical_v4.meta
  ON CONFLICT (singleton) DO NOTHING;
SELECT setval(
  'canonical_v4.contribution_ordinal_sequence',
  COALESCE((SELECT max(ordinal) + 1 FROM canonical_v4.contributions),0),
  false
);

REVOKE ALL ON TABLE canonical_v4.runtime_state FROM PUBLIC;
REVOKE ALL ON TABLE canonical_v4.command_receipts FROM PUBLIC;
REVOKE ALL ON SEQUENCE canonical_v4.contribution_ordinal_sequence FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.reject_import_receipt_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_v4.runtime_lock_row(text,text,text) FROM PUBLIC;

DO $runtime_permissions$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT SELECT ON canonical_v4.schema_migrations,canonical_v4.topics,
      canonical_v4.discussions,canonical_v4.sources,canonical_v4.source_links,
      canonical_v4.topic_memberships,canonical_v4.embeddings,
      canonical_v4.operation_receipts,canonical_v4.contributions,canonical_v4.runtime_state,
      canonical_v4.command_receipts
      TO murmingle_app;
    GRANT INSERT ON canonical_v4.id_registry,canonical_v4.contributions,
      canonical_v4.revisions,canonical_v4.command_receipts TO murmingle_app;
    GRANT UPDATE(write_version) ON canonical_v4.discussions TO murmingle_app;
    GRANT UPDATE(revision) ON canonical_v4.runtime_state TO murmingle_app;
    GRANT UPDATE(discussion_id,contribution_id,response_text)
      ON canonical_v4.command_receipts TO murmingle_app;
    GRANT USAGE,SELECT ON SEQUENCE canonical_v4.contribution_ordinal_sequence
      TO murmingle_app;
    GRANT EXECUTE ON FUNCTION canonical_v4.runtime_lock_row(text,text,text)
      TO murmingle_app;
  END IF;
END
$runtime_permissions$;
