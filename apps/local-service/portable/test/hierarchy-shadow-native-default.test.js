import test from 'node:test';
import assert from 'node:assert/strict';
import { runHierarchyShadowNativeCheck, runHierarchyShadowIsolatedServerCheck }
  from '../integration/hierarchy-shadow-native-check.js';
import { runWithIsolatedHierarchyShadowPostgres, classifyIsolatedPostgresUtilityFailure }
  from '../integration/hierarchy-shadow-isolated-postgres.js';

// Run under deny-external-capabilities.js: an accidental spawn/connection on
// import/default execution must fail, not merely return a reassuring status.
test('native rehearsal default never connects, creates a cluster or invokes its callback', async () => {
  let calls = 0;
  const direct = await runHierarchyShadowNativeCheck();
  const server = await runHierarchyShadowIsolatedServerCheck();
  const helper = await runWithIsolatedHierarchyShadowPostgres(() => { calls++; });
  for (const result of [direct, server, helper]) {
    assert.equal(result.status, 'not-run');
    assert.equal(result.databaseAccess, false);
  }
  assert.equal(calls, 0);
});

test('utility diagnostics expose only fixed labels and numeric exit codes, never raw output', () => {
  const privateMarker = 'synthetic-input-never-print-this';
  for (const [stderr, expected] of [
    ['cannot be run as root', 'administrator-or-root-refusal'],
    ['could not open file "-" for reading', 'password-stdin-read-failure'],
    ['postgres executable not found', 'executable-library-or-version'],
    ['invalid locale', 'locale'], ['permission denied', 'permission-or-access'],
    ['unrecognized failure', 'unknown']]) {
    const result = classifyIsolatedPostgresUtilityFailure({ stderr: `${stderr}\n${privateMarker}`, exitCode: 1 });
    assert.deepEqual(result, { classification: expected, exitCode: 1 });
    assert.equal(JSON.stringify(result).includes(privateMarker), false);
  }
  assert.equal(classifyIsolatedPostgresUtilityFailure({ timedOut: true }).classification, 'timeout');
  assert.equal(classifyIsolatedPostgresUtilityFailure({ outputLimit: true }).classification, 'output-limit');
});
