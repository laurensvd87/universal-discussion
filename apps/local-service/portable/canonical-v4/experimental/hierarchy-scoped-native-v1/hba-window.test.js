import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createHbaWindow,HBA_PATH,ORIGINAL_SHA,HBA_RULE,HBA_LIMITS} from './hba-window.js';

// INVENTED bytes, not a copy/read/proof of actual HBA. Only this exact synthetic
// value maps to the independent pin through the trusted digest test seam.
const original=Buffer.from('# invented source-only fixture\nhost old_fixture all 127.0.0.1/32 reject\n');
const proposed=Buffer.concat([Buffer.from(HBA_RULE),original]);
const digest=bytes=>bytes.equals(original)?ORIGINAL_SHA:createHash('sha256').update(bytes).digest('hex');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(options={}){
  let time=options.start??0,next=0,buffer=Buffer.from(options.bytes??original),writes=0,closes=0,connections=0,starts=0,stops=0;
  const timers=new Map(),events=[],records=[],journal=[];let identity='file-one';
  function write(offset,data,count=data.length){const next=Buffer.alloc(Math.max(buffer.length,offset+count));buffer.copy(next);data.copy(next,offset,0,count);buffer=next;return count;}
  const lease={inspect(){events.push('inspect');return {path:HBA_PATH,ordinary:true,ancestorsOrdinary:true,share:'read-only',volumeId:'volume-one',fileId:identity,bytes:Buffer.from(buffer),...(options.inspect?.()??{})};},
    writeAt(offset,data){writes++;events.push('write');if(options.write)return options.write({offset,data,write,number:writes});return write(offset,data);},
    truncate(length){events.push('truncate');if(options.truncate)return options.truncate({length,set(value){buffer=value;}});buffer=Buffer.from(buffer.subarray(0,length));},
    flush(){events.push('flush');return options.flush?.();},close(){closes++;events.push('lease-end');return options.leaseEnd?.();}};
  const receipt={create(data){events.push('receipt-create');records.push(structuredClone(data));if(options.create)return options.create(data);return {durable:true,restricted:true,createNew:true};},
    append(data){events.push(`phase-${data.phase}`);journal.push(data);if(options.append)return options.append(data);return {durable:true};}};
  const admin={open(){events.push('socket-open');if(options.open)return options.open();connections++;assert.equal(connections,1);
    const socket={reload(){events.push('reload');return {signalAccepted:options.signal!==false};},
      parsed(which){events.push(`parsed-${which}`);return {valid:!(options.badParse===which),exactRule:which==='proposed'};},
      end(){events.push('socket-end');if(options.end)return options.end(()=>{connections--;});connections--;return {settled:true};}};
    if(!options.absentActive)socket.active=which=>{events.push(`active-${which}`);return {status:options.active??'verified',settled:true};};return socket;}};
  const child={start(){events.push('child-start');starts++;assert.equal(connections,0);if(options.startChild)return options.startChild();
    return {settlement:options.childSettlement??Promise.resolve({settled:true,ok:options.childOK!==false}),stopOwn(){stops++;events.push('child-stop');return options.stop?.();}};}};
  const input={epoch:0,now:()=>time,digest,schedule(fn,ms){const id=++next;timers.set(id,{at:time+ms,fn});return id;},cancel(id){timers.delete(id);},lease,receipt,admin,child,
    gates:{window:()=>options.gate!==false,recovery:()=>options.gate!==false}};
  const helper=createHbaWindow(input);
  return {...helper,input,lease,events,records,journal,timers,write,
    get bytes(){return Buffer.from(buffer);},get writes(){return writes;},get closes(){return closes;},get starts(){return starts;},get stops(){return stops;},get connections(){return connections;},
    foreign(bytes){buffer=Buffer.from(bytes);},identity(value){identity=value;},set(value){time=value;},
    async advance(target){for(let count=0;count<1000;count++){await flush();const due=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){time=target;await flush();return;}time=due[1].at;timers.delete(due[0]);due[1].fn();}throw new Error('invented timer capacity');}};
}
const recoveryRecord=()=>({schema:'adr171-hba-recovery/v1',path:HBA_PATH,originalSha:ORIGINAL_SHA,proposedSha:digest(proposed),
  identity:{volumeId:'volume-one',fileId:'file-one'},originalBase64:original.toString('base64'),phase:'PREPARED'});

