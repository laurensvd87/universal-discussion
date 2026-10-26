import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {createCaptureContextObservation,RETAINED_BYTES} from './observation.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const root=new URL('../../../../../',import.meta.url);
const old='spikes/topic-resolution/harness/experimental/native-specificity-study-v19/';
const listBytes=readFileSync(new URL(old+'source-paths.js',root));
assert.equal(sha(listBytes),'f806aafcb5e41e83853e09b4efe930737d068d6a6cca86401cafc97390354c29');
const mapBytes=readFileSync(new URL(old+'reviewed-sources-r3.json',root));
assert.equal(sha(mapBytes),'9da490a224e59feaca9a959ff1a8d68684ca2f49930fbb2125fb68a90adff1c0');
// Authenticate literal keys BEFORE following/importing any frozen dependency.
const paths=JSON.parse(listBytes.toString().match(/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);/)[1]);
assert.equal(paths.length,128);assert.deepEqual(paths,[...new Set(paths)].sort());
for(const p of paths)assert.match(p,/^(?!.*(?:\.\.|\\|\/\.))[A-Za-z0-9_./-]+$/);
const map=JSON.parse(mapBytes);assert.deepEqual(Object.keys(map.sourceHashes),paths);
for(const p of paths)assert.equal(sha(readFileSync(new URL(p,root))),map.sourceHashes[p],p);
const baseline=await import('../native-specificity-study-v19/browser-capture.mjs');
const {createSpecificityDriverFailureBoundary}=await import('../native-specificity-study-v19/driver.mjs');
// Preserve and run the complete frozen driver fixture entry, including all old
// diagnostic variants and its 96 navigation tuples. No copied old assertions.
await import('../native-specificity-study-v19/driver.test.mjs');

const tuples=[['cdp-frame','main','main',null],['cdp-frame','parent-absent','nonmain',null],
 ['cdp-frame','parent-mismatch','child',null],['cdp-within','main','main',null],
 ['playwright','main-detached','unexamined',true],['playwright','main','main',false]];
const originals=[undefined,null,false,0,-0,NaN,'',true,1,Symbol('original'),Object.freeze({private:'never inspect'})];
const source=readFileSync(new URL('./observation.mjs',import.meta.url),'utf8');
function claim(slot,error,binding,tuple=tuples[0]){assert.equal(slot('terminal',error,binding,...tuple),null);}
function navigation(slot,error,binding){slot('navigation',error,binding,'within','active','matched','exact');}
function factoryWithFreeze(freeze){
 // Exact production source; isolated Object facade affects only fresh view
 // freeze. It is not a runtime injection seam or a global intrinsic mutation.
 return Function('Object',"'use strict';\n"+source.replaceAll('export ','')+'\nreturn createCaptureContextObservation;')({freeze,is:Object.is});
}
function envelope(witness){return {schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',
 primary:{family:'capture',code:'terminal-frame-navigation'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},
 journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:witness};}
function ownRecord(value,keys){
 assert.ok(value!==null&&typeof value==='object'&&!types.isProxy(value));
 assert.ok(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
 assert.equal(Reflect.ownKeys(value).length,keys.length);
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;
}
function prototypeWireProject(value){
 // Deliberately external allocation domain, NOT included in the holder256.
 const d=ownRecord(value,['schema','stage','rpc','primary','cleanup','journeyWitness','timerWitness','infrastructureWitness','networkWitness','operationWitness','ownerNavigationWitness','navigationAccountingWitness']);
 const w=ownRecord(d.navigationAccountingWitness,['schema','site','predicate','frameRelation','mainDetached']);
 assert.equal(w.schema,'native-terminal-navigation-observation/v1');
 assert.ok(tuples.some(t=>t[0]===w.site&&t[1]===w.predicate&&t[2]===w.frameRelation&&t[3]===w.mainDetached));
 const base=baseline.projectSpecificityCaptureDiagnostic({...d,navigationAccountingWitness:null});
 assert.deepEqual(base.primary,{family:'capture',code:'terminal-frame-navigation'});
 for(const k of ['journeyWitness','timerWitness','infrastructureWitness','networkWitness','operationWitness','ownerNavigationWitness'])assert.equal(base[k],null);
 const result={...base,navigationAccountingWitness:Object.freeze(w)};
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=700);return Object.freeze(result);
}

