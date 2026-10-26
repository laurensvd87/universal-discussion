import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { seedCanonicalV4RuntimeFixture } from './canonical-v4-runtime-fixture.js';
import { createCanonicalV4ReadFacade } from '../canonical-v4/read-facade.js';
import { BROWSER_MODEL_ID, LEARNED_SOURCE_PROVENANCE } from '../../src/domain/learned-sources.js';
import { performance } from 'node:perf_hooks';

const code = wanted => error => error?.code === wanted;
const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];

async function setup(t) {
  const database = await createPGliteDatabase(); t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  const ids = [fixture.sourceA, fixture.sourceB, fixture.historicalSource];
  for (const [index, id] of ids.entries()) {
    const row = (await database.query('SELECT * FROM canonical_v4.sources WHERE id=$1', [id])).rows[0];
    const members = (await database.query('SELECT topic_id FROM canonical_v4.topic_memberships WHERE source_id=$1 ORDER BY ordinal', [id])).rows;
    const value = { ...JSON.parse(row.payload), provenance: LEARNED_SOURCE_PROVENANCE,
      extractorVersion: 'main-text-prefix/v1', operationId: `operation-${id}`, operationDigest: '0'.repeat(64),
      topicIds: members.map(member => member.topic_id) };
    await database.query(`UPDATE canonical_v4.sources SET payload=$2,provenance=$3,extractor_version=$4,
      operation_id=$5,has_embedding=true WHERE id=$1`,
    [id, JSON.stringify(value), value.provenance, value.extractorVersion, value.operationId]);
    const embedding = { modelId: BROWSER_MODEL_ID, values: vector([0, .05, 1.7][index]) };
    await database.query(`INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double)
      VALUES($1,$2,$3,384,$4)`, [id, JSON.stringify(embedding), embedding.modelId, embedding.values]);
    await database.query(`INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest)
      VALUES($1,$2,$3)`, [id, value.operationId, value.operationDigest]);
  }
  const trace = [], controls = { evidence: null, generation: null };
  const fastDatabase = { ...database, transaction: work => database.transaction(tx => work({
    dialect: 'pg', query: async (sql, parameters) => {
      trace.push({ sql, parameters });
      if (sql.startsWith('SET TRANSACTION ISOLATION')) return { rows: [] };
      const result = await tx.query(sql, parameters);
      if (sql.includes('meta.state_schema') && controls.generation !== null)
        return { ...result, rows: result.rows.map(row => ({ ...row,
          import_generation: controls.generation, generation: controls.generation })) };
      if (sql.includes('pg_postmaster_start_time()') && controls.evidence)
        return { ...result, rows: result.rows.map(row => controls.evidence({ ...row })) };
      return result;
    },
  })) };
  return { database, fixture, ids, trace, controls,
    fast: createCanonicalV4ReadFacade({ database: fastDatabase }),
    oracle: createCanonicalV4ReadFacade({ database }) };
}
const wireReads = trace => trace.filter(({ sql }) => sql.includes('array_send(values_double)'));