test('exact independent pin and rule are fixed, import creates no capability, invocation requires trusted seams',()=>{
  assert.equal(HBA_PATH,'D:/PostgreSQL/17/data/pg_hba.conf');assert.equal(ORIGINAL_SHA,'aec15425b33033973c99f3e97670437238744f03cde204d544d3835654ee5781');
  assert.equal(HBA_RULE,'host murmingle_adr167_scoped_test_20261020 postgres,murmingle_app,murmingle_crawler_submitter,murmingle_ingest_worker 127.0.0.1/32 scram-sha-256\r\n');
  assert.ok(Object.isFrozen(HBA_LIMITS));assert.equal(HBA_LIMITS.totalMs,270000);assert.equal(HBA_LIMITS.restoreMs,30000);
  assert.throws(()=>createHbaWindow(),{code:'HBA_CONFIGURATION'});assert.throws(()=>createHbaWindow({epoch:NaN}),{code:'HBA_CONFIGURATION'});
});

test('successful actual state machine persists original/proposed record and closes guardian before its one child',async()=>{
  const f=fixture(),result=await f.run();assert.equal(result.status,'complete');assert.equal(result.rollbackComplete,true);assert.deepEqual(f.bytes,original);
  assert.equal(f.starts,1);assert.equal(f.closes,1);assert.equal(f.connections,0);assert.equal(result.pendingPhysical,0);
  assert.deepEqual(f.records[0],recoveryRecord());assert.equal(f.events.filter(e=>e==='socket-open').length,2);
  assert.ok(f.events.indexOf('receipt-create')<f.events.indexOf('write'));
  assert.ok(f.events.indexOf('socket-end')<f.events.indexOf('child-start'));
  assert.deepEqual(result.proposedPolicy,{signalAccepted:true,parsed:true,active:'verified'});
  assert.deepEqual(result.originalPolicy,{signalAccepted:true,parsed:true,active:'verified'});
  await assert.rejects(f.run(),{code:'HBA_DUPLICATE'});await assert.rejects(f.recover(recoveryRecord()),{code:'HBA_DUPLICATE'});
});

test('unknown/absent active proof allows one gated child but cannot claim complete active rollback',async()=>{
  for(const options of [{active:'unknown'},{absentActive:true}]){const f=fixture(options),result=await f.run();
    assert.equal(f.starts,1);assert.equal(result.fileRestored,true);assert.equal(result.originalPolicy.signalAccepted,true);assert.equal(result.originalPolicy.parsed,true);
    assert.equal(result.originalPolicy.active,'unknown');assert.equal(result.rollbackComplete,false);assert.equal(result.status,'incomplete');}
});

test('gate refusal and record creation failure precede all HBA mutation and child actions',async()=>{
  for(const options of [{gate:false},{create(){throw new Error('private receipt error');}},{create(){return {durable:false,restricted:true,createNew:true};}}]){
    const f=fixture(options),result=await f.run();assert.equal(f.writes,0);assert.equal(f.starts,0);assert.equal(f.connections,0);assert.deepEqual(f.bytes,original);assert.equal(result.status,'failed');
    assert.equal(JSON.stringify(result).includes('private'),false);}
});

test('original pin, ordinary stable identity, encoding and capacity are enforced before mutation',async()=>{
  for(const options of [{bytes:Buffer.from('not the pinned original')},{inspect:()=>({path:'D:/other'})},{inspect:()=>({ordinary:false})},
    {inspect:()=>({ancestorsOrdinary:false})},{inspect:()=>({share:'read-write'})},{bytes:Buffer.alloc(65537,65)}]){
    const f=fixture(options),result=await f.run();assert.equal(f.writes,0);assert.equal(f.starts,0);assert.equal(result.status,'failed');}
  for(const bytes of [Buffer.from([239,187,191,65]),Buffer.from([65,0]),Buffer.from([255])]){
    const f=fixture({bytes}),helper=createHbaWindow({...f.input,lease:{...f.lease},digest:b=>b.equals(bytes)?ORIGINAL_SHA:digest(b)});
    const result=await helper.run();assert.equal(result.failure,'HBA_ENCODING');assert.equal(f.writes,0);}
});

test('known rejected partial write restores original through the same held handle',async()=>{
  const f=fixture({write({offset,data,write,number}){if(number===1){write(offset,data,7);throw new Error('partial write');}return write(offset,data);}});
  const result=await f.run();assert.equal(result.failure,'HBA_WRITE');assert.deepEqual(f.bytes,original);assert.equal(result.fileRestored,true);assert.equal(result.rollbackComplete,true);assert.equal(f.starts,0);
});

