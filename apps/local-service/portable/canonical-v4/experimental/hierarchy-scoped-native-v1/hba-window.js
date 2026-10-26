import {Buffer} from 'node:buffer';

// SOURCE ONLY. No default file, socket, process, timer, hash or credential access.
export const HBA_PATH='D:/PostgreSQL/17/data/pg_hba.conf';
export const ORIGINAL_SHA='aec15425b33033973c99f3e97670437238744f03cde204d544d3835654ee5781';
export const HBA_RULE='host murmingle_adr167_scoped_test_20261020 postgres,murmingle_app,murmingle_crawler_submitter,murmingle_ingest_worker 127.0.0.1/32 scram-sha-256\r\n';
export const HBA_LIMITS=Object.freeze({originalBytes:65536,receiptBytes:131072,chunkBytes:4096,writes:64,phases:24,
  operationMs:5000,preflightMs:30000,childMs:195000,stopMs:15000,restoreMs:30000,totalMs:270000});
const usedLeases=new WeakSet();
const classified=new WeakSet();
const failure=code=>{const error=Object.assign(new Error(code),{code});classified.add(error);return error;};
const fail=code=>{throw failure(code);};
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/u.test(s);
const same=(a,b)=>a.length===b.length&&a.equals(b);
const copy=value=>{if(!(value instanceof Uint8Array))fail('HBA_BYTES');return Buffer.from(value);};
const errorCode=error=>classified.has(error)?Object.getOwnPropertyDescriptor(error,'code')?.value:'HBA_SEAM';
function dataRecord(value,keys){if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('HBA_RECOVERY_RECORD');
  const entries=Object.getOwnPropertyDescriptors(value);if(Object.keys(entries).sort().join(',')!==[...keys].sort().join(','))fail('HBA_RECOVERY_RECORD');
  const result={};for(const key of keys){if(!Object.hasOwn(entries[key],'value'))fail('HBA_RECOVERY_RECORD');result[key]=entries[key].value;}return result;}

/** All seams are trusted root closures. digest MUST be the fixed captured SHA256
 * implementation in the guardian, never an external/runtime configuration. Pure
 * tests inject invented bytes/digests; they do not authenticate actual HBA bytes.
 * lease is one held same-handle ReadWrite/FileShare.Read capability. writeAt must
 * report physical byte counts; no path reopening or implicit file replacement.
 */