test('native Related streaming budget stops hydration before later embedding batches', async t => {
  // Synthetic SQL-only catalog: long, valid ranking URLs make the real 32Mi
  // bound reachable with 5000 rows instead of a huge vector/RAM fixture.
  const f=await setup(t), original=f.fixture.sourceB, count=5000;
  const prefix=`https://example.org/${'u'.repeat(8030)}/`;
  await f.database.transaction(async tx=>{
    await tx.query(`INSERT INTO canonical_v4.id_registry
      SELECT 'stream-budget-'||n,'sources' FROM generate_series(1,$1::int) AS generated(n)`,[count]);
    await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
      SELECT 'stream-budget-'||n,10000+n,(s.payload::jsonb||jsonb_build_object('id','stream-budget-'||n,
        'url',$3::text||n,'operationId','stream-budget-operation-'||n))::text,
        $3::text||n,s.title,s.provenance,s.extractor_version,s.policy_version,'stream-budget-operation-'||n,s.has_embedding
      FROM canonical_v4.sources s CROSS JOIN generate_series(1,$2::int) AS generated(n) WHERE s.id=$1`,[original,count,prefix]);
    await tx.query(`INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double)
      SELECT 'stream-budget-'||n,e.payload,e.model_id,e.dimensions,e.values_double
      FROM canonical_v4.embeddings e CROSS JOIN generate_series(1,$2::int) AS generated(n) WHERE e.source_id=$1`,[original,count]);
    await tx.query(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
      SELECT 'stream-budget-'||n,l.topic_id,10000+n,jsonb_set(l.payload::jsonb,'{sourceId}',to_jsonb('stream-budget-'||n))::text,l.method
      FROM canonical_v4.source_links l CROSS JOIN generate_series(1,$2::int) AS generated(n) WHERE l.source_id=$1`,[original,count]);
    await tx.query(`INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT 'stream-budget-'||n,m.topic_id,m.ordinal FROM canonical_v4.topic_memberships m
      CROSS JOIN generate_series(1,$2::int) AS generated(n) WHERE m.source_id=$1`,[original,count]);
    await tx.query(`INSERT INTO canonical_v4.operation_receipts
      SELECT 'stream-budget-'||n,'stream-budget-operation-'||n,$2 FROM generate_series(1,$1::int) AS generated(n)`,[count,'0'.repeat(64)]);
  });
  f.trace.length=0;
  await assert.rejects(f.fast.relatedSources(f.fixture.sourceA,20),code('capacity'));
  const batches=wireReads(f.trace);
  assert.ok(batches.length>0);
  assert.ok(batches.length<Math.ceil((count+f.ids.length)/512),'capacity must reject while streaming, not after loading every vector batch');
  assert.ok(batches.flatMap(batch=>batch.parameters).length<count+f.ids.length);
});

test('native concurrent cold reads admit one heavy builder and reject the follower before embedding hydration', async t => {
  const f = await setup(t), id = f.fixture.sourceA;
  const expected = await f.oracle.relatedSources(id, 20);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  // PGlite has one connection. Keep one real MVCC snapshot open and let both
  // logical facade calls independently read its header/evidence. Gate before
  // the embedding query reaches the connection, so the follower can proceed.
  await f.database.transaction(async tx => {
    let embeddingLoads = 0;
    const connection = { dialect: 'pg', async query(sql, parameters) {
      if (sql.startsWith('SET TRANSACTION ISOLATION')) return { rows: [] };
      if (sql.includes('array_send(values_double)')) {
        embeddingLoads++;
        if (embeddingLoads === 1) { entered(); await gate; }
      }
      return tx.query(sql, parameters);
    } };
    const reads = createCanonicalV4ReadFacade({ database: { query: connection.query,
      transaction: work => work(connection) } });
    const first = reads.relatedSources(id, 20);
    let firstResult;
    try {
      await started;
      await assert.rejects(reads.relatedSources(id, 20), code('capacity'));
      assert.equal(embeddingLoads, 1, 'follower cannot hydrate a second embedding batch');
    } finally { release(); firstResult = await first; }
    assert.deepEqual(firstResult, expected);
    assert.deepEqual(await reads.relatedSources(id, 20), expected);
    assert.equal(embeddingLoads, 1, 'admission rejection must not poison the newly published view');
  });
});

