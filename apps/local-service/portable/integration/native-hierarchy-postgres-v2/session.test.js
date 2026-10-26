import test from 'node:test';
import assert from 'node:assert/strict';
import {createExclusiveSession} from './session.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(query){const calls=[];let ends=0,active=true;
 const raw={query(sql,p){calls.push([sql,p]);return query?query(sql,p):Promise.resolve({command:sql,rows:[]});},end(){ends++;}};
 const db=createExclusiveSession(raw,()=>{if(!active)throw Object.freeze({revoked:true});});
 return {db,calls,ends:()=>ends,revoke:()=>{active=false;}};
}
test('inert same-client adapter preserves raw query parameters and pg dialect',async()=>{
 const f=fixture(),p=['x'];assert.equal(f.calls.length,0);assert.equal(f.db.dialect,'pg');
 await f.db.query('SELECT $1',p);assert.equal(f.calls[0][1],p);await f.db.close();assert.equal(f.ends(),1);
 await assert.rejects(f.db.query('SELECT 2'),{code:'SESSION_UNAVAILABLE'});
});
test('BEGIN callback and literal COMMIT use the same original physical client',async()=>{
 const f=fixture();let retained;
 assert.equal(await f.db.transaction(async tx=>{retained=tx;assert.equal(tx.dialect,'pg');await tx.query('SELECT $1',[7]);await tx.exec('SELECT 8');return 42;}),42);
 assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','SELECT $1','SELECT 8','COMMIT']);
 await assert.rejects(retained.query('SELECT 9'),{code:'SESSION_RETIRED_LEASE'});assert.equal(f.calls.length,4);
});
test('nested transaction and outside query/exec refuse before dispatch',async()=>{
 const f=fixture();await f.db.transaction(async tx=>{
  await assert.rejects(f.db.transaction(()=>{}),{code:'SESSION_BUSY'});
  await assert.rejects(f.db.query('OUTSIDE'),{code:'SESSION_BUSY'});await assert.rejects(f.db.exec('OUTSIDE'),{code:'SESSION_BUSY'});
  await assert.rejects(f.db.close(),{code:'SESSION_CLOSE_BUSY'});await tx.query('INSIDE');
 });assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','INSIDE','COMMIT']);
});
test('all falsy callback primaries survive rollback failure and poison blocks reuse',async()=>{
 for(const primary of [undefined,null,false,0,'']){
  const cleanup=Object.assign(new Error('invented'),{code:'XX001'}),f=fixture(sql=>{if(sql==='ROLLBACK')throw cleanup;return {command:sql};});
  let caught=false;try{await f.db.transaction(()=>{throw primary;});}catch(e){caught=true;assert.equal(e,primary);}assert.equal(caught,true);
  assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','ROLLBACK']);assert.equal(f.db.snapshot().state,'poisoned');
  assert.deepEqual(f.db.snapshot().cleanupFailures,['XX001']);await assert.rejects(f.db.query('NO'),{code:'SESSION_UNAVAILABLE'});await f.db.close();
 }
});
test('SQLSTATE from late literal COMMIT is unchanged and rollback settles before reuse',async()=>{
 const late=Object.assign(new Error('invented'),{code:'P2402'}),f=fixture(sql=>{if(sql==='COMMIT')throw late;return {command:sql};});
 await assert.rejects(f.db.transaction(tx=>tx.query('MUTATION')),e=>e===late);
 assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','MUTATION','COMMIT','ROLLBACK']);await f.db.query('AFTER');
});
test('server ROLLBACK tag cannot be accepted as a COMMIT',async()=>{
 const f=fixture(sql=>({command:sql==='COMMIT'?'ROLLBACK':sql}));await assert.rejects(f.db.transaction(()=>{}),{code:'SESSION_COMMIT_NOT_COMMITTED'});
 assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','COMMIT','ROLLBACK']);
});
test('unawaited physical work settles before rollback; lease expires and session poisons',async()=>{
 const d=deferred(),f=fixture(sql=>sql==='SLOW'?d.promise:{command:sql});let retained,dispatched;
 const work=f.db.transaction(async tx=>{retained=tx;dispatched=tx.query('SLOW');});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','SLOW']);
 await assert.rejects(retained.query('LATE'),{code:'SESSION_UNAVAILABLE'});assert.equal(f.db.snapshot().pending,1);
 d.resolve({command:'SELECT'});await dispatched;await assert.rejects(work,{code:'SESSION_UNAWAITED_QUERY'});
 assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','SLOW','ROLLBACK']);await f.db.close();
});
test('parallel tx queries and parallel outside queries are refused not silently queued',async()=>{
 const d=deferred(),f=fixture(sql=>sql==='SLOW'?d.promise:{command:sql});
 const work=f.db.transaction(async tx=>{const first=tx.query('SLOW');await assert.rejects(tx.query('NO'),{code:'SESSION_QUERY_BUSY'});d.resolve({});await first;});await work;
 const d2=deferred(),g=fixture(()=>d2.promise),first=g.db.query('SLOW');await assert.rejects(g.db.query('NO'),{code:'SESSION_BUSY'});d2.resolve({});await first;
});
test('revocation during callback rolls back and no retained tx capability can dispatch',async()=>{
 const f=fixture(),marker=Object.freeze({revoked:true});let txref;
 await assert.rejects(f.db.transaction(async tx=>{txref=tx;await tx.query('BEFORE');f.revoke();}),e=>e?.revoked===marker.revoked);
 assert.deepEqual(f.calls.map(x=>x[0]),['BEGIN','BEFORE','ROLLBACK']);const n=f.calls.length;await assert.rejects(txref.query('AFTER'));assert.equal(f.calls.length,n);
});
test('BEGIN failure poisons, close is original one-shot and its failure is tracked',async()=>{
 const primary=Object.freeze({begin:true}),f=fixture(sql=>{if(sql==='BEGIN')throw primary;return {};});
 await assert.rejects(f.db.transaction(()=>{}),e=>e===primary);assert.equal(f.db.snapshot().state,'poisoned');
 const closeError=Object.freeze({close:true});let ends=0;const db=createExclusiveSession({query(){},end(){ends++;throw closeError;}},()=>{});
 const p=db.close();assert.equal(db.close(),p);await assert.rejects(p,e=>e===closeError);assert.equal(ends,1);assert.deepEqual(db.snapshot().cleanupFailures,['SESSION_CLEANUP_UNKNOWN']);
});
test('invalid commits/query styles never dispatch and no dependency can select another database',async()=>{
 const f=fixture();for(const commit of ['commit','COMMIT;','END','COMMIT WORK','COMMIT; SELECT 1'])await assert.rejects(f.db.transaction(()=>{},commit),{code:'SESSION_TRANSACTION_CONTRACT'});
 await assert.rejects(f.db.query({text:'SELECT 1'}),{code:'SESSION_QUERY_CONTRACT'});await assert.rejects(f.db.query('SELECT 1',()=>{}),{code:'SESSION_QUERY_CONTRACT'});
 assert.equal(f.calls.length,0);assert.throws(()=>createExclusiveSession({},()=>{}),{code:'SESSION_DEPENDENCIES'});
});
test('hostile cleanup code descriptors never replace a falsy primary or close failure',async()=>{
 let reads=0;const hostile=Object.defineProperty({},'code',{get(){reads++;throw new Error('getter');}});
 for(const cleanup of [hostile,new Proxy({},{getOwnPropertyDescriptor(){throw new Error('proxy');}})]){
  const f=fixture(sql=>{if(sql==='ROLLBACK')throw cleanup;return {command:sql};});
  let caught=false;try{await f.db.transaction(()=>{throw false;});}catch(e){caught=true;assert.equal(e,false);}assert.equal(caught,true);
  assert.deepEqual(f.db.snapshot().cleanupFailures,['SESSION_CLEANUP_UNKNOWN']);
  const db=createExclusiveSession({query(){},end(){throw cleanup;}},()=>{});await assert.rejects(db.close(),e=>e===cleanup);
 }assert.equal(reads,0);
});
test('guard reentry that closes or recursively dispatches cannot create late SQL',async()=>{
 let db,closed=0,calls=0,closing;
 db=createExclusiveSession({query(){calls++;},end(){closed++;}},()=>{closing=db.close();});
 await assert.rejects(db.query('LATE'),{code:'SESSION_UNAVAILABLE'});await closing;assert.equal(calls,0);assert.equal(closed,1);
 let nested;const other=createExclusiveSession({query(sql){calls++;return {command:sql};},end(){}},()=>{nested=other.query('REENTER');});
 await other.query('SELECT');await assert.rejects(nested,{code:'SESSION_GUARD_REENTRY'});assert.equal(calls,1);
});
