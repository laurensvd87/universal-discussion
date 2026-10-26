import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { readCanonicalV4MigrationManifest } from '../canonical-v4/index.js';
import { createCanonicalV4IngestionRepository } from '../canonical-v4/ingestion-repository.js';
import { seedCanonicalV4RuntimeFixture } from '../test/canonical-v4-runtime-fixture.js';
import { BROWSER_MODEL_ID } from '../../src/domain/learned-sources.js';

export async function runFailFastIngestionNativeCheck(database) {
  assert.match((await database.query('SELECT current_database() AS name')).rows[0].name,
    /^murmingle_adr126_ingestion_test_20261018(?:_[a-z0-9]+)?$/u);
  const fixture = await seedCanonicalV4RuntimeFixture(database);
  const manifest = await readCanonicalV4MigrationManifest();
  assert.equal(manifest.length, 9);
  const repository = createCanonicalV4IngestionRepository({ database });
  const sourceUrl = (await database.query('SELECT url FROM canonical_v4.sources WHERE id=$1', [fixture.sourceB])).rows[0].url;
  await database.query(`UPDATE canonical_v4.sources SET provenance='owner-local-page-embedding/v1',
    payload=jsonb_set(payload::jsonb,'{provenance}','"owner-local-page-embedding/v1"'::jsonb)::text WHERE id=$1`, [fixture.sourceB]);
  const input = (id, url = `https://example.org/native-lock/${id}`) => ({
    expected: { generation: fixture.generation, revision: fixture.revision }, operationId: id, url, title: `Synthetic ${id}`,
    embedding: { modelId: BROWSER_MODEL_ID, values: [1, ...Array(383).fill(0)] }, extractorVersion: 'main-text-prefix/v1',
  });
  const options = { authorityToken: 'authority-native-lock', authoritySeconds: 30 };
  const active = await repository.enqueueCrawler(input('operation-lock-active', sourceUrl), options);
  await repository.claim({ workerId: 'worker-lock-native', leaseToken: 'lease-lock-native', leaseSeconds: 30 });
  async function blockedBy(pid) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = (await database.query(`SELECT pid FROM pg_stat_activity
        WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid))`, [pid])).rows;
      if (rows.length) return Number(rows[0].pid);
      await delay(10);
    }
    throw new Error('Expected exact native lock waiter missing');
  }
  async function whileLocked(statements, check) {
    let release, markHeld, rejectHeld;
    const gate = new Promise(resolve => { release = resolve; });
    const held = new Promise((resolve, reject) => { markHeld = resolve; rejectHeld = reject; });
    const holder = database.transaction(async tx => {
      const pid = Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      for (const [sql, parameters] of statements) await tx.query(sql, parameters);
      markHeld(pid); await gate;
    });
    holder.catch(rejectHeld);
    try { return await check(await held); }
    finally { release(); await holder; }
  }
  const sourceLock = ['SELECT 1 FROM canonical_v4.sources WHERE id=$1 FOR UPDATE', [fixture.sourceB]];
  const laneLock = ['SELECT 1 FROM canonical_v4.catalog_ingest_lane WHERE singleton=true FOR UPDATE', []];
  // Reproduce applied008 in this disposable database only. Both wait edges
  // must actually exist before release: Source holder -> duplicate -> new URL.
  await database.exec(manifest[7].sql);
  let duplicate, other;
  await whileLocked([laneLock, sourceLock], async holderPid => {
    duplicate = repository.enqueueCrawler(input('operation-old-duplicate', sourceUrl), options);
    duplicate.catch(() => {});
    const duplicatePid = await blockedBy(holderPid);
    other = repository.enqueueInteractive(input('operation-old-unrelated'), options);
    other.catch(() => {});
    await blockedBy(duplicatePid);
  });
  await assert.rejects(duplicate, { code: 'conflict' });
  assert.equal((await other).state, 'pending');
  await database.exec(manifest[8].sql);
  const timings = {};
  async function conflict(id, url = sourceUrl) {
    const started = performance.now();
    await assert.rejects(repository.enqueueCrawler(input(id, url), options), { code: 'conflict' });
    const milliseconds = Math.round(performance.now() - started);
    assert.ok(milliseconds < 1500, 'contended fresh intent must fail without waiting for the holder');
    timings[id] = milliseconds;
    assert.equal(Number((await database.query('SELECT count(*) AS count FROM canonical_v4.ingestion_jobs WHERE operation_id=$1', [id])).rows[0].count), 0);
  }
  await whileLocked([laneLock, sourceLock], async () => {
    await conflict('operation-new-duplicate');
    assert.equal((await repository.enqueueInteractive(input('operation-new-unrelated'), options)).state, 'pending');
  });
  await repository.revokeAuthority({ operationId: active.operationId, operationDigest: active.operationDigest,
    authorityToken: options.authorityToken });
  for (const [name, lock] of [['source', sourceLock], ['stamp',
    ['SELECT 1 FROM canonical_v4.runtime_source_stamps WHERE source_id=$1 FOR UPDATE', [fixture.sourceB]]]]) {
    await whileLocked([lock], async () => {
      await conflict(`operation-manual-${name}`);
      assert.equal((await repository.enqueueInteractive(input(`operation-unrelated-${name}`), options)).state, 'pending');
    });
  }
  await whileLocked([['SELECT 1 FROM canonical_v4.runtime_state WHERE singleton=true FOR UPDATE', []]], async () => {
    await conflict('operation-runtime-selected');
    await conflict('operation-runtime-unrelated', 'https://example.org/native-lock/runtime-unrelated');
  });
  assert.equal((await repository.enqueueInteractive(input('operation-after-runtime-release'), options)).state, 'pending');
  // Force the post-advisory recheck race: the first new operation is still
  // invisible while holding admission, so the identical second caller enters
  // the fresh path and waits. A third backend holds the legacy worker lane.
  // On first commit, the second must release admission before waiting there.
  let releaseFirst, markFirst, rejectFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const firstHeld = new Promise((resolve, reject) => { markFirst = resolve; rejectFirst = reject; });
  const raceInput = input('operation-raced-replay');
  let firstResult, racedReplay, releasedAdvisory = false;
  const firstTransaction = database.transaction(async tx => {
    const pid = Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    firstResult = await createCanonicalV4IngestionRepository({ database: tx }).enqueueCrawler(raceInput, options);
    markFirst(pid); await firstGate;
  });
  firstTransaction.catch(rejectFirst);
  try {
    const firstPid = await firstHeld;
    await whileLocked([laneLock], async lanePid => {
      racedReplay = repository.enqueueCrawler(raceInput, options); racedReplay.catch(() => {});
      await blockedBy(firstPid);
      releaseFirst(); await firstTransaction;
      const replayPid = await blockedBy(lanePid);
      const locks = (await database.query(`SELECT count(*)::integer AS count FROM pg_locks
        WHERE pid=$1 AND locktype='advisory' AND classid=914092008::oid AND objid=1::oid AND objsubid=2`, [replayPid])).rows[0].count;
      assert.equal(locks, 0, 'subtransaction rollback releases its xact advisory before legacy lane wait');
      releasedAdvisory = true;
      const started = performance.now();
      assert.equal((await repository.enqueueInteractive(input('operation-fourth-unrelated'), options)).state, 'pending');
      timings.racedReplayUnrelatedAdmission = Math.round(performance.now() - started);
      assert.ok(timings.racedReplayUnrelatedAdmission < 1500);
    });
    const replayResult = await racedReplay;
    assert.equal(replayResult.replayed, true); assert.equal(replayResult.ordinal, firstResult.ordinal);
  } finally { releaseFirst(); await firstTransaction; }
  return { schemaVersion: (await repository.health()).schemaVersion, old008SourceAdvisoryConvoyReproduced: true,
    earlySameUrlConflict: true, manualSourceAndStampNoConvoy: true, runtimeContentionFailsClosed: true,
    racedReplayReleasesSubtransactionAdvisory: releasedAdvisory, rejectedOperationsStored: 0, timings };
}
