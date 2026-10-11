CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE principals (
  id text PRIMARY KEY, username text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64)
);
CREATE TABLE topics (id text PRIMARY KEY, title text NOT NULL, public boolean NOT NULL DEFAULT false);
CREATE TABLE discussions (
  id text PRIMARY KEY, topic_id text NOT NULL REFERENCES topics(id),
  version integer NOT NULL DEFAULT 0 CHECK(version >= 0), public boolean NOT NULL DEFAULT false,
  UNIQUE(id, topic_id)
);
CREATE TABLE sources (
  id text PRIMARY KEY, url text NOT NULL UNIQUE, title text NOT NULL,
  topic_id text NOT NULL REFERENCES topics(id), discussion_id text NOT NULL,
  embedding vector(384) NOT NULL, model text NOT NULL, extractor text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  FOREIGN KEY(discussion_id, topic_id) REFERENCES discussions(id, topic_id),
  UNIQUE(id, topic_id), UNIQUE(id, discussion_id)
);
CREATE TABLE contributions (
  id text PRIMARY KEY, discussion_id text NOT NULL REFERENCES discussions(id),
  source_id text NOT NULL REFERENCES sources(id),
  author_id text NOT NULL REFERENCES principals(id),
  parent_id text, root_id text NOT NULL,
  body text, withdrawn boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL,
  CHECK ((withdrawn AND body IS NULL) OR (NOT withdrawn AND body IS NOT NULL)),
  CHECK ((parent_id IS NULL AND root_id=id) OR (parent_id IS NOT NULL AND parent_id<>id AND root_id<>id)),
  UNIQUE(id, discussion_id),
  FOREIGN KEY(parent_id, discussion_id) REFERENCES contributions(id, discussion_id),
  FOREIGN KEY(root_id, discussion_id) REFERENCES contributions(id, discussion_id),
  FOREIGN KEY(source_id, discussion_id) REFERENCES sources(id, discussion_id)
);
CREATE INDEX contributions_discussion_id ON contributions(discussion_id, id);
CREATE INDEX contributions_parent_id ON contributions(parent_id);
CREATE INDEX sources_topic_page ON sources(topic_id,id) WHERE public;
CREATE FUNCTION preserve_contribution_origin() RETURNS trigger LANGUAGE plpgsql AS $immutable$
BEGIN
  IF (NEW.id, NEW.discussion_id, NEW.source_id, NEW.author_id, NEW.parent_id, NEW.root_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.discussion_id, OLD.source_id, OLD.author_id, OLD.parent_id, OLD.root_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Immutable contribution origin' USING ERRCODE = '23514';
  END IF;
  IF OLD.withdrawn AND NOT NEW.withdrawn THEN
    RAISE EXCEPTION 'Withdrawal is irreversible' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $immutable$;
CREATE TRIGGER contribution_origin BEFORE UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION preserve_contribution_origin();
CREATE TABLE contribution_revisions (
  contribution_id text NOT NULL REFERENCES contributions(id),
  version integer NOT NULL, body text NOT NULL,
  PRIMARY KEY(contribution_id, version)
);
CREATE TABLE command_receipts (
  principal_id text NOT NULL REFERENCES principals(id), request_id text NOT NULL,
  kind text NOT NULL, payload_hash text NOT NULL, response jsonb NOT NULL,
  PRIMARY KEY(principal_id, request_id)
);
CREATE TABLE jobs (
  id text PRIMARY KEY, principal_id text NOT NULL REFERENCES principals(id),
  request_id text NOT NULL, kind text NOT NULL CHECK(kind = 'bookkeeping'),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','complete','failed')),
  attempts integer NOT NULL DEFAULT 0, worker_id text, lease_token text, lease_until timestamptz,
  UNIQUE(principal_id, request_id),
  FOREIGN KEY(principal_id, request_id) REFERENCES command_receipts(principal_id, request_id)
);
CREATE INDEX jobs_claimable ON jobs(state, id) WHERE state IN ('pending','leased');
DO $permissions$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='udl_app') THEN
    GRANT SELECT ON portable_migrations, principals, topics, sources TO udl_app;
    GRANT SELECT, UPDATE ON discussions TO udl_app;
    GRANT SELECT, INSERT, UPDATE ON contributions TO udl_app;
    GRANT SELECT, INSERT, DELETE ON contribution_revisions TO udl_app;
    GRANT SELECT, INSERT ON command_receipts TO udl_app;
    GRANT SELECT, INSERT, UPDATE ON jobs TO udl_app;
  END IF;
END $permissions$;