test('native Related cache matches exhaustive oracle, does not refetch warm/post-only vectors and repairs one exact row', async t => {
  const f = await setup(t), id = f.fixture.sourceA;
  const expected = await f.oracle.relatedSources(id, 20);
  assert.deepEqual(await f.fast.relatedSources(id, 20), expected);
  assert.equal(wireReads(f.trace).length, 1);
  f.trace.length = 0;
  assert.deepEqual(await f.fast.relatedSources(id, 20), expected);
  assert.equal(wireReads(f.trace).length, 0);
  await f.database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1');
  assert.deepEqual(await f.fast.relatedSources(id, 20), await f.oracle.relatedSources(id, 20));
  assert.equal(wireReads(f.trace).length, 0);
  await f.database.query(`UPDATE canonical_v4.sources SET title='Changed title',
    payload=jsonb_set(payload::jsonb,'{title}',to_jsonb('Changed title'::text))::text WHERE id=$1`, [f.fixture.sourceB]);
  assert.deepEqual(await f.fast.relatedSources(id, 20), await f.oracle.relatedSources(id, 20));
  const changed = wireReads(f.trace);
  assert.equal(changed.length, 1);
  assert.deepEqual(changed[0].parameters, [f.fixture.sourceB]);
});

test('native Related rechecks excluded Source/embedding/link/membership/receipt corruption without a revision advance', async t => {
  const f = await setup(t), selected = f.fixture.sourceA, excluded = f.fixture.historicalSource;
  const cases = [
    [`UPDATE canonical_v4.sources SET title='Forged mirror' WHERE id=$1`,
      `UPDATE canonical_v4.sources SET title=payload::jsonb->>'title' WHERE id=$1`],
    [`UPDATE canonical_v4.embeddings SET values_double[1]=0.9 WHERE source_id=$1`,
      `UPDATE canonical_v4.embeddings SET values_double=ARRAY(SELECT jsonb_array_elements_text(payload::jsonb->'values')::float8) WHERE source_id=$1`],
    [`UPDATE canonical_v4.source_links SET method='forged' WHERE source_id=$1`,
      `UPDATE canonical_v4.source_links SET method=payload::jsonb->>'method' WHERE source_id=$1`],
    [`UPDATE canonical_v4.topic_memberships SET ordinal=1 WHERE source_id=$1`,
      `UPDATE canonical_v4.topic_memberships SET ordinal=0 WHERE source_id=$1`],
    [`UPDATE canonical_v4.operation_receipts SET operation_digest='${'1'.repeat(64)}' WHERE source_id=$1`,
      `UPDATE canonical_v4.operation_receipts SET operation_digest='${'0'.repeat(64)}' WHERE source_id=$1`],
  ];
  for (const [damage, restore] of cases) {
    assert.deepEqual(await f.fast.relatedSources(selected, 20), await f.oracle.relatedSources(selected, 20));
    await f.database.query(damage, [excluded]);
    await assert.rejects(f.oracle.relatedSources(selected, 20), code('storage-corrupt'), damage);
    await assert.rejects(f.fast.relatedSources(selected, 20), code('storage-corrupt'), damage);
    await f.database.query(restore, [excluded]);
    f.trace.length = 0;
    assert.deepEqual(await f.fast.relatedSources(selected, 20), await f.oracle.relatedSources(selected, 20));
    assert.equal(wireReads(f.trace).length, 1);
    assert.equal(wireReads(f.trace)[0].parameters.length, 3, 'failed partial repair must not publish a complete view');
  }
});

test('native Related invalidates unsafe age, horizon, server and relation witnesses and unknown lookups cannot poison reuse', async t => {
  const f = await setup(t), id = f.fixture.sourceA;
  const expected = await f.oracle.relatedSources(id, 20);
  assert.deepEqual(await f.fast.relatedSources(id, 20), expected);
  await assert.rejects(f.fast.relatedSources('unknown-source', 20), code('not-found'));
  f.trace.length = 0;
  assert.deepEqual(await f.fast.relatedSources(id, 20), expected);
  assert.equal(wireReads(f.trace).length, 0);
  for (const mutate of [row => ({ ...row, min_age: '0' }), row => ({ ...row, max_age: '1000000000' }),
    row => ({ ...row, horizon: `${BigInt(row.horizon) + 1000000000n}` }),
    row => ({ ...row, server_identity: `${row.server_identity}-restart` }),
    row => ({ ...row, relations: row.relations.replace(/:\d+/u, ':999999') })]) {
    f.controls.evidence = mutate; f.trace.length = 0;
    assert.deepEqual(await f.fast.relatedSources(id, 20), expected);
    assert.equal(wireReads(f.trace).length, 1);
    assert.equal(wireReads(f.trace)[0].parameters.length, 3);
    f.controls.evidence = null;
    await f.fast.relatedSources(id, 20);
  }
});