export function createHbaWindow({epoch,now,schedule,cancel,digest,lease,receipt,admin,child,gates}={}) {
  if(!finite(epoch)||![now,schedule,cancel,digest].every(fn=>typeof fn==='function')||
    !lease||!receipt||!admin||!gates)fail('HBA_CONFIGURATION');
  for(const name of ['inspect','writeAt','truncate','flush','close'])if(typeof lease[name]!=='function')fail('HBA_CONFIGURATION');
  for(const name of ['create','append'])if(typeof receipt[name]!=='function')fail('HBA_CONFIGURATION');
  if(typeof admin.open!=='function'||typeof gates.window!=='function'||typeof gates.recovery!=='function')fail('HBA_CONFIGURATION');
  let last=epoch,invoked=false,identity=null,original=null,proposed=null,expected=null,attempt=null;
  let mutation=false,recordReady=false,phaseCount=0,restoreDeadline=null,currentSocket=null;
  let childHandle=null,childStarted=false,childSettled=false,childOK=false,childActual=null,startActual=null;
  let socketUnknown=false,leaseClosed=false,journalFailed=false,timerFailed=false;
  const pending=new Set(),pendingWrites=new Set(),pendingLease=new Set(),endings=new WeakMap();
  const result={schema:'adr171-hba-window/v1',mode:null,status:'failed',failure:null,phases:[],
    fileRestored:false,leaseClosed:false,childStarted:false,childSettled:false,childOK:false,
    proposedPolicy:{signalAccepted:false,parsed:false,active:'unknown'},
    originalPolicy:{signalAccepted:false,parsed:false,active:'unknown'},rollbackComplete:false,
    pendingPhysical:0,journalFailed:false,timerFailed:false};
  function clock(){let time;try{time=now();}catch{fail('HBA_CLOCK');}if(!finite(time)||time<last)fail('HBA_CLOCK');last=time;return time;}
  function hash(bytes){const value=digest(Buffer.from(bytes));if(typeof value!=='string'||!/^[0-9a-f]{64}$/u.test(value))fail('HBA_DIGEST');return value;}
  function begin(mode){if(invoked||usedLeases.has(lease))fail('HBA_DUPLICATE');invoked=true;usedLeases.add(lease);result.mode=mode;clock();}
  function actual(fn,isWrite=false,isLease=false){const entry={};pending.add(entry);if(isWrite)pendingWrites.add(entry);if(isLease)pendingLease.add(entry);let promise;
    try{promise=Promise.resolve(fn());}catch(error){promise=Promise.reject(error);}
    entry.promise=promise;const settled=()=>{pending.delete(entry);pendingWrites.delete(entry);pendingLease.delete(entry);};promise.then(settled,settled);return promise;}
  function wait(promise,deadline,label){const observation=new Promise((resolve,reject)=>{let done=false,handle=null;
    function clear(){if(handle!==null)try{const cancelled=cancel(handle);if(typeof cancelled?.then==='function'){
      timerFailed=true;Promise.resolve(cancelled).catch(()=>{});}}catch{timerFailed=true;}}
    function finish(ok,value){if(done)return;let time;try{time=clock();}catch(error){done=true;clear();reject(error);return;}
      if(time>=deadline){done=true;clear();reject(failure(label));return;}
      done=true;clear();
      if(ok)resolve(value);else reject(failure(label));}
    promise.then(value=>finish(true,value),()=>finish(false));
    try{const time=clock();if(time>=deadline){finish(false);return;}handle=schedule(()=>finish(false),deadline-time);
      if(handle===undefined||handle===null||typeof handle?.then==='function'){timerFailed=true;Promise.resolve(handle).catch(()=>{});finish(false);}}
    catch{timerFailed=true;finish(false);}
  });observation.catch(()=>{});return observation;}
  function op(fn,deadline,label,isWrite=false){if(clock()>=deadline)fail(label);
    const isLease=['HBA_INSPECT','HBA_WRITE','HBA_TRUNCATE','HBA_FLUSH'].includes(label);
    return wait(actual(fn,isWrite,isLease),Math.min(clock()+HBA_LIMITS.operationMs,deadline),label);}
  async function phase(name,deadline){if(phaseCount>=HBA_LIMITS.phases)fail('HBA_PHASE_CAPACITY');phaseCount++;
    result.phases.push(name);const answer=await op(()=>receipt.append(Object.freeze({sequence:phaseCount,phase:name})),deadline,'HBA_RECEIPT');
    if(answer?.durable!==true)fail('HBA_RECEIPT');}
  async function note(name,deadline){try{await phase(name,deadline);}catch{journalFailed=true;}}
  function inspected(value){if(!value||value.path!==HBA_PATH||value.ordinary!==true||value.ancestorsOrdinary!==true||value.share!=='read-only'||
    !safeId(value.volumeId)||!safeId(value.fileId))fail('HBA_IDENTITY');
    const next={volumeId:value.volumeId,fileId:value.fileId};
    if(identity&&(identity.volumeId!==next.volumeId||identity.fileId!==next.fileId))fail('HBA_IDENTITY');
    const bytes=copy(value.bytes);if(bytes.length>HBA_LIMITS.originalBytes+Buffer.byteLength(HBA_RULE))fail('HBA_BYTES');
    if(!identity)identity=Object.freeze(next);return bytes;}
  async function read(deadline){return inspected(await op(()=>lease.inspect(),deadline,'HBA_INSPECT'));}
  function authenticate(bytes){if(bytes.length===0||bytes.length>HBA_LIMITS.originalBytes||hash(bytes)!==ORIGINAL_SHA)fail('HBA_ORIGINAL');
    if(bytes.includes(0)||bytes.subarray(0,3).equals(Buffer.from([239,187,191])))fail('HBA_ENCODING');
    try{new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{fail('HBA_ENCODING');}
    original=Buffer.from(bytes);proposed=Buffer.concat([Buffer.from(HBA_RULE),original]);expected=Buffer.from(bytes);}
  function record(){return Object.freeze({schema:'adr171-hba-recovery/v1',path:HBA_PATH,originalSha:ORIGINAL_SHA,
    proposedSha:hash(proposed),identity,originalBase64:original.toString('base64'),phase:'PREPARED'});}
  async function persist(deadline){const data=record();if(Buffer.byteLength(JSON.stringify(data))>HBA_LIMITS.receiptBytes)fail('HBA_RECEIPT_CAPACITY');
    const answer=await op(()=>receipt.create(data),deadline,'HBA_RECEIPT');
    if(answer?.durable!==true||answer?.restricted!==true||answer?.createNew!==true)fail('HBA_RECEIPT');recordReady=true;}
  function ownedPartial(bytes){if(!attempt)return false;
    if(attempt.kind==='truncate')return same(bytes,attempt.before)||same(bytes,attempt.before.subarray(0,attempt.length));
    const {before,offset,data}=attempt,n=data.length;
    if(bytes.length<before.length||bytes.length>Math.max(before.length,offset+n)||
      !same(bytes.subarray(0,offset),before.subarray(0,offset))||
      !same(bytes.subarray(offset+n),before.subarray(offset+n)))return false;
    let suffixBad=0,prefixOK=true;
    for(let j=0;j<n;j++)if(bytes[offset+j]!==before[offset+j])suffixBad++;
    for(let k=0;k<=n;k++){
      if(prefixOK&&suffixBad===0&&bytes.length===Math.max(before.length,offset+k))return true;
      if(k<n){if(bytes[offset+k]!==before[offset+k])suffixBad--;prefixOK&&=bytes[offset+k]===data[k];}
    }return false;}
  function known(bytes){return same(bytes,original)||same(bytes,proposed)||(expected&&same(bytes,expected))||ownedPartial(bytes);}
  async function replace(bytes,deadline){let offset=0,count=0;
    while(offset<bytes.length){if(++count>HBA_LIMITS.writes)fail('HBA_WRITE_CAPACITY');
      const data=Buffer.from(bytes.subarray(offset,offset+HBA_LIMITS.chunkBytes));attempt={kind:'write',before:Buffer.from(expected),offset,data};mutation=true;
      const wrote=await op(()=>lease.writeAt(offset,Buffer.from(data)),deadline,'HBA_WRITE',true);
      if(!Number.isInteger(wrote)||wrote<1||wrote>data.length)fail('HBA_WRITE_COUNT');
      const next=Buffer.alloc(Math.max(expected.length,offset+wrote));expected.copy(next);data.copy(next,offset,0,wrote);expected=next;attempt=null;offset+=wrote;
    }
    attempt={kind:'truncate',before:Buffer.from(expected),length:bytes.length};
    await op(()=>lease.truncate(bytes.length),deadline,'HBA_TRUNCATE',true);expected=Buffer.from(expected.subarray(0,bytes.length));attempt=null;
    await op(()=>lease.flush(),deadline,'HBA_FLUSH');const verified=await read(deadline);if(!same(verified,bytes))fail('HBA_VERIFY');expected=verified;
  }
  async function endSocket(deadline){if(!currentSocket)return;
    const socket=currentSocket;let promise=endings.get(socket);
    if(!promise){if(clock()>=deadline)fail('HBA_SOCKET_END');promise=actual(()=>socket.end());endings.set(socket,promise);}
    try{const ended=await wait(promise,Math.min(clock()+HBA_LIMITS.operationMs,deadline),'HBA_SOCKET_END');
      if(ended?.settled!==true)fail('HBA_SOCKET_END');currentSocket=null;
    }catch(error){socketUnknown=true;throw error;}}
  async function reload(which,deadline){if(currentSocket||socketUnknown||childStarted&&!childSettled)fail('HBA_SOCKET_ORDER');
    if(clock()>=deadline)fail('HBA_SOCKET_OPEN');
    const opened=actual(()=>admin.open());opened.then(socket=>{if(socket&&typeof socket==='object')currentSocket=socket;},()=>{socketUnknown=true;});
    let socket;try{socket=await wait(opened,Math.min(clock()+HBA_LIMITS.operationMs,deadline),'HBA_SOCKET_OPEN');}
    catch(error){socketUnknown=true;throw error;}
    if(!socket||!['reload','parsed','end'].every(name=>typeof socket[name]==='function'))fail('HBA_SOCKET');
    const policy=result[which==='proposed'?'proposedPolicy':'originalPolicy'];
    try{
      policy.signalAccepted=(await op(()=>socket.reload(),deadline,'HBA_RELOAD'))?.signalAccepted===true;
      const parsed=await op(()=>socket.parsed(which),deadline,'HBA_PARSE');policy.parsed=parsed?.valid===true&&parsed?.exactRule===(which==='proposed');
      if(typeof socket.active==='function'){
        const proof=await op(()=>socket.active(which),deadline,'HBA_ACTIVE');
        if(proof?.status==='verified'&&proof?.settled===true)policy.active='verified';
      }
      if(!policy.signalAccepted||!policy.parsed)fail('HBA_POLICY');
    }finally{await endSocket(deadline);}
  }
  function bindChild(handle){childHandle=handle;
    if(!handle||!handle.settlement||typeof handle.stopOwn!=='function')fail('HBA_CHILD');
    childActual=actual(()=>handle.settlement);
    childActual.then(answer=>{if(answer?.settled===true){childSettled=true;childOK=answer.ok===true;}},()=>{});
  }
  async function runChild(){if(currentSocket||socketUnknown||!child||typeof child.start!=='function')fail('HBA_SOCKET_ORDER');
    if(clock()>=epoch+240000)fail('HBA_CHILD_START');
    childStarted=true;startActual=actual(()=>child.start());startActual.then(bindChild,()=>{}).catch(()=>{});
    const handle=await wait(startActual,Math.min(clock()+HBA_LIMITS.operationMs,epoch+240000),'HBA_CHILD_START');
    if(!childHandle)bindChild(handle);
    const answer=await wait(childActual,Math.min(clock()+HBA_LIMITS.childMs,epoch+225000),'HBA_CHILD_TIMEOUT');
    if(answer?.settled!==true||answer.ok!==true)fail('HBA_CHILD_FAILED');
  }
  async function settleChild(deadline){if(!childStarted||childSettled)return;
    if(startActual&&!childHandle)try{await wait(startActual,deadline,'HBA_CHILD_UNKNOWN');}catch{}
    if(childHandle&&!childSettled){
      try{const stopDeadline=Math.min(clock()+HBA_LIMITS.stopMs,deadline);if(clock()<stopDeadline)await wait(actual(()=>childHandle.stopOwn()),stopDeadline,'HBA_CHILD_STOP');}catch{}
      if(childActual)try{await wait(childActual,deadline,'HBA_CHILD_UNKNOWN');}catch{}
    }
  }
  async function restore(){restoreDeadline=Math.min(clock()+HBA_LIMITS.restoreMs,epoch+HBA_LIMITS.totalMs);
    await settleChild(Math.min(restoreDeadline-15000,epoch+240000));
    if(recordReady)await note('RESTORE_STARTED',restoreDeadline);
    // Never race a pending physical write with restoration on the same handle.
    if(pendingLease.size)await wait(Promise.allSettled([...pendingLease].map(entry=>entry.promise)),restoreDeadline,'HBA_WRITE_PENDING');
    if(original){const current=await read(restoreDeadline);if(!known(current))fail('HBA_UNKNOWN_BYTES');expected=current;attempt=null;
      if(!same(current,original))await replace(original,restoreDeadline);result.fileRestored=true;
    }
    if(recordReady)await note('FILE_RESTORED',restoreDeadline);
    if(currentSocket)await endSocket(restoreDeadline);
    if(mutation&&(!childStarted||childSettled)&&!socketUnknown){await reload('original',restoreDeadline);
      if(recordReady)await note('ORIGINAL_RELOADED',restoreDeadline);}
  }
  async function finish(){
    try{if(original&&(mutation||recordReady))await restore();}
    catch(error){result.failure??=errorCode(error)??'HBA_RESTORE';}
    try{if(pendingLease.size===0){await op(()=>lease.close(),Math.min(clock()+HBA_LIMITS.operationMs,epoch+HBA_LIMITS.totalMs),'HBA_LEASE_CLOSE');leaseClosed=true;}}
    catch{result.failure??='HBA_LEASE_CLOSE';}
    result.childStarted=childStarted;result.childSettled=childSettled;result.childOK=childOK;
    result.leaseClosed=leaseClosed;result.pendingPhysical=pending.size;result.journalFailed=journalFailed;result.timerFailed=timerFailed;
    result.rollbackComplete=result.fileRestored&&result.originalPolicy.signalAccepted&&result.originalPolicy.parsed&&
      result.originalPolicy.active==='verified'&&(!childStarted||childSettled)&&!socketUnknown&&pending.size===0&&!journalFailed&&!timerFailed&&leaseClosed;
    if(result.rollbackComplete&&result.failure===null&&(result.mode==='recovery'||childOK))result.status='complete';
    else if(result.failure===null)result.status='incomplete';
    return Object.freeze({...result,phases:Object.freeze([...result.phases]),proposedPolicy:Object.freeze({...result.proposedPolicy}),originalPolicy:Object.freeze({...result.originalPolicy})});
  }
  async function run(){begin('window');const deadline=epoch+HBA_LIMITS.preflightMs;
    try{
      if(await op(()=>gates.window(),deadline,'HBA_GATES')!==true)fail('HBA_GATES');
      authenticate(await read(deadline));await persist(deadline);await phase('APPLY_STARTED',deadline);
      if(!same(await read(deadline),original))fail('HBA_UNKNOWN_BYTES');
      await replace(proposed,deadline);await phase('PROPOSED_VERIFIED',deadline);await reload('proposed',deadline);
      await phase('ADMIN_ENDED',deadline);await phase('CHILD_STARTED',deadline);await runChild();await phase('CHILD_SETTLED',epoch+240000);
    }catch(error){result.failure=errorCode(error)??'HBA_WINDOW';}
    return finish();
  }
  async function recover(data){begin('recovery');const deadline=epoch+HBA_LIMITS.preflightMs;let authenticated=false;
    try{
      if(await op(()=>gates.recovery(),deadline,'HBA_GATES')!==true)fail('HBA_GATES');
      data=dataRecord(data,['identity','originalBase64','originalSha','path','phase','proposedSha','schema']);
      if(data.schema!=='adr171-hba-recovery/v1'||data.path!==HBA_PATH||data.originalSha!==ORIGINAL_SHA||data.phase!=='PREPARED'||
        typeof data.originalBase64!=='string'||data.originalBase64.length>HBA_LIMITS.receiptBytes||
        Buffer.byteLength(JSON.stringify(data))>HBA_LIMITS.receiptBytes)fail('HBA_RECOVERY_RECORD');
      const bytes=Buffer.from(data.originalBase64,'base64');if(bytes.toString('base64')!==data.originalBase64)fail('HBA_RECOVERY_RECORD');
      const storedIdentity=dataRecord(data.identity,['volumeId','fileId']);
      authenticate(bytes);if(data.proposedSha!==hash(proposed)||!safeId(storedIdentity.volumeId)||!safeId(storedIdentity.fileId))fail('HBA_RECOVERY_RECORD');
      identity=Object.freeze({volumeId:storedIdentity.volumeId,fileId:storedIdentity.fileId});const current=await read(deadline);
      if(!same(current,original)&&!same(current,proposed))fail('HBA_UNKNOWN_BYTES');
      expected=current;recordReady=true;mutation=true;authenticated=true;await phase('RECOVERY_AUTHENTICATED',deadline);
    }catch(error){result.failure=errorCode(error)??'HBA_RECOVERY';
      if(!authenticated)original=null;else journalFailed=true;
    }
    return finish();
  }
  return Object.freeze({run,recover});
}
