CREATE TABLE canonical_v4.meta (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  target_format text NOT NULL CHECK (target_format = 'canonical-postgresql/v4-slice1'),
  source_format text NOT NULL CHECK (source_format = 'canonical-relational/v2'),
  state_schema text NOT NULL CHECK (state_schema = 'demo-state/v4'),
  generation text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  logical_sha256 text NOT NULL CHECK (logical_sha256 ~ '^[a-f0-9]{64}$'),
  counts_text text NOT NULL
);

CREATE TABLE canonical_v4.id_registry (
  id text COLLATE "C" PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('topics','discussions','sources','contributions'))
);

CREATE TABLE canonical_v4.topics (
  id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.id_registry(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal bigint NOT NULL UNIQUE CHECK (ordinal >= 0),
  payload text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  created_at text NOT NULL,
  provenance text,
  retain_tight boolean
);

CREATE TABLE canonical_v4.discussions (
  id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.id_registry(id) DEFERRABLE INITIALLY DEFERRED,
  topic_id text COLLATE "C" NOT NULL UNIQUE REFERENCES canonical_v4.topics(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal bigint NOT NULL UNIQUE CHECK (ordinal >= 0),
  payload text NOT NULL
);

CREATE TABLE canonical_v4.sources (
  id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.id_registry(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal bigint NOT NULL UNIQUE CHECK (ordinal >= 0),
  payload text NOT NULL,
  url text NOT NULL,
  title text NOT NULL,
  provenance text NOT NULL,
  extractor_version text,
  policy_version text,
  operation_id text COLLATE "C",
  has_embedding boolean NOT NULL
);
CREATE INDEX sources_url ON canonical_v4.sources(url);
CREATE INDEX sources_operation ON canonical_v4.sources(operation_id) WHERE operation_id IS NOT NULL;

CREATE TABLE canonical_v4.embeddings (
  source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  payload text NOT NULL,
  model_id text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0 AND dimensions <= 1536),
  values_double double precision[] NOT NULL CHECK (cardinality(values_double) = dimensions),
  vector_mirror vector
);
CREATE INDEX embeddings_model ON canonical_v4.embeddings(model_id, source_id);

CREATE TABLE canonical_v4.source_links (
  source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  topic_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.topics(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal bigint NOT NULL UNIQUE CHECK (ordinal >= 0),
  payload text NOT NULL,
  method text NOT NULL
);
CREATE INDEX source_links_topic ON canonical_v4.source_links(topic_id, source_id);

CREATE TABLE canonical_v4.topic_memberships (
  source_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  topic_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.topics(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (source_id, topic_id),
  UNIQUE (source_id, ordinal)
);
CREATE INDEX topic_memberships_topic ON canonical_v4.topic_memberships(topic_id, source_id);

CREATE TABLE canonical_v4.fixed_references (
  topic_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.topics(id) DEFERRABLE INITIALLY DEFERRED,
  payload text NOT NULL,
  source_id text COLLATE "C" REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  parameter_sha256 text,
  values_double double precision[],
  vector_mirror vector(384),
  CHECK (
    (source_id IS NULL AND parameter_sha256 IS NULL AND values_double IS NULL AND vector_mirror IS NULL)
    OR
    (source_id IS NOT NULL AND parameter_sha256 IS NOT NULL AND parameter_sha256 ~ '^[a-f0-9]{64}$'
      AND values_double IS NOT NULL AND cardinality(values_double) = 384)
  )
);
CREATE INDEX fixed_references_source ON canonical_v4.fixed_references(source_id) WHERE source_id IS NOT NULL;

CREATE TABLE canonical_v4.contributions (
  id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.id_registry(id) DEFERRABLE INITIALLY DEFERRED,
  discussion_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.discussions(id) DEFERRABLE INITIALLY DEFERRED,
  root_id text COLLATE "C" REFERENCES canonical_v4.contributions(id) DEFERRABLE INITIALLY DEFERRED,
  reply_to_id text COLLATE "C" REFERENCES canonical_v4.contributions(id) DEFERRABLE INITIALLY DEFERRED,
  author_id text COLLATE "C",
  operator_id text COLLATE "C",
  origin_source_id text COLLATE "C" REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  anchor_source_id text COLLATE "C" REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  actor_type text NOT NULL CHECK (actor_type IN ('human','agent')),
  visibility text NOT NULL,
  withdrawn boolean NOT NULL,
  created_at text NOT NULL,
  revision_count integer NOT NULL CHECK (revision_count >= 0),
  ordinal bigint NOT NULL UNIQUE CHECK (ordinal >= 0),
  payload text NOT NULL,
  CHECK ((withdrawn AND author_id IS NULL AND revision_count = 0) OR NOT withdrawn)
);
CREATE INDEX contributions_discussion ON canonical_v4.contributions(discussion_id, ordinal);
CREATE INDEX contributions_root ON canonical_v4.contributions(root_id, ordinal);
CREATE INDEX contributions_origin ON canonical_v4.contributions(origin_source_id, id);
CREATE INDEX contributions_anchor ON canonical_v4.contributions(anchor_source_id, id);
CREATE INDEX contributions_author ON canonical_v4.contributions(author_id, id);
CREATE INDEX contributions_operator ON canonical_v4.contributions(operator_id, id);

CREATE TABLE canonical_v4.revisions (
  contribution_id text COLLATE "C" NOT NULL REFERENCES canonical_v4.contributions(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  payload text NOT NULL,
  PRIMARY KEY (contribution_id, ordinal)
);

CREATE TABLE canonical_v4.operation_receipts (
  source_id text COLLATE "C" PRIMARY KEY REFERENCES canonical_v4.sources(id) DEFERRABLE INITIALLY DEFERRED,
  operation_id text COLLATE "C" NOT NULL,
  operation_digest text NOT NULL CHECK (operation_digest ~ '^[a-f0-9]{64}$')
);
CREATE INDEX operation_receipts_operation ON canonical_v4.operation_receipts(operation_id, source_id);

CREATE TABLE canonical_v4.import_ledger (
  import_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_format text NOT NULL,
  state_schema text NOT NULL,
  generation text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  logical_sha256 text NOT NULL UNIQUE CHECK (logical_sha256 ~ '^[a-f0-9]{64}$'),
  counts_text text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

DO $permissions$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='murmingle_app') THEN
    GRANT USAGE ON SCHEMA canonical_v4 TO murmingle_app;
    GRANT SELECT ON ALL TABLES IN SCHEMA canonical_v4 TO murmingle_app;
  END IF;
END $permissions$;
