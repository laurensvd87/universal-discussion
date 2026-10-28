import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoredHierarchyCoordinator,createStoredHierarchyCoordinatorForTest} from '../src/application/stored-hierarchy-coordinator.js';

const HASH='a'.repeat(64),GEN='stored-generation',defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const row=n=>({ordinal:String(n),sourceId:'private-source-'+n,title:'Private raw title',url:'https://example.org/private-input'});
function clock(){
 const pending=[];let event=defer();
 return {wait:(ms,signal)=>new Promise(resolve=>{
  let done=false;const stop=()=>{if(done)return;done=true;signal.removeEventListener('abort',stop);resolve();};
  signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();pending.push({ms,release:stop});event.resolve();
 }),async next(){while(!pending.length){await event.promise;event=defer();}return pending.shift();}};
}
function fixture({rows=[],prepare=async value=>({sourceId:value.sourceId}),reclassify=async()=>[{status:'recorded'}],readGeneration=async()=>GEN,candidates=null,requested=null}={}){
 const calls=[],timing=clock();
 const resources={descriptor:{installed:{matcherIdentityHash:HASH}},prepareStoredSource:async value=>{calls.push(['prepare',value.ordinal]);return prepare(value);},
  storedSources:{candidates:async input=>{calls.push(['candidates',input]);return candidates?candidates(input):{generation:input.generation,matcherIdentityHash:HASH,candidates:rows};},
   reclassify:async input=>{calls.push(['reclassify',input]);return reclassify(input);}}};
 if(requested)resources.storedSources.requested=async input=>{calls.push(['requested',input]);return requested(input);};
 const options={resources,readGeneration:async()=>{calls.push(['generation']);return readGeneration();}};
 return {calls,timing,resources,options,create:()=>createStoredHierarchyCoordinatorForTest(options,{wait:timing.wait})};
}
async function release(clock,ms){const value=await clock.next();assert.equal(value.ms,ms);value.release();}

test('opened pages jump the scan without moving its keyset; eight urgent turns still permit background progress',async()=>{
 let urgent=0,ordinary=0;
 const f=fixture({requested:async input=>({ ...input,candidates:urgent++===0?[]:[row(9000+urgent)] }),
  candidates:async input=>({...input,candidates:ordinary++===0?Array.from({length:10},(_,i)=>row(i)):[]})});
 // Repository responses contain only the scope and candidates, not read args.
 const read=f.resources.storedSources.candidates;f.resources.storedSources.candidates=async input=>{const p=await read(input);return {generation:p.generation,matcherIdentityHash:p.matcherIdentityHash,candidates:p.candidates};};
 const c=f.create();c.start();for(let i=0;i<10;i++)await release(f.timing,5);await release(f.timing,250);
 for(let i=0;i<8;i++)await release(f.timing,5);
 const idle=await f.timing.next();assert.equal(idle.ms,2000);
 assert.deepEqual(f.calls.filter(call=>call[0]==='candidates').map(call=>call[1].afterOrdinal),[null,'9']);
 assert.equal(f.calls.filter(call=>call[0]==='requested').length,9);
 assert.equal(c.describe().counters.recorded,18);assert.equal(c.describe().counters.batches,2);await c.close();
});

test('close drains an original priority read and fences its late preparation',async()=>{
 const gate=defer(),entered=defer(),f=fixture({requested:async input=>{entered.resolve();await gate.promise;return {...input,candidates:[row(999)]};}}),c=f.create();
 c.start();await entered.promise;let done=false;const closing=c.close().then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);
 gate.resolve();await closing;assert.equal(f.calls.some(call=>call[0]==='prepare'||call[0]==='candidates'),false);
});

test('construction is inert and a short sequential batch skips ineligible/invalid rows, then rewinds without exposing material',async()=>{
 const f=fixture({rows:[row(0),row(1),row(2)],prepare:async value=>{if(value.ordinal==='1')return null;if(value.ordinal==='2')throw new TypeError('Private validation failure');return {sourceId:value.sourceId};}});
 const c=f.create();assert.deepEqual(f.calls,[]);assert.equal(c.describe().lastOutcome,'not-started');assert.equal(c.start(),c);
 for(let i=0;i<3;i++)await release(f.timing,5);
 const workPause=await f.timing.next();assert.equal(workPause.ms,250);
 assert.deepEqual(f.calls.filter(call=>call[0]==='prepare').map(call=>call[1]),['0','1','2']);
 assert.equal(f.calls.filter(call=>call[0]==='reclassify').length,1);
 assert.deepEqual(c.describe().counters,{batches:1,candidates:3,prepared:1,recorded:1,reused:0,skipped:1,invalid:1,failures:0,generationChanges:0});
 const json=JSON.stringify(c.describe());assert.equal(json.includes('Private'),false);assert.equal(json.includes('https:'),false);assert.equal(json.includes('source-'),false);
 assert.ok(Object.isFrozen(c.describe().counters));
 f.resources.storedSources.candidates=async input=>{f.calls.push(['candidates',input]);return {generation:GEN,matcherIdentityHash:HASH,candidates:[]};};
 workPause.release();const idle=await f.timing.next();assert.equal(idle.ms,2000);
 assert.equal(f.calls.filter(call=>call[0]==='candidates').at(-1)[1].afterOrdinal,null);
 await c.close();assert.equal(c.describe().phase,'closed');assert.throws(()=>c.start(),{code:'unavailable'});
});

