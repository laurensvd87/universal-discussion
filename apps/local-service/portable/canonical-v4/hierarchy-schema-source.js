// Compatibility bridge for the immutable ADR220 schema. Reading this module
// executes no SQL and grants no fixture, migration or assignment authority.
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const INPUT_BYTES = 148666;
const INPUT_SHA256 = 'bdb10afc73c8eb0ef6c44b8d0433095f8e88ed7cedbec2970904566fd66577f6';
const OUTPUT_SHA256 = 'f0d838927ed10b17d71261d3e5f8cc36924421d60f1322032b6d39f643b0b518';
const BOUNDARY_SHA256 = '6e0ac824f9963ed20db9504b81432a41ffbe86cff00b7a569ba88fb28d8a3490';
const SCHEMA_URL = new URL('./experimental/hierarchy-native-scoped-ingestion-v2/schema.sql', import.meta.url);
const BOUNDARY_URL = new URL('./experimental/hierarchy-native-scoped-ingestion-v2/boundary.sql', import.meta.url);
const EXPRESSIONS = Object.freeze([
  "CASE WHEN a->>'originKind'='actor' THEN 32 ELSE 1024 END",
  "CASE WHEN a.authority->>'originKind'='actor' THEN 32 ELSE 1024 END",
]);
const ALIAS_FIXES = Object.freeze([
  Object.freeze([
    'SELECT g,op,i.deadline,false FROM hierarchy_native_scoped_ingestion_v2.issuance_context c JOIN hierarchy_native_scoped_ingestion_v2.issued_commands i ON i.id=c.issued_id WHERE c.tx=pg_catalog.txid_current();',
    'SELECT g,op,issued.deadline,false FROM hierarchy_native_scoped_ingestion_v2.issuance_context c JOIN hierarchy_native_scoped_ingestion_v2.issued_commands issued ON issued.id=c.issued_id WHERE c.tx=pg_catalog.txid_current();',
  ]),
  Object.freeze([
    'JOIN hierarchy_native_scoped_ingestion_v2.current_inputs c USING(source_id,source_version,decision_hash) WHERE d.source_id=i.source_id;',
    'JOIN hierarchy_native_scoped_ingestion_v2.current_inputs current_input USING(source_id,source_version,decision_hash) WHERE d.source_id=i.source_id;',
  ]),
]);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const refuse = () => { throw new TypeError('Hierarchy schema source identity mismatch'); };

async function readPinnedSource(url, length, expectedHash) {
  const file = await open(url, 'r');
  try {
    const bytes = Buffer.alloc(length + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await file.read(bytes, used, bytes.length - used, null);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    const source = bytes.subarray(0, used);
    if (used !== length || sha256(source) !== expectedHash) refuse();
    return source.toString('utf8');
  } finally {
    await file.close();
  }
}

/** Repair two PL/pgSQL CASE delimiters and two overlapping table aliases.
 * PostgreSQL's IF reader otherwise treats the CASE's THEN as its own delimiter.
 * Alias changes keep table bindings/predicates and intended record variables.
 * All other source bytes remain unchanged; this is not a general SQL rewriter.
 */
export function materializeHierarchySchemaSource(source) {
  if (typeof source !== 'string' || source.length > INPUT_BYTES ||
      Buffer.byteLength(source, 'utf8') !== INPUT_BYTES || sha256(source) !== INPUT_SHA256) refuse();
  let corrected = source;
  for (const expression of EXPRESSIONS) {
    const before = '>=' + expression + ' THEN';
    const after = '>=(' + expression + ') THEN';
    const position = corrected.indexOf(before);
    if (position === -1 || corrected.indexOf(before, position + 1) !== -1) refuse();
    corrected = corrected.slice(0, position) + after + corrected.slice(position + before.length);
  }
  for (const [before, after] of ALIAS_FIXES) {
    const position = corrected.indexOf(before);
    if (position === -1 || corrected.indexOf(before, position + 1) !== -1) refuse();
    corrected = corrected.slice(0, position) + after + corrected.slice(position + before.length);
  }
  if (sha256(corrected) !== OUTPUT_SHA256) refuse();
  let inverse = corrected;
  for (const expression of EXPRESSIONS)
    inverse = inverse.replace('>=(' + expression + ') THEN', '>=' + expression + ' THEN');
  for (const [before, after] of ALIAS_FIXES) inverse = inverse.replace(after, before);
  if (inverse !== source) refuse();
  return corrected;
}

/** Fixed source paths only. A future maintained initializer must explicitly
 * consume this result; frozen v2 continues to use its original inputs.
 */
export async function readHierarchySchemaSources() {
  const schema = await readPinnedSource(SCHEMA_URL, INPUT_BYTES, INPUT_SHA256);
  const boundary = await readPinnedSource(BOUNDARY_URL, 7931, BOUNDARY_SHA256);
  return Object.freeze({ schema: materializeHierarchySchemaSource(schema), boundary });
}
