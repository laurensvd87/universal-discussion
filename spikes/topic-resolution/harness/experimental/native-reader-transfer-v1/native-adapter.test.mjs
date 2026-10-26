import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeReaderTransfer,FIXED_CASES,NativeReaderTransferError} from './native-adapter.js';
import * as urlPolicy from '../../../browser/core/page-content-policy.js';
function emitter(){const callbacks=new Set();return {addListener:fn=>callbacks.add(fn),removeListener:fn=>callbacks.delete(fn),emit(...args){for(const fn of callbacks)fn(...args);},size:()=>callbacks.size};}
function setup(){
 const state={window:{id:4,type:'normal',incognito:false,focused:true},tab:{id:9,windowId:4,active:true,incognito:false,status:'complete',url:FIXED_CASES[0].url},permission:true};
 const calls={foreground:0,read:[],attest:[]},events={activated:emitter(),updated:emitter(),removed:emitter(),replaced:emitter(),focus:emitter(),windowRemoved:emitter(),permissionRemoved:emitter()};
 const chromeApi={windows:{getLastFocused:async()=>{calls.foreground++;return {...state.window};},onFocusChanged:events.focus,onRemoved:events.windowRemoved},
  tabs:{query:async()=>[{...state.tab}],onActivated:events.activated,onUpdated:events.updated,onRemoved:events.removed,onReplaced:events.replaced},
  permissions:{contains:async()=>state.permission,onRemoved:events.permissionRemoved}};
 const reader={read:async(...args)=>{calls.read.push(args);return {documentId:'native-document-1',result:{contractVersion:'page-content/1',status:'collected',url:args[1],title:'  Native title  ',text:'Fresh invented body for a native reader test.',extractorVersion:'main-text-prefix/v1'}};},
  attest:async(...args)=>{calls.attest.push(args);return {contractVersion:'page-content-attestation/1',status:'attested',url:args[2]};}};
 const adapter=createNativeReaderTransfer({chromeApi,reader,urlPolicy});
 const begin=()=>adapter.beginStudy({studyId:'synthetic-study-0001',windowId:4,cases:FIXED_CASES});
 const command=(session,ordinal=1,observationNonce='synthetic-observation-'+ordinal)=>({studyId:session.studyId,studyRevision:session.studyRevision,caseId:FIXED_CASES[ordinal-1].id,ordinal,observationNonce});
 return {adapter,state,calls,reader,events,chromeApi,begin,command};
}
test('inert constructor; actual three foreground observations and native same-document attest bind frozen transient pair',async()=>{
 const f=setup();assert.equal(f.calls.foreground,0);assert.equal(f.events.focus.size(),0);
 const session=await f.begin(),result=await f.adapter.observe(f.command(session));
 assert.equal(result.status,'collected');assert.equal(result.rawTitle,'  Native title  ');assert.equal(result.effectiveTitle,'Native title');
 assert.equal(f.calls.foreground,6);assert.equal(f.calls.read.length,1);assert.equal(f.calls.attest.length,1);
 assert.deepEqual(f.calls.attest[0],[9,'native-document-1',FIXED_CASES[0].url,FIXED_CASES[0].url]);
 const w=result.nativeWitness;assert.equal(w.frameId,0);assert.equal(w.documentId,'native-document-1');assert.equal(w.foregroundChecks.length,3);
 assert.equal(w.studyRevision,session.studyRevision);assert.equal(w.eventEpoch,0);assert.equal(w.nativeDocumentContinuityOnly,true);assert.equal(w.canonicalAuthority,false);
 assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(w.foregroundChecks[0]));f.state.tab.id=10;assert.equal(w.tabId,9);
 assert.equal(Object.hasOwn(w,'loaderId'),false);assert.equal(Object.hasOwn(result,'rightsApproved'),false);
});
test('exact32 ordered sealed cases are required; failed begin cannot be replayed and no permissions are granted',async()=>{
 for(const change of [cases=>cases.pop(),cases=>cases.reverse(),cases=>cases[0].url='https://www.stardewvalley.net/other/',cases=>cases[0].id=cases[1].id]){
  const f=setup(),cases=FIXED_CASES.map(c=>({...c}));change(cases);
  await assert.rejects(f.adapter.beginStudy({studyId:'synthetic-study-0001',windowId:4,cases}),{code:'study-initialization'});
  await assert.rejects(f.begin(),{code:'study-replay'});assert.equal(f.calls.read.length,0);
 }
});
test('one-use case ordinal and unique nonce survive unavailable outcomes; wrong study/revision/extra fields reject',async()=>{
 const f=setup(),s=await f.begin();f.state.permission=false;
 assert.equal((await f.adapter.observe(f.command(s))).reason,'permission-unavailable');
 await assert.rejects(f.adapter.observe(f.command(s)),{code:'observation-replay'});f.state.tab.url=FIXED_CASES[1].url;f.state.permission=true;
 await assert.rejects(f.adapter.observe(f.command(s,2,'synthetic-observation-1')),{code:'observation-replay'});
 await assert.rejects(f.adapter.observe({...f.command(s,2),studyRevision:'other'}),{code:'study-identity'});
 await assert.rejects(f.adapter.observe({...f.command(s,2),extra:true}),{code:'command-contract'});
 assert.equal((await f.adapter.observe(f.command(s,2))).status,'collected');
});
test('native foreground/permission/URL failures never call read or substitute headless success',async()=>{
 for(const mutate of [s=>s.window.focused=false,s=>s.window.type='popup',s=>s.window.incognito=true,s=>s.window.id=5,s=>s.tab.active=false,
  s=>s.tab.incognito=true,s=>s.tab.status='loading',s=>s.tab.pendingUrl='https://www.stardewvalley.net/about/',s=>s.tab.url+='?changed=1',s=>s.permission=false]){
  const f=setup(),session=await f.begin();mutate(f.state);const out=await f.adapter.observe(f.command(session));assert.equal(out.status,'unavailable');assert.equal(f.calls.read.length,0);
 }
});
test('events at read, after-read and attestation boundaries invalidate without publishing partial text',async()=>{
 for(const stage of ['read-event','after-read-focus','attest-event','after-attest-focus']){
  const f=setup(),s=await f.begin(),read=f.reader.read,attest=f.reader.attest;
  f.reader.read=async(...args)=>{const r=await read(...args);if(stage==='read-event')f.events.updated.emit(9,{url:FIXED_CASES[0].url});if(stage==='after-read-focus')f.state.window.focused=false;return r;};
  f.reader.attest=async(...args)=>{const r=await attest(...args);if(stage==='attest-event')f.events.focus.emit(4);if(stage==='after-attest-focus')f.state.window.focused=false;return r;};
  const out=await f.adapter.observe(f.command(s));assert.equal(out.status,'unavailable');assert.equal(Object.hasOwn(out,'body'),false);assert.equal(Object.hasOwn(out,'nativeWitness'),false);
 }
});
test('tab switch and cross-document native mismatch cannot pass the three checks',async()=>{
 const f=setup(),s=await f.begin(),original=f.reader.read;f.reader.read=async(...args)=>{const r=await original(...args);f.state.tab.id=10;return r;};
 assert.equal((await f.adapter.observe(f.command(s))).reason,'context-changed');assert.equal(f.calls.attest.length,0);
 const g=setup(),t=await g.begin();g.reader.attest=async()=>({contractVersion:'page-content-attestation/1',status:'unsupported',reason:'document-mismatch'});
 assert.equal((await g.adapter.observe(g.command(t))).reason,'native-document-changed');
});
test('single-flight and endStudy fence an awaited read, detach listeners, and forbid reuse',async()=>{
 const f=setup(),s=await f.begin();let release;f.reader.read=()=>new Promise(yes=>{release=yes;});
 const pending=f.adapter.observe(f.command(s));while(!release)await Promise.resolve();
 await assert.rejects(f.adapter.observe(f.command(s)),{code:'single-flight'});
 f.adapter.endStudy({studyId:s.studyId,studyRevision:s.studyRevision});assert.equal(f.events.focus.size(),0);
 release({documentId:'native-document-1',result:{}});assert.equal((await pending).reason,'context-changed');
 await assert.rejects(f.adapter.observe(f.command(s)),{code:'study-identity'});
});
test('endStudy wins pending begin initialization; no late listener installation/publication or pre-ready observation',async t=>{
 const revision='synthetic-fixed-revision';t.mock.method(crypto,'randomUUID',()=>revision);
 const f=setup(),pending=f.begin();
 const identity={studyId:'synthetic-study-0001',studyRevision:revision};
 const premature=assert.rejects(f.adapter.observe({...identity,caseId:FIXED_CASES[0].id,ordinal:1,observationNonce:'synthetic-observation-1'}),{code:'study-initializing'});
 f.adapter.endStudy(identity);await premature;await assert.rejects(pending,{code:'study-initialization'});
 for(const event of Object.values(f.events))assert.equal(event.size(),0);assert.equal(f.calls.read.length,0);
 await assert.rejects(f.adapter.observe({...identity,caseId:FIXED_CASES[0].id,ordinal:1,observationNonce:'synthetic-observation-1'}),{code:'study-identity'});
});
test('unknown native event shapes and event capacity fail closed, without raw callback errors',async()=>{
 const f=setup(),s=await f.begin();f.events.activated.emit({tabId:'bad',windowId:4});
 await assert.rejects(f.adapter.observe(f.command(s)),e=>e instanceof NativeReaderTransferError&&e.code==='native-event'&&!e.message.includes('bad'));
 const g=setup(),t=await g.begin();for(let i=0;i<4097;i++)g.events.focus.emit(4);
 await assert.rejects(g.adapter.observe(g.command(t)),{code:'native-event'});
});
test('raw/effective title production rule and strict paired bounds preserve exact multilingual input',async()=>{
 for(const rawTitle of ['', '   ', '  Fran\u00e7ais \u4e2d\u6587  ']){
  const f=setup(),s=await f.begin(),original=f.reader.read;f.reader.read=async(...args)=>{const r=await original(...args);r.result.title=rawTitle;return r;};
  const out=await f.adapter.observe(f.command(s));assert.equal(out.rawTitle,rawTitle);assert.equal(out.effectiveTitle,rawTitle.trim()||new URL(FIXED_CASES[0].url).hostname);
 }
 for(const alter of [r=>r.title='x'.repeat(201),r=>r.text='x'.repeat(4097),r=>r.title='bad\u0001',r=>r.text='bad\ud800',r=>r.extractorVersion='unknown']){
  const f=setup(),s=await f.begin(),original=f.reader.read;f.reader.read=async(...args)=>{const r=await original(...args);alter(r.result);return r;};
  await assert.rejects(f.adapter.observe(f.command(s)),{code:'native-contract'});
 }
 const f=setup(),s=await f.begin(),original=f.reader.read;f.reader.read=async(...args)=>{const r=await original(...args);r.documentId='x'.repeat(129);return r;};
 await assert.rejects(f.adapter.observe(f.command(s)),{code:'native-contract'});
});
test('unsupported reader results stay finite unavailable; malformed read/attest data is not accepted',async()=>{
 const f=setup(),s=await f.begin();f.reader.read=async()=>({documentId:'native-document-1',result:{contractVersion:'page-content/1',status:'unsupported',reason:'missing-region'}});
 assert.deepEqual(await f.adapter.observe(f.command(s)),{status:'unavailable',caseId:FIXED_CASES[0].id,ordinal:1,reason:'reader-missing-region'});
 const g=setup(),t=await g.begin();g.reader.attest=async()=>({contractVersion:'page-content-attestation/1',status:'attested',url:FIXED_CASES[1].url});
 await assert.rejects(g.adapter.observe(g.command(t)),{code:'native-contract'});
});
test('command accessors reject without invoking getters; result data is detached from injected reader',async()=>{
 const f=setup(),s=await f.begin();let calls=0;const command=f.command(s);Object.defineProperty(command,'ordinal',{enumerable:true,get(){calls++;throw 0;}});
 await assert.rejects(f.adapter.observe(command));assert.equal(calls,0);
 let captured;const original=f.reader.read;f.reader.read=async(...args)=>{captured=await original(...args);return captured;};
 const out=await f.adapter.observe(f.command(s));captured.result.title='mutated';captured.documentId='other';assert.equal(out.rawTitle,'  Native title  ');assert.equal(out.nativeWitness.documentId,'native-document-1');
});
test('manifest is minimal and factory stays inert; no external messaging/storage/loopback capabilities',()=>{
 const manifest=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url))),source=readFileSync(new URL('./native-adapter.js',import.meta.url),'utf8');
 assert.deepEqual(manifest.permissions,['scripting','tabs']);assert.equal(manifest.host_permissions.length,29);
 assert.deepEqual(new Set(manifest.host_permissions),new Set(FIXED_CASES.map(c=>new URL(c.url).origin+'/*')));
 for(const forbidden of ['externally_connectable','web_accessible_resources','content_scripts','optional_host_permissions'])assert.equal(Object.hasOwn(manifest,forbidden),false);
 assert.equal(manifest.background.service_worker,'worker.js');assert.ok(!source.includes('import('));assert.ok(!source.includes('globalThis.chrome'));assert.ok(!source.includes('onMessage'));
 assert.equal(Object.hasOwn(globalThis,'nativeReaderTransfer'),false);
});
test('MV3 worker statically wires only real staged production capabilities, without configuration or dynamic fallback',()=>{
 const source=readFileSync(new URL('./worker.js',import.meta.url),'utf8');
 const imports=[...source.matchAll(/^import .+ from '([^']+)';$/gmu)].map(m=>m[1]);
 assert.deepEqual(imports,['./chromium/page-content-reader.js','./core/page-content-policy.js','./native-adapter.js','./native-rights.js']);
 assert.ok(source.includes('const chromeApi=globalThis.chrome;'));assert.ok(source.includes('createPageContentReader(chromeApi.scripting)'));
 assert.ok(source.includes('createNativeReaderTransfer({chromeApi,reader,urlPolicy})'));
 assert.ok(source.includes('createNativeDocumentRights({chromeApi,attestDocument:attestContentDocument,urlPolicy})'));
 for(const forbidden of ['import(','onMessage','storage','isPaired','fetch(','eval(','...'])assert.ok(!source.includes(forbidden));
});
test('preflight skip consumes exact ordered case and nonce with ZERO native calls, then next observe succeeds',async()=>{
 const f=setup(),s=await f.begin(),before={...f.calls};
 const row=f.adapter.skipUnavailable({...f.command(s),reason:'origin-policy-refused'});
 assert.deepEqual(row,{status:'unavailable',caseId:FIXED_CASES[0].id,ordinal:1,reason:'origin-policy-refused'});assert.ok(Object.isFrozen(row));
 assert.equal(f.calls.foreground,before.foreground);assert.equal(f.calls.read.length,0);assert.equal(f.calls.attest.length,0);
 assert.equal(Object.hasOwn(row,'nativeWitness'),false);assert.equal(Object.hasOwn(row,'body'),false);
 assert.throws(()=>f.adapter.skipUnavailable({...f.command(s),reason:'article-unavailable'}),{code:'observation-replay'});
 f.state.tab.url=FIXED_CASES[1].url;
 await assert.rejects(f.adapter.observe(f.command(s,2,'synthetic-observation-1')),{code:'observation-replay'});
 assert.equal((await f.adapter.observe(f.command(s,2))).status,'collected');
});
test('skip validates finite exact schema and refuses leap/prebegin/end/in-flight work without native calls',async()=>{
 const f=setup(),fake={studyId:'synthetic-study-0001',studyRevision:'not-ready',caseId:FIXED_CASES[0].id,ordinal:1,observationNonce:'synthetic-observation-1',reason:'article-unavailable'};
 assert.throws(()=>f.adapter.skipUnavailable(fake),{code:'study-identity'});const s=await f.begin();
 for(const reason of ['unknown','rights-approved','article-unavailable ',null])assert.throws(()=>f.adapter.skipUnavailable({...f.command(s),reason}),{code:'skip-reason'});
 assert.throws(()=>f.adapter.skipUnavailable({...f.command(s,2),reason:'article-unavailable'}),{code:'observation-replay'});
 assert.throws(()=>f.adapter.skipUnavailable({...f.command(s),reason:'article-unavailable',extra:true}),{code:'command-contract'});
 assert.equal(f.calls.foreground,0);
 let release;f.reader.read=()=>new Promise(yes=>{release=yes;});const pending=f.adapter.observe(f.command(s));while(!release)await Promise.resolve();
 assert.throws(()=>f.adapter.skipUnavailable({...f.command(s,2),reason:'article-unavailable'}),{code:'single-flight'});
 f.adapter.endStudy({studyId:s.studyId,studyRevision:s.studyRevision});release({documentId:'doc',result:{}});await pending;
 assert.throws(()=>f.adapter.skipUnavailable({...f.command(s,2),reason:'article-unavailable'}),{code:'study-identity'});
});
test('all five preflight reasons stay metadata-only; skip cannot race unfinished initialization',async t=>{
 const f=setup();t.mock.method(crypto,'randomUUID',()=> 'synthetic-fixed-revision');const begin=f.begin();
 assert.throws(()=>f.adapter.skipUnavailable({studyId:'synthetic-study-0001',studyRevision:'synthetic-fixed-revision',caseId:FIXED_CASES[0].id,ordinal:1,observationNonce:'synthetic-observation-1',reason:'article-unavailable'}),{code:'study-initializing'});
 const s=await begin;
 for(const [i,reason]of ['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable','restricted-rendering'].entries()){
  assert.equal(f.adapter.skipUnavailable({...f.command(s,i+1),reason}).reason,reason);
 }
 assert.equal(f.calls.foreground,0);assert.equal(f.calls.read.length,0);assert.equal(f.calls.attest.length,0);
});
