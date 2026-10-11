import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { setup } from './helpers.js';

const document = parse(await readFile(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));
const schemas = document.components.schemas;

test('OpenAPI local references resolve and operations exclude provider, identity, ingestion and admin routes', () => {
  assert.equal(document.openapi, '3.1.0');
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'));
      assert.ok(value.$ref.slice(2).split('/').reduce((parent, key) => parent?.[key], document));
    }
    Object.values(value).forEach(walk);
  };
  walk(document);
  assert.deepEqual(Object.keys(document.paths).sort(), [
    '/health/live', '/health/ready', '/portable/v1/commands/{kind}',
    '/portable/v1/discussions/{discussionId}', '/portable/v1/related',
    '/portable/v1/source/resolve', '/portable/v1/sources', '/portable/v1/topics',
  ]);
  assert.equal(schemas.version.maximum, 2147483646);
  assert.deepEqual(schemas.reply.required.sort(), ['body','discussionId','expectedVersion','replyToId','sourceId']);
});

test('actual SQL safe projections match documented field allowlists', async t => {
  const context = await setup(t);
  const assertFields = (value, schema) => assert.deepEqual(Object.keys(value).sort(), Object.keys(schema.properties).sort());
  const sources = await context.repository.listSources({ topicId: context.ids.topic });
  for (const source of sources.items) assertFields(source, schemas.sourceFields);
  const root = await context.repository.command({ principal: context.alex, requestId: 'contract-root', kind: 'create-root', payload: {
    discussionId: context.ids.discussion, sourceId: context.ids.source, body: 'Synthetic contract example', expectedVersion: 0,
  } });
  const responseSchema = document.paths['/portable/v1/commands/{kind}'].post.responses['200'].content['application/json'].schema;
  assertFields(root, responseSchema);
  const messages = await context.repository.readDiscussion({ discussionId: context.ids.discussion });
  assertFields(messages.items[0], schemas.contribution);
  assertFields(messages.items[0].author, schemas.contribution.properties.author);
  const related = await context.repository.findRelated({ sourceId: context.ids.source });
  for (const row of related.items) assert.deepEqual(Object.keys(row).sort(), [...Object.keys(schemas.sourceFields.properties), 'similarity'].sort());
});
