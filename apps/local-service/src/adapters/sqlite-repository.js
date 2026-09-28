import { DatabaseSync } from "node:sqlite";
import { ServiceError, fail } from "../domain/errors.js";
import { STATE_SCHEMA } from "../domain/demo-state.js";
import { assertValidPersistedState } from "../domain/persisted-state.js";
import { clone, frozenClone } from "../domain/validation.js";

const TABLE = "demo_state";
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export function createSqliteRepository(databasePath, initialState, options = {}) {
  const database = new DatabaseSync(databasePath);
  const serialize = options.serialize ?? JSON.stringify;
  try {
    configure(database);
    initialize(database, initialState, serialize);
  } catch (error) {
    database.close();
    throw normalizeStorageError(error);
  }

  function write(expected, nextState) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const current = readRow(database);
      const currentState = parseRow(current);
      if (currentState.generation !== expected.generation || currentState.revision !== expected.revision) {
        fail("conflict", "State changed");
      }
      assertValidPersistedState(nextState);
      const document = serialize(nextState);
      if (typeof document !== "string" || Buffer.byteLength(document, "utf8") > MAX_DOCUMENT_BYTES) {
        fail("capacity", "Capacity reached");
      }
      const result = database.prepare(
        `UPDATE ${TABLE} SET schema = ?, generation = ?, revision = ?, document = ?
         WHERE singleton = 1 AND generation = ? AND revision = ?`,
      ).run(nextState.schema, nextState.generation, nextState.revision, document, expected.generation, expected.revision);
      if (result.changes !== 1) fail("conflict", "State changed");
      database.exec("COMMIT");
      return frozenClone(nextState);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      throw normalizeStorageError(error);
    }
  }

  return Object.freeze({
    load() {
      try { return frozenClone(parseRow(readRow(database))); }
      catch (error) { throw normalizeStorageError(error); }
    },
    save: write,
    replace: write,
    close() { database.close(); },
  });
}

function configure(database) {
  database.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
}

function initialize(database, initialState, serialize) {
  const objects = database.prepare(
    "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all();
  if (objects.length === 0) {
    assertValidPersistedState(initialState);
    database.exec(
      `CREATE TABLE ${TABLE} (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema TEXT NOT NULL,
        generation TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        document TEXT NOT NULL
      ) STRICT`,
    );
    database.prepare(
      `INSERT INTO ${TABLE} (singleton, schema, generation, revision, document) VALUES (1, ?, ?, ?, ?)`,
    ).run(initialState.schema, initialState.generation, initialState.revision, serialize(initialState));
    return;
  }
  if (objects.length !== 1 || objects[0].name !== TABLE || objects[0].type !== "table") {
    fail("storage-schema", "Unsupported local database schema");
  }
  const columns = database.prepare(`PRAGMA table_info(${TABLE})`).all().map((column) => column.name);
  if (columns.join(",") !== "singleton,schema,generation,revision,document") {
    fail("storage-schema", "Unsupported local database schema");
  }
  const row = readRow(database);
  parseRow(row);
}

function readRow(database) {
  const row = database.prepare(
    `SELECT schema, generation, revision, document FROM ${TABLE} WHERE singleton = 1`,
  ).get();
  if (!row) fail("storage-corrupt", "Local database is incomplete");
  return row;
}

function parseRow(row) {
  if (
    row.schema !== STATE_SCHEMA || typeof row.generation !== "string" ||
    !Number.isSafeInteger(row.revision) || typeof row.document !== "string"
  ) fail("storage-schema", "Unsupported local database schema");
  if (Buffer.byteLength(row.document, "utf8") > MAX_DOCUMENT_BYTES) fail("storage-corrupt", "Local database is oversized");
  let state;
  try { state = JSON.parse(row.document); }
  catch { fail("storage-corrupt", "Local database is unreadable"); }
  if (state.schema !== row.schema || state.generation !== row.generation || state.revision !== row.revision) {
    fail("storage-corrupt", "Local database is inconsistent");
  }
  try { assertValidPersistedState(state); }
  catch { fail("storage-corrupt", "Local database is inconsistent"); }
  return clone(state);
}

function normalizeStorageError(error) {
  if (error instanceof ServiceError) return error;
  return new ServiceError("storage-failure", "Local storage failed");
}
