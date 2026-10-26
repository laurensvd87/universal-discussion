import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { acquireNativeFixture } from '../integration/hierarchy-native-context.js';
import { FIXED, verifyScopedOwnership, runWithOwnedScopedPostgres } from '../integration/hierarchy-native-cluster.js';
import { runHierarchyNativeCheck } from '../integration/hierarchy-native-check.js';
import { createInputVersionFixtureDatabase, describeHierarchyFixtureFailure, projectHierarchyFixtureFailure } from '../canonical-v4/hierarchy-repository.js';
import { runAssertions } from './hierarchy-native-assertions.js';

test('maintained factory and check refuse external selectors without starting PostgreSQL', async () => {
  await assert.rejects(createInputVersionFixtureDatabase({}), /Invalid experimental/);
  await assert.rejects(createInputVersionFixtureDatabase(), { code: 'NATIVE_NO_OWNED_SCOPE' });
  await assert.rejects(acquireNativeFixture(), { code: 'NATIVE_NO_OWNED_SCOPE' });
  await assert.rejects(acquireNativeFixture({}), { code: 'NATIVE_NO_OWNED_SCOPE' });
  await assert.rejects(runHierarchyNativeCheck({}), /no selectors/);
});

test('actual cluster entry rejects invalid callback and extra selectors before consuming its attempt', async () => {
  for (const args of [[], [null], [{}], [false], [0], [''], [undefined], [() => {}, {}]]) {
    await assert.rejects(runWithOwnedScopedPostgres(...args), { code: 'OWNED_REQUEST' });
  }
});

test('maintained original first assertion runs purely and the next database case is explicitly intercepted', async () => {
  const intercepted = new Error('Do not enter SQL in this offline test');
  let cases = 0;
  await assert.rejects(runAssertions(async (name, ...args) => {
    cases++;
    if (cases === 1) {
      assert.equal(name, 'pure wire and factory capability preconditions do not open any DB');
      assert.equal(args.length, 1);
      await args[0]();
    } else {
      assert.equal(name, 'actual canonical native queue, historical topology and ancestor feeds (separately gated)');
      assert.equal(args[0].skip, false);
      assert.equal(args[0].timeout, 180000);
      throw intercepted;
    }
  }), error => error === intercepted);
  assert.equal(cases, 2);
});