test('confirmed short writes are bounded and finish exact proposed bytes before child',async()=>{
  const f=fixture({write({offset,data,write}){return write(offset,data,Math.min(17,data.length));}}),result=await f.run();
  assert.equal(result.status,'complete');assert.deepEqual(f.bytes,original);assert.ok(f.writes>2&&f.writes<=128);
});

test('unknown foreign bytes and identity drift are never overwritten by restoration',async()=>{
  let f;f=fixture({flush(){if(f.writes===1)f.foreign(Buffer.from('foreign replacement'));}});let result=await f.run();
  assert.equal(result.fileRestored,false);assert.equal(f.writes,1);assert.deepEqual(f.bytes,Buffer.from('foreign replacement'));
  let g;g=fixture({flush(){g.identity('foreign-file');}});result=await g.run();assert.equal(result.fileRestored,false);assert.equal(g.writes,1);assert.equal(result.rollbackComplete,false);
});

test('receipt journal failure after proposal cannot skip same-handle restoration',async()=>{
  const f=fixture({append({phase}){if(['PROPOSED_VERIFIED','RESTORE_STARTED'].includes(phase))throw new Error('journal');return {durable:true};}}),result=await f.run();
  assert.deepEqual(f.bytes,original);assert.equal(result.fileRestored,true);assert.equal(result.journalFailed,true);assert.equal(result.rollbackComplete,false);assert.equal(f.starts,0);
});

test('failed reload signal or complete parser check never starts child, yet restoration is attempted',async()=>{
  for(const options of [{signal:false},{badParse:'proposed'}]){const f=fixture(options),result=await f.run();assert.equal(result.failure,'HBA_POLICY');assert.equal(f.starts,0);assert.deepEqual(f.bytes,original);assert.equal(result.fileRestored,true);}
});

test('failed child is not retried and still gets byte-exact restoration and reload',async()=>{
  const f=fixture({childOK:false}),result=await f.run();assert.equal(f.starts,1);assert.equal(result.childSettled,true);assert.equal(result.childOK,false);assert.equal(result.failure,'HBA_CHILD_FAILED');
  assert.deepEqual(f.bytes,original);assert.equal(result.rollbackComplete,true);assert.equal(result.status,'failed');
});

test('unsettled child timeout restores bytes, never opens a ninth reload socket, and never claims rollback',async()=>{
  const held=deferred(),f=fixture({childSettlement:held.promise}),run=f.run();await flush();await f.advance(210000);const result=await run;
  assert.equal(f.starts,1);assert.equal(f.stops,1);assert.equal(result.childSettled,false);assert.equal(result.pendingPhysical,1);assert.equal(result.fileRestored,true);
  assert.deepEqual(f.bytes,original);assert.equal(f.events.filter(e=>e==='socket-open').length,1);assert.equal(result.originalPolicy.active,'unknown');assert.equal(result.rollbackComplete,false);
  held.resolve({settled:true,ok:true});await flush();assert.equal(result.childSettled,false);assert.equal(result.rollbackComplete,false);
});

test('owned stop acknowledgement alone is not child settlement; actual settled promise permits restore reload',async()=>{
  const held=deferred(),f=fixture({childSettlement:held.promise,stop(){held.resolve({settled:true,ok:false});return {settled:true};}}),run=f.run();
  await flush();await f.advance(195000);const result=await run;assert.equal(f.stops,1);assert.equal(result.childSettled,true);assert.equal(result.rollbackComplete,true);assert.equal(result.status,'failed');
});

test('pending physical write is not settled by timeout and restoration never writes concurrently',async()=>{
  const held=deferred(),f=fixture({write(){return held.promise;}}),run=f.run();await flush();await f.advance(5000);
  assert.equal(f.writes,1);await f.advance(35000);const result=await run;assert.equal(f.writes,1);assert.equal(f.closes,0);assert.equal(result.pendingPhysical,1);assert.equal(result.fileRestored,false);
  held.reject(new Error('late invented IO failure'));await flush();assert.equal(result.fileRestored,false);
});

test('unsettled guardian end prevents child and second reload connection, even after file restoration',async()=>{
  const held=deferred(),f=fixture({end(){return held.promise;}}),run=f.run();await flush();await f.advance(10000);const result=await run;
  assert.equal(f.starts,0);assert.equal(result.fileRestored,true);assert.equal(f.events.filter(e=>e==='socket-open').length,1);assert.equal(result.rollbackComplete,false);assert.equal(result.pendingPhysical,1);
  held.resolve({settled:true});await flush();assert.equal(result.rollbackComplete,false);
});