test('native nested Insight bundle keeps ADR-124 canonical Related closure identical before and after warming', async t => {
  const f = await setup(t), sourceId = f.fixture.sourceA, topicId = f.fixture.topicA;
  const input = { sourceId, topicId, includeRelatedSources: true, includeDiscussion: true, destinationTopicId: null };
  const expected = await f.oracle.insightBundle(input);
  assert.deepEqual(await f.fast.insightBundle(input), expected);
  f.trace.length = 0;
  assert.deepEqual(await f.fast.insightBundle(input), expected);
  assert.equal(wireReads(f.trace).length, 0);
});

test('native Related rejects signed-zero drift after warming even for a below-floor embedding', async t => {
  const f = await setup(t), id = f.fixture.sourceA, excluded = f.fixture.historicalSource;
  assert.deepEqual(await f.fast.relatedSources(id, 20), await f.oracle.relatedSources(id, 20));
  await f.database.query(`UPDATE canonical_v4.embeddings SET values_double[3]='-0'::float8 WHERE source_id=$1`, [excluded]);
  await assert.rejects(f.fast.relatedSources(id, 20), code('storage-corrupt'));
  await assert.rejects(f.oracle.relatedSources(id, 20), code('storage-corrupt'));
});

test('native Related mirrors additions, deletions, model and extractor ineligibility with only affected embedding loads', async t => {
  const f = await setup(t), id = f.fixture.sourceA, changedId = f.fixture.sourceB;
  await f.fast.relatedSources(id, 20);
  async function parity(expectedIds) {
    f.trace.length = 0;
    assert.deepEqual(await f.fast.relatedSources(id, 20), await f.oracle.relatedSources(id, 20));
    assert.deepEqual(wireReads(f.trace).flatMap(row => row.parameters), expectedIds);
  }
  await f.database.query(`UPDATE canonical_v4.embeddings SET model_id='synthetic-incompatible-model',
    payload=jsonb_set(payload::jsonb,'{modelId}',to_jsonb('synthetic-incompatible-model'::text))::text WHERE source_id=$1`, [changedId]);
  await parity([changedId]);
  await f.database.query(`UPDATE canonical_v4.embeddings SET model_id=$2,
    payload=jsonb_set(payload::jsonb,'{modelId}',to_jsonb($2::text))::text WHERE source_id=$1`, [changedId, BROWSER_MODEL_ID]);
  await parity([changedId]);
  await f.database.query(`UPDATE canonical_v4.sources SET extractor_version='synthetic-incompatible-extractor',
    payload=jsonb_set(payload::jsonb,'{extractorVersion}',to_jsonb('synthetic-incompatible-extractor'::text))::text WHERE id=$1`, [changedId]);
  await parity([changedId]);
  await f.database.query(`UPDATE canonical_v4.sources SET extractor_version='main-text-prefix/v1',
    payload=jsonb_set(payload::jsonb,'{extractorVersion}',to_jsonb('main-text-prefix/v1'::text))::text WHERE id=$1`, [changedId]);
  await parity([changedId]);
  const added = 'source-added-cache';
  await f.database.transaction(async tx => {
    await tx.query(`INSERT INTO canonical_v4.id_registry VALUES($1,'sources')`, [added]);
    await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,
      policy_version,operation_id,has_embedding)
      SELECT $2,3,(payload::jsonb || jsonb_build_object('id',$2::text,'url','https://example.org/added-cache',
        'operationId','operation-added-cache'))::text,'https://example.org/added-cache',title,provenance,
        extractor_version,policy_version,'operation-added-cache',has_embedding FROM canonical_v4.sources WHERE id=$1`,
    [changedId, added]);
    await tx.query(`INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double)
      SELECT $2,payload,model_id,dimensions,values_double FROM canonical_v4.embeddings WHERE source_id=$1`, [changedId, added]);
    await tx.query(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
      SELECT $2,topic_id,3,jsonb_set(payload::jsonb,'{sourceId}',to_jsonb($2::text))::text,method
      FROM canonical_v4.source_links WHERE source_id=$1`, [changedId, added]);
    await tx.query(`INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT $2,topic_id,ordinal FROM canonical_v4.topic_memberships WHERE source_id=$1`, [changedId, added]);
    await tx.query(`INSERT INTO canonical_v4.operation_receipts VALUES($1,'operation-added-cache',$2)`, [added, '0'.repeat(64)]);
  });
  await parity([added]);
  await f.database.transaction(async tx => {
    for (const table of ['embeddings', 'operation_receipts', 'topic_memberships', 'source_links'])
      await tx.query(`DELETE FROM canonical_v4.${table} WHERE source_id=$1`, [added]);
    await tx.query(`DELETE FROM canonical_v4.sources WHERE id=$1`, [added]);
    await tx.query(`DELETE FROM canonical_v4.id_registry WHERE id=$1`, [added]);
  });
  await parity([]);
});

