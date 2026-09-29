import { DatabaseSync } from "node:sqlite";
import { ServiceError, fail } from "../domain/errors.js";
import { STATE_SCHEMA } from "../domain/demo-state.js";
import { assertValidLegacyPersistedState, assertValidPersistedState } from "../domain/persisted-state.js";
import { migrateLegacyState } from "../domain/state-migration.js";
import { clone, frozenClone } from "../domain/validation.js";
import { assertExpected, assertTransition, MAX_DOCUMENT_BYTES, serializeSnapshot } from "../domain/repository-contract.js";

const TABLE = "demo_state";

export function createSqliteRepository(databasePath, initialState, options = {}) {
  let database;
  const serialize = options.serialize ?? JSON.stringify;
  try {
    database = new DatabaseSync(databasePath);
    initialize(database, initialState, serialize);
    configure(database);
  } catch (error) {
    database?.close();
    throw normalizeStorageError(error);
  }

  function write(expectedValue, nextState, reset) {
    let transaction = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      transaction = true;
      const current = readRow(database);
      const currentState = parseRow(current);
      const expected = assertExpected(currentState, expectedValue);
      const document = serializeSnapshot(nextState, serialize);
      assertTransition(currentState, nextState, reset);
      const result = database.prepare(
        `UPDATE ${TABLE} SET schema = ?, generation = ?, revision = ?, document = ?
         WHERE singleton = 1 AND generation = ? AND revision = ?`,
      ).run(nextState.schema, nextState.generation, nextState.revision, document, expected.generation, expected.revision);
      if (result.changes !== 1) fail("conflict", "State changed");
      database.exec("COMMIT");
      transaction = false;
      return frozenClone(nextState);
    } catch (error) {
      if (transaction) {
        try { database.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      }
      throw normalizeStorageError(error);
    }
  }

  return Object.freeze({
    load() {
      try { return frozenClone(parseRow(readRow(database))); }
      catch (error) { throw normalizeStorageError(error); }
    },
    save(expected, nextState) { return write(expected, nextState, false); },
    replace(expected, nextState) { return write(expected, nextState, true); },
    close() { database.close(); },
  });
}

function configure(database) {
  database.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
}

function initialize(database, initialState, serialize) {
  database.exec("BEGIN IMMEDIATE");
  try {
    initializeTransaction(database, initialState, serialize);
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

function initializeTransaction(database, initialState, serialize) {
  const objects = database.prepare(
    "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all();
  if (objects.length === 0) {
    const document = serializeSnapshot(initialState, serialize);
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
    ).run(initialState.schema, initialState.generation, initialState.revision, document);
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
  const state = parseRow(row, true);
  if (row.schema === "demo-state/v1") {
    const migrated = migrateLegacyState(state);
    const document = serializeSnapshot(migrated, serialize);
    assertTransition(state, migrated, false);
    const outcome = database.prepare(`UPDATE ${TABLE} SET schema = ?, revision = ?, document = ?
      WHERE singleton = 1 AND schema = ? AND generation = ? AND revision = ?`).run(
      migrated.schema, migrated.revision, document, row.schema, row.generation, row.revision);
    if (outcome.changes !== 1) fail("conflict", "State changed");
  }
}

function readRow(database) {
  const row = database.prepare(
    `SELECT schema, generation, revision, document FROM ${TABLE} WHERE singleton = 1`,
  ).get();
  if (!row) fail("storage-corrupt", "Local database is incomplete");
  return row;
}

function parseRow(row, allowLegacy = false) {
  if (
    (row.schema !== STATE_SCHEMA && !(allowLegacy && row.schema === "demo-state/v1")) || typeof row.generation !== "string" ||
    !Number.isSafeInteger(row.revision) || typeof row.document !== "string"
  ) fail("storage-schema", "Unsupported local database schema");
  if (Buffer.byteLength(row.document, "utf8") > MAX_DOCUMENT_BYTES) fail("storage-corrupt", "Local database is oversized");
  let state;
  try { state = JSON.parse(row.document); }
  catch { fail("storage-corrupt", "Local database is unreadable"); }
  if (!state || state.schema !== row.schema || state.generation !== row.generation || state.revision !== row.revision) {
    fail("storage-corrupt", "Local database is inconsistent");
  }
  try { (row.schema === "demo-state/v1" ? assertValidLegacyPersistedState : assertValidPersistedState)(state); }
  catch { fail("storage-corrupt", "Local database is inconsistent"); }
  return clone(state);
}

function normalizeStorageError(error) {
  if (error instanceof ServiceError) return error;
  return new ServiceError("storage-failure", "Local storage failed");
}
