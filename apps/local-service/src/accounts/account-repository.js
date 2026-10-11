import { DatabaseSync } from 'node:sqlite';
import { basename } from 'node:path';

const SCHEMA = `
CREATE TABLE auth_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
INSERT INTO auth_meta VALUES ('schema','synthetic-accounts-v1');
CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT, username_key TEXT UNIQUE,
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','deleting','deleted','blocked')),
 reply_email INTEGER NOT NULL DEFAULT 0 CHECK(reply_email IN (0,1)), created_at INTEGER NOT NULL,
 CHECK((username IS NULL) = (username_key IS NULL)),
 CHECK(username IS NULL OR (length(username) BETWEEN 3 AND 24 AND username NOT GLOB '*[^A-Za-z0-9_]*' AND username_key=lower(username)))) STRICT;
CREATE TABLE account_emails (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 email TEXT NOT NULL UNIQUE, verified_at INTEGER NOT NULL) STRICT;
CREATE TABLE email_challenges (id TEXT PRIMARY KEY,
 email_key TEXT NOT NULL CHECK(length(email_key)=64 AND email_key NOT GLOB '*[^0-9a-f]*'),
 email TEXT NOT NULL,
 code_digest TEXT NOT NULL CHECK(length(code_digest)=64 AND code_digest NOT GLOB '*[^0-9a-f]*'),
 client_digest TEXT NOT NULL CHECK(length(client_digest)=64 AND client_digest NOT GLOB '*[^0-9a-f]*'), created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 5),
 consumed INTEGER NOT NULL CHECK(consumed IN (0,1)), CHECK(expires_at > created_at)) STRICT;
CREATE TABLE sessions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 access_digest TEXT NOT NULL UNIQUE CHECK(length(access_digest)=64 AND access_digest NOT GLOB '*[^0-9a-f]*'),
 refresh_digest TEXT NOT NULL UNIQUE CHECK(length(refresh_digest)=64 AND refresh_digest NOT GLOB '*[^0-9a-f]*'),
 access_expires INTEGER NOT NULL, refresh_expires INTEGER NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))) STRICT;
CREATE TABLE rate_limits (key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL CHECK(count > 0),
 PRIMARY KEY(key,bucket)) STRICT;
CREATE TABLE account_reply_outbox (
    id TEXT PRIMARY KEY, reply_id TEXT NOT NULL, recipient_id TEXT NOT NULL REFERENCES accounts(id),
    topic_id TEXT NOT NULL, discussion_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind='direct-reply'),
    state TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, next_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, batch_key TEXT, lease_token TEXT, lease_until INTEGER,
    sent_at INTEGER, last_attempt_at INTEGER, UNIQUE(reply_id,recipient_id,kind)
  ) STRICT;
PRAGMA user_version=1;
`;
const MIGRATION_V2 = `
CREATE TABLE external_identities (
 issuer TEXT NOT NULL CHECK(issuer='https://auth.openai.com'),
 client_id TEXT NOT NULL CHECK(length(client_id) BETWEEN 1 AND 256 AND client_id!='dynamic_agent_client'),
 subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 256),
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, PRIMARY KEY(issuer,client_id,subject)
) STRICT;
UPDATE auth_meta SET value='discussion-accounts-v2' WHERE key='schema';
PRAGMA user_version=2;
`;
function validateSchema(database, version) {
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec(SCHEMA);
    if (version === 2) expected.exec(MIGRATION_V2);
    const normalize = db => db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all()
      .map(row => ({...row,sql:row.sql?.replace(/\s+/g,' ')}));
    if (JSON.stringify(normalize(database)) !== JSON.stringify(normalize(expected))) throw new Error('unsupported-account-schema');
    const meta = database.prepare('SELECT key,value FROM auth_meta').all();
    if (meta.length !== 1 || meta[0].key !== 'schema' ||
        meta[0].value !== (version === 1 ? 'synthetic-accounts-v1' : 'discussion-accounts-v2')) throw new Error('unsupported-account-schema');
    if (database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('invalid-account-integrity');
  } finally { expected.close(); }
}

// Separately declared account repository. It never migrates or accepts the demo database.
export class AccountRepository {
  constructor({ filename = ':memory:' } = {}) {
    if (typeof filename !== 'string' || basename(filename).toLowerCase() === 'demo.sqlite') throw new Error('unsupported-account-schema');
    this.database = new DatabaseSync(filename);
    this.depth = 0;
    try {
      this.database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;');
      const objects = this.database.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
      const tables = objects.filter(row => row.type === 'table');
      if (!objects.length) this.transaction(() => { this.database.exec(SCHEMA); this.database.exec(MIGRATION_V2); });
      else if (!tables.length) throw new Error('unsupported-account-schema');
      const version = this.database.prepare('PRAGMA user_version').get().user_version;
      if (![1,2].includes(version)) throw new Error('unsupported-account-schema');
      // Validate the complete prior schema before any migration can modify it.
      validateSchema(this.database,version);
      if (version === 1) this.transaction(() => { this.database.exec(MIGRATION_V2); validateSchema(this.database,2); });
    } catch (error) { this.database.close(); throw error; }
  }
  transaction(fn) {
    if (typeof fn !== 'function' || fn.constructor?.name === 'AsyncFunction') throw new Error('synchronous-transaction-required');
    const depth = this.depth;
    const label = `account_transaction_${depth}`;
    this.database.exec(depth ? `SAVEPOINT ${label}` : 'BEGIN IMMEDIATE');
    this.depth++;
    try {
      const result = fn(this.database);
      if (result && typeof result.then === 'function') throw new Error('synchronous-transaction-required');
      this.database.exec(depth ? `RELEASE ${label}` : 'COMMIT');
      return result;
    } catch (error) {
      this.database.exec(depth ? `ROLLBACK TO ${label}; RELEASE ${label}` : 'ROLLBACK');
      throw error;
    } finally { this.depth--; }
  }
  close() { if (!this.closed) { this.database.close(); this.closed = true; } }
}
