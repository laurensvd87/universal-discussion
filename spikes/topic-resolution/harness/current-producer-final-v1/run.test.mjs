import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAIN_SETUP_PLAN, publicNavigationCommand, ControlProtocolError, projectProtocolFailure, SOURCE_FILES, validateEligibilityResult, validateSelectionReceipt, validateFitterCompletion, batchOutput } from './run.mjs';
import { digest } from './manifest.js';
import { sha } from './policy.js';
const CONTROLS=['en','de','nl','fr'].map((language,i)=>({id:'fixture-'+i,groupId:'g-'+i,language,url:'https://'+language+'.example/article'}));
const URLS=CONTROLS.map(c=>c.url);

test('immutable setup preserves V2 guards and adds own main-document Response interception before resume', () => {
  const methods = MAIN_SETUP_PLAN.map(x => x.method);
  for (const m of ['Target.setAutoAttach', 'Network.enable', 'Network.setBypassServiceWorker', 'Network.setCacheDisabled', 'Network.setBlockedURLs', 'ServiceWorker.enable', 'ServiceWorker.stopAllWorkers', 'Fetch.enable', 'Page.enable', 'Page.setLifecycleEventsEnabled', 'Runtime.runIfWaitingForDebugger']) assert.equal(methods.filter(x => x === m).length, 1);
  assert.ok(methods.indexOf('ServiceWorker.enable') < methods.indexOf('ServiceWorker.stopAllWorkers'));
  assert.ok(methods.indexOf('Fetch.enable') < methods.indexOf('Runtime.runIfWaitingForDebugger'));
  assert.deepEqual(MAIN_SETUP_PLAN.find(c => c.method === 'Fetch.enable').params.patterns, [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }]);
  assert.ok(Object.isFrozen(MAIN_SETUP_PLAN)); for (const c of MAIN_SETUP_PLAN) assert.ok(Object.isFrozen(c.params));
});
test('navigation cannot precede private setup completion or target final/nonallowlisted URLs', () => {
  for (const done of [false, 1, null, undefined]) assert.throws(() => publicNavigationCommand(done, URLS[0], CONTROLS));
  for (const url of URLS) assert.deepEqual(publicNavigationCommand(true, url, CONTROLS), { method: 'Page.navigate', params: { url } });
  assert.throws(() => publicNavigationCommand(true, 'https://example.invalid/', CONTROLS));
});
test('CDP errors project only reviewed stage, fixed method and integer code', () => {
  const e = new ControlProtocolError('Fetch.continueResponse', -32000);
  assert.deepEqual(projectProtocolFailure({ stage: 'continue-response', method: e.method, code: e.code }), { stage: 'continue-response', method: 'Fetch.continueResponse', code: -32000, reason: 'cdp-command-rejected' });
  assert.throws(() => projectProtocolFailure({ stage: 'navigate', method: 'Browser.close', code: -1 }));
  assert.throws(() => new ControlProtocolError('Arbitrary.command', -1)); assert.throws(() => new ControlProtocolError('Page.navigate', 'private text'));
});
test('browser prerequisite requires complete exact static rights evidence, not a per-batch quality threshold and matching sources/freeze', () => {
  const hashes = { fixture: 'a'.repeat(64) }, freezeHash = 'b'.repeat(64), receipt = { fixture: true };
  const x = { schema: 'current-producer-final-result/v1', phase: 'static', status: 'complete', sourceHashesRechecked: true, freezeHash, sourceHashes: hashes,
    denominator: 4, eligibleCases: 2, compatibilityPrerequisitePassed: true, cases: CONTROLS.map((c, i) => ({ ...c, rightsTransportEligible: i < 2, status: 'unavailable', reason: i < 2 ? 'static-insufficient-text' : 'origin-robots-denied',
      ...(i < 2 ? { originPolicy: receipt, originPolicyHash: sha(JSON.stringify(receipt)), pagePolicy: { domDirectivesChecked: true }, htmlSha256: 'c'.repeat(64) } : {}) })) };
  assert.deepEqual(validateEligibilityResult(x, hashes, freezeHash, CONTROLS), [true, true, false, false]);
  for (const change of [r => r.phase = 'browser', r => r.sourceHashes = {}, r => r.cases[0].id = 'other', r => r.cases[0].pagePolicy.domDirectivesChecked = false, r => r.status = 'fatal']) {
    const c = structuredClone(x); change(c); assert.throws(() => validateEligibilityResult(c, hashes, freezeHash, CONTROLS));
  }
});

