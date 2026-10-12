import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createNormalizedSqliteRepository } from "../adapters/normalized-sqlite-repository.js";
import { assertValidPersistedState } from "../domain/persisted-state.js";
import { MAX_DOCUMENT_BYTES } from "../domain/repository-contract.js";

export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function assertBackupRuntime() {
  if (typeof DatabaseSync.prototype.serialize !== "function" || typeof DatabaseSync.prototype.deserialize !== "function") throw new Error("Unsupported backup runtime");
}

// The read transaction pins the WAL view. Never use filesystem copying or the
// native backup API (which would require a plaintext staging file).
export function captureCanonicalImage(filename) {
  assertBackupRuntime();
  const database = new DatabaseSync(filename, { readOnly: true });
  let image;
  try {
    database.exec("PRAGMA busy_timeout=5000; BEGIN");
    database.prepare("SELECT count(*) FROM sqlite_master").get();
    const pages = database.prepare("PRAGMA page_count").get().page_count;
    const pageSize = database.prepare("PRAGMA page_size").get().page_size;
    if (!Number.isSafeInteger(pages * pageSize) || pages * pageSize > MAX_BACKUP_BYTES) throw new Error("Backup capacity exceeded");
    image = database.serialize();
    if (image.length > MAX_BACKUP_BYTES) throw new Error("Backup capacity exceeded");
    database.exec("COMMIT");
    return image;
  } catch (error) {
    image?.fill(0);
    try { database.exec("ROLLBACK"); } catch { /* Preserve original failure. */ }
    throw error;
  } finally { database.close(); }
}

export function validateCanonicalImage(image) {
  if (!(image instanceof Uint8Array) || image.length < 100 || image.length > MAX_BACKUP_BYTES || Buffer.from(image.subarray(0, 16)).toString("binary") !== "SQLite format 3\0") throw new Error("Invalid backup image");
  if (![1,2].includes(image[18]) || ![1,2].includes(image[19])) throw new Error("Invalid backup journal header");
  const copy = Buffer.from(image);
  // SQLite's documented RAM-only conversion of a serialized WAL image.
  copy[18] = 1; copy[19] = 1;
  let database, repository, state;
  try {
    database = new DatabaseSync(":memory:"); database.deserialize(copy); database.exec("PRAGMA query_only=ON");
    const objects = database.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const check = database.prepare("PRAGMA quick_check").all();
    if (check.length !== 1 || check[0].quick_check !== "ok") throw new Error("Invalid backup image");
    if (objects.some(item => item.name === "canonical_meta")) {
      database.close(); database = null;
      repository = createNormalizedSqliteRepository(":memory:", null, { readOnly: true, snapshotBytes: copy });
      state = repository.load();
    } else {
      if (objects.length !== 1 || objects[0].name !== "demo_state" || objects[0].type !== "table") throw new Error("Invalid canonical scope");
      const columns = database.prepare("PRAGMA table_info(demo_state)").all().map(row => row.name).join(",");
      if (columns !== "singleton,schema,generation,revision,document") throw new Error("Invalid legacy schema");
      const fields = database.prepare("PRAGMA table_info(demo_state)").all();
      if (fields.some((field,index) => field.type !== ["INTEGER","TEXT","TEXT","INTEGER","TEXT"][index] || field.pk !== (index === 0 ? 1 : 0) || field.notnull !== (index === 0 ? 0 : 1) || field.dflt_value !== null) || database.prepare("PRAGMA table_list").all().find(table => table.name === "demo_state")?.strict !== 1) throw new Error("Invalid legacy schema");
      const ddl = database.prepare("SELECT sql FROM sqlite_master WHERE name='demo_state'").get().sql;
      const expected = "CREATE TABLE demo_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),schema TEXT NOT NULL,generation TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=0),document TEXT NOT NULL) STRICT";
      if (ddl.replace(/\s/gu,"").toUpperCase() !== expected.replace(/\s/gu,"").toUpperCase()) throw new Error("Invalid legacy schema");
      const rows = database.prepare("SELECT * FROM demo_state").all();
      if (rows.length !== 1 || rows[0].singleton !== 1) throw new Error("Invalid legacy state");
      const row = rows[0];
      if (!["demo-state/v2", "demo-state/v3"].includes(row.schema) || typeof row.document !== "string" || Buffer.byteLength(row.document) > MAX_DOCUMENT_BYTES) throw new Error("Invalid legacy state");
      state = JSON.parse(row.document); assertValidPersistedState(state);
      if (state.schema !== row.schema || state.generation !== row.generation || state.revision !== row.revision) throw new Error("Invalid legacy header");
    }
    return { canonicalSchema: state.schema, version: { generation: state.generation, revision: state.revision }, counts: Object.fromEntries(["topics", "discussions", "sources", "sourceLinks", "contributions"].map(name => [name, state[name].length])), logicalStateDigest: digest(JSON.stringify(state)), imageDigest: digest(image), size: image.length };
  } finally { database?.close(); repository?.close(); copy.fill(0); }
}
