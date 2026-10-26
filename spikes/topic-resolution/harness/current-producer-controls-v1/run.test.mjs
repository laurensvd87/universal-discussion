import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAIN_SETUP_PLAN, publicNavigationCommand, ControlProtocolError, projectProtocolFailure, SOURCE_FILES, validateEligibilityResult, CONTROLS, URLS } from './run.mjs';
import { sha } from './policy.js';

test('immutable setup preserves V2 guards and adds own main-document Response interception before resume', () => {
  const methods = MAIN_SETUP_PLAN.map(x => x.method);
  for (const m of ['Target.setAutoAttach', 'Network.enable', 'Network.setBypassServiceWorker', 'Network.setCacheDisabled', 'Network.setBlockedURLs', 'ServiceWorker.enable', 'ServiceWorker.stopAllWorkers', 'Fetch.enable', 'Page.enable', 'Page.setLifecycleEventsEnabled', 'Runtime.runIfWaitingForDebugger']) assert.equal(methods.filter(x => x === m).length, 1);
  assert.ok(methods.indexOf('ServiceWorker.enable') < methods.indexOf('ServiceWorker.stopAllWorkers'));
  assert.ok(methods.indexOf('Fetch.enable') < methods.indexOf('Runtime.runIfWaitingForDebugger'));
  assert.deepEqual(MAIN_SETUP_PLAN.find(c => c.method === 'Fetch.enable').params.patterns, [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }]);
  assert.ok(Object.isFrozen(MAIN_SETUP_PLAN)); for (const c of MAIN_SETUP_PLAN) assert.ok(Object.isFrozen(c.params));
});
test('navigation cannot precede private setup completion or target final/nonallowlisted URLs', () => {
  for (const done of [false, 1, null, undefined]) assert.throws(() => publicNavigationCommand(done, URLS[0]));
  for (const url of URLS) assert.deepEqual(publicNavigationCommand(true, url), { method: 'Page.navigate', params: { url } });
  assert.throws(() => publicNavigationCommand(true, 'https://example.invalid/'));
});
test('CDP errors project only reviewed stage, fixed method and integer code', () => {
  const e = new ControlProtocolError('Fetch.continueResponse', -32000);
  assert.deepEqual(projectProtocolFailure({ stage: 'continue-response', method: e.method, code: e.code }), { stage: 'continue-response', method: 'Fetch.continueResponse', code: -32000, reason: 'cdp-command-rejected' });
  assert.throws(() => projectProtocolFailure({ stage: 'navigate', method: 'Browser.close', code: -1 }));
  assert.throws(() => new ControlProtocolError('Arbitrary.command', -1)); assert.throws(() => new ControlProtocolError('Page.navigate', 'private text'));
});
test('browser prerequisite requires two exact complete static eligible rows and matching sources/freeze', () => {
  const hashes = { fixture: 'a'.repeat(64) }, freezeHash = 'b'.repeat(64), receipt = { fixture: true };
  const x = { schema: 'current-producer-controls-result/v1', phase: 'static-controls', status: 'complete', sourceHashesRechecked: true, freezeHash, sourceHashes: hashes,
    denominator: 4, eligibleCases: 2, compatibilityPrerequisitePassed: true, cases: CONTROLS.map((c, i) => ({ ...c, rightsTransportEligible: i < 2, status: 'unavailable', reason: i < 2 ? 'static-insufficient-text' : 'origin-robots-denied',
      ...(i < 2 ? { originPolicy: receipt, originPolicyHash: sha(JSON.stringify(receipt)), pagePolicy: { domDirectivesChecked: true }, htmlSha256: 'c'.repeat(64) } : {}) })) };
  assert.deepEqual(validateEligibilityResult(x, hashes, freezeHash), [true, true, false, false]);
  for (const change of [r => r.eligibleCases = 1, r => r.phase = 'browser-controls', r => r.sourceHashes = {}, r => r.cases[0].id = 'other', r => r.cases[0].pagePolicy.domDirectivesChecked = false, r => r.status = 'fatal']) {
    const c = structuredClone(x); change(c); assert.throws(() => validateEligibilityResult(c, hashes, freezeHash));
  }
});
test('protocol/source list is fixed and no model, final cohort or old output import exists', async () => {
  const protocol = JSON.parse(await readFile(SOURCE_FILES['protocol.json'], 'utf8')); assert.deepEqual(protocol.controls, CONTROLS);
  assert.equal(Object.keys(SOURCE_FILES).length, 13); assert.equal(protocol.browser.wallSeconds, 180); assert.equal(protocol.static.wallSeconds, 360);
  for (const file of ['run.mjs', 'policy.js']) {
    const source = await readFile(SOURCE_FILES[file], 'utf8');
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/gu)].map(m => m[1]);
    assert.ok(imports.every(p => !/model|classifier|candidates-adr143|real-root.*output/u.test(p)));
    assert.ok(imports.filter(p => p.includes('topic-encoder')).every(p => p.endsWith('/hierarchical-public-capture-v2/robots-deny-space-repair.js')));
  }
  const supervisor = await readFile(SOURCE_FILES['supervise.py'], 'utf8');
  assert.ok(supervisor.indexOf('AssignProcessToJobObject(job, process_handle)') < supervisor.indexOf('child.stdin.write('));
  assert.ok(supervisor.includes('IsProcessInJob(handle, job'));
  assert.ok(supervisor.includes("ACTIVE_LIMIT = 170 if PHASE == 'browser-controls' else 350"));
  assert.ok(supervisor.includes('cleanup_deadline = time.monotonic() + 5'));
  assert.equal(supervisor.includes('time.monotonic() - started > 180'), false);
  assert.ok(supervisor.includes('parsed = json.loads(result_bytes)'));
});
