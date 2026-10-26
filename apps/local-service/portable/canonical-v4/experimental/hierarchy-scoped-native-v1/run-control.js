import { AsyncLocalStorage } from 'node:async_hooks';

// Cooperative event-loop observations, NOT server cancellation or OS limits.
// Nothing samples, schedules, connects, or reads process state on import.
export const RUN_CONTROL_LIMITS = Object.freeze({clients:8,statementMs:5000,admitMs:165000,
  wallMs:180000,cleanupMs:15000,dropMs:15000,sampleMs:25,rss:512*1024**2,cpuUs:30e6});
const failure = code => Object.assign(new Error(code), {code});
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const keyValid = key => typeof key === 'string' && /^[a-z][a-z0-9-]{0,63}$/u.test(key);

/** Root retains admin lexically. ONLY work may be handed to Run or work callbacks.
 * epoch is minted before source capture, not here. usage is epoch-relative CPU.
 * All dependencies are required trusted seams; there are no process/timer defaults.
 * Callback results/errors stay internal to root orchestration. This helper does
 * not validate SQL, scratch OIDs or backend identities: the fixed reviewed driver
 * owns those checks and must route EVERY query through its appropriate lane.
 */
export function createRunControl({epoch,now,schedule,cancel,usage,onFault}={}) {
  if (!finite(epoch) || ![now,schedule,cancel,usage,onFault].every(fn=>typeof fn==='function'))
    throw failure('CONTROL_CONFIGURATION');
  const limits=RUN_CONTROL_LIMITS, als=new AsyncLocalStorage(), clients=new Map();
  const physical=new Set(), originals=new Set();
  let last=epoch, firstFault=null, faultAt=null, phase='work', closed=false;
  let cleanupDeadline=epoch+limits.wallMs, dropDeadline=epoch+limits.wallMs+limits.dropMs;
  let controller=null, workToken=null, cleanupToken=null, dropToken=null;
  let workStarted=false, cleanupPromise=null, dropPromise=null, joinPromise=null;
  let sampledTimer=null, sinkFailed=false, timerFailed=false, acquisitionUncertain=false;
  let closeUncertain=false, dropUncertain=false, dropFinished=false;

  function sink(code) {
    try { Promise.resolve(onFault(code)).catch(()=>{sinkFailed=true;}); }
    catch { sinkFailed=true; }
  }
  function latch(code,time=last) {
    if (firstFault===null) {
      firstFault=code;faultAt=time;
      cleanupDeadline=Math.min(cleanupDeadline,time+limits.cleanupMs,epoch+limits.wallMs);
      dropDeadline=Math.min(dropDeadline,cleanupDeadline+limits.dropMs,epoch+limits.wallMs+limits.dropMs);
      sink(code);
    }
  }
  function clock() {
    let time;
    try { time=now(); } catch { latch('CONTROL_CLOCK');throw failure('CONTROL_CLOCK'); }
    if (!finite(time)||time<last) {latch('CONTROL_CLOCK');throw failure('CONTROL_CLOCK');}
    last=time;return time;
  }
  function stop(code,time=last) {latch(code,time);throw failure(code);}
  function taskFailed() {
    let time=last;try {time=clock();}catch {}
    latch('CONTROL_WORK_FAILED',time);
  }
  function cancelTimer(handle) {
    if(handle===null)return;
    try {Promise.resolve(cancel(handle)).catch(()=>{timerFailed=true;latch('CONTROL_TIMER');});}
    catch {timerFailed=true;latch('CONTROL_TIMER');}
  }
  function timer(fn,ms) {
    try {
      const handle=schedule(fn,ms);
      // Schedulers must return an immediate handle, not an asynchronous acquisition.
      if(handle===undefined || handle===null || typeof handle?.then==='function') {
        Promise.resolve(handle).catch(()=>{});throw failure('CONTROL_TIMER');
      }
      return handle;
    } catch {timerFailed=true;latch('CONTROL_TIMER');throw failure('CONTROL_TIMER');}
  }
  function budget(time) {
    let value;
    try {value=usage();} catch {stop('CONTROL_USAGE',time);}
    if(!value || !finite(value.rss)||!finite(value.cpuUs)||value.rss>limits.rss||value.cpuUs>limits.cpuUs)
      stop('CONTROL_RESOURCE',time);
  }
  function checkLane(kind) {
    const time=clock(), token=als.getStore();
    const expected=kind==='work'?workToken:kind==='cleanup'?cleanupToken:dropToken;
    if(closed || !expected || token!==expected || !token.active || phase!==kind)
      throw failure('CONTROL_LANE');
    if(time>=token.deadline)stop(kind==='work'?'CONTROL_WORK_DEADLINE':kind==='cleanup'?'CONTROL_CLEANUP_DEADLINE':'CONTROL_DROP_DEADLINE',time);
    if(kind==='work'&&firstFault!==null)throw failure('CONTROL_POISONED');
    // A resource fault stops work, not the bounded attempt to clean up own work.
    if(kind==='work')budget(time);
    const dispatchedAt=clock();
    if(dispatchedAt>=token.deadline)stop(kind==='work'?'CONTROL_WORK_DEADLINE':kind==='cleanup'?'CONTROL_CLEANUP_DEADLINE':'CONTROL_DROP_DEADLINE',dispatchedAt);
    return dispatchedAt;
  }
  function rootOnly() {
    if(als.getStore()!==undefined)throw failure('CONTROL_LANE');
    if(closed)throw failure('CONTROL_CLOSED');
  }
  function track(set,fn,token,onSettled=()=>{}) {
    // Register BEFORE invocation, including synchronous and reentrant callbacks.
    const entry={};set.add(entry);
    let promise;
    try {promise=Promise.resolve(als.run(token,fn));} catch(error) {promise=Promise.reject(error);}
    entry.promise=promise;
    promise.then(()=>{set.delete(entry);onSettled(true);},()=>{set.delete(entry);onSettled(false);});
    return promise;
  }
  function observe(promise,deadline,code,onTimeout=()=>{}) {
    const observation=new Promise((resolve,reject)=>{
      let done=false, handle=null;
      const timeout=()=>{
        if(done)return;done=true;
        let time=last;try {time=clock();}catch {}
        latch(code,time);onTimeout();reject(failure(code));
      };
      const settle=(ok,value)=>{
        if(done)return;
        let time;try {time=clock();}catch(error){done=true;cancelTimer(handle);onTimeout();reject(error);return;}
        if(time>=deadline){timeout();cancelTimer(handle);return;}
        done=true;cancelTimer(handle);if(ok)resolve(value);else reject(value);
      };
      // Always observe the original, even when scheduling fails or time is exhausted.
      promise.then(value=>settle(true,value),error=>settle(false,error));
      let time;try {time=clock();if(time>=deadline){timeout();return;}handle=timer(timeout,deadline-time);}
      catch(error){done=true;onTimeout();reject(error);}
    });
    observation.catch(()=>{}); // A detached observer must not hide a late rejection.
    return observation;
  }
  function guardedDispatch(key,fn,kind) {
    const time=checkLane(kind);
    const client=clients.get(key);
    if(typeof fn!=='function'||!client||client.state!=='connected'||client.busy||client.closePromise)
      throw failure('CONTROL_CLIENT');
    client.busy=true;
    const token=als.getStore();
    const actual=track(physical,()=>{
      checkLane(kind); // Immediately before invoking the actual SQL closure.
      return fn();
    },token,()=>{client.busy=false;});
    return observe(actual,Math.min(time+limits.statementMs,token.deadline),'CONTROL_QUERY_TIMEOUT',()=>{
      if(kind==='drop')dropUncertain=true;
    });
  }
  function sample() {
    sampledTimer=null;
    if(closed)return;
    try {
      const time=clock();budget(time);
      if(phase==='work'&&time>=epoch+limits.admitMs)latch('CONTROL_WORK_DEADLINE',time);
      if(time>=dropDeadline)return;
    } catch {}
    try {sampledTimer=timer(sample,limits.sampleMs);} catch {}
  }
  function snapshot() {
    return Object.freeze({phase,closed,fault:firstFault,faultAt,epoch,cleanupDeadline,dropDeadline,
      clients:clients.size,connected:[...clients.values()].filter(c=>c.state==='connected').length,
      pendingPhysical:physical.size,pendingTasks:originals.size,
      controllerPresent:controller!==null,controllerBusy:controller!==null&&clients.get(controller).busy,
      acquisitionUncertain,closeUncertain,dropUncertain,dropFinished,sinkFailed,timerFailed});
  }
  const work=Object.freeze({
    check(){checkLane('work');},
    run(fn){
      rootOnly();if(workStarted||phase!=='work'||typeof fn!=='function')throw failure('CONTROL_RUN');
      const time=clock();if(firstFault!==null)throw failure('CONTROL_POISONED');
      if(time>=epoch+limits.admitMs)stop('CONTROL_WORK_DEADLINE',time);
      budget(time);workStarted=true;workToken={active:true,deadline:epoch+limits.admitMs};
      const actual=track(originals,()=>{checkLane('work');return fn();},workToken,ok=>{
        workToken.active=false;if(!ok)taskFailed();
      });
      return observe(actual,workToken.deadline,'CONTROL_WORK_DEADLINE',()=>{workToken.active=false;});
    },
    dispatch(key,fn){return guardedDispatch(key,fn,'work');},
  });
  const admin=Object.freeze({
    registerController(key){
      checkLane('work');
      const client=clients.get(key);
      if(controller!==null||acquisitionUncertain||!keyValid(key)||clients.size!==1||
          !client||client.state!=='connected'||client.busy||client.closePromise)
        throw failure('CONTROL_CONTROLLER');
      controller=key;
    },
    establish(key,fn){
      const time=checkLane('work');
      if((controller===null&&clients.size!==0)||!keyValid(key)||clients.has(key)||clients.size>=limits.clients||typeof fn!=='function')
        throw failure('CONTROL_CAPACITY');
      const client={state:'establishing',busy:false,closePromise:null};clients.set(key,client);
      const actual=track(physical,()=>{checkLane('work');return fn();},workToken,ok=>{client.state=ok?'connected':'failed';if(!ok)acquisitionUncertain=true;});
      return observe(actual,Math.min(time+limits.statementMs,workToken.deadline),'CONTROL_ESTABLISH_TIMEOUT',()=>{acquisitionUncertain=true;});
    },
    cleanup(fn){
      rootOnly();if(cleanupPromise)return cleanupPromise;
      if(phase!=='work'||typeof fn!=='function')throw failure('CONTROL_CLEANUP');
      const time=clock();phase='cleanup';if(workToken)workToken.active=false;
      cleanupDeadline=Math.min(cleanupDeadline,time+limits.cleanupMs,epoch+limits.wallMs);
      dropDeadline=Math.min(dropDeadline,cleanupDeadline+limits.dropMs,epoch+limits.wallMs+limits.dropMs);
      if(time>=cleanupDeadline)throw failure('CONTROL_CLEANUP_DEADLINE');
      cleanupToken={active:true,deadline:cleanupDeadline};
      const actual=track(originals,()=>{checkLane('cleanup');return fn();},cleanupToken,()=>{cleanupToken.active=false;});
      cleanupPromise=observe(actual,cleanupDeadline,'CONTROL_CLEANUP_DEADLINE',()=>{cleanupToken.active=false;});return cleanupPromise;
    },
    dispatch(key,fn){
      checkLane('cleanup');
      if(key===controller)throw failure('CONTROL_CONTROLLER');
      return guardedDispatch(key,fn,'cleanup');
    },
    controller(fn){if(controller===null)throw failure('CONTROL_CONTROLLER');return guardedDispatch(controller,fn,'cleanup');},
    closeClient(key,fn){
      const token=als.getStore();if(token!==undefined&&token!==cleanupToken)throw failure('CONTROL_LANE');
      if(token!==undefined)checkLane('cleanup');
      const time=clock(), client=clients.get(key);
      if(closed||!client||typeof fn!=='function')throw failure('CONTROL_CLIENT');
      if(client.closePromise)return client.closePromise;
      if(phase!=='cleanup'&&!(phase==='drop'&&key===controller))throw failure('CONTROL_LANE');
      // Failed establishment can still own a raw socket (e.g. identity SQL failed).
      // Its state becomes failed only at physical settlement; never end a still
      // establishing client or clear the permanent acquisition uncertainty.
      if(!['connected','failed'].includes(client.state)||client.busy)throw failure('CONTROL_CLIENT');
      const deadline=phase==='drop'?dropDeadline:cleanupDeadline;
      if(time>=deadline)throw failure('CONTROL_CLEANUP_DEADLINE');
      client.state='closing';
      const actual=track(physical,fn,token,ok=>{client.state=ok?'closed':'close-failed';if(!ok)closeUncertain=true;});
      client.closePromise=observe(actual,Math.min(time+limits.cleanupMs,deadline),'CONTROL_CLOSE_TIMEOUT',()=>{closeUncertain=true;});return client.closePromise;
    },
    join(){
      rootOnly();if(joinPromise)return joinPromise;
      if(phase!=='cleanup')throw failure('CONTROL_LANE');
      // Admission is closed; a failed work continuation cannot add new dispatches.
      const tasks=[...originals,...physical].map(entry=>entry.promise);
      joinPromise=observe(Promise.allSettled(tasks),cleanupDeadline,'CONTROL_JOIN_TIMEOUT');return joinPromise;
    },
    drop(fn){
      rootOnly();if(dropPromise)return dropPromise;
      const time=clock(), control=clients.get(controller);
      if(phase!=='cleanup'||originals.size||physical.size||acquisitionUncertain||closeUncertain||
          !control||control.state!=='connected'||control.busy||control.closePromise||
          [...clients].some(([key,client])=>key!==controller&&client.state!=='closed'))
        throw failure('CONTROL_DROP_INELIGIBLE');
      if(typeof fn!=='function'||time>=dropDeadline)throw failure('CONTROL_DROP_DEADLINE');
      phase='drop';dropToken={active:true,deadline:dropDeadline};
      const actual=track(originals,()=>{checkLane('drop');return fn();},dropToken,ok=>{dropToken.active=false;if(!ok)dropUncertain=true;});
      dropPromise=observe(actual,dropDeadline,'CONTROL_DROP_TIMEOUT',()=>{dropToken.active=false;dropUncertain=true;}).then(value=>{
        if(physical.size||clients.get(controller).busy)dropUncertain=true;
        if(dropUncertain)throw failure('CONTROL_DROP_UNCERTAIN');dropFinished=true;return value;
      });dropPromise.catch(()=>{});return dropPromise;
    },
    dropDispatch(fn){if(controller===null)throw failure('CONTROL_CONTROLLER');return guardedDispatch(controller,fn,'drop');},
    fault(){rootOnly();latch('CONTROL_FAULT',clock());},
    snapshot,
    close(){
      if(als.getStore()!==undefined)throw failure('CONTROL_LANE');
      if(closed)return snapshot();
      closed=true;phase='closed';
      if(workToken)workToken.active=false;if(cleanupToken)cleanupToken.active=false;if(dropToken)dropToken.active=false;
      const handle=sampledTimer;sampledTimer=null;cancelTimer(handle);return snapshot();
    },
  });
  // Arm from the original absolute epoch; never reset it on Run construction.
  const time=clock();budget(time);
  if(time>=epoch+limits.admitMs)latch('CONTROL_WORK_DEADLINE',time);
  sampledTimer=timer(sample,limits.sampleMs);
  return Object.freeze({work,admin});
}
