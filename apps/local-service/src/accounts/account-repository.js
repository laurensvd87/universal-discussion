import { DatabaseSync } from 'node:sqlite';

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
const CORE = ['auth_meta','accounts','account_emails','email_challenges','sessions','rate_limits','account_reply_outbox'];

// Separate fixture repository. It never migrates or accepts the demo database.
export class AccountRepository {
  constructor({ filename = ':memory:' } = {}) {
    this.database = new DatabaseSync(filename);
    this.depth = 0;
    try {
      this.database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;');
      const objects = this.database.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
      const tables = objects.filter(row => row.type === 'table');
      if (!objects.length) this.transaction(() => this.database.exec(SCHEMA));
      else if (!tables.length) throw new Error('unsupported-account-schema');
      const names = tables.length ? tables.map(row => row.name) : CORE;
      if (names.some(name => !CORE.includes(name)) || CORE.some(name => !names.includes(name)) ||
          this.database.prepare('PRAGMA user_version').get().user_version !== 1 ||
          this.database.prepare("SELECT value FROM auth_meta WHERE key='schema'").get()?.value !== 'synthetic-accounts-v1') {
        throw new Error('unsupported-account-schema');
      }
      // Check constraints/column definitions, not just a version marker supplied by a caller.
      const expected = new DatabaseSync(':memory:');
      try {
        expected.exec(SCHEMA);
        const normalize = database => database.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all()
          .map(row => ({...row,sql:row.sql?.replace(/\s+/g,' ')}));
        // Only the declared tables and their SQLite-generated autoindices may exist.
        // Unexpected triggers/views/user indices can alter behavior despite valid tables.
        if (JSON.stringify(normalize(this.database)) !== JSON.stringify(normalize(expected))) throw new Error('unsupported-account-schema');
      } finally { expected.close(); }
      if (this.database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('invalid-account-integrity');
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
