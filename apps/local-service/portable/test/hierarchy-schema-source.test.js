import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { materializeHierarchySchemaSource, readHierarchySchemaSources } from '../canonical-v4/hierarchy-schema-source.js';

const originalUrl = new URL('../canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/schema.sql', import.meta.url);
const sha256 = value => createHash('sha256').update(value).digest('hex');

test('hierarchy source repair preserves the complete original outside two CASE delimiters', async () => {
  const originalBytes = await readFile(originalUrl);
  const original = originalBytes.toString('utf8');
  const corrected = materializeHierarchySchemaSource(original);
  assert.equal(originalBytes.length, 148666);
  assert.equal(sha256(originalBytes), 'bdb10afc73c8eb0ef6c44b8d0433095f8e88ed7cedbec2970904566fd66577f6');
  assert.equal(Buffer.byteLength(corrected), 148670);
  assert.equal(sha256(corrected), 'ccd20702f7f31579bc79265ceb87f65a7fc1aeaa669460d71f048cdc75b9526e');
  // Independent full-text inverse: exactly four added parentheses, no SQL rewrite.
  const inverse = corrected
    .replace(">=(CASE WHEN a->>'originKind'='actor' THEN 32 ELSE 1024 END) THEN", ">=CASE WHEN a->>'originKind'='actor' THEN 32 ELSE 1024 END THEN")
    .replace(">=(CASE WHEN a.authority->>'originKind'='actor' THEN 32 ELSE 1024 END) THEN", ">=CASE WHEN a.authority->>'originKind'='actor' THEN 32 ELSE 1024 END THEN");
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
  assert.equal(sha256(sources.schema), 'ccd20702f7f31579bc79265ceb87f65a7fc1aeaa669460d71f048cdc75b9526e');
  assert.equal(sha256(sources.boundary), '6e0ac824f9963ed20db9504b81432a41ffbe86cff00b7a569ba88fb28d8a3490');
});