test('six legal terminal tuples preserve exact frozen field order and original identity',()=>{
 for(const t of tuples)for(const error of originals){const slot=createCaptureContextObservation(),binding=Symbol();claim(slot,error,binding,t);
  const view=slot('selectPrimary',error,binding);
  assert.deepEqual(view,{schema:'native-terminal-navigation-observation/v1',site:t[0],predicate:t[1],frameRelation:t[2],mainDetached:t[3]});
  assert.deepEqual(Object.keys(view),['schema','site','predicate','frameRelation','mainDetached']);assert.ok(Object.isFrozen(view));
  assert.equal(slot('selectPrimary',error,binding),null);assert.equal(slot('retainedBytes'),256);
 }
});
test('exhaustive old navigation data constraints agree with the authenticated actual projector',()=>{
 let valid=0;
 for(const site of ['fresh','within','public','read','seal','retire'])for(const state of ['active','sealed','retiring','released','unavailable'])
 for(const balance of ['matched','unmatched','unavailable'])for(const urlRelation of ['not-examined','exact','different','blank','unavailable']){
  const slot=createCaptureContextObservation(),binding=Symbol(),error={};slot('navigation',error,binding,site,state,balance,urlRelation);
  const witness=slot('selectPrimary',error,binding),candidate={schema:'native-main-navigation-observation/v1',site,state,balance,urlRelation};
  const d={...envelope(candidate),primary:{family:'unclassified',code:'unclassified'}};
  let oracle=null;try{oracle=baseline.projectSpecificityCaptureDiagnostic(d).navigationAccountingWitness;}catch{}
  assert.deepEqual(witness,oracle);if(witness)valid++;
 }assert.equal(valid,96);
});
test('all terminal field combinations admit exactly six tuples; malformed first claims stay null',()=>{
 let valid=0;
 for(const site of ['cdp-frame','cdp-within','playwright','other'])for(const predicate of ['main','parent-absent','parent-mismatch','main-detached','other'])
 for(const relation of ['main','nonmain','child','unexamined','other'])for(const detached of [null,true,false,undefined]){
  const slot=createCaptureContextObservation(),b=Symbol(),error={};slot('terminal',error,b,site,predicate,relation,detached);
  const expected=tuples.some(t=>t[0]===site&&t[1]===predicate&&t[2]===relation&&t[3]===detached);
  const view=slot('selectPrimary',error,b);assert.equal(view!==null,expected);if(view)valid++;
 }assert.equal(valid,6);
});
test('Object.is distinguishes signed zeros and accepts NaN; symbols match by identity only',()=>{
 const b=Symbol('same');for(const [claimed,selected,works]of [[0,-0,false],[-0,0,false],[NaN,NaN,true]]){
  const slot=createCaptureContextObservation();claim(slot,claimed,b);assert.equal(slot('selectPrimary',selected,b)!==null,works);assert.equal(slot('selectPrimary',claimed,b),null);
 }
 const slot=createCaptureContextObservation();claim(slot,false,b);assert.equal(slot('selectPrimary',false,Symbol('same')),null);assert.equal(slot('selectPrimary',false,b),null);
 const shared=Symbol.for('invented-public-binding'),s=createCaptureContextObservation();claim(s,false,shared);assert.ok(s('selectPrimary',false,shared));
});
test('selection before claim blocks identical later falsy values, and cleanup cannot lend context',()=>{
 for(const error of originals)for(const selector of ['selectPrimary','selectCleanup'])for(const before of [true,false]){
  const slot=createCaptureContextObservation(),b=Symbol();if(!before)claim(slot,error,b);
  const result=selector==='selectCleanup'?slot(selector,error):slot(selector,error,b);
  assert.equal(result!==null,selector==='selectPrimary'&&!before);
  claim(slot,error,b);assert.equal(slot('selectPrimary',error,b),null);
 }
});
test('unrelated first primary, wrong binding, invalid claim and competing union variants never retry',()=>{
 for(const error of originals){const b=Symbol(),s=createCaptureContextObservation();assert.equal(s('selectPrimary',error,b),null);claim(s,error,b);assert.equal(s('selectPrimary',error,b),null);}
 for(const first of ['navigation','terminal']){
  const s=createCaptureContextObservation(),b=Symbol(),e={};if(first==='navigation')navigation(s,e,b);else claim(s,e,b);
  const later={};if(first==='navigation')claim(s,later,b);else navigation(s,later,b);
  assert.equal(s('selectPrimary',later,b),null);assert.equal(s('selectPrimary',e,b),null);
 }
 for(const b of [null,undefined,{},()=>{},0,'symbol']){const s=createCaptureContextObservation(),token=Symbol(),e={};claim(s,e,b);claim(s,e,token);assert.equal(s('selectPrimary',e,token),null);}
});
test('release at every state is irreversible, idempotent and never refunds or revokes issued views',()=>{
 for(const stage of ['empty','claimed','selected','invalid','cleanup']){
  const s=createCaptureContextObservation(),e={},b=Symbol();let issued=null;
  if(stage==='claimed'||stage==='selected')claim(s,e,b);if(stage==='selected')issued=s('selectPrimary',e,b);
  if(stage==='invalid')s('terminal',e,b,'bad');if(stage==='cleanup')s('selectCleanup',false);
  const saved=issued&&JSON.stringify(issued);s('release');s('release');claim(s,e,b);navigation(s,e,b);
  assert.equal(s('selectPrimary',e,b),null);assert.equal(s('retainedBytes'),256);
  if(issued){assert.ok(Object.isFrozen(issued));assert.equal(JSON.stringify(issued),saved);}
 }assert.equal(RETAINED_BYTES,256);
});
test('hostile error/context/binding values invoke zero hooks and no payload inspection',()=>{
 let hooks=0;const evil=new Proxy(function(){},{get(){hooks++;throw false;},getPrototypeOf(){hooks++;throw false;},ownKeys(){hooks++;throw false;},apply(){hooks++;throw false;}});
 const getter={get then(){hooks++;throw false;},get code(){hooks++;throw false;},[Symbol.toPrimitive](){hooks++;throw false;}};
 for(const e of [evil,getter]){const s=createCaptureContextObservation(),b=Symbol();claim(s,e,b);assert.ok(s('selectPrimary',e,b));}
 for(const value of [evil,getter])for(let position=0;position<5;position++){
  const s=createCaptureContextObservation(),e={},b=Symbol(),args=[e,b,...tuples[0]];args[position+1]=value;
  s('terminal',...args);assert.equal(s('selectPrimary',e,b),null);
 }assert.equal(hooks,0);
});
test('projection failure is sticky null for truthy/falsy faults, without altering the original',()=>{
 for(const projectionFault of originals){let fail=true;const factory=factoryWithFreeze(value=>{if(fail)throw projectionFault;return Object.freeze(value);});
  const s=factory(),e=Object.freeze({original:true}),b=Symbol();assert.doesNotThrow(()=>claim(s,e,b));
  assert.equal(s('selectPrimary',e,b),null);fail=false;claim(s,e,b);
  assert.equal(s('selectPrimary',e,b),null);assert.deepEqual(e,{original:true});assert.equal(s('retainedBytes'),256);
 }
});
test('release during projection revokes; nested primary or cleanup cannot replace the outer selection',()=>{
 for(const command of ['release','selectPrimary','selectCleanup'])for(const e of originals){
  let s;const b=Symbol();s=factoryWithFreeze(value=>{assert.equal(command==='release'?s(command):command==='selectCleanup'?s(command,e):s(command,e,b),null);return Object.freeze(value);})();
  claim(s,e,b);const view=s('selectPrimary',e,b);assert.equal(view!==null,command!=='release');
  if(view)assert.deepEqual(view,{schema:'native-terminal-navigation-observation/v1',site:'cdp-frame',predicate:'main',frameRelation:'main',mainDetached:null});
  assert.equal(s('selectPrimary',e,b),null);assert.equal(s('retainedBytes'),256);
 }
});
test('claim invocations construct no view; matching later selection alone projects after claim returns',()=>{
 for(const variant of ['navigation','terminal']){
  let claimActive=false,selectionActive=false,projections=0;
  const s=factoryWithFreeze(value=>{assert.equal(claimActive,false);assert.equal(selectionActive,true);projections++;return Object.freeze(value);})(),e={},b=Symbol();
  claimActive=true;if(variant==='navigation')navigation(s,e,b);else claim(s,e,b);claimActive=false;
  assert.equal(projections,0);selectionActive=true;const view=s('selectPrimary',e,b);selectionActive=false;
  assert.ok(view);assert.equal(projections,1);assert.equal(s('selectPrimary',e,b),null);assert.equal(projections,1);
 }
});
test('literal branch source seam preserves short-circuit priorities and throws the same generated object',()=>{
 for(const site of ['cdp-frame','cdp-within','playwright']){
  const s=createCaptureContextObservation(),binding=Symbol(),error={};let laterPredicateReads=0;
  // Invented branch seam only: not a collector callback or private gate proof.
  function refuse(){if(site==='cdp-frame'){if(true){claim(s,error,binding,tuples[0]);throw error;}laterPredicateReads++;}
   else if(site==='playwright'){if(true){claim(s,error,binding,tuples[4]);throw error;}laterPredicateReads++;}
   else{claim(s,error,binding,tuples[3]);throw error;}}
  assert.throws(refuse,value=>value===error);assert.equal(laterPredicateReads,0);assert.ok(s('selectPrimary',error,binding));
 }
});
test('all six terminal views cross the actual driver boundary using an external prototype projector',async()=>{
 let max=0;
 for(const tuple of tuples){const s=createCaptureContextObservation(),e={},b=Symbol();claim(s,e,b,tuple);
  const d=prototypeWireProject(envelope(s('selectPrimary',e,b))),capture=JSON.stringify(d),lines=[];max=Math.max(max,Buffer.byteLength(capture));
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:line=>lines.push(line),captureDiagnostic:()=>capture});
  boundary.mark('browser-capture');await assert.rejects(boundary.run(()=>{throw e;}),value=>value===e);
  assert.equal(lines.length,1);assert.deepEqual(JSON.parse(lines[0]).capture,d);assert.ok(lines[0].length<=900);assert.ok(lines[0].length+31<=1024);
  // Frozen collector intentionally has not been modified to accept this union.
  assert.throws(()=>baseline.projectSpecificityCaptureDiagnostic(d));
 }assert.ok(max<=700);
});
test('external union projector rejects hostile shapes, conflicting witnesses and wrong primary with zero hooks',()=>{
 const s=createCaptureContextObservation(),e={},b=Symbol();claim(s,e,b);const d=envelope(s('selectPrimary',e,b));let hooks=0;
 const getter={...d.navigationAccountingWitness};Object.defineProperty(getter,'site',{enumerable:true,get(){hooks++;throw false;}});
 const proxy=new Proxy(d.navigationAccountingWitness,{getPrototypeOf(){hooks++;throw false;},ownKeys(){hooks++;throw false;}});
 for(const w of [getter,proxy,{...d.navigationAccountingWitness,extra:true},{...d.navigationAccountingWitness,mainDetached:false}])assert.throws(()=>prototypeWireProject({...d,navigationAccountingWitness:w}));
 assert.throws(()=>prototypeWireProject({...d,primary:{family:'unclassified',code:'unclassified'}}));
 assert.throws(()=>prototypeWireProject({...d,timerWitness:{lane:'ordinary',rpc:'Page.navigate'}}));assert.equal(hooks,0);
});
test('finite outer dimensions prove terminal maximum; unchanged old space delegates byteexact to actual oracle',()=>{
 const oldSource=readFileSync(new URL(old+'browser-capture.mjs',root),'utf8');
 const literals=text=>[...text.matchAll(/'([^']+)'/g)].map(m=>m[1]);
 const stages=literals(oldSource.match(/const FAILURE_STAGES=new Set\(\[([^\]]+)\]/)[1]);
 const rpcs=[null,...literals(oldSource.match(/const FAILURE_RPCS=new Set\(\[([^\]]+)\]/)[1])];
 const families=oldSource.match(/const FAILURE_CODES=Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
 const cleanups=[null];
 for(const m of families.matchAll(/(?:'([^']+)'|([a-z]+)):new Set\(\[([^\]]+)\]\)/g))for(const code of literals(m[3]))cleanups.push({family:m[1]??m[2],code});
 // Include the imported closed journey codes and later literal capture additions.
 const journeySource=readFileSync(new URL('spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v3/journey.mjs',root),'utf8');
 const codeLiteral=journeySource.match(/export const CODES=Object\.freeze\(\[([^\]]+)\]/);
 assert.ok(codeLiteral);for(const code of literals(codeLiteral[1]))cleanups.push({family:'public-journey',code});
 for(const m of oldSource.matchAll(/for\(const code of \[([^\]]+)\]\)FAILURE_CODES\.capture\.add\(code\)/g))for(const code of literals(m[1]))cleanups.push({family:'capture',code});
 let maximumCleanup=null;
 for(const cleanup of cleanups){const d={...envelope(null),cleanup};const actual=baseline.projectSpecificityCaptureDiagnostic(d);
  assert.equal(JSON.stringify(actual),JSON.stringify(d));
  if(Buffer.byteLength(JSON.stringify(cleanup))>Buffer.byteLength(JSON.stringify(maximumCleanup)))maximumCleanup=cleanup;
 }
 let max=0;
 for(const t of tuples){const s=createCaptureContextObservation(),e={},b=Symbol();claim(s,e,b,t);const witness=s('selectPrimary',e,b);
  for(const stage of stages)for(const rpc of rpcs){const value=prototypeWireProject({...envelope(witness),stage,rpc,cleanup:maximumCleanup});
   const length=Buffer.byteLength(JSON.stringify(value));max=Math.max(max,length);assert.ok(length<=700);
   const line=JSON.stringify({schema:'native-specificity-execution-failure/v1',phase:'train-cal',stage:'browser-capture',capture:value})+'\n';
   assert.ok(Buffer.byteLength(line)<=900);assert.ok(Buffer.byteLength(line)+31<=1024);
  }
 }assert.equal(max,599);
});
test('source inventory has one callable, five cells, scalar claims and later consuming view allocation',()=>{
 assert.match(source,/let phase=0,first,bound,packed=0,view=null;/);
 assert.equal((source.match(/makeView\(packed\)/g)||[]).length,1);
 assert.ok(source.indexOf('first=undefined;bound=undefined;\n   // Only this later selection')<source.indexOf('original=makeView(packed)'));
 assert.ok(source.indexOf('original=makeView(packed)')<source.indexOf("if(command!=='navigation'"));
 assert.equal((source.match(/return function observation/g)||[]).length,1);
 for(const forbidden of [/\.\.\./,/Object\.(?:keys|values|entries|getOwnPropertyDescriptor)/,/new (?:Map|Set|Array)/,/\[\s*\]/])assert.doesNotMatch(source,forbidden);
 assert.match(source,/if\(phase===2\)view=original/);
 assert.equal(128+(64+6*8)+16,256);
 // Invented arithmetic only, not an actual collector aggregate proof.
 assert.equal(32512+RETAINED_BYTES,32768);assert.ok(32513+RETAINED_BYTES>32768);
});
test('exact arity blocks extra payloads before projection and malformed selection consumes',()=>{
 let projections=0;const factory=factoryWithFreeze(v=>{projections++;return Object.freeze(v);});
 for(const command of ['terminal','navigation'])for(const extra of [true,false]){
  const s=factory(),e={},b=Symbol(),args=command==='terminal'?[command,e,b,...tuples[0]]:[command,e,b,'within','active','matched','exact'];
  if(extra)args.push({unbounded:'not inspected'});else args.pop();s(...args);claim(s,e,b);assert.equal(s('selectPrimary',e,b),null);
 }assert.equal(projections,0);
 for(const command of ['terminal','navigation']){
  const s=factory(),e={},b=Symbol();
  if(command==='terminal')s(command,e,b,'cdp-frame','main','wrong-relation',null);
  else s(command,e,b,'within','wrong-state','matched','exact');
  claim(s,e,b);assert.equal(s('selectPrimary',e,b),null);
 }assert.equal(projections,0);
 for(const selector of ['selectPrimary','selectCleanup']){
  const s=factory(),e={},b=Symbol();claim(s,e,b);assert.equal(s(selector,e,b,'extra'),null);assert.equal(s('selectPrimary',e,b),null);
 }
 const s=factory();assert.equal(s('retainedBytes','extra'),null);assert.equal(s('retainedBytes'),256);
});
test('all128 authenticated frozen CODE end pins and control FILE pins remain unchanged',()=>{
 assert.equal(sha(readFileSync(new URL(old+'source-paths.js',root))),sha(listBytes));
 assert.equal(sha(readFileSync(new URL(old+'reviewed-sources-r3.json',root))),sha(mapBytes));
 for(const p of paths)assert.equal(sha(readFileSync(new URL(p,root))),map.sourceHashes[p],p);
});
