// Compatibility bridge for the immutable ADR220 schema. Reading this module
// executes no SQL and grants no fixture, migration or assignment authority.
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const INPUT_BYTES = 148666;
const INPUT_SHA256 = 'bdb10afc73c8eb0ef6c44b8d0433095f8e88ed7cedbec2970904566fd66577f6';
const OUTPUT_SHA256 = '3940520b803f4de36ed6c8a74e95638eefd575cc632699103f1fe41cee1ccb36';
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

function issueCommandSpan(source) {
  const signature = 'CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.issue_command(v jsonb,p_params jsonb) RETURNS text';
  const start = source.indexOf(signature);
  if (start === -1 || source.indexOf(signature, start + 1) !== -1) refuse();
  const end = source.indexOf('\nEND $$;', start);
  if (end === -1) refuse();
  return { start, end: end + '\nEND $$;'.length };
}

function renameIssueMaterial(source) {
  const { start, end } = issueCommandSpan(source);
  const body = source.slice(start, end);
  if (/\bmaterial_\b/u.test(body) || [...body.matchAll(/\bmaterial\b/gu)].length !== 6) refuse();
  for (const [fragment, count] of [
    ['m jsonb; material jsonb; mode_ text;', 1],
    ['material:=(p_params->>3)::jsonb;', 1],
    ["material->>'url'", 3],
    ["material->>'documentHash'", 1],
  ]) if (body.split(fragment).length - 1 !== count) refuse();
  return source.slice(0, start) + body.replace(/\bmaterial\b/gu, 'material_') + source.slice(end);
}

function inverseIssueMaterial(source) {
  const { start, end } = issueCommandSpan(source);
  const body = source.slice(start, end);
  if ([...body.matchAll(/\bmaterial_\b/gu)].length !== 6) refuse();
  return source.slice(0, start) + body.replace(/\bmaterial_\b/gu, 'material') + source.slice(end);
}

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

/** Repair two CASE delimiters, two table aliases and one shadowing local name.
 * PostgreSQL's IF reader otherwise treats the CASE's THEN as its own delimiter.
 * Alias/local changes keep table bindings, predicates and record variables.
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
  corrected = renameIssueMaterial(corrected);
  if (sha256(corrected) !== OUTPUT_SHA256) refuse();
  let inverse = inverseIssueMaterial(corrected);
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