test('native Related rejects inherited tuple relations before publishing any catalog view', async t => {
  const f = await setup(t), id = f.fixture.sourceA;
  await f.fast.relatedSources(id, 20);
  await f.database.transaction(async tx => {
    await tx.query(`CREATE TABLE canonical_v4.cache_test_source_child () INHERITS (canonical_v4.sources)`);
    await tx.query(`INSERT INTO canonical_v4.cache_test_source_child
      SELECT 'inherited-source',3,jsonb_set(payload::jsonb,'{id}',to_jsonb('inherited-source'::text))::text,
        url,title,provenance,extractor_version,policy_version,operation_id,has_embedding,write_version
      FROM canonical_v4.sources WHERE id=$1`, [f.fixture.sourceB]);
  });
  await assert.rejects(f.fast.relatedSources(id, 20), code('storage-corrupt'));
});

test('native Related expires the fixed five-minute baseline and rejects reuse across canonical generations', async t => {
  const f = await setup(t), id = f.fixture.sourceA;
  let clock = 1000;
  t.mock.method(performance, 'now', () => clock);
  assert.deepEqual(await f.fast.relatedSources(id, 20), await f.oracle.relatedSources(id, 20));
  f.trace.length = 0; clock += 100;
  await f.fast.relatedSources(id, 20);
  assert.equal(wireReads(f.trace).length, 0);
  f.trace.length = 0; clock += 300001;
  assert.deepEqual(await f.fast.relatedSources(id, 20), await f.oracle.relatedSources(id, 20));
  assert.equal(wireReads(f.trace).length, 1);
  assert.equal(wireReads(f.trace)[0].parameters.length, 3);
  // A different canonical generation is installed by replacing a database, not
  // mutating its immutable import receipt. Simulate that trusted dependency
  // transition after real SQL executes; never disable the immutability guard.
  f.controls.generation = 'synthetic-next-cache-generation';
  f.trace.length = 0;
  const expected = await f.oracle.relatedSources(id, 20);
  assert.deepEqual(await f.fast.relatedSources(id, 20), { ...expected,
    version: { ...expected.version, generation: f.controls.generation } });
  assert.equal(wireReads(f.trace).length, 1);
  assert.equal(wireReads(f.trace)[0].parameters.length, 3);
});