test('recovery authenticates independent pin and accepts only original/proposed current state without a child',async()=>{
  for(const bytes of [original,proposed]){const f=fixture({bytes}),result=await f.recover(recoveryRecord());assert.equal(result.status,'complete');assert.equal(f.starts,0);assert.equal(f.records.length,0);assert.deepEqual(f.bytes,original);}
  for(const change of [r=>r.originalSha='0'.repeat(64),r=>r.originalBase64=Buffer.from('forged').toString('base64'),r=>r.proposedSha='0'.repeat(64),r=>r.identity.fileId='different']){
    const f=fixture({bytes:proposed}),data=recoveryRecord();change(data);const result=await f.recover(data);assert.equal(result.status,'failed');assert.equal(f.writes,0);assert.equal(f.starts,0);}
  const f=fixture({bytes:Buffer.from('unknown foreign state')}),result=await f.recover(recoveryRecord());assert.equal(result.fileRestored,false);assert.equal(f.writes,0);
});

test('recovery rejects accessors, excessive records and arbitrary fields without executing getters',async()=>{
  let getters=0;const accessor=recoveryRecord();Object.defineProperty(accessor,'originalSha',{enumerable:true,get(){getters++;return ORIGINAL_SHA;}});
  for(const data of [accessor,{...recoveryRecord(),extra:true},{...recoveryRecord(),originalBase64:'a'.repeat(131073)}]){
    const f=fixture({bytes:proposed}),result=await f.recover(data);assert.equal(result.status,'failed');assert.equal(f.writes,0);assert.equal(f.starts,0);}
  assert.equal(getters,0);
});

test('recovery restoration failure cannot become complete rollback',async()=>{
  const f=fixture({bytes:proposed,write(){throw new Error('restore denied');}}),result=await f.recover(recoveryRecord());assert.equal(result.fileRestored,false);assert.equal(result.rollbackComplete,false);assert.equal(result.status,'failed');
});

test('absolute epoch, nonfinite clocks and finite write loops fail closed without renewed allowances',async()=>{
  const late=fixture({start:30000}),result=await late.run();assert.equal(result.failure,'HBA_GATES');assert.equal(late.writes,0);
  const nan=fixture({start:NaN});await assert.rejects(nan.run(),{code:'HBA_CLOCK'});
  const tiny=fixture({write({offset,data,write}){return write(offset,data,1);}}),bounded=await tiny.run();assert.equal(bounded.failure,'HBA_WRITE_CAPACITY');assert.ok(tiny.writes<=128);assert.equal(tiny.starts,0);
});

test('partial physical write settles before restoration starts; timeout never frees the handle',async()=>{
  const held=deferred(),f=fixture({write({offset,data,write,number}){if(number===1){write(offset,data,7);return held.promise;}return write(offset,data);}}),run=f.run();
  await flush();await f.advance(5000);assert.equal(f.writes,1);held.reject(new Error('settled partial write'));await flush();
  const result=await run;assert.equal(f.writes,2);assert.deepEqual(f.bytes,original);assert.equal(result.rollbackComplete,true);assert.equal(result.failure,'HBA_WRITE');
});

test('pending flush is also physical same-handle IO and cannot race restoration',async()=>{
  const held=deferred();let flushes=0;const f=fixture({flush(){if(++flushes===1)return held.promise;}}),run=f.run();
  await flush();await f.advance(5000);assert.equal(f.writes,1);held.reject(new Error('settled flush failure'));await flush();const result=await run;
  assert.equal(f.writes,2);assert.deepEqual(f.bytes,original);assert.equal(result.fileRestored,true);assert.equal(result.pendingPhysical,0);
});

test('timed-out socket acquisition cannot open another socket or grant child authority',async()=>{
  const held=deferred(),f=fixture({open(){return held.promise;}}),run=f.run();await flush();await f.advance(5000);const result=await run;
  assert.equal(f.starts,0);assert.equal(f.events.filter(e=>e==='socket-open').length,1);assert.equal(result.fileRestored,true);assert.equal(result.pendingPhysical,1);assert.equal(result.rollbackComplete,false);
  held.reject(new Error('late invented socket failure'));await flush();assert.equal(result.pendingPhysical,1);
});

test('timed-out child start is physically unknown and cannot trigger a restoration reload',async()=>{
  const held=deferred(),f=fixture({startChild(){return held.promise;}}),run=f.run();await flush();await f.advance(20000);const result=await run;
  assert.equal(f.starts,1);assert.equal(result.childSettled,false);assert.equal(result.fileRestored,true);assert.equal(result.pendingPhysical,1);
  assert.equal(f.events.filter(e=>e==='socket-open').length,1);assert.equal(result.rollbackComplete,false);
  held.reject(new Error('late invented child acquisition failure'));await flush();
});

