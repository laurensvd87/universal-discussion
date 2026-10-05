// Synthetic-only schema exercise. This is not a production migration.
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE schema_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL CHECK (version = 1)
) STRICT;
INSERT INTO schema_meta VALUES (1, 1);

CREATE TABLE sources (
  source_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_order INTEGER NOT NULL UNIQUE
) STRICT;
CREATE INDEX sources_order_idx ON sources(created_order, source_id);

CREATE TABLE vectors (
  source_id TEXT PRIMARY KEY REFERENCES sources(source_id) ON DELETE CASCADE,
  model_stamp TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions > 0),
  vector_json TEXT NOT NULL CHECK (json_valid(vector_json) AND json_type(vector_json) = 'array' AND json_array_length(vector_json) = dimensions),
  updated_order INTEGER NOT NULL
) STRICT;

-- A scored pair is a candidate relationship, never a transitive Topic merge.
CREATE TABLE scored_edges (
  source_a TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  source_b TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  scorer_stamp TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('vector', 'lexical', 'combined')),
  PRIMARY KEY (source_a, source_b),
  CHECK (source_a < source_b)
) STRICT;
CREATE INDEX edges_from_a_idx ON scored_edges(source_a, score DESC, source_b);
CREATE INDEX edges_from_b_idx ON scored_edges(source_b, score DESC, source_a);

-- Discussion identity is independent of edge scores and ordering.
CREATE TABLE discussions (
  discussion_id TEXT PRIMARY KEY,
  anchor_source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE RESTRICT,
  focus_label TEXT NOT NULL,
  created_order INTEGER NOT NULL UNIQUE
) STRICT;
CREATE TABLE contributions (
  contribution_id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL REFERENCES discussions(discussion_id) ON DELETE RESTRICT,
  parent_id TEXT REFERENCES contributions(contribution_id) ON DELETE RESTRICT,
  root_id TEXT REFERENCES contributions(contribution_id) ON DELETE RESTRICT,
  origin_source_id TEXT REFERENCES sources(source_id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_order INTEGER NOT NULL UNIQUE,
  CHECK (parent_id IS NULL AND root_id IS NULL OR parent_id IS NOT NULL AND root_id IS NOT NULL)
) STRICT;
CREATE INDEX contributions_discussion_idx ON contributions(discussion_id, created_order);
CREATE INDEX contributions_root_idx ON contributions(root_id, created_order);

CREATE TRIGGER contributions_parent_guard BEFORE INSERT ON contributions
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'parent/root mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM contributions p
    WHERE p.contribution_id = NEW.parent_id
      AND p.discussion_id = NEW.discussion_id
      AND COALESCE(p.root_id, p.contribution_id) = NEW.root_id
  );
END;

CREATE TRIGGER discussion_identity_immutable BEFORE UPDATE OF discussion_id, anchor_source_id, created_order ON discussions
BEGIN SELECT RAISE(ABORT, 'discussion identity immutable'); END;
CREATE TRIGGER contribution_identity_immutable BEFORE UPDATE OF contribution_id, discussion_id, parent_id, root_id, origin_source_id, created_order ON contributions
BEGIN SELECT RAISE(ABORT, 'contribution identity immutable'); END;
`;
