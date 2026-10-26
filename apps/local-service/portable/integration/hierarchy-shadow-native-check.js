// INERT unless explicitly run with --run-isolated or --run-isolated-server.
// This is a native correctness rehearsal, never canonical/runtime activation.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createPgDatabase } from '../src/database.js';
import { createWindowsDpapiPasswordProvider } from '../src/windows-dpapi-password.js';
import { runWithIsolatedHierarchyShadowPostgres } from './hierarchy-shadow-isolated-postgres.js';
import { initializeHierarchyShadow, publishShadowHierarchy, registerShadowSourceWitness,
  commitShadowDecision, bindShadowRoot, deleteShadowSource, revokeShadowRevision,
  readShadowPath, readShadowParentRoots } from '../canonical-v4/experimental/hierarchy-shadow/repository.js';

// The existing loopback HBA deliberately allows only this reserved test DB.
// Never reuse an existing database, even if another test created it.
const SCRATCH_DATABASE = 'murmingle_v4_native_test';
const READ_DEADLINE_MS = 5_000;
const hash = digit => String(digit).repeat(64);
function identifier(name) {
  if (name !== SCRATCH_DATABASE || Buffer.byteLength(name) > 63)
    throw Error('Invalid isolated scratch identifier');
  return `"${name}"`;
}
function deadline(promise, milliseconds = READ_DEADLINE_MS) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(Error('Synthetic operation deadline'), { code: 'DEADLINE' })), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function deferred() {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => { resolvePromise = resolveValue; rejectPromise = rejectValue; });
  // The owner always awaits the promise. This also covers setup failure before
  // the held/started observer is reached, without an unhandled rejection.
  promise.catch(() => {});
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
const publication = (revision, expectedRevision) => ({ revision, expectedRevision,
  artifactHash: hash(1), modelHash: hash(2), policyHash: hash(3), nodes: [
    { id: 'games', parentId: null, label: 'Synthetic Games' },
    { id: 'gta', parentId: 'games', label: 'Synthetic GTA' },
    { id: 'nature', parentId: null, label: 'Synthetic Nature' }] });
const page = (db, overrides = {}) => readShadowParentRoots(db, { nodeId: 'games', expectedRevision: null,
  expectedFeedVersion: null, afterRootId: null, limit: 100, ...overrides });
async function job(db, sourceId, sourceInputHash = hash(4), revision = 'native-revision-1') {
  const registered = await registerShadowSourceWitness(db, { sourceId, sourceInputHash });
  return { revision, artifactHash: hash(1), modelHash: hash(2), policyHash: hash(3), sourceId,
    sourceInputHash, sourceWitnessVersion: registered.sourceWitnessVersion, nodeId: 'gta' };
}
const bind = (db, expected, canonicalRootId) => bindShadowRoot(db, { revision: expected.revision, nodeId: expected.nodeId,
  sourceId: expected.sourceId, sourceInputHash: expected.sourceInputHash, sourceWitnessVersion: expected.sourceWitnessVersion, canonicalRootId,
  canonicalDestinationId: 'synthetic-original-destination' });

