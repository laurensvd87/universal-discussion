import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransientNativeCohort} from './phase-ledger.js';

const h='a'.repeat(64),unit=()=>Array.from({length:384},(_,i)=>i===0?1:i===383?-0:0);
const cases=Array.from({length:32},(_,i)=>({id:'invented-'+(i+1),ordinal:i+1,url:'https://public'+i+'.invalid/article'}));
const cohort=()=>createTransientNativeCohort({cases,producerProfileHash:h,admitAvailable:({fieldBindings,nativeWitness,rightsEvidence})=>{
 assert.equal(nativeWitness.documentId,'native-document');assert.equal(rightsEvidence.sameDocument,true);
 return {inputIdentity:h,evidence:{nativeWitness,rightsEvidence,fieldBindings}};
}});
const row=i=>({caseId:cases[i].id,ordinal:i+1,rawTitle:'  Invented title  ',effectiveTitle:'Invented title',body:'Invented public article sample',
 extractorVersion:'main-text-prefix/v1',nativeWitness:{documentId:'native-document'},rightsEvidence:{sameDocument:true}});
function fill(c,n=32){for(let i=0;i<n;i++)c.available(row(i));}
const encoding=(overrides={})=>({assertBrowserDrained:async()=>true,embed:async()=>unit(),closeEncoder:async()=>true,recheckAssetsAndSources:async()=>true,...overrides});

