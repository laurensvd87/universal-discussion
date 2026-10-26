import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunControl,RUN_CONTROL_LIMITS as limits} from './run-control.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const code=value=>error=>error?.code===value;
function fixture({epoch=0,start=epoch,usage=()=>({rss:1,cpuUs:0}),onFault=()=>{},scheduleFault=false,cancelFault=false}={}) {
  let time=start,next=0;const timers=new Map(),faults=[];
  const input={epoch,now:()=>time,usage,onFault(label){faults.push(label);return onFault(label);},
    schedule(fn,ms){if(scheduleFault)return Promise.reject(new Error('private timer error'));const id=++next;timers.set(id,{fn,at:time+ms});return id;},
    cancel(id){timers.delete(id);if(cancelFault)return Promise.reject(new Error('private cancellation error'));}};
  const control=createRunControl(input);
  return {...control,input,timers,faults,set(value){time=value;},
    async advance(value){time=value;const due=[...timers].filter(([,timer])=>timer.at<=time);for(const [id,timer]of due){if(timers.delete(id))timer.fn();}await flush();}};
}
async function bootstrap(f){await f.admin.establish('controller',()=>Promise.resolve());f.admin.registerController('controller');}
async function seeded(options={}) {
  const f=fixture(options);await f.work.run(async()=>{await bootstrap(f);await f.admin.establish('worker',()=>Promise.resolve());});return f;
}
async function closeWorker(f){await f.admin.closeClient('worker',()=>Promise.resolve());}

test('imported constants match fixed source ceilings and capabilities are separate frozen facades',()=>{
  assert.deepEqual(limits,{clients:8,statementMs:5000,admitMs:165000,wallMs:180000,cleanupMs:15000,dropMs:15000,sampleMs:25,rss:536870912,cpuUs:30000000});
  assert.throws(()=>{limits.clients=NaN;},TypeError);
  const f=fixture();assert.ok(Object.isFrozen(f.work));assert.ok(Object.isFrozen(f.admin));
  assert.deepEqual(Object.keys(f.work),['check','run','dispatch']);assert.equal(f.work.admin,undefined);assert.equal(f.work.token,undefined);
  assert.equal(f.timers.size,1);f.admin.close();assert.equal(f.timers.size,0);assert.deepEqual(f.admin.close(),f.admin.snapshot());
});

