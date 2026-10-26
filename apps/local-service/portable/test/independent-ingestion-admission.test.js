import test from 'node:test';
import assert from 'node:assert/strict';
import { createPGliteDatabase } from '../src/database.js';
import { readCanonicalV4MigrationManifest } from '../canonical-v4/index.js';
import { createCanonicalV4IngestionRepository } from '../canonical-v4/ingestion-repository.js';
import { seedCanonicalV4RuntimeFixture } from './canonical-v4-runtime-fixture.js';
import { BROWSER_MODEL_ID } from '../../src/domain/learned-sources.js';

const unit = [1, ...Array(383).fill(0)];
const request = (fixture, id, url = `https://example.org/admission/${id}`) => ({
  expected: { generation: fixture.generation, revision: fixture.revision },
  operationId: id, url, title: `Synthetic ${id}`,
  embedding: { modelId: BROWSER_MODEL_ID, values: unit }, extractorVersion: 'main-text-prefix/v1',
});

test('independent new admission retains coherent lane proof, replay and Source erasure fences', async t => {
  const database = await createPGliteDatabase(); t.after(() => database.close());
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  const repository = createCanonicalV4IngestionRepository({ database });
  const options = { authorityToken: 'authority-independent-admission', authoritySeconds: 30 };
  const first = request(fixture, 'operation-active');
  await repository.enqueueInteractive(first, options);
  const claim = await repository.claim({ workerId: 'worker-independent', leaseToken: 'lease-independent' });
  assert.equal(claim.operationId, first.operationId);
  const before = (await database.query('SELECT * FROM canonical_v4.catalog_ingest_lane')).rows;
  const fresh = await repository.enqueueCrawler(request(fixture, 'operation-new'), options);
  assert.equal(fresh.state, 'pending'); assert.equal(fresh.replayed, false);
  assert.deepEqual((await database.query('SELECT * FROM canonical_v4.catalog_ingest_lane')).rows, before,
    'fresh admission never changes the running matcher lane or its lease');
  const replay = await repository.enqueueInteractive(first, options);
  assert.equal(replay.state, 'leased'); assert.equal(replay.replayed, true);
  await assert.rejects(repository.enqueueInteractive({ ...first, title: 'Forged operation bytes' }, options), { code: 'conflict' });
  await assert.rejects(repository.enqueueInteractive(request(fixture, 'operation-duplicate-url', first.url), options), { code: 'conflict' });

  // Every statement sees the lane and its leased row together; an unmatched
  // lease is still corruption rather than permission to enqueue more work.
  await database.query("UPDATE canonical_v4.catalog_ingest_lane SET active_lease_token='corrupt-lease' WHERE singleton=true");
  await assert.rejects(repository.enqueueCrawler(request(fixture, 'operation-corrupt-lane'), options), { code: 'storage-corrupt' });
  await database.query('UPDATE canonical_v4.catalog_ingest_lane SET active_lease_token=$1 WHERE singleton=true', [claim.leaseToken]);

  // Selected Source/catalog witnesses still reject a page changed since the
  // client's read. A forgotten URL likewise cannot be resurrected by old intent.
  const sourceUrl = (await database.query('SELECT url FROM canonical_v4.sources WHERE id=$1', [fixture.sourceB])).rows[0].url;
  await database.query(`UPDATE canonical_v4.sources SET provenance='owner-local-page-embedding/v1',
    payload=jsonb_set(payload::jsonb,'{provenance}','"owner-local-page-embedding/v1"'::jsonb)::text WHERE id=$1`, [fixture.sourceB]);
  await database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1 WHERE singleton=true');
  await database.query('UPDATE canonical_v4.runtime_source_stamps SET catalog_revision=$1 WHERE source_id=$2', [fixture.revision + 1, fixture.sourceB]);
  await assert.rejects(repository.enqueueInteractive(request(fixture, 'operation-stale-source', sourceUrl), options), { code: 'conflict' });
  for (const table of ['topic_memberships', 'source_links', 'runtime_source_stamps'])
    await database.query(`DELETE FROM canonical_v4.${table} WHERE source_id=$1`, [fixture.sourceB]);
  await database.query('DELETE FROM canonical_v4.sources WHERE id=$1', [fixture.sourceB]);
  await database.query('UPDATE canonical_v4.runtime_state SET revision=revision+1,source_absence_revision=revision+1 WHERE singleton=true');
  await assert.rejects(repository.enqueueInteractive(request(fixture, 'operation-forgotten-source', sourceUrl), options), { code: 'conflict' });
  assert.equal((await repository.enqueueInteractive({ ...request(fixture, 'operation-current-absence', sourceUrl),
    expected: { generation: fixture.generation, revision: fixture.revision + 2 } }, options)).state, 'pending');

  const manifest = await readCanonicalV4MigrationManifest(), sql = manifest[7].sql;
  assert.equal(manifest.length, 9);
  assert.match(sql, /pg_advisory_xact_lock\(914092008,1\)/u);
  assert.match(sql, /WHERE singleton=true FOR SHARE/u);
  assert.doesNotMatch(sql, /\b(?:CREATE\s+TABLE|ALTER\s+TABLE|DROP|GRANT)\b/u);
  // Preserve the entire old lane/replay/repair region verbatim. Only its old
  // absent-operation insertion is replaced by the separately serialized path.
  const old = manifest[4].sql;
  const from = '  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane';
  const until = '  IF p_expected_revision > runtime.revision THEN';
  assert.equal(sql.slice(sql.indexOf(from), sql.indexOf('  -- A previously observed operation')),
    old.slice(old.indexOf(from), old.indexOf(until)));
});