test('native Related fully revalidates own-transaction tuples instead of trusting age-zero evidence', async t => {
  const f = await setup(t), id = f.fixture.sourceA;
  await f.database.transaction(async tx => {
    const statements = [];
    const wrapper = { dialect: 'pg', async query(sql, parameters) {
      statements.push({ sql, parameters });
      return sql.startsWith('SET TRANSACTION ISOLATION') ? { rows: [] } : tx.query(sql, parameters);
    } };
    const fast = createCanonicalV4ReadFacade({ database: { query: wrapper.query,
      transaction: work => work(wrapper) } });
    await tx.query(`UPDATE canonical_v4.sources SET write_version=write_version+1 WHERE id=$1`, [id]);
    await fast.relatedSources(id, 20);
    statements.length = 0;
    await fast.relatedSources(id, 20);
    assert.equal(wireReads(statements).length, 1);
    assert.equal(wireReads(statements)[0].parameters.length, 3);
    await tx.query(`UPDATE canonical_v4.sources SET title='Same transaction corrupt mirror' WHERE id=$1`,
      [f.fixture.historicalSource]);
    await assert.rejects(fast.relatedSources(id, 20), code('storage-corrupt'));
  });
});

test('native Related invalidates a real PostgreSQL heap rewrite even when the logical catalog is identical', async t => {
  const f = await setup(t), id = f.fixture.sourceA;
  const expected = await f.oracle.relatedSources(id, 20);
  assert.deepEqual(await f.fast.relatedSources(id, 20), expected);
  await f.database.query('VACUUM FULL canonical_v4.embeddings');
  f.trace.length = 0;
  assert.deepEqual(await f.fast.relatedSources(id, 20), expected);
  assert.equal(wireReads(f.trace).length, 1);
  assert.equal(wireReads(f.trace)[0].parameters.length, 3);
});

test('native chunk merge equals the global oracle at small limits with normalized duplicate URLs across chunk cuts', async t => {
  const f = await setup(t), original = f.fixture.sourceB;
  const originalUrl = (await f.database.query('SELECT url FROM canonical_v4.sources WHERE id=$1', [original])).rows[0].url;
  await f.database.transaction(async tx => {
    for (const [id, ordinal, url] of [
      ['cache-copy-001', 256, `${originalUrl}#one`], ['cache-copy-002', 257, `${originalUrl}#two`],
      ['cache-copy-003', 258, 'https://example.org/cross-chunk-one'],
      ['cache-copy-004', 512, 'https://example.org/cross-chunk-one#two'],
      ['cache-copy-005', 513, 'https://example.org/cross-chunk-two'],
    ]) {
      const operation = `operation-${id}`;
      await tx.query(`INSERT INTO canonical_v4.id_registry VALUES($1,'sources')`, [id]);
      await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,
        policy_version,operation_id,has_embedding)
        SELECT $2,$3,(payload::jsonb || jsonb_build_object('id',$2::text,'url',$4::text,'operationId',$5::text))::text,
          $4,title,provenance,extractor_version,policy_version,$5,has_embedding FROM canonical_v4.sources WHERE id=$1`,
      [original, id, ordinal, url, operation]);
      await tx.query(`INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double)
        SELECT $2,payload,model_id,dimensions,values_double FROM canonical_v4.embeddings WHERE source_id=$1`, [original, id]);
      await tx.query(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
        SELECT $2,topic_id,$3,jsonb_set(payload::jsonb,'{sourceId}',to_jsonb($2::text))::text,method
        FROM canonical_v4.source_links WHERE source_id=$1`, [original, id, ordinal]);
      await tx.query(`INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
        SELECT $2,topic_id,ordinal FROM canonical_v4.topic_memberships WHERE source_id=$1`, [original, id]);
      await tx.query(`INSERT INTO canonical_v4.operation_receipts VALUES($1,$2,$3)`, [id, operation, '0'.repeat(64)]);
    }
  });
  for (const limit of [1, 2, 3, 20])
    assert.deepEqual(await f.fast.relatedSources(f.fixture.sourceA, limit), await f.oracle.relatedSources(f.fixture.sourceA, limit));
});
