import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { acquireNativeFixture } from '../integration/hierarchy-native-context.js';
import { FIXED, verifyScopedOwnership, runWithOwnedScopedPostgres } from '../integration/hierarchy-native-cluster.js';
import { runHierarchyNativeCheck } from '../integration/hierarchy-native-check.js';
import { createInputVersionFixtureDatabase, describeHierarchyFixtureFailure } from '../canonical-v4/hierarchy-repository.js';
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