test('fixed source allowlist pins all transitive producers and DEV closure without old final inputs',async()=>{
 const base='spikes/topic-resolution/harness/current-producer-final-v1/';
 const protocol=JSON.parse(await readFile(SOURCE_FILES[base+'protocol.json'],'utf8'));
 assert.equal(protocol.batches.length,8);assert.equal(protocol.static.wholePhaseMaximumSeconds,2880);
 assert.equal(protocol.resources.packetBytes,131072);assert.equal(protocol.resources.resultBytes,65536);
 const paths=Object.keys(SOURCE_FILES);
 assert.ok(paths.includes('decisions/ADR-143-current-producer-transfer-gate.md'));
 assert.ok(paths.includes('spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/supervisor.json'));
 assert.ok(paths.every(k=>!/(?:adr136|adr141|adr142|real-root-v[123]|capacity-real-root)/u.test(k)));
 for(const file of ['run.mjs','policy.js','manifest.js']){
  const source=await readFile(SOURCE_FILES[base+file],'utf8'),imports=[...source.matchAll(/from ['"]([^'"]+)['"]/gu)].map(m=>m[1]);
  assert.ok(imports.every(k=>!/(?:scorer|classifier|encoding|model|fit\.js)/u.test(k)));
 }
 const supervisor=await readFile(SOURCE_FILES[base+'supervise.py'],'utf8');
 assert.ok(supervisor.indexOf('AssignProcessToJobObject(job, process_handle)')<supervisor.indexOf('child.stdin.write('));
 assert.ok(supervisor.includes('IsProcessInJob(handle, job'));assert.ok(supervisor.includes('cleanup_deadline = time.monotonic() + 5'));
 assert.ok(supervisor.includes('packetSha256'));assert.ok(supervisor.includes("ACTIVE_LIMIT = 170 if PHASE == 'browser' else 350"));
 assert.ok(supervisor.includes('64 * 1024'));assert.ok(supervisor.includes('128 * 1024'));
});
test('selected receipt binds both exact target profiles without allowing a new builder or hash cycle',()=>{
 const h='a'.repeat(64),profiles=['current-static','browser-current'].map(producerId=>{
  const p={schema:'root-rank-target-producer-profile/v1',producerId,inputConstructionHash:h,extractorVersions:producerId==='current-static'?['crawler-static-html-prefix/v1']:['article-container-prefix/v1','main-text-prefix/v1']};
  return {...p,producerProfileHash:digest(p)};
 });
 const r={schema:'current-producer-root-selection/v1',phase:'selected-before-final-transfer',finalTestEvaluated:false,
 freezeHash:h,freezeFileSha256:h,protocolSha256:h,selectionSha256:h,selectedIndex:1,bodyWeight:.75,titleWeight:.25,lambda:.1,
 trainingInputConstructionHash:h,eligibleCohortHash:h,eligibilityReceiptSha256:h,calibrationGoldSha256:h,selectedModelSha256:h,modelJsonHash:h,
 selectedPolicySha256:h,policyHash:h,selectedInputDefinitionSha256:h,transferHash:h,targetProfiles:profiles,sourceBindingsHash:h,
 candidateSha256:'d6843c87347a111277c04baf65062cf246ccd75fc883631d8c69e31563288052',labelSealSha256:h,encoderHash:h,representationHash:h,
 inputView:'current-static',productionValidated:false,assignmentAuthority:false};
 assert.deepEqual(validateSelectionReceipt(r,profiles,h),r);
 for(const change of [x=>x.finalTestEvaluated=true,x=>x.selectedIndex=0,x=>x.targetProfiles.reverse(),x=>x.collectorFreezeHash=h,x=>x.labelSealSha256='b'.repeat(64)]){
  const x=structuredClone(r);change(x);assert.throws(()=>validateSelectionReceipt(x,profiles,h));
 }
 let calls=0;const x=structuredClone(r);x.targetProfiles=new Proxy([],{get(){calls++;throw 0}});
 assert.throws(()=>validateSelectionReceipt(x,profiles,h));assert.equal(calls,0);
});
test('only eight ordinal batch paths exist, never caller-supplied paths or adaptive ranges',()=>{
 assert.match(batchOutput('browser',8),/output-browser-08$/u);
 for(const n of [0,9,'1',1.5])assert.throws(()=>batchOutput('static',n));
 assert.throws(()=>batchOutput('../owner',1));
});
test('Python literal source map exactly equals Node keys/order and resolves to the same paths',async()=>{
 const base='spikes/topic-resolution/harness/current-producer-final-v1/';
 const text=await readFile(SOURCE_FILES[base+'supervise.py'],'utf8');
 const match=/^source_paths = \{name: REPO \/ name for name in (\[[^\r\n]+\])\}$/mu.exec(text);
 assert.ok(match,'only the reviewed literal comprehension is accepted');
 const keys=JSON.parse(match[1]);assert.deepEqual(keys,Object.keys(SOURCE_FILES));
 const root=resolve(SOURCE_FILES[base+'run.mjs'],'../../../../..');
 for(const key of keys)assert.equal(resolve(root,key),SOURCE_FILES[key]);
 assert.equal(keys.filter(k=>k.startsWith('spikes/topic-resolution/harness/current-producer-controls-v1/')).length,12);
 assert.equal(keys.includes(base+'freeze.json'),false);
});
test('fitter completion requires actual receipt/freeze bytes and successful owned cleanup/source proof',()=>{
 const h='a'.repeat(64),receiptSha256='b'.repeat(64),freezeSha256='c'.repeat(64);
 const material={schema:'current-producer-root-fit-freeze/v1',sourceHashes:{'protocol.json':h,'fit.js':h},protocolSha256:h};
 const f={...material,freezeHash:digest(material)},r={freezeHash:f.freezeHash,freezeFileSha256:freezeSha256,protocolSha256:h};
 const s={schema:'current-producer-root-fit-supervisor/v1',phase:'fit-current',reason:null,cleanupReason:null,exitCode:0,
  ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,resultSha256:receiptSha256,freezeSha256,sourceHashes:material.sourceHashes};
 assert.equal(validateFitterCompletion(f,s,r,{receiptSha256,freezeSha256}),true);
 for(const change of [x=>x.reason='resource-failed',x=>x.cleanupReason='drain-failed',x=>x.exitCode=1,x=>x.ownTreeCleanupConfirmed=false,
  x=>x.sourceHashesRechecked=false,x=>x.resultSha256=h,x=>x.freezeSha256=h,x=>x.sourceHashes={},x=>x.phase='other']){
  const x=structuredClone(s);change(x);assert.throws(()=>validateFitterCompletion(f,x,r,{receiptSha256,freezeSha256}));
 }
 assert.throws(()=>validateFitterCompletion({...f,protocolSha256:'d'.repeat(64)},s,r,{receiptSha256,freezeSha256}));
 assert.throws(()=>validateFitterCompletion(f,s,{...r,freezeFileSha256:h},{receiptSha256,freezeSha256}));
 let called=0;const x=structuredClone(s);Object.defineProperty(x,'reason',{enumerable:true,get(){called++;throw 0}});
 assert.throws(()=>validateFitterCompletion(f,x,r,{receiptSha256,freezeSha256}));assert.equal(called,0);
 assert.ok(Object.keys(SOURCE_FILES).includes('apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json'));
 assert.ok(Object.keys(SOURCE_FILES).includes('apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json'));
});