test('total epoch and failed timer seams cannot produce a complete rollback claim',async()=>{
  const expired=fixture({start:270000}),result=await expired.run();assert.equal(expired.writes,0);assert.equal(expired.starts,0);assert.equal(expired.closes,0);assert.equal(result.leaseClosed,false);
  const f=fixture(),helper=createHbaWindow({...f.input,lease:{...f.lease},cancel(){return Promise.reject(new Error('invented cancellation failure'));}});
  const timed=await helper.run();assert.equal(timed.timerFailed,true);assert.equal(timed.rollbackComplete,false);assert.notEqual(timed.status,'complete');
  const g=fixture(),bad=createHbaWindow({...g.input,lease:{...g.lease},schedule(){return Promise.reject(new Error('invented scheduler failure'));}});
  const denied=await bad.run();assert.equal(denied.timerFailed,true);assert.equal(g.writes,0);assert.equal(g.starts,0);
});

test('arbitrary seam errors and error code accessors never enter the recovery report',async()=>{
  let reads=0;const error={};Object.defineProperty(error,'code',{get(){reads++;return 'PRIVATE-CONTENT';}});
  const f=fixture(),helper=createHbaWindow({...f.input,lease:{...f.lease},digest(){throw error;}}),result=await helper.run();
  assert.equal(reads,0);assert.equal(result.failure,'HBA_SEAM');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(f.writes,0);
});

test('same-handle identity and current bytes are revalidated after durable receipt and before first write',async()=>{
  let f;f=fixture({append({phase}){if(phase==='APPLY_STARTED')f.foreign(Buffer.from('foreign before first write'));return {durable:true};}});
  const result=await f.run();assert.equal(f.writes,0);assert.equal(result.failure,'HBA_UNKNOWN_BYTES');assert.deepEqual(f.bytes,Buffer.from('foreign before first write'));
  let g;g=fixture({append({phase}){if(phase==='APPLY_STARTED')g.identity('foreign-before-write');return {durable:true};}});
  const changed=await g.run();assert.equal(g.writes,0);assert.equal(changed.failure,'HBA_IDENTITY');assert.equal(changed.fileRestored,false);
});

test('authenticated recovery restores original when its authentication journal append throws',async()=>{
  const f=fixture({bytes:proposed,append({phase}){if(phase==='RECOVERY_AUTHENTICATED')throw new Error('invented journal failure');return {durable:true};}});
  const result=await f.recover(recoveryRecord());assert.equal(result.failure,'HBA_RECEIPT');assert.equal(result.fileRestored,true);assert.deepEqual(f.bytes,original);
  assert.equal(f.writes,1);assert.equal(f.starts,0);assert.equal(result.originalPolicy.active,'verified');assert.equal(result.journalFailed,true);assert.equal(result.rollbackComplete,false);assert.equal(result.status,'failed');
});

test('authenticated recovery restores original when its authentication journal append is nondurable',async()=>{
  const f=fixture({bytes:proposed,append({phase}){return {durable:phase!=='RECOVERY_AUTHENTICATED'};}});
  const result=await f.recover(recoveryRecord());assert.equal(result.failure,'HBA_RECEIPT');assert.equal(result.fileRestored,true);assert.deepEqual(f.bytes,original);
  assert.equal(f.writes,1);assert.equal(f.starts,0);assert.equal(result.originalPolicy.active,'verified');assert.equal(result.journalFailed,true);assert.equal(result.rollbackComplete,false);assert.equal(result.status,'failed');
});

test('authenticated recovery restores original while its authentication journal append remains unsettled',async()=>{
  const held=deferred(),f=fixture({bytes:proposed,append({phase}){return phase==='RECOVERY_AUTHENTICATED'?held.promise:{durable:true};}}),run=f.recover(recoveryRecord());
  await flush();await f.advance(5000);const result=await run;
  assert.equal(result.failure,'HBA_RECEIPT');assert.equal(result.fileRestored,true);assert.deepEqual(f.bytes,original);assert.equal(f.writes,1);assert.equal(f.starts,0);
  assert.equal(result.originalPolicy.active,'verified');assert.equal(result.journalFailed,true);assert.equal(result.pendingPhysical,1);assert.equal(result.rollbackComplete,false);assert.equal(result.status,'failed');
  held.resolve({durable:true});await flush();assert.equal(result.rollbackComplete,false);assert.equal(result.status,'failed');
});