test('absent and wrong lanes reject before callbacks; root capabilities cannot be entered by work',async()=>{
  const f=fixture();let effects=0;
  assert.throws(()=>f.work.check(),code('CONTROL_LANE'));assert.throws(()=>f.work.dispatch('controller',()=>effects++),code('CONTROL_LANE'));
  await f.work.run(async()=>{
    f.work.check();await bootstrap(f);
    assert.throws(()=>f.admin.dispatch('controller',()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.controller(()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.dropDispatch(()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.cleanup(()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.drop(()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.work.run(()=>effects++),code('CONTROL_LANE'));
  });
  await f.admin.cleanup(async()=>{
    assert.throws(()=>f.work.dispatch('controller',()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.work.check(),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.dispatch('controller',()=>effects++),code('CONTROL_CONTROLLER'));
    await f.admin.controller(()=>{effects++;});
  });assert.equal(effects,1);f.admin.close();
});

test('one enclosing run refuses second entry and concurrent root run',async()=>{
  const f=fixture(),held=deferred();const run=f.work.run(()=>held.promise);
  assert.throws(()=>f.work.run(()=>{}),code('CONTROL_RUN'));held.resolve();await run;
  assert.throws(()=>f.work.run(()=>{}),code('CONTROL_RUN'));f.admin.close();
});

test('all eight lifetime slots include controller; capacity checks precede factories',async()=>{
  const f=fixture();let created=0;
  await f.work.run(async()=>{
    await bootstrap(f);assert.throws(()=>f.admin.registerController('other'),code('CONTROL_CONTROLLER'));
    for(let i=0;i<7;i++)await f.admin.establish(`worker-${i}`,()=>{created++;});
    assert.throws(()=>f.admin.establish('ninth',()=>created++),code('CONTROL_CAPACITY'));
    assert.throws(()=>f.admin.establish('worker-0',()=>created++),code('CONTROL_CAPACITY'));
  });assert.equal(created,7);assert.equal(f.admin.snapshot().clients,8);f.admin.close();
});

test('reserved controller must exist and a busy controller cannot issue its own cancellation',async()=>{
  const f=fixture(),query=deferred();let queryObservation,run;
  assert.throws(()=>f.admin.controller(()=>{}),code('CONTROL_CONTROLLER'));
  run=f.work.run(async()=>{await bootstrap(f);queryObservation=f.work.dispatch('controller',()=>query.promise);await queryObservation;});
  run.catch(()=>{});await flush();
  await f.admin.cleanup(async()=>{assert.throws(()=>f.admin.controller(()=>{}),code('CONTROL_CLIENT'));});
  assert.equal(f.admin.snapshot().controllerBusy,true);assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));
  query.resolve();await run;await f.admin.join();f.admin.close();
});

test('every dispatch checks absolute deadline before invocation, including after an await',async()=>{
  const f=fixture({epoch:100,start:164999+100});let effects=0;
  await f.work.run(async()=>{await bootstrap(f);await Promise.resolve();f.set(165100);
    assert.throws(()=>f.work.dispatch('controller',()=>effects++),code('CONTROL_WORK_DEADLINE'));
    assert.throws(()=>f.work.check(),code('CONTROL_WORK_DEADLINE'));
  }).catch(()=>{});assert.equal(effects,0);assert.equal(f.admin.snapshot().epoch,100);f.admin.close();
});

test('work timeout retains original continuation and late work cannot borrow cleanup or DROP',async()=>{
  const f=fixture(),resume=deferred();let lateCode,effects=0;
  const run=f.work.run(async()=>{await bootstrap(f);await resume.promise;
    try{await f.work.dispatch('controller',()=>effects++);}catch(error){lateCode=error.code;}
    assert.throws(()=>f.admin.controller(()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.dropDispatch(()=>effects++),code('CONTROL_LANE'));
  });const rejected=assert.rejects(run,code('CONTROL_WORK_DEADLINE'));await flush();await f.advance(165000);await rejected;
  assert.equal(f.admin.snapshot().pendingTasks,1);
  await f.admin.cleanup(async()=>{await f.admin.controller(()=>{effects++;});});
  assert.throws(()=>f.admin.drop(()=>effects++),code('CONTROL_DROP_INELIGIBLE'));
  const join=f.admin.join();assert.equal(join,f.admin.join());resume.resolve();await join;
  assert.equal(lateCode,'CONTROL_LANE');assert.equal(effects,1);
  await f.admin.drop(async()=>{await f.admin.dropDispatch(()=>{effects++;});});assert.equal(effects,2);f.admin.close();
});

test('query timeout does not settle physical query, release busy capacity, or enable DROP',async()=>{
  const f=fixture(),query=deferred();let seen;
  const run=f.work.run(async()=>{await bootstrap(f);await f.admin.establish('worker',()=>{});
    seen=f.work.dispatch('worker',()=>query.promise);await assert.rejects(seen,code('CONTROL_QUERY_TIMEOUT'));
  });await flush();await f.advance(5000);await run;
  assert.equal(f.admin.snapshot().pendingPhysical,1);
  await f.admin.cleanup(async()=>{assert.throws(()=>f.admin.dispatch('worker',()=>{}),code('CONTROL_CLIENT'));assert.throws(()=>f.admin.closeClient('worker',()=>{}),code('CONTROL_CLIENT'));});
  assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));
  const join=f.admin.join();query.reject(new Error('late raw rejection observed'));await join;
  assert.equal(f.admin.snapshot().pendingPhysical,0);await closeWorker(f);f.admin.close();
});

test('join timeout never counts original or physical promises as settled',async()=>{
  const f=fixture(),held=deferred();const run=f.work.run(async()=>{await bootstrap(f);await held.promise;});run.catch(()=>{});
  await flush();f.set(10);f.admin.fault();await f.admin.cleanup(()=>{});const join=f.admin.join();const rejected=assert.rejects(join,code('CONTROL_JOIN_TIMEOUT'));
  await f.advance(15010);await rejected;assert.equal(f.admin.snapshot().pendingTasks,1);
  assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));held.resolve();await flush();assert.equal(f.admin.snapshot().pendingTasks,0);f.admin.close();
});

test('uncertain establishment remains a permanent no-DROP flag after its late success',async()=>{
  const f=fixture(),connect=deferred();let result;
  const run=f.work.run(async()=>{await bootstrap(f);result=f.admin.establish('worker',()=>connect.promise);await assert.rejects(result,code('CONTROL_ESTABLISH_TIMEOUT'));});
  await flush();await f.advance(5000);await run;
  assert.equal(f.admin.snapshot().acquisitionUncertain,true);assert.equal(f.admin.snapshot().pendingPhysical,1);
  await f.admin.cleanup(()=>{});connect.resolve();await f.admin.join();await closeWorker(f);
  assert.equal(f.admin.snapshot().acquisitionUncertain,true);assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));f.admin.close();
});

