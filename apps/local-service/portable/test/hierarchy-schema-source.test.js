import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { materializeHierarchySchemaSource, readHierarchySchemaSources } from '../canonical-v4/hierarchy-schema-source.js';

const originalUrl = new URL('../canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/schema.sql', import.meta.url);
const sha256 = value => createHash('sha256').update(value).digest('hex');

test('hierarchy source repair preserves original source outside reviewed delimiters and scoped names', async () => {
  const originalBytes = await readFile(originalUrl);
  const original = originalBytes.toString('utf8');
  const corrected = materializeHierarchySchemaSource(original);
  assert.equal(originalBytes.length, 148666);
  assert.equal(sha256(originalBytes), 'bdb10afc73c8eb0ef6c44b8d0433095f8e88ed7cedbec2970904566fd66577f6');
  assert.equal(Buffer.byteLength(corrected), 148703);
  assert.equal(sha256(corrected), '3940520b803f4de36ed6c8a74e95638eefd575cc632699103f1fe41cee1ccb36');
  // Independent full-text inverse: no predicates, relation bindings or intended
  // PL/pgSQL record references change outside the reviewed substitutions.
  const functionStart = corrected.indexOf('CREATE FUNCTION hierarchy_native_scoped_ingestion_v2.issue_command(');
  const functionEnd = corrected.indexOf('\nEND $$;', functionStart) + '\nEND $$;'.length;
  const body = corrected.slice(functionStart, functionEnd);
  assert.equal([...body.matchAll(/\bmaterial_\b/gu)].length, 6);
  assert.equal(/\bmaterial\b/u.test(body), false);
  assert.ok(corrected.includes('UPDATE hierarchy_native_scoped_ingestion_v2.jobs SET state=p_state,params=NULL,material=NULL'));
  const inverse = (corrected.slice(0, functionStart) + body.replace(/\bmaterial_\b/gu, 'material') + corrected.slice(functionEnd))
    .replace(">=(CASE WHEN a->>'originKind'='actor' THEN 32 ELSE 1024 END) THEN", ">=CASE WHEN a->>'originKind'='actor' THEN 32 ELSE 1024 END THEN")
    .replace(">=(CASE WHEN a.authority->>'originKind'='actor' THEN 32 ELSE 1024 END) THEN", ">=CASE WHEN a.authority->>'originKind'='actor' THEN 32 ELSE 1024 END THEN")
    .replace('SELECT g,op,issued.deadline,false FROM hierarchy_native_scoped_ingestion_v2.issuance_context c JOIN hierarchy_native_scoped_ingestion_v2.issued_commands issued ON issued.id=c.issued_id WHERE c.tx=pg_catalog.txid_current();', 'SELECT g,op,i.deadline,false FROM hierarchy_native_scoped_ingestion_v2.issuance_context c JOIN hierarchy_native_scoped_ingestion_v2.issued_commands i ON i.id=c.issued_id WHERE c.tx=pg_catalog.txid_current();')
    .replace('JOIN hierarchy_native_scoped_ingestion_v2.current_inputs current_input USING(source_id,source_version,decision_hash) WHERE d.source_id=i.source_id;', 'JOIN hierarchy_native_scoped_ingestion_v2.current_inputs c USING(source_id,source_version,decision_hash) WHERE d.source_id=i.source_id;');
  assert.equal(inverse, original);
  assert.deepEqual(await readFile(originalUrl), originalBytes);
});

test('hierarchy source repair refuses altered limits, line endings, truncation and a second application', async () => {
  const original = await readFile(originalUrl, 'utf8');
  for (const changed of [
    original.replace('THEN 32 ELSE 1024', 'THEN 33 ELSE 1024'),
    original.includes('\r\n') ? original.replace(/\r\n/g, '\n') : original.replace(/\n/g, '\r\n'),
    original.slice(0, -1),
    original + '\n',
    materializeHierarchySchemaSource(original),
  ]) assert.throws(() => materializeHierarchySchemaSource(changed), /source identity mismatch/);
});

test('hierarchy source repair rejects non-text without executing conversion hooks', () => {
  let calls = 0;
  const object = { toString() { calls++; return ''; }, [Symbol.toPrimitive]() { calls++; return ''; } };
  for (const value of [null, undefined, false, 0, {}, [], object, new Proxy(object, {
    get() { calls++; throw new Error('must not inspect'); },
  })]) assert.throws(() => materializeHierarchySchemaSource(value), /source identity mismatch/);
  assert.equal(calls, 0);
});

test('fixed hierarchy loader returns corrected schema and unchanged boundary without opening a database', async () => {
  const sources = await readHierarchySchemaSources();
  assert.equal(Object.isFrozen(sources), true);
  assert.deepEqual(Object.keys(sources), ['schema', 'boundary']);
  assert.equal(sha256(sources.schema), '3940520b803f4de36ed6c8a74e95638eefd575cc632699103f1fe41cee1ccb36');
  assert.equal(sha256(sources.boundary), '6e0ac824f9963ed20db9504b81432a41ffbe86cff00b7a569ba88fb28d8a3490');
});
