import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createCanonicalV4IngestionRepository } from '../canonical-v4/ingestion-repository.js';
import { seedCanonicalV4RuntimeFixture } from '../test/canonical-v4-runtime-fixture.js';
import { BROWSER_MODEL_ID } from '../../src/domain/learned-sources.js';

// Explicitly provisioned disposable database only. This function must never be
// run against a live canonical store; it installs synthetic state and jobs.
export async function runIndependentIngestionNativeCheck(database) {
  const name = (await database.query('SELECT current_database() AS name')).rows[0].name;
  assert.match(name, /^murmingle_adr126_ingestion_test_20261018(?:_[a-z0-9]+)?$/u);
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  const repository = createCanonicalV4IngestionRepository({ database });
  const request = id => ({ expected: { generation: fixture.generation, revision: fixture.revision },
    operationId: id, url: `https://example.org/native-admission/${id}`, title: `Synthetic ${id}`,
    embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] },
    extractorVersion: 'main-text-prefix/v1' });
  const options = { authorityToken: 'authority-native-admission', authoritySeconds: 30 };
  const active = request('operation-native-active');
  await repository.enqueueCrawler(active, options);
  const claim = await repository.claim({ workerId: 'worker-native-admission', leaseToken: 'lease-native-admission', leaseSeconds: 30 });
  let release, markHeld, rejectHeld;
  const gate = new Promise(resolve => { release = resolve; });
  const held = new Promise((resolve, reject) => { markHeld = resolve; rejectHeld = reject; });
  let lanePid;
  const holder = database.transaction(async tx => {
    lanePid = Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await tx.query('SELECT 1 FROM canonical_v4.catalog_ingest_lane WHERE singleton=true FOR UPDATE');
    markHeld(); await gate;
  });
  holder.catch(rejectHeld);
  let replay;
  let milliseconds;
  try {
    await held;
    const started = performance.now();
    const fresh = await repository.enqueueInteractive(request('operation-native-fresh'), options);
    milliseconds = Math.round(performance.now() - started);
    assert.equal(fresh.state, 'pending'); assert.equal(fresh.replayed, false);
    assert.ok(milliseconds < 5000, 'fresh admission must finish while the worker lane remains held');
    replay = repository.enqueueCrawler(active, options);
    // Observe the exact blocked backend, not a timing assumption that the
    // replay has reached its legacy lane-lock statement.
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = (await database.query(`SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid))`, [lanePid])).rows;
      if (rows.length) { blocked = true; break; }
      await delay(10);
    }
    assert.equal(blocked, true, 'existing replay retains the worker lane fence');
  } finally { release(); await holder; }
  assert.equal((await replay).replayed, true);

  // Concurrent queue growth is serialized independently of matcher execution.
  const admissions = await Promise.allSettled(Array.from({ length: 12 }, (_, index) =>
    repository.enqueueInteractive(request(`operation-native-capacity-${index}`), options)));
  assert.equal(admissions.filter(result => result.status === 'fulfilled').length, 7);
  for (const result of admissions.filter(result => result.status === 'rejected'))
    assert.equal(result.reason.code, 'capacity');
  assert.equal(Number((await database.query(`SELECT count(*) AS count FROM canonical_v4.ingestion_jobs
    WHERE job_class='interactive' AND state IN ('pending','leased')`)).rows[0].count), 8);
  const raced = await Promise.all([
    repository.enqueueCrawler(request('operation-native-identical-race'), options),
    repository.enqueueCrawler(request('operation-native-identical-race'), options),
  ]);
  assert.equal(raced.filter(result => !result.replayed).length, 1);
  assert.equal(raced.filter(result => result.replayed).length, 1);
  const outcome = await repository.apply(claim, { representedValues: [1, ...Array(383).fill(0)] });
  const staleChange = { ...request('operation-native-stale-change'), url: active.url };
  await assert.rejects(repository.enqueueCrawler(staleChange, options), { code: 'conflict' });
  const revision = Number((await database.query('SELECT revision FROM canonical_v4.runtime_state WHERE singleton=true')).rows[0].revision);
  const currentChange = { ...staleChange, expected: { generation: fixture.generation, revision } };
  const acceptedChange = await repository.enqueueCrawler(currentChange, options);
  assert.equal(acceptedChange.state, 'pending');
  await repository.revokeAuthority({ operationId: currentChange.operationId,
    operationDigest: acceptedChange.operationDigest, authorityToken: options.authorityToken });
  await repository.lifecycle({ generation: fixture.generation, revision }, { type: 'forget-source', sourceId: outcome.sourceId });
  await assert.rejects(repository.enqueueCrawler(active, options), { code: 'conflict' },
    'erased receipt/job cannot resurrect the original stale operation');
  return Object.freeze({ schemaVersion: (await repository.health()).schemaVersion,
    freshAdmissionMilliseconds: milliseconds, laneHeldFreshAdmission: true,
    legacyReplayBlockedUntilRelease: true, concurrentCapacityBound: true, exactOperationRace: true,
    sourceChangeFence: true, erasurePreventsReplay: true });
}