test('maintained cluster preserves the portable pg dependency anchor after relocation', async () => {
  const url = new URL('../integration/hierarchy-native-cluster.js', import.meta.url);
  const source = await readFile(url, 'utf8');
  const matches = [...source.matchAll(/createRequire\(new URL\('([^']+)',import\.meta\.url\)\)/g)];
  assert.equal(matches.length, 1);
  const actual = new URL(matches[0][1], url);
  const predecessor = new URL('../../package.json', new URL('../integration/native-hierarchy-postgres-v2/cluster.js', import.meta.url));
  assert.equal(actual.href, predecessor.href);
  assert.equal(actual.href, new URL('../package.json', import.meta.url).href);
  assert.equal(createRequire(actual).resolve('pg'), createRequire(predecessor).resolve('pg'));
});

test('maintained ownership joins its exact bound run parent, marker and pidStart', () => {
  const ownedParent = 'D:\\GITProjekts\\universal-discussion-bootstrap\\apps\\local-service\\portable\\data\\hierarchy-native-runs\\run-' + 'a'.repeat(48) + '\\cluster';
  const runDirectory = ownedParent + '\\nhpg-Invented1';
  const dataDirectory = runDirectory + '\\pgdata';
  const marker = { schema: FIXED.marker, nonce: 'a'.repeat(48), runDirectory };
  const request = { ownedParent, runDirectory, dataDirectory, marker, pid: 123,
    markerText: JSON.stringify(marker), pidText: ['123', dataDirectory, '1700000000', '55433'].join('\n') };
  assert.equal(verifyScopedOwnership(request), 1700000000);
  assert.throws(() => verifyScopedOwnership({ ...request, expectedStart: 1700000001 }), { code: 'OWNERSHIP_PID' });
  assert.throws(() => verifyScopedOwnership({ ...request, markerText: JSON.stringify({ ...marker, schema: 'native-hierarchy-postgres/v2' }) }), { code: 'OWNERSHIP_MARKER' });
  assert.throws(() => verifyScopedOwnership({ ...request, ownedParent: ownedParent.replace('run-' + 'a'.repeat(48), 'run-' + 'b'.repeat(48)) }), { code: 'OWNERSHIP_PATH' });
  assert.throws(() => verifyScopedOwnership({ ...request, ownedParent: undefined }), { code: 'OWNERSHIP_PATH' });
  assert.equal(Object.hasOwn(FIXED, 'parent'), false);
});

test('diagnostics cannot expose arbitrary error content or invoke error hooks', () => {
  let calls = 0;
  const error = Object.defineProperties({}, {
    code: { get() { calls++; return '42601'; } },
    message: { get() { calls++; return 'private SQL'; } },
  });
  for (const value of [null, undefined, false, 0, '', error, { code: '42601', position: '42', message: 'private SQL' }, new Proxy(error, {
    get() { calls++; throw new Error('must not inspect'); },
    getOwnPropertyDescriptor() { calls++; throw new Error('must not inspect'); },
  })]) assert.equal(describeHierarchyFixtureFailure(value), null);
  assert.equal(calls, 0);
});

test('pure failure projection preserves distinct bounded positions without registering errors', () => {
  const error = { code: '42702', position: '42', internalPosition: '314', message: 'private SQL', detail: 'private data' };
  const expected = { stage: 'rpc:create_root', sqlState: '42702', position: '42', internalPosition: '314', functionName: null, functionLine: null };
  assert.deepEqual(projectHierarchyFixtureFailure(error, 'rpc:create_root'), expected);
  assert.ok(Object.isFrozen(projectHierarchyFixtureFailure(error, 'rpc:create_root')));
  assert.equal(describeHierarchyFixtureFailure(error), null);
  const inherited = Object.create(error);
  assert.deepEqual(projectHierarchyFixtureFailure(inherited, 'hierarchy-schema-load'), { ...expected, stage: 'hierarchy-schema-load', sqlState: null, position: null, internalPosition: null });
  for (const value of ['0', '-1', '+1', '01', '1.0', '1e2', '1000001', '1'.repeat(100), '４２', 42, {}, null]) {
    const projected = projectHierarchyFixtureFailure({ code: 'bad!', position: value, internalPosition: value }, 'rpc:complete');
    assert.equal(projected.position, null);assert.equal(projected.internalPosition, null);assert.equal(projected.sqlState, null);
  }
  const upper = projectHierarchyFixtureFailure({ position: '1000000', internalPosition: '1', code: 'P2306' }, 'rpc:complete');
  assert.equal(upper.position, '1000000');assert.equal(upper.internalPosition, '1');assert.equal(upper.sqlState, 'P2306');
  for (const stage of ['rpc:unknown', 'rpc:complete;SELECT private', 'rpc:Complete', 'complete', '', {}, null]) assert.equal(projectHierarchyFixtureFailure(error, stage), null);
});

test('failure projection ignores proxies, accessors and nonprimitive fields without hooks', () => {
  let calls = 0;
  const hooked = { toString() { calls++;throw new Error('must not coerce'); }, [Symbol.toPrimitive]() { calls++;throw new Error('must not coerce'); } };
  const error = Object.defineProperties({}, Object.fromEntries(['code', 'position', 'internalPosition', 'where', 'message', 'internalQuery', 'detail'].map(name => [name, { get() { calls++;throw new Error('must not get'); } }])));
  const blank = { stage: 'rpc:claim', sqlState: null, position: null, internalPosition: null, functionName: null, functionLine: null };
  assert.deepEqual(projectHierarchyFixtureFailure(error, 'rpc:claim'), blank);
  assert.deepEqual(projectHierarchyFixtureFailure({ code: hooked, position: hooked, internalPosition: hooked, where: hooked }, 'rpc:claim'), blank);
  const proxy = new Proxy(error, { get() { calls++;throw new Error('must not get'); }, getOwnPropertyDescriptor() { calls++;throw new Error('must not inspect'); }, getPrototypeOf() { calls++;throw new Error('must not inspect'); } });
  const revoked = Proxy.revocable(error, {});revoked.revoke();
  for (const value of [proxy, revoked.proxy, null, undefined, false, 0, '', () => {}]) assert.equal(projectHierarchyFixtureFailure(value, 'rpc:claim'), null);
  assert.equal(calls, 0);assert.equal(describeHierarchyFixtureFailure(error), null);
});

test('context projection emits only the first finite exact-schema signature and line observation', () => {
  const frame = (name = 'create_root', signature = Array(12).fill('text').join(','), line = '7', site = 'SQL statement') => `PL/pgSQL function hierarchy_native_scoped_ingestion_v2.${name}(${signature}) line ${line} at ${site}`;
  const secret = 'SQL statement "SELECT secret_password, private_url FROM private_material"';
  const error = { where: [secret, frame(), frame('root_hook', '', '9', 'IF')].join('\n'), internalQuery: 'private SQL', message: 'secret_password' };
  const expected = { stage: 'rpc:create_root', sqlState: null, position: null, internalPosition: null, functionName: 'create_root', functionLine: '7' };
  assert.deepEqual(projectHierarchyFixtureFailure(error, 'rpc:create_root'), expected);
  assert.equal(describeHierarchyFixtureFailure(error), null);
  assert.ok(!JSON.stringify(projectHierarchyFixtureFailure(error, 'rpc:create_root')).includes('secret'));
  const rejected = [frame('unknown', ''), frame('create_root', 'text'), frame('root_hook', '', '0'), frame('root_hook', '', '100001'), frame('root_hook', '', '01'), frame('root_hook', '', '1', 'SQL statement private'), frame().replace('hierarchy_native_scoped_ingestion_v2', 'foreign_schema'), 'prefix ' + frame(), frame() + '\r', frame() + ' private'];
  for (const where of rejected) {
    const projected = projectHierarchyFixtureFailure({ where }, 'rpc:create_root');assert.equal(projected.functionName, null);assert.equal(projected.functionLine, null);
  }
  for (const where of [secret.repeat(200) + '\n' + frame(), Array(64).fill('ignored').join('\n') + '\n' + frame()]) assert.equal(projectHierarchyFixtureFailure({ where }, 'rpc:create_root').functionName, null);
  assert.equal(projectHierarchyFixtureFailure({ where: frame('root_hook', '', '100000', 'RAISE') }, 'rpc:create_root').functionLine, '100000');
});

test('deep fixed-schema frames precede outer RPC frames only with exact immutable signatures', () => {
  const frame = (name, signature, line) => `PL/pgSQL function hierarchy_native_scoped_ingestion_v2.${name}(${signature}) line ${line} at SQL statement`;
  const fixtures = [
    ['enqueue', 'text,text,text,jsonb,integer,text', 'enqueue_issued', 'text,text,text,text'],
    ['admit_new', 'text,bigint,text,text,text,text,text,text,text,double precision[],double precision[],text', 'complete', 'text,text,text,text,text,text,integer'],
    ['update_source', 'text,bigint,text,text,text,text,text,text,text,double precision[],double precision[],text,bigint,text,text', 'complete', 'text,text,text,text,text,text,integer'],
    ['attach_native_decision', 'text,text,jsonb', 'complete', 'text,text,text,text,text,text,integer'],
    ['assert_witness', 'text,text', 'complete', 'text,text,text,text,text,text,integer'],
  ];
  for (const [deep, signature, outer, outerSignature] of fixtures) {
    const where = [frame(deep, signature, '17'), frame(outer, outerSignature, '33')].join('\n');
    const projected = projectHierarchyFixtureFailure({ where }, 'rpc:' + outer);
    assert.equal(projected.functionName, deep);assert.equal(projected.functionLine, '17');
    const mismatched = projectHierarchyFixtureFailure({ where: where.replace(signature, signature + ',text') }, 'rpc:' + outer);
    assert.equal(mismatched.functionName, outer);assert.equal(mismatched.functionLine, '33');
    assert.equal(projectHierarchyFixtureFailure({ where }, 'rpc:' + deep), null);
  }
});
