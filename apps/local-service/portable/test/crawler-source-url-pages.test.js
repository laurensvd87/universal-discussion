import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { seedCanonicalV4RuntimeFixture } from './canonical-v4-runtime-fixture.js';
import { createCanonicalV4ReadFacade } from '../canonical-v4/read-facade.js';
import { createPostgresCanonicalService } from '../../src/application/create-postgres-canonical-service.js';
import { createRequestHandler } from '../../src/http/request-handler.js';

const config = { hostHeader: '127.0.0.1:4174', origin: `chrome-extension://${'a'.repeat(32)}`, capability: 'synthetic-url-page' };

test('minimal crawler URL pages retain Source mirrors and catalog cursors without Topic/account/vector hydration', async t => {
  const database = await createPGliteDatabase(); t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  await database.transaction(async tx => {
    await tx.query(`INSERT INTO canonical_v4.id_registry(id,kind)
      SELECT 'source-url-extra-' || lpad(n::text,3,'0'),'sources' FROM generate_series(1,101) n`);
    await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,has_embedding)
      SELECT 'source-url-extra-' || lpad(n::text,3,'0'),n+2,
        json_build_object('id','source-url-extra-' || lpad(n::text,3,'0'),
          'url','https://example.org/url-page/' || n,'title','Synthetic source ' || n,'provenance','synthetic-owner-local/v1')::text,
        'https://example.org/url-page/' || n,'Synthetic source ' || n,'synthetic-owner-local/v1',false
      FROM generate_series(1,101) n`);
  });
  const statements = [];
  const reads = createCanonicalV4ReadFacade({ database: { ...database,
    transaction: work => database.transaction(tx => work({ ...tx, query(sql, parameters) {
      statements.push(sql); return tx.query(sql, parameters);
    } })),
  } });
  const service = createPostgresCanonicalService({ reads: { ...reads,
    catalogContext() { assert.fail('dedup URLs must not hydrate per-Source Topic contexts'); },
  }, runtime: { command() { assert.fail('URL read cannot write canonical state'); } } });
  const handle = createRequestHandler({ service, config });
  const request = (body, overrides = {}) => handle({ method: 'POST', url: '/v1/catalog/source-urls', body: JSON.stringify(body),
    headers: { host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`,
      'content-type': 'application/json', ...overrides } });
  const first = await request({ limit: 100, cursor: null });
  assert.equal(first.status, 200);
  const page = JSON.parse(first.body);
  assert.deepEqual(Object.keys(page).sort(), ['nextCursor', 'urls', 'version']);
  assert.equal(page.urls.length, 100); assert.equal(typeof page.nextCursor, 'string');
  await database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1');
  const second = await request({ limit: 100, cursor: page.nextCursor });
  assert.equal(second.status, 200);
  const tail = JSON.parse(second.body);
  assert.equal(tail.urls.length, 4); assert.equal(tail.nextCursor, null);
  assert.ok(tail.version.revision > page.version.revision);
  assert.equal(new Set([...page.urls, ...tail.urls]).size, 104);
  assert.equal(statements.some(sql => /FROM canonical_v4\.(topics|fixed_references)|account|private_chat/u.test(sql)), false);
  assert.equal(statements.some(sql => /SELECT source_id,payload,model_id,dimensions,values_double/u.test(sql)), false);
  assert.ok(statements.some(sql => sql.includes('canonical_v4.operation_receipts')));
  assert.equal((await request({ limit: 100, cursor: null, kind: 'sources' })).status, 400);
  assert.equal((await request({ limit: 99, cursor: null })).status, 400);
  assert.equal((await request({ limit: 100, cursor: null }, { authorization: 'missing' })).status, 401);
  await database.query('UPDATE canonical_v4.runtime_state SET catalog_version=catalog_version+1');
  assert.equal((await request({ limit: 100, cursor: page.nextCursor })).status, 409);
  await database.query(`UPDATE canonical_v4.sources SET title='Forged typed title' WHERE id=$1`, [fixture.historicalSource]);
  assert.equal((await request({ limit: 100, cursor: null })).status, 500, 'typed mirror corruption still fails closed');
});