test('all32 accounted and browser drain precede 64 calls; classification waits for close and asset endchecks',async()=>{
 const c=cohort(),events=[];fill(c,31);assert.throws(()=>c.finishCapture());assert.equal(c.snapshot().phase,'capture');
 await assert.rejects(c.encodeAfterBrowserDrain(encoding()));assert.equal(c.snapshot().encoderCalls,0);c.available(row(31));
 assert.equal(c.finishCapture().accounted,32);assert.throws(()=>c.assess(()=>({accepted:true})));
 const e=await c.encodeAfterBrowserDrain(encoding({assertBrowserDrained:async()=>{events.push('drain');return true;},embed:async text=>{events.push('embed');assert.ok(text);return unit();},
  closeEncoder:async()=>{events.push('close');return true;},recheckAssetsAndSources:async()=>{events.push('recheck');return true;}}));
 assert.equal(e.encoderCalls,64);assert.equal(events[0],'drain');assert.deepEqual(events.slice(-2),['close','recheck']);assert.equal(c.snapshot().retainedTextUnits,0);
 const r=c.assess(value=>{assert.equal(Object.is(value.bodyVector[383],-0),true);assert.equal('body'in value,false);return {selectedRoot:'invented-root'};});
 assert.equal(r.results.length,32);assert.equal(r.semanticTextIndependentlyReconstructable,false);assert.deepEqual(c.snapshot(),{phase:'complete',accounted:32,retainedTextUnits:0,encoderCalls:64,privateVectorRows:0});
 assert.throws(()=>c.assess(()=>({})));await assert.rejects(c.encodeAfterBrowserDrain(encoding()));
});
test('unavailable rows remain in full denominator and cannot trigger encoding or input rescue',async()=>{
 const c=cohort();for(let i=0;i<32;i++)c.unavailable({caseId:cases[i].id,ordinal:i+1,reason:'origin-policy-refused',inputIdentity:h});
 c.finishCapture();let calls=0;await c.encodeAfterBrowserDrain(encoding({embed:async()=>{calls++;return unit();}}));
 const r=c.assess(()=>{throw new Error('must not classify unavailable');});assert.equal(calls,0);assert.equal(r.results.length,32);assert.ok(r.results.every(r=>r.status==='unavailable'));
});
test('both input fields, exact title rule and trusted native/rights admission are checked before any encoder',()=>{
 for(const mutate of [r=>r.effectiveTitle='another title',r=>r.rawTitle='x'.repeat(201),r=>r.body='x'.repeat(4097),r=>r.body+='\u0081',
  r=>r.body='\ud800',r=>r.nativeWitness.documentId='changed',r=>r.rightsEvidence.sameDocument=false,r=>r.extractorVersion='unknown']){
  const c=cohort(),r=row(0);mutate(r);assert.throws(()=>c.available(r));assert.equal(c.snapshot().phase,'failed');assert.equal(c.snapshot().retainedTextUnits,0);assert.equal(c.snapshot().encoderCalls,0);
 }
 const c=cohort(),r=row(0);r.rawTitle='  ';r.effectiveTitle='public0.invalid';c.available(r);assert.equal(c.snapshot().accounted,1);
});
test('duplicate, reordered, accessor and proxy submissions fail closed without invoking hostile fields',()=>{
 for(const input of [row(1),new Proxy(row(0),{getPrototypeOf(){throw new Error('trap');}})]){const c=cohort();assert.throws(()=>c.available(input));assert.equal(c.snapshot().phase,'failed');}
 const c=cohort();c.available(row(0));assert.throws(()=>c.available(row(0)));assert.equal(c.snapshot().retainedTextUnits,0);
 let reads=0;const hostile=row(0);Object.defineProperty(hostile,'body',{enumerable:true,get(){reads++;throw new Error('secret');}});assert.throws(()=>cohort().available(hostile));assert.equal(reads,0);
});
test('drain, embedding, vector, close and endcheck failure erase partial state and never allow scoring or retry',async()=>{
 for(const stage of ['drain','embed','vector','close','recheck']){
  const c=cohort();fill(c);c.finishCapture();let calls=0,closed=0,checked=0;
  await assert.rejects(c.encodeAfterBrowserDrain(encoding({assertBrowserDrained:async()=>stage!=='drain',embed:async()=>{
   calls++;if(stage==='embed'&&calls===2)throw new Error('private');return stage==='vector'?[1]:unit();},closeEncoder:async()=>{closed++;return stage!=='close';},recheckAssetsAndSources:async()=>{checked++;return stage!=='recheck';}})));
  assert.equal(closed,1);assert.equal(checked,1);assert.equal(c.snapshot().phase,'failed');assert.equal(c.snapshot().retainedTextUnits,0);assert.equal(c.snapshot().privateVectorRows,0);
  assert.throws(()=>c.assess(()=>({})));await assert.rejects(c.encodeAfterBrowserDrain(encoding()));if(stage==='drain')assert.equal(calls,0);
 }
});
test('capture input mutation cannot replace retained evidence or field bits; async classifier is rejected',async()=>{
 const c=cohort(),r=row(0);c.available(r);r.body='changed';r.nativeWitness.documentId='changed';for(let i=1;i<32;i++)c.available(row(i));c.finishCapture();
 let first=true;await c.encodeAfterBrowserDrain(encoding({embed:async text=>{if(first){assert.equal(text,'Invented public article sample');first=false;}return unit();}}));
 assert.throws(()=>c.assess(async()=>({accepted:true})));assert.equal(c.snapshot().phase,'failed');
});
test('explicit abandon wins at every awaited encoding, close and endcheck boundary, and during classification',async()=>{
 for(const boundary of ['drain','body','title','close','recheck']){
  const c=cohort();fill(c);c.finishCapture();let calls=0;
  await assert.rejects(c.encodeAfterBrowserDrain(encoding({assertBrowserDrained:async()=>{if(boundary==='drain')c.abandon();return true;},embed:async()=>{
   calls++;if(boundary==='body'&&calls===1||boundary==='title'&&calls===2)c.abandon();return unit();},closeEncoder:async()=>{if(boundary==='close')c.abandon();return true;},
   recheckAssetsAndSources:async()=>{if(boundary==='recheck')c.abandon();return true;}})));
  assert.equal(c.snapshot().phase,'failed');assert.equal(c.snapshot().retainedTextUnits,0);assert.equal(c.snapshot().privateVectorRows,0);
 }
 const c=cohort();fill(c);c.finishCapture();await c.encodeAfterBrowserDrain(encoding());assert.throws(()=>c.assess(()=>{c.abandon();return {accepted:true};}));assert.equal(c.snapshot().phase,'failed');
});
test('reentrant admission cannot duplicate a case, advance order or finish capture, even if callback swallows refusal',async()=>{
 for(const nested of ['available','unavailable','finishCapture']){
  let c;c=createTransientNativeCohort({cases,producerProfileHash:h,admitAvailable:()=>{
   try{if(nested==='available')c.available(row(0));else if(nested==='unavailable')c.unavailable({caseId:cases[0].id,ordinal:1,reason:'article-unavailable',inputIdentity:h});else c.finishCapture();}catch{}
   return {inputIdentity:h,evidence:{invented:true}};
  }});
  assert.throws(()=>c.available(row(0)));assert.equal(c.snapshot().phase,'failed');assert.equal(c.snapshot().accounted,0);assert.equal(c.snapshot().retainedTextUnits,0);
  assert.throws(()=>c.finishCapture());await assert.rejects(c.encodeAfterBrowserDrain(encoding()));assert.equal(c.snapshot().encoderCalls,0);
 }
});
test('rejected native promises from forbidden async admission and classifier are observed without reading arbitrary then',async()=>{
 const unhandled=[],listener=reason=>unhandled.push(reason);process.on('unhandledRejection',listener);
 try{
  const c=createTransientNativeCohort({cases,producerProfileHash:h,admitAvailable:async()=>{throw new Error('invented async admission failure');}});
  assert.throws(()=>c.available(row(0)));assert.equal(c.snapshot().phase,'failed');assert.equal(c.snapshot().retainedTextUnits,0);
  const d=cohort();fill(d);d.finishCapture();await d.encodeAfterBrowserDrain(encoding());
  assert.throws(()=>d.assess(async()=>{throw new Error('invented async classifier failure');}));assert.equal(d.snapshot().phase,'failed');assert.equal(d.snapshot().privateVectorRows,0);
  let thenReads=0;const e=cohort();fill(e);e.finishCapture();await e.encodeAfterBrowserDrain(encoding());
  assert.throws(()=>e.assess(()=>Object.defineProperty({},'then',{enumerable:true,get(){thenReads++;throw new Error('do not read');}})));
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);assert.equal(thenReads,0);
 }finally{process.removeListener('unhandledRejection',listener);}
});