test('establishment guard stays in original work lane across connector awaits',async()=>{
  const f=fixture(),connect=deferred();let setup=0,late;
  const run=f.work.run(async()=>{await bootstrap(f);await f.admin.establish('worker',async()=>{
    f.work.check();await connect.promise;try{f.work.check();setup++;}catch(error){late=error.code;throw error;}
  });});run.catch(()=>{});await flush();f.set(1);f.admin.fault();await f.admin.cleanup(()=>{});connect.resolve();await f.admin.join();
  assert.equal(setup,0);assert.equal(late,'CONTROL_LANE');assert.equal(f.admin.snapshot().acquisitionUncertain,true);f.admin.close();
});

test('close is exactly once, bounded, and cannot free a pending close slot',async()=>{
  const f=await seeded(),end=deferred();await f.admin.cleanup(()=>{});let calls=0;
  const close=f.admin.closeClient('worker',()=>{calls++;return end.promise;});assert.equal(close,f.admin.closeClient('worker',()=>{calls++;}));
  const rejected=assert.rejects(close,code('CONTROL_CLOSE_TIMEOUT'));await f.advance(15000);await rejected;
  assert.equal(calls,1);assert.equal(f.admin.snapshot().pendingPhysical,1);assert.equal(f.admin.snapshot().closeUncertain,true);
  assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));end.resolve();await flush();
  assert.equal(f.admin.snapshot().clients,2);assert.equal(f.admin.snapshot().closeUncertain,true);f.admin.close();
});

test('rejected close is observed and also forbids DROP',async()=>{
  const f=await seeded();await f.admin.cleanup(()=>{});
  await assert.rejects(f.admin.closeClient('worker',()=>Promise.reject(new Error('end failed'))));
  assert.equal(f.admin.snapshot().closeUncertain,true);assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));f.admin.close();
});

test('DROP requires noncontroller closure but keeps the reserved controller open through confirmation',async()=>{
  const f=await seeded();await f.admin.cleanup(()=>{});assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));
  await closeWorker(f);let sql=0;
  await f.admin.drop(async()=>{assert.throws(()=>f.work.check(),code('CONTROL_LANE'));assert.throws(()=>f.admin.controller(()=>{}),code('CONTROL_LANE'));
    await f.admin.dropDispatch(()=>{sql++;});await f.admin.dropDispatch(()=>{sql++;});});
  assert.equal(sql,2);assert.equal(f.admin.snapshot().dropFinished,true);assert.equal(f.admin.snapshot().connected,1);
  let ends=0;const closed=f.admin.closeClient('controller',()=>{ends++;});await closed;assert.equal(closed,f.admin.closeClient('controller',()=>ends++));assert.equal(ends,1);f.admin.close();
});

test('late DROP remains uncertain even when its physical query and callback eventually succeed',async()=>{
  const f=await seeded(),query=deferred();await f.admin.cleanup(()=>{});await closeWorker(f);
  const drop=f.admin.drop(async()=>{await f.admin.dropDispatch(()=>query.promise);});const rejected=assert.rejects(drop,code('CONTROL_QUERY_TIMEOUT'));
  await f.advance(5000);await rejected;assert.equal(f.admin.snapshot().dropUncertain,true);assert.equal(f.admin.snapshot().dropFinished,false);
  assert.equal(f.admin.snapshot().pendingPhysical,1);query.resolve();await flush();assert.equal(f.admin.snapshot().dropFinished,false);f.admin.close();
});

test('DROP original callback timeout revokes late continuation and cannot become success',async()=>{
  const f=await seeded(),held=deferred();await f.admin.cleanup(()=>{});await closeWorker(f);let effects=0;
  const drop=f.admin.drop(async()=>{await held.promise;assert.throws(()=>f.admin.dropDispatch(()=>effects++),code('CONTROL_LANE'));});
  const rejected=assert.rejects(drop,code('CONTROL_DROP_TIMEOUT'));await f.advance(30000);await rejected;
  assert.equal(f.admin.snapshot().pendingTasks,1);held.resolve();await flush();assert.equal(effects,0);assert.equal(f.admin.snapshot().dropFinished,false);assert.equal(f.admin.snapshot().dropUncertain,true);f.admin.close();
});