test('full batches use ordinal keysets and end-of-pass resets revisit earlier changed versions',async()=>{
 let batch=0;const f=fixture({candidates:async input=>({generation:input.generation,matcherIdentityHash:HASH,candidates:batch++===0?Array.from({length:10},(_,i)=>row(i)):[]})}),c=f.create();c.start();
 for(let i=0;i<10;i++)await release(f.timing,5);await release(f.timing,250);
 await release(f.timing,2000);const idle=await f.timing.next();assert.equal(idle.ms,2000);
 assert.deepEqual(f.calls.filter(call=>call[0]==='candidates').map(call=>call[1].afterOrdinal),[null,'9',null]);
 for(const [,input] of f.calls.filter(call=>call[0]==='candidates')){assert.equal(input.limit,10);assert.equal(input.matcherIdentityHash,HASH);}
 await c.close();
});

test('generation changes reset an unfinished pass while retaining the fixed matcher identity',async()=>{
 let generation=GEN;const f=fixture({readGeneration:async()=>generation,candidates:async input=>({generation:input.generation,matcherIdentityHash:HASH,
  candidates:input.generation===GEN?Array.from({length:10},(_,i)=>row(i)):[]})}),c=f.create();c.start();
 for(let i=0;i<10;i++)await release(f.timing,5);generation='next-generation';await release(f.timing,250);
 const idle=await f.timing.next();assert.equal(idle.ms,2000);const request=f.calls.filter(call=>call[0]==='candidates').at(-1)[1];
 assert.equal(request.generation,'next-generation');assert.equal(request.afterOrdinal,null);assert.equal(request.matcherIdentityHash,HASH);assert.equal(c.describe().counters.generationChanges,1);await c.close();
});

test('preparation infrastructure failure stops the batch and revisits the failing ordinal without replaying prior success',async()=>{
 let fail=true;const f=fixture({candidates:async input=>({generation:GEN,matcherIdentityHash:HASH,candidates:input.afterOrdinal===null?[row(0),row(1)]:[row(1)]}),
  prepare:async value=>{if(value.ordinal==='1'&&fail)throw Error('Encoder unavailable private text');return {sourceId:value.sourceId};}}),c=f.create();c.start();
 await release(f.timing,5);const backoff=await f.timing.next();assert.equal(backoff.ms,2000);assert.equal(c.describe().lastOutcome,'preparation-unavailable');
 assert.equal(f.calls.filter(call=>call[0]==='reclassify').length,1);fail=false;backoff.release();await release(f.timing,5);
 const work=await f.timing.next();assert.equal(work.ms,250);assert.equal(f.calls.filter(call=>call[0]==='candidates').at(-1)[1].afterOrdinal,'0');
 assert.equal(c.describe().counters.recorded,2);assert.equal(c.describe().counters.failures,1);await c.close();
});

test('uncertain reclassification and stale installed-head reads back off without changing matcher or activating anything',async()=>{
 let rejectRead=false;const f=fixture({candidates:async input=>{if(rejectRead)throw Object.assign(Error('Private head mismatch'),{code:'conflict'});return {generation:GEN,matcherIdentityHash:HASH,candidates:[row(0)]};},
  reclassify:async()=>{throw Object.assign(Error('Private SQL uncertainty'),{code:'conflict'});}}),c=f.create();c.start();
 const backoff=await f.timing.next();assert.equal(backoff.ms,2000);assert.equal(c.describe().lastOutcome,'reclassification-uncertain');rejectRead=true;backoff.release();
 const next=await f.timing.next();assert.equal(next.ms,2000);assert.equal(c.describe().lastOutcome,'candidates-unavailable');
 assert.equal(f.calls.filter(call=>call[0]==='reclassify').length,1);assert.equal(c.describe().counters.failures,2);await c.close();
});

test('close waits exact original generation, candidate, preparation and reclassification promises without publishing follow-up work',async()=>{
 for(const stage of ['generation','candidates','prepare','reclassify']){
  const held=defer(),entered=defer();let returned=false;
  const options={readGeneration:async()=>{if(stage==='generation'){entered.resolve();await held.promise;}return GEN;},
   candidates:async()=>{if(stage==='candidates'){entered.resolve();await held.promise;}return {generation:GEN,matcherIdentityHash:HASH,candidates:[row(0)]};},
   prepare:async()=>{if(stage==='prepare'){entered.resolve();await held.promise;}return {sourceId:'private-source'};},
   reclassify:async()=>{if(stage==='reclassify'){entered.resolve();await held.promise;}return [{status:'recorded'}];}};
  const f=fixture(options),c=f.create();c.start();await entered.promise;const closing=c.close().then(()=>{returned=true;});await Promise.resolve();await Promise.resolve();assert.equal(returned,false,stage);
  const count=f.calls.length;held.resolve();await closing;assert.equal(returned,true);assert.equal(f.calls.length,count);assert.equal(c.describe().counters.recorded,0);await c.close();
 }
});

test('close before start and malformed configuration perform no work; invalid generation reports finite counters',async()=>{
 const f=fixture(),c=createStoredHierarchyCoordinator(f.options);await c.close();assert.deepEqual(f.calls,[]);assert.throws(()=>c.start(),{code:'unavailable'});
 assert.throws(()=>createStoredHierarchyCoordinator({...f.options,path:'arbitrary'}),TypeError);
 let hooks=0;const forged={...f.options};Object.defineProperty(forged,'readGeneration',{enumerable:true,get(){hooks++;return ()=>GEN;}});
 assert.throws(()=>createStoredHierarchyCoordinator(forged),TypeError);assert.equal(hooks,0);
 const invalid=fixture({readGeneration:async()=>({generation:GEN})}),bad=invalid.create();bad.start();const idle=await invalid.timing.next();assert.equal(idle.ms,2000);
 assert.equal(bad.describe().lastOutcome,'generation-unavailable');assert.equal(bad.describe().counters.failures,1);assert.equal(invalid.calls.some(c=>c[0]==='candidates'),false);await bad.close();
});
