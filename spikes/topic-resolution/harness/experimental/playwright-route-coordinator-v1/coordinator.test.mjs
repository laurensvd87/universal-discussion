import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteCoordinator,LIMITS} from './coordinator.mjs';
const denied=ordinal=>({method:'route-abort',ordinal}),rpc=ordinal=>({method:'coordinator-rpc',ordinal}),cleanup=ordinal=>({method:'cleanup-rpc',ordinal});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
for(const size of [200,1000])test('invented denial burst '+size+' stays serial and completes without dropping failures',async()=>{
 let active=0,peak=0,count=0;
 const c=createRouteCoordinator(async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;count++;});
 await Promise.all(Array.from({length:size},(_,i)=>c.deny(denied(i))));
 assert.equal(count,size);assert.equal(peak,1);assert.equal(c.snapshot().peakDenials,1);assert.equal(c.snapshot().backlog,0);
 assert.equal(c.snapshot().failure,null);assert.ok(Object.isFrozen(c.snapshot()));
});
test('4096 event/backlog budget rejects overflow, drops metadata and settles all callers',async()=>{
 const held=deferred(),c=createRouteCoordinator(()=>held.promise);
 const waits=Array.from({length:4096},(_,i)=>c.deny(denied(i)).then(()=>null,e=>e.code));
 assert.equal(c.snapshot().events,4096);assert.equal(c.snapshot().backlog,4095);
 await assert.rejects(c.deny(denied(0)),{code:'event-capacity'});
 assert.deepEqual(new Set(await Promise.all(waits)),new Set(['event-capacity']));
 assert.equal(c.snapshot().backlog,0);assert.equal(c.snapshot().denialActive,1);
 held.resolve();await tick();assert.equal(c.snapshot().normalActive,0);
});
test('held denial plus 125 ordinary RPCs still leaves exactly two cleanup slots after fatal',async()=>{
 const held=deferred(),cleanupCalls=[];
 const c=createRouteCoordinator((t,lane)=>{if(lane==='cleanup'){cleanupCalls.push(t.ordinal);return Promise.resolve();}return held.promise;});
 const waits=[c.deny(denied(0)),...Array.from({length:125},(_,i)=>c.rpc(rpc(i)))].map(p=>p.catch(e=>e.code));
 c.fail();await Promise.all(waits);
 await Promise.all([c.cleanup(cleanup(0)),c.cleanup(cleanup(1))]);
 assert.deepEqual(cleanupCalls,[0,1]);assert.equal(c.snapshot().peakAggregate,128);assert.equal(c.snapshot().normalActive,126);
 await assert.rejects(c.cleanup(cleanup(2)),{code:'cleanup-capacity'});
 held.reject(new Error('secret raw cause'));await tick();assert.equal(c.snapshot().normalActive,0);
 assert.ok(!JSON.stringify(c.snapshot()).includes('secret'));
});
test('ordinary overload is fatal but reserved cleanup still enters',async()=>{
 const held=deferred(),c=createRouteCoordinator((t,lane)=>lane==='cleanup'?Promise.resolve():held.promise);
 const waits=Array.from({length:126},(_,i)=>c.rpc(rpc(i)).catch(e=>e.code));
 await assert.rejects(c.rpc(rpc(126)),{code:'normal-capacity'});await Promise.all(waits);
 await c.cleanup(cleanup(0));assert.equal(c.snapshot().peakNormal,126);held.resolve();await tick();
});
test('sync throws and asynchronous rejection are fatal, never unhandled or silently denied',async()=>{
 for(const invoke of [()=>{throw new Error('private');},()=>Promise.reject(new Error('private'))]){
  const c=createRouteCoordinator(invoke);await assert.rejects(c.deny(denied(0)),{code:'operation-rejected'});
  assert.equal(c.snapshot().failure,'operation-rejected');assert.ok(!JSON.stringify(c.snapshot()).includes('private'));
 }
 const c=createRouteCoordinator(()=>Promise.reject(7));await assert.rejects(c.cleanup(cleanup(0)),{code:'operation-rejected'});
});
test('dispose and failure races settle callers once without manufacturing cancellation',async()=>{
 const held=deferred(),c=createRouteCoordinator(()=>held.promise);
 const normal=c.deny(denied(0)).catch(e=>e.code),queued=c.deny(denied(1)).catch(e=>e.code),clean=c.cleanup(cleanup(0)).catch(e=>e.code);
 c.dispose();c.fail();assert.deepEqual(await Promise.all([normal,queued,clean]),['disposed','disposed','disposed']);
 assert.equal(c.snapshot().normalActive,1);assert.equal(c.snapshot().cleanupActive,1);
 await assert.rejects(c.cleanup(cleanup(1)),{code:'disposed'});held.resolve();await tick();assert.equal(c.snapshot().normalActive,0);
 assert.equal(c.snapshot().cleanupActive,0);
});
test('queued tasks are copied and frozen; hostile arguments never invoke accessors/proxy traps',async()=>{
 const held=deferred(),seen=[],c=createRouteCoordinator(t=>{seen.push(t);return seen.length===1?held.promise:Promise.resolve();});
 const a=c.deny(denied(0)),input=denied(1),b=c.deny(input);input.ordinal=99;held.resolve();await Promise.all([a,b]);
 assert.equal(seen[1].ordinal,1);assert.ok(Object.isFrozen(seen[1]));
 let calls=0;const getter={ordinal:0};Object.defineProperty(getter,'method',{enumerable:true,get(){calls++;throw 0;}});
 for(const hostile of [getter,new Proxy({},{getPrototypeOf(){calls++;throw 0;},ownKeys(){calls++;throw 0;}}),{...denied(0),extra:1}]){
  const next=createRouteCoordinator(()=>{calls++;});await assert.rejects(next.deny(hostile),{code:'invalid-task'});
 }
 assert.equal(calls,0);assert.deepEqual(LIMITS,{normalEvents:4096,normalInFlight:126,cleanupInFlight:2,aggregateInFlight:128,denialsInFlight:1});
});
