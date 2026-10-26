import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { migrateCanonicalV4, readCanonicalV4MigrationManifest } from '../canonical-v4/index.js';
import { seedCanonicalV4RuntimeFixture, RUNTIME_FIXTURE_STAMP } from './canonical-v4-runtime-fixture.js';
import { RIDGE_PARAMETER_SHA256 } from '../../src/domain/ridge-topic-adapter.js';
import { createCanonicalV4IngestionRepository } from '../canonical-v4/ingestion-repository.js';
import { createCanonicalV4RuntimeRepository } from '../canonical-v4/runtime-repository.js';
import { createCanonicalV4LifecycleRepository } from '../canonical-v4/lifecycle-repository.js';

const FLOOR = .8639003810829322;
const unit = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
function adjacent(value, step) {
  const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value);
  bytes.writeBigUInt64BE(bytes.readBigUInt64BE() + BigInt(step)); return bytes.readDoubleBE();
}
const withFirst = first => [first, Math.sqrt(1 - first * first), ...Array(382).fill(0)];
function randomUnit(seed) {
  let state = seed;
  const values = Array.from({ length: 384 }, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0xffffffff - .5; });
  const norm = Math.hypot(...values); return values.map(value => value / norm);
}

test('migration007 retains exact exhaustive binary64 Ridge decisions, all corruption checks and role boundaries',
  { timeout: 60000 }, async t => {
    const database = await createPGliteDatabase(); t.after(() => database.close());
    for (const role of ['murmingle_app', 'murmingle_crawler_submitter', 'murmingle_ingest_worker'])
      await database.query(`CREATE ROLE ${role}`);
    const fixture = await seedCanonicalV4RuntimeFixture(database), manifest = await readCanonicalV4MigrationManifest();
    assert.equal(manifest.length, 9);
    assert.doesNotMatch(manifest[6].sql, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE|DROP|CREATE\s+TABLE|ALTER\s+TABLE)\b/iu);
    assert.equal((await createCanonicalV4IngestionRepository({ database }).health()).schemaVersion, 9);
    assert.equal((await createCanonicalV4RuntimeRepository({ database, nextId: () => 'unused', now: () => RUNTIME_FIXTURE_STAMP }).health()).schemaVersion, 9);
    assert.equal((await createCanonicalV4LifecycleRepository({ database, nextId: () => 'unused', now: () => RUNTIME_FIXTURE_STAMP }).health()).schemaVersion, 9);
    assert.equal((await migrateCanonicalV4(database)).schemaVersion, 9);

    // Independently preserve the previous migration's exact function body as a
    // synthetic oracle; never change the checked historical migration hashes.
    const oldDefinition = manifest[3].sql.match(/CREATE FUNCTION canonical_v4\.ingest_ridge_scan\([\s\S]*?\$ingest_ridge_scan\$;/u)?.[0];
    assert.ok(oldDefinition);
    await database.query(oldDefinition.replace('CREATE FUNCTION canonical_v4.ingest_ridge_scan(',
      'CREATE FUNCTION canonical_v4.test_legacy_ridge_scan('));
    const scan = (name, candidate, parameter = RIDGE_PARAMETER_SHA256) => database.query(`SELECT topic_id,
      encode(float8send(similarity),'hex') AS binary64 FROM canonical_v4.${name}($1::float8[],$2)`, [candidate, parameter]);
    assert.deepEqual((await scan('ingest_ridge_scan', unit(0))).rows, []);
    await database.query(`UPDATE canonical_v4.topics SET payload=jsonb_set(payload::jsonb,'{reference}','null'::jsonb)::text
      WHERE id=$1`, [fixture.topicA]);
    await database.query(`INSERT INTO canonical_v4.fixed_references(topic_id,payload) VALUES($1,'null')`, [fixture.topicA]);
    const references = [unit(0), withFirst(adjacent(FLOOR, -1)), withFirst(FLOOR), withFirst(adjacent(FLOOR, 1)),
      unit(Math.PI), unit(Math.PI / 2), ...Array.from({ length: 20 }, (_, index) => randomUnit(index + 10))];
    for (const [index, values] of references.entries()) {
      const id = `topic-scan-${String(index).padStart(3, '0')}`;
      const reference = { sourceId: fixture.sourceA, parameterSha256: RIDGE_PARAMETER_SHA256, values };
      const topic = { id, kind: 'general', title: `Synthetic scan ${index}`, createdAt: RUNTIME_FIXTURE_STAMP, reference };
      await database.query(`INSERT INTO canonical_v4.id_registry VALUES($1,'topics')`, [id]);
      await database.query(`INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at)
        VALUES($1,$2,$3,'general',$4,$5)`, [id, index + 2, JSON.stringify(topic), topic.title, topic.createdAt]);
      await database.query(`INSERT INTO canonical_v4.fixed_references(topic_id,payload,source_id,parameter_sha256,values_double)
        VALUES($1,$2,$3,$4,$5)`, [id, JSON.stringify(reference), fixture.sourceA, RIDGE_PARAMETER_SHA256, values]);
    }
    for (const candidate of [unit(0), unit(.05), unit(-.7), unit(Math.PI), ...Array.from({ length: 8 }, (_, index) => randomUnit(index + 1))]) {
      const old = await scan('test_legacy_ridge_scan', candidate), current = await scan('ingest_ridge_scan', candidate);
      assert.deepEqual(current.rows, old.rows);
    }
    const inclusive = (await scan('ingest_ridge_scan', unit(0))).rows.map(row => row.topic_id);
    assert.equal(inclusive.includes('topic-scan-001'), false);
    assert.equal(inclusive.includes('topic-scan-002'), true);
    assert.equal(inclusive.includes('topic-scan-003'), true);

    for (const functionName of ['test_legacy_ridge_scan', 'ingest_ridge_scan']) {
      await assert.rejects(scan(functionName, unit(0), '0'.repeat(64)), error => error.code === 'P1203');
      for (const vectorSql of [
        'NULL::float8[]', 'array_fill(0::float8,ARRAY[384])', 'array_fill(0::float8,ARRAY[383])',
        'array_fill(0::float8,ARRAY[384],ARRAY[0])', 'array_fill(0::float8,ARRAY[1,384])',
        `ARRAY['NaN'::float8] || array_fill(0::float8,ARRAY[383])`,
        `ARRAY['Infinity'::float8] || array_fill(0::float8,ARRAY[383])`,
        `ARRAY[1::float8,NULL::float8] || array_fill(0::float8,ARRAY[382])`,
      ]) await assert.rejects(database.query(`SELECT * FROM canonical_v4.${functionName}(${vectorSql},$1)`,
        [RIDGE_PARAMETER_SHA256]), error => error.code === 'P1203');
    }
    // The corrupt row sorts after valid hits. No earlier RETURN NEXT may leak
    // a partial accepted result when any exhaustive reference proof fails.
    await database.query(`UPDATE canonical_v4.fixed_references SET parameter_sha256=$1 WHERE topic_id='topic-scan-025'`, ['0'.repeat(64)]);
    for (const name of ['test_legacy_ridge_scan', 'ingest_ridge_scan'])
      await assert.rejects(scan(name, unit(0)), error => error.code === 'P1204');
    await database.query(`UPDATE canonical_v4.fixed_references SET parameter_sha256=$1,
      values_double=array_fill(0::float8,ARRAY[384]) WHERE topic_id='topic-scan-025'`, [RIDGE_PARAMETER_SHA256]);
    for (const name of ['test_legacy_ridge_scan', 'ingest_ridge_scan'])
      await assert.rejects(scan(name, unit(0)), error => error.code === 'P1204');

    const permissions = (await database.query(`SELECT p.prosecdef,p.provolatile,p.proconfig,
      has_function_privilege('public',p.oid,'EXECUTE') AS public_execute,
      has_function_privilege('murmingle_app',p.oid,'EXECUTE') AS app_execute,
      has_function_privilege('murmingle_crawler_submitter',p.oid,'EXECUTE') AS crawler_execute,
      has_function_privilege('murmingle_ingest_worker',p.oid,'EXECUTE') AS worker_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='canonical_v4' AND p.proname='ingest_ridge_scan'`)).rows;
    assert.deepEqual(permissions, [{ prosecdef: true, provolatile: 's', proconfig: ['search_path=pg_catalog'],
      public_execute: false, app_execute: false, crawler_execute: false, worker_execute: true }]);
  });
