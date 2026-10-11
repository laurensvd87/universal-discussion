import { DatabaseSync } from "node:sqlite";
import { ServiceError, fail } from "../domain/errors.js";

const DEFINITIONS = [
  `CREATE TABLE private_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>=0)) STRICT`,
  `CREATE TABLE private_owner_versions (owner_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0)) STRICT`,
  `CREATE TABLE private_conversations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK(visibility='private'), source_id TEXT NOT NULL, source_url TEXT NOT NULL,
    title TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1), created_at TEXT NOT NULL) STRICT`,
  `CREATE TABLE private_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL
    REFERENCES private_conversations(id) ON DELETE CASCADE, reply_to_id TEXT,
    actor_type TEXT NOT NULL CHECK(actor_type IN ('human','agent')), operator_id TEXT,
    body TEXT NOT NULL, citations TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL) STRICT`,
  `CREATE TABLE private_operations (owner_id TEXT NOT NULL, operation_id TEXT NOT NULL,
    digest TEXT NOT NULL, conversation_id TEXT NOT NULL, message_id TEXT NOT NULL,
    PRIMARY KEY(owner_id,operation_id)) STRICT`,
  `CREATE TABLE private_claims (message_id TEXT PRIMARY KEY REFERENCES private_messages(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES private_conversations(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL
    CHECK(state IN ('running','completed','failed')), error TEXT, answer_id TEXT) STRICT`,
  `CREATE INDEX private_conversations_owner ON private_conversations(owner_id,id)`,
  `CREATE INDEX private_messages_conversation ON private_messages(conversation_id)`,
];
const normalize = value => value.replace(/\s+/gu, " ").trim();

export class PrivateRepository {
  constructor(filename) {
    let db;
    try {
      db = new DatabaseSync(filename);
      const objects = db.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
      if (objects.length === 0) {
        db.exec("BEGIN IMMEDIATE");
        try {
          for (const definition of DEFINITIONS) db.exec(definition);
          db.prepare("INSERT INTO private_meta VALUES (1,'discussion-private-v1',0)").run();
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      } else if (objects.length !== DEFINITIONS.length ||
          objects.some(object => !DEFINITIONS.some(definition => normalize(definition) === normalize(object.sql ?? "")))) {
        fail("storage-schema", "Unsupported private database");
      }
      const meta = db.prepare("SELECT * FROM private_meta").all();
      if (meta.length !== 1 || meta[0].schema !== "discussion-private-v1" || meta[0].singleton !== 1 ||
          !Number.isSafeInteger(meta[0].revision) || meta[0].revision < 0) fail("storage-schema", "Unsupported private database");
      db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
      this.db = db;
      // A dispatched attempt is never replayed after process interruption.
      this.transaction(() => {
        const owners = db.prepare("SELECT DISTINCT owner_id FROM private_claims WHERE state='running'").all();
        const changed = db.prepare("UPDATE private_claims SET state='failed',error='interrupted' WHERE state='running'").run();
        for (const owner of owners) this.bumpOwner(owner.owner_id);
        return changed.changes > 0;
      });
    } catch (error) {
      db?.close();
      throw error instanceof ServiceError ? error : new ServiceError("storage-failure", "Private storage failed");
    }
  }
  bumpOwner(ownerId) {
    this.db.prepare(`INSERT INTO private_owner_versions VALUES (?,1)
      ON CONFLICT(owner_id) DO UPDATE SET revision=revision+1`).run(ownerId);
  }
  transaction(work, ownerId = null) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const outcome = work();
      if (outcome !== false) {
        this.db.prepare("UPDATE private_meta SET revision=revision+1 WHERE singleton=1").run();
        if (ownerId !== null) this.bumpOwner(ownerId);
      }
      this.db.exec("COMMIT");
      return outcome;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* Preserve failure. */ }
      throw error instanceof ServiceError ? error : new ServiceError("storage-failure", "Private storage failed");
    }
  }
  version(ownerId) { return this.db.prepare("SELECT revision FROM private_owner_versions WHERE owner_id=?").get(ownerId)?.revision ?? 0; }
  close() { this.db.close(); }
}