test('detached work retains its own ALS lane even while root is inside DROP',async()=>{
  const f=fixture(),resume=deferred();let child,effects=0;
  await f.work.run(async()=>{await bootstrap(f);child=(async()=>{await resume.promise;
    assert.throws(()=>f.work.dispatch('controller',()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.dropDispatch(()=>effects++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.cleanup(()=>effects++),code('CONTROL_LANE'));
  })();});await f.admin.cleanup(()=>{});
  await f.admin.drop(async()=>{resume.resolve();await child;await f.admin.dropDispatch(()=>{effects++;});});
  assert.equal(effects,1);f.admin.close();
});

test('detached cleanup cannot continue closing clients after its lane has finished',async()=>{
  const f=await seeded(),resume=deferred();let child,ends=0;
  await f.admin.cleanup(()=>{child=(async()=>{await resume.promise;
    assert.throws(()=>f.admin.closeClient('worker',()=>ends++),code('CONTROL_LANE'));
    assert.throws(()=>f.admin.dispatch('worker',()=>ends++),code('CONTROL_LANE'));
  })();});resume.resolve();await child;assert.equal(ends,0);await closeWorker(f);f.admin.close();
});

test('DROP cannot report success while a detached physical DROP query remains pending',async()=>{
  const f=await seeded(),query=deferred();await f.admin.cleanup(()=>{});await closeWorker(f);
  await assert.rejects(f.admin.drop(()=>{f.admin.dropDispatch(()=>query.promise);}),code('CONTROL_DROP_UNCERTAIN'));
  assert.equal(f.admin.snapshot().pendingPhysical,1);assert.equal(f.admin.snapshot().dropFinished,false);
  query.resolve();await flush();assert.equal(f.admin.snapshot().dropUncertain,true);assert.equal(f.admin.snapshot().dropFinished,false);f.admin.close();
});

test('usage sampling cannot move a callback past its deadline without a fresh clock check',async()=>{
  const f=fixture();let effects=0,advance=false;
  f.input.usage=()=>({rss:1,cpuUs:0});
  const g=createRunControl({...f.input,usage(){if(advance)f.set(165000);return {rss:1,cpuUs:0};}});
  await g.work.run(async()=>{await bootstrap(g);advance=true;
    assert.throws(()=>g.work.dispatch('controller',()=>effects++),code('CONTROL_WORK_DEADLINE'));
  }).catch(()=>{});assert.equal(effects,0);g.admin.close();f.admin.close();
});

test('early fault fixes exact short cleanup and DROP caps; later faults cannot extend them',async()=>{
  const f=await seeded({epoch:100});f.set(1100);f.admin.fault();let snapshot=f.admin.snapshot();assert.equal(snapshot.cleanupDeadline,16100);assert.equal(snapshot.dropDeadline,31100);
  f.set(2100);f.admin.fault();assert.equal(f.admin.snapshot().cleanupDeadline,16100);
  await f.admin.cleanup(()=>{});await closeWorker(f);f.set(31100);
  assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_DEADLINE'));f.admin.close();
});

test('original epoch caps late cleanup at180s and checked DROP at195s',async()=>{
  const f=fixture({epoch:100,start:165099});await f.work.run(()=>bootstrap(f));
  f.set(165100);f.admin.fault();await f.admin.cleanup(()=>{});assert.equal(f.admin.snapshot().cleanupDeadline,180100);assert.equal(f.admin.snapshot().dropDeadline,195100);f.admin.close();
});

test('ordinary rejected original work measures fault time at actual settlement, not its last dispatch',async()=>{
  const f=fixture(),held=deferred();const run=f.work.run(()=>held.promise);const rejected=assert.rejects(run);
  f.set(1000);held.reject(new Error('expected fixture failure'));await rejected;
  assert.equal(f.admin.snapshot().faultAt,1000);assert.equal(f.admin.snapshot().cleanupDeadline,16000);assert.equal(f.admin.snapshot().dropDeadline,31000);f.admin.close();
});

test('cleanup and DROP each check their own deadline immediately before every SQL closure',async()=>{
  const f=await seeded();let effects=0;
  const cleanup=f.admin.cleanup(()=>{f.set(15000);assert.throws(()=>f.admin.controller(()=>effects++),code('CONTROL_CLEANUP_DEADLINE'));});
  await assert.rejects(cleanup,code('CONTROL_CLEANUP_DEADLINE'));assert.equal(effects,0);f.admin.close();
  const g=await seeded();await g.admin.cleanup(()=>{});await closeWorker(g);
  const drop=g.admin.drop(()=>{g.set(30000);assert.throws(()=>g.admin.dropDispatch(()=>effects++),code('CONTROL_DROP_DEADLINE'));});
  await assert.rejects(drop,code('CONTROL_DROP_TIMEOUT'));assert.equal(effects,0);assert.equal(g.admin.snapshot().dropUncertain,true);g.admin.close();
});

test('cleanup duplicate returns its single original observation and cannot be reentered',async()=>{
  const f=await seeded(),held=deferred();let calls=0;
  const cleanup=f.admin.cleanup(async()=>{calls++;assert.throws(()=>f.admin.cleanup(()=>calls++),code('CONTROL_LANE'));await held.promise;});
  assert.equal(cleanup,f.admin.cleanup(()=>calls++));held.resolve();await cleanup;assert.equal(calls,1);f.admin.close();
});

test('sampled resource fault closes work without preventing bounded cleanup',async()=>{
  let cpu=0;const f=fixture({usage:()=>({rss:1,cpuUs:cpu})}),held=deferred();let denied;
  const run=f.work.run(async()=>{await bootstrap(f);await held.promise;try{f.work.check();}catch(error){denied=error.code;}});
  await flush();cpu=30000001;await f.advance(25);assert.equal(f.admin.snapshot().fault,'CONTROL_RESOURCE');
  held.resolve();await run;assert.equal(denied,'CONTROL_POISONED');await f.admin.cleanup(()=>f.admin.controller(()=>{}));f.admin.close();
});

test('nonfinite/backward clocks and resource values fail closed without callbacks',async()=>{
  assert.throws(()=>createRunControl(),code('CONTROL_CONFIGURATION'));
  assert.throws(()=>createRunControl({epoch:0}),code('CONTROL_CONFIGURATION'));
  for(const epoch of [NaN,Infinity,-1,'0'])assert.throws(()=>fixture({epoch}),code('CONTROL_CONFIGURATION'));
  for(const start of [NaN,Infinity,-1])assert.throws(()=>fixture({start}),code('CONTROL_CLOCK'));
  for(const value of [NaN,Infinity,-1,'1'])assert.throws(()=>fixture({usage:()=>({rss:value,cpuUs:0})}),code('CONTROL_RESOURCE'));
  const f=fixture({epoch:10});f.set(9);assert.throws(()=>f.work.run(()=>{}),code('CONTROL_CLOCK'));f.admin.close();
});

test('throwing/rejected timer and fault sinks are observed and do not leak provider errors',async()=>{
  assert.throws(()=>fixture({scheduleFault:true}),code('CONTROL_TIMER'));await flush();
  const f=fixture({onFault:()=>Promise.reject(new Error('private sink error')),cancelFault:true});f.admin.fault();await flush();assert.equal(f.admin.snapshot().sinkFailed,true);
  f.admin.close();await flush();assert.equal(f.admin.snapshot().timerFailed,true);assert.equal(f.admin.snapshot().fault,'CONTROL_FAULT');
  assert.equal(JSON.stringify(f.admin.snapshot()).includes('private'),false);
});

test('bootstrap reserves the sole initial slot and physical connection before invoking its factory',async()=>{
  const f=fixture(),connect=deferred();let factories=0,identityChecked=false;
  await f.work.run(async()=>{
    assert.throws(()=>f.admin.registerController('controller'),code('CONTROL_CONTROLLER'));
    const pending=f.admin.establish('controller',async()=>{
      factories++;assert.equal(f.admin.snapshot().clients,1);assert.equal(f.admin.snapshot().pendingPhysical,1);
      f.work.check();await connect.promise;f.work.check();identityChecked=true;
    });
    assert.equal(f.admin.snapshot().clients,1);assert.equal(f.admin.snapshot().pendingPhysical,1);
    assert.throws(()=>f.admin.establish('other',()=>factories++),code('CONTROL_CAPACITY'));
    assert.throws(()=>f.admin.registerController('controller'),code('CONTROL_CONTROLLER'));
    assert.throws(()=>f.admin.registerController('nonexistent'),code('CONTROL_CONTROLLER'));
    connect.resolve();await pending;assert.equal(identityChecked,true);
    assert.throws(()=>f.admin.establish('other',()=>factories++),code('CONTROL_CAPACITY'));
    const heldQuery=deferred(),query=f.work.dispatch('controller',()=>heldQuery.promise);
    assert.throws(()=>f.admin.registerController('controller'),code('CONTROL_CONTROLLER'));
    heldQuery.resolve();await query;
    f.admin.registerController('controller');assert.equal(f.admin.snapshot().clients,1);
    assert.throws(()=>f.admin.registerController('controller'),code('CONTROL_CONTROLLER'));
    await f.admin.establish('worker',()=>{factories++;});
  });assert.equal(factories,2);assert.equal(f.admin.snapshot().controllerPresent,true);f.admin.close();
});

test('failed initial establishment cannot be registered or replaced by another bootstrap factory',async()=>{
  const f=fixture();let factories=0;
  await f.work.run(async()=>{
    await assert.rejects(f.admin.establish('controller',()=>{factories++;throw new Error('identity check failed');}));
    assert.equal(f.admin.snapshot().pendingPhysical,0);assert.equal(f.admin.snapshot().acquisitionUncertain,true);
    assert.throws(()=>f.admin.registerController('controller'),code('CONTROL_CONTROLLER'));
    assert.throws(()=>f.admin.establish('other',()=>factories++),code('CONTROL_CAPACITY'));
  });assert.equal(factories,1);assert.equal(f.admin.snapshot().controllerPresent,false);f.admin.close();
});

test('initial establishment timeout retains physical acquisition and late success cannot grant controller authority',async()=>{
  const f=fixture(),connect=deferred(),late=deferred();let factories=0;
  const run=f.work.run(async()=>{
    const pending=f.admin.establish('controller',()=>{factories++;return connect.promise;});
    await assert.rejects(pending,code('CONTROL_ESTABLISH_TIMEOUT'));
    assert.equal(f.admin.snapshot().pendingPhysical,1);assert.equal(f.admin.snapshot().clients,1);
    assert.throws(()=>f.admin.registerController('controller'),code('CONTROL_POISONED'));
    connect.resolve();await flush();
    assert.equal(f.admin.snapshot().pendingPhysical,0);assert.equal(f.admin.snapshot().acquisitionUncertain,true);
    assert.throws(()=>f.admin.registerController('controller'),code('CONTROL_POISONED'));
    assert.throws(()=>f.admin.establish('other',()=>factories++),code('CONTROL_POISONED'));late.resolve();
  });await flush();await f.advance(5000);await late.promise;await run;
  assert.equal(factories,1);assert.equal(f.admin.snapshot().controllerPresent,false);
  await f.admin.cleanup(()=>{});await f.admin.closeClient('controller',()=>{});
  assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));f.admin.close();
});