async function syntheticChecks(database) {
  const before = (await database.query(`SELECT current_database() AS name,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN('pg_catalog','information_schema')) AS occupied`)).rows[0];
  identifier(before.name); assert.equal(before.occupied, false);
  await initializeHierarchyShadow(database);
  assert.equal((await database.query("SELECT to_regnamespace('canonical_v4') AS canonical")).rows[0].canonical, null);
  await publishShadowHierarchy(database, publication('native-revision-1', null));
  const primary = await job(database, 'synthetic-main-source');
  await commitShadowDecision(database, primary);
  await bind(database, primary, 'synthetic-root-a');
  await bind(database, primary, 'synthetic-root-b');
  const baseline = await page(database);
  assert.equal(baseline.rootRefs.length, 2);

  // Three scratch connections at most: held transaction, pending writer, reader.
  // The maintenance pool has one additional connection: total <=4, never >5.
  const preparedWriter = { ...await job(database, 'synthetic-blocked-writer'), nodeId: 'nature' };
  const held = deferred(), release = deferred(), writerStarted = deferred();
  const rollback = Error('Intentional synthetic lock-holder rollback');
  let holder, writer, writerSettled = false, blockedObserved = false, readerMilliseconds;
  try {
    holder = database.transaction(async tx => {
      const pid = Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await tx.query('SELECT 1 FROM hierarchy_shadow.state WHERE singleton FOR UPDATE');
      held.resolve(pid); await release.promise; throw rollback;
    }).catch(error => {
      if (error === rollback) return;
      held.reject(error); throw error;
    });
    holder.catch(() => {});
    const holderPid = await deadline(held.promise);
    writer = database.transaction(async tx => {
      const writerPid = Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      writerStarted.resolve(writerPid);
      return commitShadowDecision(tx, preparedWriter);
    });
    writer.then(() => { writerSettled = true; }, error => { writerSettled = true; writerStarted.reject(error); });
    const writerPid = await deadline(writerStarted.promise);
    const blockStarted = performance.now();
    while (performance.now() - blockStarted < READ_DEADLINE_MS) {
      const observed = (await database.query('SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS blocked', [holderPid, writerPid])).rows[0];
      if (observed.blocked) { blockedObserved = true; break; }
      await delay(10);
    }
    assert.equal(blockedObserved, true, 'The exact second writer must be observed blocked by this lock holder');
    const started = performance.now();
    const whileHeld = await deadline(page(database));
    readerMilliseconds = performance.now() - started;
    assert.equal(writerSettled, false);
    assert.equal(whileHeld.revision, baseline.revision); assert.equal(whileHeld.feedVersion, baseline.feedVersion);
    assert.deepEqual(whileHeld.rootRefs, baseline.rootRefs);
  } finally {
    release.resolve();
    // Drain only our own transaction. No cancellation, backend termination or
    // force-drop is used, including an assertion/deadline failure path.
    const settled = await Promise.allSettled([holder, writer].filter(Boolean));
    const rejected = settled.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
  }
  assert.equal((await writer).status, 'accepted');

  // Same-value A->B->A and delete/re-add cannot reuse a prepared incarnation.
  const old = await job(database, 'synthetic-aba-source');
  await registerShadowSourceWitness(database, { sourceId: old.sourceId, sourceInputHash: hash(5) });
  assert.equal((await commitShadowDecision(database, old)).status, 'stale-source');
  await registerShadowSourceWitness(database, { sourceId: old.sourceId, sourceInputHash: old.sourceInputHash });
  assert.equal((await commitShadowDecision(database, old)).status, 'stale-source');
  await deleteShadowSource(database, { sourceId: old.sourceId });
  await registerShadowSourceWitness(database, { sourceId: old.sourceId, sourceInputHash: old.sourceInputHash });
  assert.equal((await commitShadowDecision(database, old)).status, 'stale-source');

  const first = await page(database, { limit: 1 });
  const cursor = { expectedRevision: first.revision, expectedFeedVersion: first.feedVersion,
    afterRootId: first.nextAfterRootId, limit: 1 };
  const [bound, racedFeed] = await Promise.all([
    bind(database, primary, 'synthetic-root-c'), page(database, cursor),
  ]);
  assert.equal(bound.status, 'bound');
  if (racedFeed.status === 'ready') {
    assert.equal(racedFeed.feedVersion, first.feedVersion);
    assert.deepEqual(racedFeed.rootRefs.map(root => root.canonicalRootId), ['synthetic-root-b']);
  } else {
    assert.equal(racedFeed.status, 'stale-feed'); assert.deepEqual(racedFeed.rootRefs, []);
    assert.notEqual(racedFeed.feedVersion, first.feedVersion);
  }
  assert.equal((await page(database, cursor)).status, 'stale-feed');

  const stable = await page(database);
  await commitShadowDecision(database, { ...primary, nodeId: 'nature' });
  assert.equal((await bind(database, primary, 'synthetic-stale-decision-root')).status, 'stale-decision');
  assert.equal((await readShadowPath(database, { sourceId: primary.sourceId })).nodeId, 'nature');
  assert.deepEqual((await page(database)).rootRefs, stable.rootRefs);
  assert.equal((await page(database)).feedVersion, stable.feedVersion);
  assert.equal((await bind(database, { ...primary, nodeId: 'nature' }, 'synthetic-root-a')).status, 'semantic-binding-conflict');

  const newInput = await registerShadowSourceWitness(database, { sourceId: primary.sourceId, sourceInputHash: hash(5) });
  assert.equal((await bind(database, primary, 'synthetic-stale-source-root')).status, 'stale-source');
  assert.equal((await readShadowPath(database, { sourceId: primary.sourceId })).status, 'unassigned');
  assert.equal((await page(database)).rootRefs.length, 3);
  const [published, racedRevision] = await Promise.all([
    publishShadowHierarchy(database, publication('native-revision-2', 'native-revision-1')),
    page(database, { expectedRevision: stable.revision, expectedFeedVersion: stable.feedVersion, afterRootId: null }),
  ]);
  assert.equal(published.status, 'published');
  assert.equal((await bind(database, primary, 'synthetic-stale-revision-root')).status, 'stale-revision');
  if (racedRevision.status === 'ready') {
    assert.equal(racedRevision.revision, stable.revision);
    assert.equal(racedRevision.feedVersion, stable.feedVersion);
    assert.deepEqual(racedRevision.rootRefs, stable.rootRefs);
  } else {
    assert.equal(racedRevision.status, 'stale-revision'); assert.deepEqual(racedRevision.rootRefs, []);
  }
  assert.equal((await page(database, { expectedRevision: stable.revision, expectedFeedVersion: stable.feedVersion })).status, 'stale-revision');
  assert.equal((await page(database)).rootRefs.length, 0);
  assert.equal((await commitShadowDecision(database, primary)).status, 'stale-model');
  await revokeShadowRevision(database, { revision: 'native-revision-1' });
  const erased = (await database.query(`SELECT
    (SELECT count(*)::integer FROM hierarchy_shadow.root_registry) AS roots,
    (SELECT count(*)::integer FROM hierarchy_shadow.source_root_bindings) AS bindings`)).rows[0];
  assert.deepEqual(erased, { roots: 0, bindings: 0 });
  await commitShadowDecision(database, { ...primary, revision: 'native-revision-2', sourceInputHash: hash(5),
    sourceWitnessVersion: newInput.sourceWitnessVersion });
  assert.equal((await page(database)).rootRefs.length, 0);

  return { syntheticOnly: true, nativeMultiConnection: true, maximumPoolConnections: 4,
    writerObservedBlocked: blockedObserved, readerCompletedWhileWriterBlocked: true,
    readerMilliseconds: Math.round(readerMilliseconds * 100) / 100, readDeadlineMilliseconds: READ_DEADLINE_MS,
    writerAcceptedAfterHolderRollback: true, sourceIncarnationFence: true,
    preparedRootBindSourceDecisionRevisionFences: true,
    coherentScopedFeedRace: true, coherentPublicationRace: true, stableHistoricalRootBinding: true,
    revocationAfterInputInvalidationErasesReferences: true };
}

