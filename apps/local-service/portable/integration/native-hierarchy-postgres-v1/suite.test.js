import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,createAssertionLedger} from './suite.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function invented(ledger){
 await ledger.test(CASES[0].name,()=>{});
 await ledger.test(CASES[1].name,{skip:false,timeout:180000},async t=>{for(const row of CASES.slice(2,22))await t.test(row.name,()=>{});});
 await ledger.test(CASES[22].name,{skip:false,timeout:180000},async t=>{for(const row of CASES.slice(23))await t.test(row.name,()=>{});});
}
test('invented ordered3outer+22children ledger requires all25 awaited successes',async()=>{
 let guards=0;const l=createAssertionLedger({guard:()=>{guards++;}});assert.equal(CASES.length,25);assert.ok(Object.isFrozen(CASES));
 await invented(l);const rows=l.finish();assert.equal(rows.length,25);assert.deepEqual(rows.map(r=>[r.name,r.depth]),CASES.map(r=>[r.name,r.depth]));
 assert.ok(rows.every(r=>r.status==='passed'));assert.ok(guards>=50);assert.equal(l.snapshot().pending,0);assert.equal(l.snapshot().closed,true);
 await assert.rejects(l.test(CASES[0].name,()=>{}),{code:'ASSERTION_CLOSED'});
});
test('missing inventory, skipped points, wrong titles and duplicate completion cannot pass',async()=>{
 const l=createAssertionLedger({guard:()=>{}});assert.throws(()=>l.finish(),{code:'ASSERTION_INCOMPLETE'});
 for(const [name,options] of [[CASES[0].name,{skip:true}],['wrong',{}],[CASES[0].name,{timeout:999}]]){
  const f=createAssertionLedger({guard:()=>{}});await assert.rejects(f.test(name,options,()=>{}));assert.equal(f.snapshot().failed,true);
 }
});
test('first falsy assertion failure cannot be swallowed by a parent and become success',async()=>{
 for(const primary of [undefined,null,false,0,'']){
  const l=createAssertionLedger({guard:()=>{}});await l.test(CASES[0].name,()=>{});let caught=false;
  try{await l.test(CASES[1].name,{skip:false,timeout:180000},async t=>{try{await t.test(CASES[2].name,()=>{throw primary;});}catch{}});}
  catch(e){caught=true;assert.equal(e,primary);}assert.equal(caught,true);assert.equal(l.snapshot().failed,true);assert.throws(()=>l.finish(),e=>e===primary);
 }
});
test('retained child callback and overlapping outer registrations are denied',async()=>{
 const l=createAssertionLedger({guard:()=>{}}),d=deferred();let retained;
 await l.test(CASES[0].name,()=>{});const pending=l.test(CASES[1].name,{skip:false,timeout:180000},async t=>{retained=t;await d.promise;});await flush();
 await assert.rejects(l.test(CASES[22].name,()=>{}),{code:'ASSERTION_OVERLAP'});d.resolve();await assert.rejects(pending,{code:'ASSERTION_OVERLAP'});
 await assert.rejects(retained.test(CASES[2].name,()=>{}));
});
test('original180s timer refuses success without pretending to cancel original callback',async()=>{
 let time=0,timer;const l=createAssertionLedger({guard:()=>{},now:()=>time,schedule(fn,ms){assert.equal(ms,180000);timer=fn;return 1;},cancel(){}}),d=deferred();
 await l.test(CASES[0].name,()=>{});const pending=l.test(CASES[1].name,{skip:false,timeout:180000},()=>d.promise);await flush();
 time=180000;timer();await assert.rejects(pending,{code:'ASSERTION_DEADLINE'});assert.equal(l.snapshot().pending,1);
 assert.equal(l.snapshot().rows[1].pendingPhysical,true);assert.throws(()=>l.finish(),{code:'ASSERTION_DEADLINE'});d.resolve();await flush();assert.equal(l.snapshot().pending,0);
});
test('unawaited children and backwards clocks fail before accepting the outer row',async()=>{
 const d=deferred(),l=createAssertionLedger({guard:()=>{}});await l.test(CASES[0].name,()=>{});let child;
 await assert.rejects(l.test(CASES[1].name,{skip:false,timeout:180000},t=>{child=t.test(CASES[2].name,()=>d.promise);}),{code:'ASSERTION_UNAWAITED_CHILD'});
 d.resolve();await assert.rejects(child,{code:'ASSERTION_UNAWAITED_CHILD'});assert.equal(l.snapshot().failed,true);
 let time=10;const c=createAssertionLedger({guard:()=>{},now:()=>time});await assert.rejects(c.test(CASES[0].name,()=>{time=9;}),{code:'ASSERTION_CLOCK'});
});