test('settled failed identity establishment can close its owned raw once without clearing uncertainty or enabling DROP',async()=>{
  const f=fixture();let ends=0,rawExists=false;
  await f.work.run(async()=>{await bootstrap(f);
    await assert.rejects(f.admin.establish('worker',async()=>{rawExists=true;f.work.check();throw new Error('invented identity denial');}));
  });assert.equal(rawExists,true);assert.equal(f.admin.snapshot().pendingPhysical,0);
  await f.admin.cleanup(async()=>{
    const close=f.admin.closeClient('worker',()=>{ends++;});
    assert.equal(close,f.admin.closeClient('worker',()=>ends++));await close;
  });assert.equal(ends,1);assert.equal(f.admin.snapshot().acquisitionUncertain,true);
  assert.equal(f.admin.snapshot().closeUncertain,false);assert.equal(f.admin.snapshot().pendingPhysical,0);
  assert.throws(()=>f.admin.drop(()=>{}),code('CONTROL_DROP_INELIGIBLE'));f.admin.close();
});

test('unsettled physical establishment cannot be closed even when cleanup has started',async()=>{
  const f=fixture(),identity=deferred();let ends=0;
  const run=f.work.run(async()=>{await bootstrap(f);await f.admin.establish('worker',()=>identity.promise);});
  const rejected=assert.rejects(run);await flush();
  await f.admin.cleanup(()=>{
    assert.equal(f.admin.snapshot().pendingPhysical,1);
    assert.throws(()=>f.admin.closeClient('worker',()=>ends++),code('CONTROL_CLIENT'));
  });assert.equal(ends,0);identity.reject(new Error('late invented identity denial'));await rejected;await f.admin.join();
  await f.admin.closeClient('worker',()=>{ends++;});assert.equal(ends,1);assert.equal(f.admin.snapshot().acquisitionUncertain,true);f.admin.close();
});