/** No options, alternate hosts, caller credentials, paths or existing DB names. */
export async function runHierarchyShadowNativeCheck() {
  if (process.argv.slice(2).length !== 1 || process.argv[2] !== '--run-isolated') {
    return { status: 'not-run', syntheticOnly: true, requires: '--run-isolated', databaseAccess: false };
  }
  const scratchName = SCRATCH_DATABASE;
  const quoted = identifier(scratchName);
  let maintenance, scratch, createdIdentity = null, created = false, createAttempted = false, phase = 'protected-credential';
  let scratchClosed = true, failed = false;
  const report = { status: 'failed', syntheticOnly: true, scratchDatabase: null,
    cleanup: { success: false, reason: 'not-created' } };
  try {
    const password = createWindowsDpapiPasswordProvider({ role: 'postgres' });
    const base = { host: '127.0.0.1', port: 55432, user: 'postgres', password,
      application_name: 'murmingle-hierarchy-shadow-adr132-native-check',
      connectionTimeoutMillis: 5_000, idleTimeoutMillis: 1_000,
      options: '-c statement_timeout=10000 -c lock_timeout=10000' };
    phase = 'maintenance-preflight';
    maintenance = await createPgDatabase({ config: { ...base, database: 'postgres', max: 1 } });
    const owner = (await maintenance.query(`SELECT current_database() AS name,current_user AS role,
      (SELECT oid::text FROM pg_roles WHERE rolname=current_user) AS owner_oid,
      host(inet_server_addr()) AS address,inet_server_port() AS port`)).rows[0];
    assert.equal(owner.name, 'postgres'); assert.equal(owner.role, 'postgres');
    assert.equal(owner.address, '127.0.0.1'); assert.equal(Number(owner.port), 55432);
    const absent = (await maintenance.query('SELECT oid FROM pg_database WHERE datname=$1', [scratchName])).rows;
    assert.equal(absent.length, 0, 'Never reuse an existing database');
    phase = 'scratch-create';
    createAttempted = true; report.scratchDatabase = scratchName;
    await maintenance.query(`CREATE DATABASE ${quoted} OWNER postgres TEMPLATE template0`);
    created = true; report.scratchDatabase = scratchName;
    const identity = (await maintenance.query('SELECT oid::text AS oid,datdba::text AS owner_oid FROM pg_database WHERE datname=$1', [scratchName])).rows;
    assert.equal(identity.length, 1); assert.equal(identity[0].owner_oid, owner.owner_oid);
    createdIdentity = { oid: identity[0].oid, ownerOid: identity[0].owner_oid };
    phase = 'synthetic-native-checks';
    scratch = await createPgDatabase({ config: { ...base, database: scratchName, max: 3 } });
    scratchClosed = false;
    report.metrics = await syntheticChecks(scratch);
    report.status = 'passed';
  } catch (error) {
    failed = true;
    // Deliberately no message/stack/config/provider output: diagnostics are
    // phase plus a bounded code, all data in this harness is synthetic.
    report.failure = { phase, code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,20}$/u.test(error.code)
      ? error.code : error instanceof assert.AssertionError ? 'ASSERTION' : 'CHECK_FAILED' };
  } finally {
    if (scratch) {
      try { await scratch.close(); scratchClosed = true; }
      catch { report.cleanup = { success: false, reason: 'own-pool-close-failed' }; }
    }
    if (created) {
      if (!createdIdentity) report.cleanup = { success: false, reason: 'creation-identity-unavailable' };
      else if (!scratchClosed) report.cleanup = { success: false, reason: 'own-pool-not-closed' };
      else {
        try {
          // Check the exact name, recorded creation OID and owner immediately
          // before DROP. Active connections (including any outside connection)
          // block cleanup. A newly opened connection also makes PostgreSQL DROP
          // refuse cleanup; FORCE is never used.
          const candidates = (await maintenance.query(`SELECT d.oid::text AS oid,d.datdba::text AS owner_oid,
            (SELECT count(*)::integer FROM pg_stat_activity a WHERE a.datid=d.oid) AS connections
            FROM pg_database d WHERE d.datname=$1`, [scratchName])).rows;
          if (candidates.length !== 1 || candidates[0].oid !== createdIdentity.oid || candidates[0].owner_oid !== createdIdentity.ownerOid) {
            report.cleanup = { success: false, reason: 'identity-changed-no-drop' };
          } else if (candidates[0].connections !== 0) {
            report.cleanup = { success: false, reason: 'other-connections-no-drop' };
          } else {
            await maintenance.query(`DROP DATABASE ${quoted}`);
            const remains = (await maintenance.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rows.length;
            report.cleanup = { success: remains === 0, reason: remains === 0 ? 'own-scratch-dropped' : 'scratch-still-present' };
          }
        } catch { report.cleanup = { success: false, reason: 'cleanup-refused-or-failed-no-force' }; }
      }
    } else report.cleanup = createAttempted
      ? { success: false, reason: 'creation-outcome-unknown-no-drop' }
      : { success: true, reason: 'no-database-created' };
    if (maintenance) {
      try { await maintenance.close(); }
      catch { report.cleanup = { success: false, reason: 'maintenance-pool-close-failed' }; }
    }
    if (!report.cleanup.success) { report.status = 'failed'; failed = true; }
    if (failed) report.status = 'failed';
  }
  return report;
}

export async function runHierarchyShadowIsolatedServerCheck() {
  return runWithIsolatedHierarchyShadowPostgres(syntheticChecks);
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  const args = process.argv.slice(2);
  if (!args.length) {
    process.stdout.write(`${JSON.stringify({ status: 'not-run', syntheticOnly: true, requires: '--run-isolated or --run-isolated-server', databaseAccess: false })}\n`);
  } else if (args.length !== 1 || !['--run-isolated', '--run-isolated-server'].includes(args[0])) {
    process.stdout.write(`${JSON.stringify({ status: 'not-run', reason: 'unsupported-arguments', databaseAccess: false })}\n`);
    process.exitCode = 2;
  } else {
    const run = args[0] === '--run-isolated-server' ? runHierarchyShadowIsolatedServerCheck : runHierarchyShadowNativeCheck;
    run().then(report => {
      process.stdout.write(`${JSON.stringify(report)}\n`); process.exitCode = report.status === 'passed' ? 0 : 1;
    }, () => {
      process.stdout.write(`${JSON.stringify({ status: 'failed', reason: 'unexpected-harness-failure', syntheticOnly: true })}\n`);
      process.exitCode = 1;
    });
  }
}
