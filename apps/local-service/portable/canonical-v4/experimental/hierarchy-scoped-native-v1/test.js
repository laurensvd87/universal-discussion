// Invented local adapters only. This suite never captures inventory, invokes
// the runner beyond its closed source gate, opens a database, reads credentials
// or runs a process.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import { SCRATCH_DATABASE,DRIVER_RELATIVE,LIMITS,CASE_NAMES,SOURCE_STATUS,exactIdentifier,
 replaceUnique,checkedReport,assertBudget,assertBarrierWindow,runMeasuredBarrier,sanitizeFailure,explicitAdapter,runNativeScopedProof,createWorkQueryFacade,cleanupOwnedNativeRun,erasedReplayPlan,committedScopedTuple } from './check.js';
import {createRunControl} from './run-control.js';
import { establishFixedClient,FIXED_CLIENT_LIMITS,awaitGuardianHandshake,validateOwnedLedger,validateOwnedFreeze,OWNED_SETTINGS,NATIVE_BINARY_PINS,executeOwnedEntry,readAuthenticatedOwnedLedger,publishSqlStarted } from '../../../../data/adr167-scoped-native-check-20261020.mjs';

function inventedClient({isolation='read committed',failAt=null,rollbackError=null}={}){
 const calls=[];let ended=0;
 return {calls,get ended(){return ended;},
  async query(sql,parameters){calls.push({sql,parameters});
   if(sql===failAt?.sql)throw failAt.error;
   if(sql==='ROLLBACK'&&rollbackError)throw rollbackError;
   if(sql==='SHOW transaction_isolation')return {rows:[{transaction_isolation:isolation}]};
   return {rows:[{invented:true}]};
  },async end(){ended++;}
 };
}
const sqls=client=>client.calls.map(x=>x.sql);
const budget=changes=>({elapsedMs:0,rss:0,cpuUs:0,cases:0,...changes});

test('actual SQL phase publication waits for complete pending-file close before exclusive final link',async()=>{
 const calls=[];let finish;const written=new Promise(resolve=>{finish=resolve;});
 const p=publishSqlStarted({write:async(file,bytes,options)=>{calls.push('write');assert.ok(file.pathname.endsWith('/output/sql-started.pending'));assert.equal(bytes,JSON.stringify({schema:'adr173-sql-phase-started/v1'}));assert.deepEqual(options,{flag:'wx'});await written;calls.push('closed');},publish:async(from,to)=>{assert.ok(from.pathname.endsWith('/output/sql-started.pending'));assert.ok(to.pathname.endsWith('/output/sql-started.json'));calls.push('link');}});
 await Promise.resolve();assert.deepEqual(calls,['write']);finish();await p;assert.deepEqual(calls,['write','closed','link']);
 let links=0;await assert.rejects(publishSqlStarted({write:async()=>{throw Error('invented');},publish:async()=>links++}));assert.equal(links,0);
 await assert.rejects(publishSqlStarted({write:async()=>{},publish:async()=>{throw Object.assign(Error('invented'),{code:'EEXIST'});}}),e=>e.code==='EEXIST');
});

test('owned guardian handshake accepts exactly one bounded line followed by physical stdin end',async()=>{
 const input=new EventEmitter();let paused=0,resumed=0;input.pause=()=>paused++;input.resume=()=>resumed++;
 let timer,cleared=0;const timers={setTimeout(fn,ms){assert.equal(ms,5000);timer=fn;return 1;},clearTimeout(id){assert.equal(id,1);cleared++;}};
 let complete=false;const p=awaitGuardianHandshake({input,supervised:'v1',timers}).then(()=>{complete=true;});
 input.emit('data',Buffer.from('SCOPED_NATIVE_OWN_'));input.emit('data',Buffer.from('JOB_ASSIGNED_V1\n'));
 await Promise.resolve();assert.equal(complete,false);input.emit('end');await p;
 assert.equal(complete,true);assert.equal(resumed,1);assert.equal(paused,1);assert.equal(cleared,1);assert.equal(input.listenerCount('data'),0);assert.equal(typeof timer,'function');
});
test('missing, excessive, duplicate, timed out and errored guardian handshakes refuse without capabilities',async()=>{
 await assert.rejects(awaitGuardianHandshake({supervised:'no'}),e=>e.code==='OWNED_HANDSHAKE');
 for(const kind of ['missing','extra','duplicate','timeout','error']){
  const input=new EventEmitter();input.pause=()=>{};input.resume=()=>{};let expire;
  const p=awaitGuardianHandshake({input,supervised:'v1',timers:{setTimeout(fn){expire=fn;return 1;},clearTimeout(){}}});
  if(kind==='timeout')expire();else if(kind==='error')input.emit('error',Error('invented'));else{
   if(kind==='extra')input.emit('data',Buffer.from('x'.repeat(65)));
   if(kind==='duplicate')input.emit('data',Buffer.from('SCOPED_NATIVE_OWN_JOB_ASSIGNED_V1\n'.repeat(2)));
   input.emit('end');
  }
  await assert.rejects(p,e=>e.code==='OWNED_HANDSHAKE');assert.equal(input.listenerCount('data'),0);
 }
});
const inventedLedger=()=>({schema:'adr173-owned-native-source-ledger/v1',sourceHashes:Object.fromEntries([
 'apps/local-service/data/adr167-scoped-native-check-20261020.mjs',
 'apps/local-service/package.json',
 'apps/local-service/portable/integration/scoped-native-isolated-v1/cluster.js',
 'apps/local-service/portable/integration/scoped-native-isolated-v1/supervise.py',
 'decisions/ADR-173-scoped-proof-owned-postgresql-cluster.md',
].sort().map(key=>[key,'a'.repeat(64)]))});
test('actual owned orchestration refuses missing handshake before context, imports or startup',async()=>{
 const calls=[];await assert.rejects(executeOwnedEntry({handshake:async()=>{calls.push('handshake');throw Error('invented');},context:()=>calls.push('context'),loadCheck:()=>calls.push('check'),loadCluster:()=>calls.push('cluster'),execute:()=>calls.push('start')}));assert.deepEqual(calls,['handshake']);
});
test('actual owned orchestration authenticates ledger before parse, path following or native imports',async()=>{
 const calls=[],bytes=Buffer.from(JSON.stringify(inventedLedger()));
 await assert.rejects(executeOwnedEntry({handshake:async()=>calls.push('handshake'),context:()=>readAuthenticatedOwnedLedger({read:async()=>{calls.push('read');return bytes;},expectedSha:'0'.repeat(64),parse(){calls.push('parse');return inventedLedger();}}),loadCheck:()=>calls.push('check'),loadCluster:()=>calls.push('cluster'),execute:()=>calls.push('start')}));
 assert.deepEqual(calls,['handshake','read']);
});
test('actual owned orchestration refuses closed source before cluster import or startup',async()=>{
 const calls=[];await assert.rejects(executeOwnedEntry({handshake:async()=>calls.push('handshake'),context:async()=>{calls.push('context');return {};},loadCheck:async()=>{calls.push('check');return {SOURCE_STATUS:'incomplete-not-reviewed'};},loadCluster:()=>calls.push('cluster'),execute:()=>calls.push('start')}),e=>e.code==='SOURCE_NOT_ACCEPTED');assert.deepEqual(calls,['handshake','context','check']);
});
test('actual owned orchestration hands authenticated context and modules to execution in strict order',async()=>{
 const calls=[],context={invented:true},check={SOURCE_STATUS:'accepted-for-native-proof'},cluster={invented:true};
 const result=await executeOwnedEntry({handshake:async()=>calls.push('handshake'),context:async()=>{calls.push('context');return context;},loadCheck:async()=>{calls.push('check');return check;},loadCluster:async()=>{calls.push('cluster');return cluster;},execute:async value=>{calls.push('start');assert.deepEqual(value,{context,check,cluster});return 'invented-result';}});
 assert.equal(result,'invented-result');assert.deepEqual(calls,['handshake','context','check','cluster','start']);
});
test('owned source ledger allows fixed code paths and refuses data/output/traversal/accessors',()=>{
 assert.deepEqual(validateOwnedLedger(inventedLedger()),inventedLedger());
 for(const key of ['apps/local-service/data/private.json','apps/local-service/portable/data/a.json','apps/local-service/portable/output/a.js','apps/local-service/portable/../src/a.js','C:/secret.js','apps/local-service/portable/artifacts/a.json']){
  const value=inventedLedger();value.sourceHashes[key]='a'.repeat(64);value.sourceHashes=Object.fromEntries(Object.entries(value.sourceHashes).sort(([a],[b])=>a<b?-1:1));assert.throws(()=>validateOwnedLedger(value));
 }
 let getters=0;const value=inventedLedger();Object.defineProperty(value.sourceHashes,'apps/local-service/portable/a.js',{enumerable:true,get(){getters++;return 'a'.repeat(64);}});
 assert.throws(()=>validateOwnedLedger(value));assert.equal(getters,0);
});
test('owned freeze binds exact ledger, endpoint, resources, binaries and semantic hash',()=>{
 const ledger=inventedLedger(),ledgerSha='b'.repeat(64),body={schema:'adr173-owned-native-freeze/v1',sourceLedgerSha256:ledgerSha,sourceHashes:ledger.sourceHashes,binaryHashes:NATIVE_BINARY_PINS,settings:OWNED_SETTINGS};
 const good={...body,freezeHash:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
 assert.equal(validateOwnedFreeze(good,{ledgerSha,sourceHashes:ledger.sourceHashes}),good);
 for(const field of ['sourceLedgerSha256','sourceHashes','binaryHashes','settings','freezeHash']){
  const bad={...good,[field]:field==='sourceHashes'?{}:field==='binaryHashes'?{}:field==='settings'?{...OWNED_SETTINGS,port:55432}:'c'.repeat(64)};
  assert.throws(()=>validateOwnedFreeze(bad,{ledgerSha,sourceHashes:ledger.sourceHashes}));
 }
});

test('import exposes a bounded plan, not an executed native result',()=>{
 assert.equal(SCRATCH_DATABASE,'murmingle_adr167_scoped_test_20261020');
 assert.equal(DRIVER_RELATIVE,'apps/local-service/data/adr167-scoped-native-check-20261020.mjs');
 assert.ok(Object.isFrozen(LIMITS));assert.ok(Object.isFrozen(CASE_NAMES));
 assert.ok(CASE_NAMES.length>0&&CASE_NAMES.length<=LIMITS.cases);
 assert.equal(new Set(CASE_NAMES).size,CASE_NAMES.length);
 for(const name of CASE_NAMES)assert.match(name,/^[a-zA-Z0-9-]{1,80}$/u);
 // Merely having a named plan is not evidence that any of its cases ran.
});

test('accepted source still rejects an unminted seal before any connector call',async()=>{
 assert.equal(SOURCE_STATUS,'accepted-for-native-proof');let connections=0;
 await assert.rejects(runNativeScopedProof({sourceSeal:null,connectFixedRole(){connections++;throw new Error('Connector must remain unreachable');}}),e=>e.code==='SOURCE_SEAL');
 assert.equal(connections,0);
});

test('exact scratch identifier accepts one literal name without coercion or fallback',()=>{
 assert.equal(exactIdentifier(SCRATCH_DATABASE),'"'+SCRATCH_DATABASE+'"');
 let coerced=0;const hostile={toString(){coerced++;throw new Error('Must not coerce');}};
 for(const value of [undefined,null,'postgres','canonical','murmingle_v4_native_test',SCRATCH_DATABASE+'_retry',SCRATCH_DATABASE.toUpperCase(),SCRATCH_DATABASE+'; DROP DATABASE x',hostile,Symbol('name')])
  assert.throws(()=>exactIdentifier(value),e=>e.code==='DATABASE_NAME');
 assert.equal(coerced,0);
});

test('unique instrumentation preserves all original bytes and literal addition text',()=>{
 const marker='-- unique pre-watermark\r\n';
 const original='BEGIN\r\n'+marker+'UPDATE synthetic SET n=n+1;\r\nEND';
 const addition='PERFORM synthetic_barrier(); -- literal $& $` $\'\r\n';
 const changed=replaceUnique(original,marker,addition);
 assert.equal(changed,'BEGIN\r\n'+addition+marker+'UPDATE synthetic SET n=n+1;\r\nEND');
 assert.equal(changed.replace(addition,''),original);
 for(const body of ['',original.replace(marker,''),original+marker])
  assert.throws(()=>replaceUnique(body,marker,addition),e=>e.code==='INSTRUMENT_MARKER');
 for(const badMarker of ['',null,undefined])
  assert.throws(()=>replaceUnique(original,badMarker,addition),e=>e.code==='INSTRUMENT_MARKER');
});

test('bounded report copies ordinary evidence and enforces UTF-8 byte ceiling',()=>{
 const original={status:'not-executed',cases:[{name:'invented',status:'not-executed'}]};
 const result=checkedReport(original);assert.deepEqual(result,original);assert.notEqual(result,original);
 result.cases[0].status='changed locally';assert.equal(original.cases[0].status,'not-executed');
 const overhead=Buffer.byteLength(JSON.stringify({value:''}));
 const exact={value:'a'.repeat(LIMITS.resultBytes-overhead)};
 assert.equal(Buffer.byteLength(JSON.stringify(checkedReport(exact))),LIMITS.resultBytes);
 assert.throws(()=>checkedReport({value:exact.value+'a'}),e=>e.code==='RESULT_CAPACITY');
 assert.throws(()=>checkedReport({value:'\u20ac'.repeat(Math.ceil(LIMITS.resultBytes/3))}),e=>e.code==='RESULT_CAPACITY');
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>checkedReport(cyclic),TypeError);
});

test('budget helpers admit exact ceilings and reject each independent overrun',()=>{
 assert.doesNotThrow(()=>assertBudget(budget({elapsedMs:LIMITS.admitMs,rss:LIMITS.rss,cpuUs:LIMITS.cpuUs,cases:LIMITS.cases})));
 for(const values of [{elapsedMs:LIMITS.admitMs+1},{rss:LIMITS.rss+1},{cpuUs:LIMITS.cpuUs+1},{cases:LIMITS.cases+1}])
  assert.throws(()=>assertBudget(budget(values)),e=>e.code==='RESOURCE_LIMIT');
 assert.doesNotThrow(()=>assertBudget(budget({elapsedMs:LIMITS.wallMs}),false));
 assert.throws(()=>assertBudget(budget({elapsedMs:LIMITS.wallMs+1}),false),e=>e.code==='RESOURCE_LIMIT');
 assert.equal(LIMITS.clients,8);assert.equal(LIMITS.statementMs,5000);assert.equal(LIMITS.lockMs,3000);assert.equal(LIMITS.barrierMs,2000);
 assert.equal(LIMITS.cleanupMs,15000);assert.equal(LIMITS.rss,512*1024**2);assert.equal(LIMITS.cpuUs,30e6);
});

test('budget helpers reject every nonfinite negative or nonnumeric metric without coercion',()=>{
 let coerced=0;const hostile={valueOf(){coerced++;throw new Error('Must not coerce metric');},toString(){coerced++;throw new Error('Must not stringify metric');}};
 for(const field of ['elapsedMs','rss','cpuUs','cases'])
  for(const invalid of [NaN,Infinity,-Infinity,-1,-Number.MIN_VALUE,'0',null,undefined,{},[],hostile])
   assert.throws(()=>assertBudget(budget({[field]:invalid})),e=>e.code==='RESOURCE_LIMIT');
 assert.throws(()=>assertBudget(budget({cases:0.5})),e=>e.code==='RESOURCE_LIMIT');
 assert.doesNotThrow(()=>assertBudget(budget({elapsedMs:0.5,cpuUs:0.25})));
 assert.equal(coerced,0);
});

test('measured barrier window includes acquisition and release and rejects exact expiry without coercion',()=>{
 assert.deepEqual(assertBarrierWindow(100,100),{elapsedMs:0,limitMs:2000});
 assert.deepEqual(assertBarrierWindow(100,2099.5),{elapsedMs:1999.5,limitMs:2000});
 assert.ok(Object.isFrozen(assertBarrierWindow(100,101)));
 let coerced=0;const hostile={valueOf(){coerced++;throw new Error('Must not coerce time');}};
 for(const [start,end]of [[100,2100],[100,2101],[100,99],[-1,0],[0,-1],[NaN,0],[0,Infinity],[undefined,0],[0,null],[0,'1'],[hostile,1],[0,hostile]])
  assert.throws(()=>assertBarrierWindow(start,end),e=>e.code==='BARRIER_EXPIRED');
 assert.equal(coerced,0);
 // These pure comparisons do not claim a timer cancelled a native query.
});

function inventedBarrier(overrides={}){
 let now=100;const calls=[];
 const options={clock:()=>now,
  acquire:async()=>{calls.push('acquire');},action:async()=>{calls.push('action');return 'synthetic-completion';},
  observe:async()=>{calls.push('observe');},during:async()=>{calls.push('during');},release:async()=>{calls.push('release');},...overrides};
 return {calls,options,setTime:value=>{now=value;}};
}
test('actual measured-barrier helper observes held action twice and releases once before completion',async()=>{
 const f=inventedBarrier();assert.equal(await runMeasuredBarrier(f.options),'synthetic-completion');
 assert.deepEqual(f.calls,['acquire','observe','action','during','observe','release']);
});
test('actual measured-barrier helper rejects long acquisition or release, with no false successful window',async()=>{
 for(const stage of ['acquire','during','release']){
  const f=inventedBarrier();const original=f.options[stage];f.options[stage]=async()=>{await original();f.setTime(2100);};
  await assert.rejects(runMeasuredBarrier(f.options),e=>e.code==='BARRIER_EXPIRED');
  assert.equal(f.calls.filter(c=>c==='release').length,1);
  if(stage==='acquire')assert.equal(f.calls.includes('action'),false);
 }
});
test('actual measured-barrier helper releases after failure without masking the original fault',async()=>{
 const first=new Error('Invented held-operation failure'),second=new Error('Invented release failure');
 const f=inventedBarrier({during:async()=>{throw first;},release:async()=>{throw second;}});
 await assert.rejects(runMeasuredBarrier(f.options),e=>e===first);
 const acquireFailure=inventedBarrier({acquire:async()=>{throw first;}});
 await assert.rejects(runMeasuredBarrier(acquireFailure.options),e=>e===first);
 assert.equal(acquireFailure.calls.includes('release'),false);
});
test('measured-barrier failure does not settle an outstanding action or count it as cancelled',async()=>{
 let settle,physicallySettled=false;const first=new Error('Invented observation refusal');
 const f=inventedBarrier({action:()=>new Promise(resolve=>{settle=()=>{physicallySettled=true;resolve('late');};}),during:async()=>{throw first;}});
 await assert.rejects(runMeasuredBarrier(f.options),e=>e===first);
 assert.equal(physicallySettled,false);assert.equal(f.calls.filter(c=>c==='release').length,1);
 settle();await Promise.resolve();assert.equal(physicallySettled,true);
});

test('failure labels retain only finite classification, never message or stack',()=>{
 for(const code of ['42501','P2305','RESOURCE_LIMIT'])assert.equal(sanitizeFailure({code,message:'synthetic unretained detail'}),code);
 for(const code of ['','lowercase','SECRET value','x'.repeat(100),'A\nB'])assert.equal(sanitizeFailure({code,message:'unretained'}),'CHECK_FAILED');
 assert.equal(sanitizeFailure(new assert.AssertionError({message:'unretained assertion'})),'ASSERTION');
 assert.equal(sanitizeFailure(new Error('unretained failure')),'CHECK_FAILED');
 assert.equal(sanitizeFailure(null),'CHECK_FAILED');
});

test('unknown uppercase failure labels are not a channel for arbitrary error text',()=>{
 for(const code of ['A'.repeat(32),'UNREVIEWED_SECRET_LABEL','ERR_ASSERTION','NOT_A_LOCAL_LABEL'])
  assert.equal(sanitizeFailure({code}),'CHECK_FAILED');
 for(const code of ['P2305','42501','08P01','DATABASE_NAME','RESOURCE_LIMIT'])
  assert.equal(sanitizeFailure({code}),code);
 for(const code of ['p2305','P23050','P 305','A\nB00'])assert.equal(sanitizeFailure({code}),'CHECK_FAILED');
});

test('failure code getters do not run and assertions are classified before code inspection',()=>{
 let getters=0;
 const error={};Object.defineProperty(error,'code',{get(){getters++;throw new Error('Must not inspect getter');}});
 assert.equal(sanitizeFailure(error),'CHECK_FAILED');
 const inherited=Object.create({code:'P2305'});assert.equal(sanitizeFailure(inherited),'CHECK_FAILED');
 const assertion=new assert.AssertionError({message:'unretained assertion'});
 Object.defineProperty(assertion,'code',{get(){getters++;throw new Error('Assertion classification must come first');}});
 assert.equal(sanitizeFailure(assertion),'ASSERTION');assert.equal(getters,0);
});

test('invented adapter forwards local query and exec without owning client shutdown',async()=>{
 const client=inventedClient(),adapter=explicitAdapter(client),parameters=['synthetic'];
 assert.equal(adapter.dialect,'pg');assert.deepEqual(await adapter.query('SELECT $1',parameters),{rows:[{invented:true}]});
 await adapter.exec('SELECT 2');assert.deepEqual(sqls(client),['SELECT $1','SELECT 2']);
 assert.equal(client.calls[0].parameters,parameters);assert.equal(client.ended,0);
});

test('invented successful transaction checks isolation and sends separate literal COMMIT',async()=>{
 const client=inventedClient(),adapter=explicitAdapter(client),value={local:'result'};
 const returned=await adapter.transaction(async tx=>{assert.equal(tx.dialect,'pg');await tx.query('SELECT $1',[1]);await tx.exec('SELECT 2');return value;});
 assert.equal(returned,value);
 assert.deepEqual(sqls(client),['BEGIN','SHOW transaction_isolation','SELECT $1','SELECT 2','COMMIT']);
 assert.equal(client.calls.at(-1).parameters,undefined);assert.equal(client.ended,0);
});

test('invented callback rejection rolls back and preserves exact original failure',async()=>{
 const client=inventedClient(),failure=new Error('invented callback failure');
 await assert.rejects(explicitAdapter(client).transaction(async tx=>{await tx.query('SELECT 1');throw failure;}),e=>e===failure);
 assert.deepEqual(sqls(client),['BEGIN','SHOW transaction_isolation','SELECT 1','ROLLBACK']);assert.equal(client.ended,0);
});

test('invented wrong isolation denies callback and rolls back before mutation',async()=>{
 const client=inventedClient({isolation:'repeatable read'});let callbacks=0;
 await assert.rejects(explicitAdapter(client).transaction(async()=>{callbacks++;}));
 assert.equal(callbacks,0);assert.deepEqual(sqls(client),['BEGIN','SHOW transaction_isolation','ROLLBACK']);
});

test('invented COMMIT failure is not an accepted result and triggers rollback',async()=>{
 const failure=Object.assign(new Error('invented commit rejection'),{code:'P2306'}),client=inventedClient({failAt:{sql:'COMMIT',error:failure}});
 await assert.rejects(explicitAdapter(client).transaction(async()=>({unaccepted:'value'})),e=>e===failure);
 assert.deepEqual(sqls(client),['BEGIN','SHOW transaction_isolation','COMMIT','ROLLBACK']);assert.equal(client.ended,0);
});

test('invented rollback failure does not mask the command failure',async()=>{
 const original=new Error('invented command failure'),client=inventedClient({rollbackError:new Error('invented rollback failure')});
 await assert.rejects(explicitAdapter(client).transaction(async()=>{throw original;}),e=>e===original);
 assert.deepEqual(sqls(client),['BEGIN','SHOW transaction_isolation','ROLLBACK']);
});

test('invented BEGIN failure never enters callback or commits',async()=>{
 const original=new Error('invented begin failure'),client=inventedClient({failAt:{sql:'BEGIN',error:original}});let callbacks=0;
 await assert.rejects(explicitAdapter(client).transaction(async()=>{callbacks++;}),e=>e===original);
 assert.equal(callbacks,0);assert.deepEqual(sqls(client),['BEGIN']);assert.equal(client.ended,0);
});

const fixedRequest=changes=>({role:'murmingle_app',database:SCRATCH_DATABASE,applicationName:'murmingle-adr167-scoped-native',statementTimeoutMs:5000,lockTimeoutMs:3000,...changes});
function virtualTimers(){
 let next=0;const active=new Map(),scheduled=[];
 return {active,scheduled,setTimeout(fn,ms){const id=++next;active.set(id,{fn,ms});scheduled.push(ms);return id;},clearTimeout(id){active.delete(id);},
  fire(ms){const found=[...active].find(([,job])=>job.ms===ms);assert.ok(found,'expected bounded virtual timer');active.delete(found[0]);found[1].fn();}
 };
}
async function microtasks(){for(let i=0;i<12;i++)await Promise.resolve();}
function establishmentDeps({connect=async()=>{},query=async()=>{},end=async()=>{}}={}){
 const calls=[],configs=[],timers=virtualTimers();let providers=0;
 const client={async connect(){calls.push('connect');return connect();},async query(sql){calls.push(sql);return query(sql);},async end(){calls.push('end');return end();}};
 return {client,calls,configs,timers,get providers(){return providers;},
  createClient(config){configs.push(config);return client;},passwordProvider(role){providers++;assert.equal(role,'murmingle_app');return ()=>{throw new Error('Invented password callback must never run');};}
 };
}
function fixedErrorOnly(error,code,cleanup){
 assert.equal(error.code,code);assert.equal(error.cleanup,cleanup);assert.equal(Object.hasOwn(error,'cause'),false);
 assert.equal(error.message,'Fixed native client establishment refused or failed');assert.doesNotMatch(JSON.stringify(error),/PRIVATE_FIXTURE_DETAIL/u);return true;
}

test('invented fixed-client connect rejection closes exactly once and replaces original failure',async()=>{
 const original=new Error('PRIVATE_FIXTURE_DETAIL'),deps=establishmentDeps({connect:async()=>{throw original;}});
 await assert.rejects(establishFixedClient(fixedRequest(),deps),e=>{assert.notEqual(e,original);return fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','closed');});
 assert.deepEqual(deps.calls,['connect','end']);assert.equal(deps.configs.length,1);assert.equal(deps.providers,1);assert.equal(deps.timers.active.size,0);
});

test('invented fixed-client READ COMMITTED setup rejection closes before reporting failure',async()=>{
 const deps=establishmentDeps({query:async()=>{throw new Error('PRIVATE_FIXTURE_DETAIL');}});
 await assert.rejects(establishFixedClient(fixedRequest(),deps),e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','closed'));
 assert.deepEqual(deps.calls,['connect','SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED','end']);
 assert.deepEqual(deps.timers.scheduled,[5000,15000]);assert.equal(deps.timers.active.size,0);
});

test('invented fixed-client success hands off unchanged client with fixed endpoint and no close',async()=>{
 const deps=establishmentDeps(),returned=await establishFixedClient(fixedRequest(),deps);
 assert.equal(returned,deps.client);assert.deepEqual(deps.calls,['connect','SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED']);
 assert.equal(deps.configs.length,1);const config=deps.configs[0];
 assert.deepEqual({...config,password:'opaque invented callback'},{host:'127.0.0.1',port:55433,database:SCRATCH_DATABASE,user:'murmingle_app',password:'opaque invented callback',ssl:false,connectionTimeoutMillis:5000,application_name:'murmingle-adr167-scoped-native',options:'-c statement_timeout=5000 -c lock_timeout=3000'});
 assert.equal(typeof config.password,'function');assert.equal(deps.providers,1);assert.deepEqual(deps.timers.scheduled,[5000]);assert.equal(deps.timers.active.size,0);
 assert.deepEqual(FIXED_CLIENT_LIMITS,{establishmentMs:5000,closeMs:15000});assert.ok(Object.isFrozen(FIXED_CLIENT_LIMITS));
});

test('invented fixed-client failed close is not retried or confused with successful cleanup',async()=>{
 const deps=establishmentDeps({connect:async()=>{throw new Error('PRIVATE_FIXTURE_DETAIL');},end:async()=>{throw new Error('PRIVATE_FIXTURE_DETAIL');}});
 await assert.rejects(establishFixedClient(fixedRequest(),deps),e=>fixedErrorOnly(e,'FIXED_CLIENT_CLOSE','unsettled-or-failed'));
 assert.deepEqual(deps.calls,['connect','end']);assert.equal(deps.timers.active.size,0);
});

test('invented fixed-client unsettled close is awaited only to the fixed virtual cleanup deadline',async()=>{
 const deps=establishmentDeps({connect:async()=>{throw new Error('PRIVATE_FIXTURE_DETAIL');},end:()=>new Promise(()=>{})});
 let settled=false;const pending=establishFixedClient(fixedRequest(),deps);pending.then(()=>{settled=true;},()=>{settled=true;});
 await microtasks();assert.deepEqual(deps.calls,['connect','end']);assert.equal(settled,false);
 deps.timers.fire(15000);await assert.rejects(pending,e=>fixedErrorOnly(e,'FIXED_CLIENT_CLOSE','unsettled-or-failed'));
 assert.equal(settled,true);assert.equal(deps.calls.filter(x=>x==='end').length,1);assert.equal(deps.timers.active.size,0);
});

test('invented fixed-client establishment timeout closes once and never starts late setup',async()=>{
 let releaseConnect;const deps=establishmentDeps({connect:()=>new Promise(resolve=>{releaseConnect=resolve;})});
 const pending=establishFixedClient(fixedRequest(),deps);await microtasks();assert.deepEqual(deps.calls,['connect']);
 deps.timers.fire(5000);await assert.rejects(pending,e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','closed'));
 releaseConnect();await microtasks();assert.deepEqual(deps.calls,['connect','end']);assert.equal(deps.timers.active.size,0);
});

test('invented fixed-client stalled setup shares the same five-second establishment bound',async()=>{
 let releaseSetup;const deps=establishmentDeps({query:()=>new Promise(resolve=>{releaseSetup=resolve;})});
 const pending=establishFixedClient(fixedRequest(),deps);await microtasks();
 assert.deepEqual(deps.calls,['connect','SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED']);
 deps.timers.fire(5000);await assert.rejects(pending,e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','closed'));
 releaseSetup();await microtasks();assert.equal(deps.calls.filter(x=>x==='end').length,1);assert.deepEqual(deps.timers.scheduled,[5000,15000]);assert.equal(deps.timers.active.size,0);
});

test('invented fixed-client invalid scope rejects before client or password-factory creation',async()=>{
 const deps=establishmentDeps();let getters=0;
 const accessor=fixedRequest();Object.defineProperty(accessor,'role',{enumerable:true,get(){getters++;throw new Error('Must not read accessor');}});
 const unknown={...fixedRequest(),host:'elsewhere'};
 const proxy=new Proxy(fixedRequest(),{get(){getters++;throw new Error('Must not inspect proxy');}});
 for(const request of [null,undefined,{},unknown,accessor,proxy,fixedRequest({role:'murmingle_owner'}),fixedRequest({database:'postgres'}),fixedRequest({database:'owner_database'}),fixedRequest({applicationName:'unreviewed'}),fixedRequest({statementTimeoutMs:5001}),fixedRequest({lockTimeoutMs:3001})])
  await assert.rejects(establishFixedClient(request,deps),e=>e.code==='FIXED_CLIENT_REQUEST');
 assert.equal(getters,0);assert.equal(deps.configs.length,0);assert.equal(deps.providers,0);assert.deepEqual(deps.calls,[]);assert.deepEqual(deps.timers.scheduled,[]);
});

test('invented password-factory rejection is sanitized and creates no client',async()=>{
 const deps=establishmentDeps();deps.passwordProvider=()=>{throw new Error('PRIVATE_FIXTURE_DETAIL');};
 await assert.rejects(establishFixedClient(fixedRequest(),deps),e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','not-created'));
 assert.equal(deps.configs.length,0);assert.deepEqual(deps.calls,[]);
});

test('invented fixed-client cleanup waits for end fulfillment before rejecting establishment',async()=>{
 let releaseEnd;const deps=establishmentDeps({query:async()=>{throw new Error('PRIVATE_FIXTURE_DETAIL');},end:()=>new Promise(resolve=>{releaseEnd=resolve;})});
 let settled=false;const pending=establishFixedClient(fixedRequest(),deps);pending.then(()=>{settled=true;},()=>{settled=true;});
 await microtasks();assert.equal(settled,false);assert.equal(deps.calls.at(-1),'end');releaseEnd();
 await assert.rejects(pending,e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','closed'));assert.equal(settled,true);assert.equal(deps.calls.filter(x=>x==='end').length,1);assert.equal(deps.timers.active.size,0);
});

test('fixed-client epoch guard rejects before any factory when work is no longer admitted',async()=>{
 const deps=establishmentDeps();let guards=0;
 await assert.rejects(establishFixedClient(fixedRequest(),{...deps,beforeDispatch(){guards++;throw new Error('PRIVATE_FIXTURE_DETAIL');}}),e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','not-created'));
 assert.equal(guards,1);assert.equal(deps.providers,0);assert.equal(deps.configs.length,0);assert.deepEqual(deps.calls,[]);
});

test('fixed-client epoch is checked again immediately before connection dispatch',async()=>{
 const deps=establishmentDeps();let guards=0;
 await assert.rejects(establishFixedClient(fixedRequest(),{...deps,beforeDispatch(){if(++guards===2)throw new Error('PRIVATE_FIXTURE_DETAIL');}}),e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','closed'));
 assert.equal(guards,2);assert.deepEqual(deps.calls,['end']);assert.equal(deps.configs.length,1);
});

test('fixed-client delayed connection cannot issue setup SQL after the enclosing epoch is poisoned',async()=>{
 let release,admitted=true,guards=0;const deps=establishmentDeps({connect:()=>new Promise(resolve=>{release=resolve;})});
 const pending=establishFixedClient(fixedRequest(),{...deps,beforeDispatch(){guards++;if(!admitted)throw new Error('PRIVATE_FIXTURE_DETAIL');}});
 await microtasks();assert.deepEqual(deps.calls,['connect']);admitted=false;release();
 await assert.rejects(pending,e=>fixedErrorOnly(e,'FIXED_CLIENT_ESTABLISH','closed'));
 assert.equal(guards,3);assert.deepEqual(deps.calls,['connect','end']);assert.equal(deps.timers.active.size,0);
});

// These exercise the ACTUAL Run facade and cleanup with virtual clocks, the
// real cooperative controller and invented sockets. No inventory/DB/provider IO.
const held=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function ownedCleanupFixture({controllerQuery,workerQuery}={}){
 let time=0,next=0,dropped=false;const timers=new Map(),calls=[],sockets=new Map();
 const control=createRunControl({epoch:0,now:()=>time,usage:()=>({rss:1,cpuUs:0}),onFault:()=>{},
  schedule(fn,ms){const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const controller={key:'controller',role:'postgres',database:'postgres',pid:101,backendStart:'2026-10-20 12:00:00+00',applicationName:'murmingle-adr167-scoped-native',closed:false};
 const worker={key:'worker',role:'murmingle_app',database:SCRATCH_DATABASE,pid:102,backendStart:'2026-10-20 12:00:01+00',applicationName:'murmingle-adr167-scoped-native',closed:false};
 const r={started:performance.now(),maintenance:{entry:controller},admin:{entry:worker},owner:{entry:worker},clients:[controller,worker],pending:new Map(),barriers:new Set(),restores:[],created:true,createAttempted:true,identity:{oid:'12345'},
  report:{status:'passed',cases:[{name:'invented',status:'passed'}],cleanup:{status:'not-created'}}};
 const defaultController=sql=>{
  if(sql.startsWith('SELECT d.oid'))return {rows:[{oid:'12345',owner:'murmingle_owner',sessions:0}]};
  if(sql.startsWith('DROP DATABASE')){dropped=true;return {rows:[]};}
  if(sql.startsWith('SELECT 1 FROM pg_database'))return {rows:dropped?[]:[{}]};
  return {rows:[]};
 };
 for(const [entry,override]of [[controller,controllerQuery],[worker,workerQuery]]){
  const raw={query(sql,args){calls.push({key:entry.key,sql,args});return override?.(sql,args,defaultController)??(entry===controller?defaultController(sql):{rows:[]});},end(){calls.push({key:entry.key,sql:'END-SOCKET'});return Promise.resolve();}};
  sockets.set(entry,raw);entry.client=createWorkQueryFacade({work:control.work,key:entry.key,raw,pending:r.pending,entry,canDispatch:()=>true});
 }
 return {...control,r,calls,controller,worker,sockets,rawOf:entry=>sockets.get(entry),
  async bootstrap(){await control.admin.establish('controller',()=>{});control.admin.registerController('controller');await control.admin.establish('worker',()=>{});},
  async advance(value){time=value;for(const [id,t]of [...timers])if(t.at<=time&&timers.delete(id))t.fn();await microtasks();}};
}

test('actual Run query facade exposes no raw/admin authority and rejects missing or retired work lanes',async()=>{
 const f=ownedCleanupFixture();assert.ok(Object.isFrozen(f.worker.client));assert.equal(f.worker.client.raw,undefined);assert.equal(f.worker.client.end,undefined);
 assert.throws(()=>f.worker.client.query('invented'),e=>e.code==='CONTROL_LANE');
 await f.work.run(async()=>{await f.bootstrap();await f.worker.client.query('invented');});
 assert.throws(()=>f.worker.client.query('late'),e=>e.code==='CONTROL_LANE');assert.deepEqual(f.calls.map(c=>c.sql),['invented']);f.admin.close();
});

test('actual Run facade can reserve the maintenance controller against all ordinary case SQL',async()=>{
 const f=ownedCleanupFixture();let provisioning=true;
 const facade=createWorkQueryFacade({work:f.work,key:'controller',raw:f.sockets.get(f.controller),pending:f.r.pending,entry:f.controller,canDispatch:()=>provisioning});
 await f.work.run(async()=>{await f.bootstrap();await facade.query('provisioning-only');provisioning=false;
  assert.throws(()=>facade.query('forbidden-case'),e=>e.code==='CLIENT_SCOPE');});
 assert.deepEqual(f.calls.map(c=>c.sql),['provisioning-only']);assert.equal(f.admin.snapshot().controllerBusy,false);f.admin.close();
});

test('actual Run facade keeps physical query pending after observation timeout and denies cleanup borrowing',async()=>{
 const physical=held(),f=ownedCleanupFixture({workerQuery:()=>physical.promise});let observed;
 const original=f.work.run(async()=>{await f.bootstrap();observed=f.worker.client.query('slow');await observed;});original.catch(()=>{});
 await microtasks();await f.advance(5000);await assert.rejects(original);assert.equal(f.r.pending.size,1);assert.equal(f.admin.snapshot().pendingPhysical,1);
 await f.admin.cleanup(()=>{assert.throws(()=>f.worker.client.query('borrow-cleanup'),e=>e.code==='CONTROL_LANE');});
 physical.reject(new Error('invented late raw error'));await f.admin.join();assert.equal(f.r.pending.size,0);assert.equal(f.admin.snapshot().pendingPhysical,0);
 assert.deepEqual(f.calls.map(c=>c.sql),['slow']);f.admin.close();
});

test('actual root cleanup rolls back before unlock and restore, closes own sockets, then verifies exact DROP',async()=>{
 const saved='SELECT invented_restore_only',f=ownedCleanupFixture({workerQuery(sql){if(sql.startsWith('SELECT pg_advisory_unlock'))return {rows:[{unlocked:true}]};if(sql.startsWith('SELECT pg_get_functiondef'))return {rows:[{body:saved}]};}});
 await f.work.run(()=>f.bootstrap());f.r.barriers.add(1);f.r.restores.push({signature:'invented_signature()',old:saved});
 await cleanupOwnedNativeRun(f.r,f.admin,Promise.resolve(),f.rawOf);
 assert.equal(f.r.report.cleanup.status,'dropped');assert.equal(f.r.report.closedClients,2);assert.equal(f.admin.snapshot().dropFinished,true);
 const actions=f.calls.map(c=>c.sql);assert.equal(actions[0],'ROLLBACK');assert.ok(actions[1].startsWith('SELECT pg_advisory_unlock'));assert.equal(actions[2],saved);assert.ok(actions[3].startsWith('SELECT pg_get_functiondef'));
 assert.ok(actions.indexOf('END-SOCKET')<actions.findIndex(s=>s.startsWith('DROP DATABASE')));assert.equal(actions.at(-1),'END-SOCKET');assert.equal(f.r.restores.length,0);assert.equal(f.r.barriers.size,0);f.admin.close();
});

test('actual root cleanup waits for physical server settlement and original continuation without dispatching cancel SQL',async()=>{
 const physical=held(),finished=held();let late;
 const f=ownedCleanupFixture({workerQuery(sql){if(sql==='slow')return physical.promise;}});
 const original=f.work.run(async()=>{try{await f.bootstrap();await f.worker.client.query('slow');}catch{try{await f.worker.client.query('late-after-cancel');}catch(e){late=e.code;}}finally{finished.resolve();}});
 await microtasks();f.admin.fault();f.r.report.status='failed';const cleanup=cleanupOwnedNativeRun(f.r,f.admin,finished.promise,f.rawOf);await microtasks();
 assert.deepEqual(f.calls.map(c=>c.sql),['slow']);assert.equal(f.r.pending.size,1);
 physical.reject(new Error('invented server timeout settlement'));await cleanup;await original;
 assert.equal(late,'CONTROL_LANE');assert.equal(f.r.report.cleanup.status,'dropped');assert.ok(!f.calls.some(c=>c.sql==='late-after-cancel'||c.sql.includes('pg_cancel_backend')));f.admin.close();
});

test('actual cleanup does not DROP while an original work continuation remains unsettled',async()=>{
 const resume=held(),finished=held(),f=ownedCleanupFixture();let late;
 const original=f.work.run(async()=>{try{await f.bootstrap();await resume.promise;try{await f.worker.client.query('late');}catch(e){late=e.code;}}finally{finished.resolve();}});original.catch(()=>{});
 await microtasks();f.admin.fault();const cleanup=cleanupOwnedNativeRun(f.r,f.admin,finished.promise,f.rawOf);await microtasks();
 await f.advance(15000);await cleanup;assert.equal(f.r.report.cleanup.status,'unknown');assert.equal(f.admin.snapshot().pendingTasks,2);assert.ok(!f.calls.some(c=>c.sql.startsWith('DROP DATABASE')));
 resume.resolve();await original;await microtasks();assert.equal(late,'CONTROL_LANE');assert.ok(!f.calls.some(c=>c.sql==='late'));assert.ok(!f.calls.some(c=>c.sql.startsWith('DROP DATABASE')));f.admin.close();
});

test('actual cleanup waits for tracked physical establishment before any socket close and preserves acquisition uncertainty',async()=>{
 const physical=held(),finished=held(),f=ownedCleanupFixture();f.r.establishments=new Set([physical.promise]);
 const remove=()=>f.r.establishments.delete(physical.promise);physical.promise.then(remove,remove);
 const original=f.work.run(async()=>{try{await f.admin.establish('controller',()=>{});f.admin.registerController('controller');await f.admin.establish('worker',()=>physical.promise);}finally{finished.resolve();}});original.catch(()=>{});
 await microtasks();f.admin.fault();const cleanup=cleanupOwnedNativeRun(f.r,f.admin,finished.promise,f.rawOf);await microtasks();
 assert.equal(f.r.establishments.size,1);assert.equal(f.calls.length,0);
 physical.reject(new Error('invented setup rejection'));await cleanup;await assert.rejects(original);
 assert.equal(f.admin.snapshot().acquisitionUncertain,true);assert.equal(f.r.report.cleanup.status,'unknown');
 assert.ok(!f.calls.some(c=>c.sql.includes('pg_cancel_backend')||c.sql.startsWith('DROP DATABASE')));assert.equal(f.calls.filter(c=>c.sql==='END-SOCKET').length,2);f.admin.close();
});

test('actual cleanup cannot equate configured server timeout with physical query settlement',async()=>{
 const physical=held(),finished=held(),f=ownedCleanupFixture({workerQuery(sql){if(sql==='slow')return physical.promise;}});
 const original=f.work.run(async()=>{try{await f.bootstrap();await f.worker.client.query('slow');}finally{finished.resolve();}});original.catch(()=>{});
 await microtasks();f.admin.fault();const cleanup=cleanupOwnedNativeRun(f.r,f.admin,finished.promise,f.rawOf);await microtasks();
 await f.advance(15000);await cleanup;assert.equal(f.r.report.cleanup.status,'unknown');assert.equal(f.admin.snapshot().pendingPhysical,1);assert.equal(f.r.pending.size,1);
 assert.ok(!f.calls.some(c=>c.key==='worker'&&c.sql!=='slow'));assert.ok(!f.calls.some(c=>c.sql.includes('pg_cancel_backend')||c.sql.startsWith('DROP DATABASE')));
 physical.reject(new Error('invented much later server result'));await assert.rejects(original);await microtasks();
 assert.equal(f.r.report.cleanup.status,'unknown');assert.ok(!f.calls.some(c=>c.sql.startsWith('DROP DATABASE')));f.admin.close();
});

test('actual cleanup refuses changed creation OID without issuing DROP',async()=>{
 const f=ownedCleanupFixture({controllerQuery(sql){if(sql.startsWith('SELECT d.oid'))return {rows:[{oid:'different',owner:'murmingle_owner',sessions:0}]};}});
 await f.work.run(()=>f.bootstrap());await cleanupOwnedNativeRun(f.r,f.admin,Promise.resolve(),f.rawOf);
 assert.equal(f.r.report.status,'failed');assert.ok(!f.calls.some(c=>c.sql.startsWith('DROP DATABASE')));f.admin.close();
});

test('actual cleanup reports a timed-out DROP as unknown and never upgrades late server success',async()=>{
 const drop=held(),f=ownedCleanupFixture({controllerQuery(sql){if(sql.startsWith('DROP DATABASE'))return drop.promise;}});
 await f.work.run(()=>f.bootstrap());const cleanup=cleanupOwnedNativeRun(f.r,f.admin,Promise.resolve(),f.rawOf);await microtasks();
 assert.ok(f.calls.some(c=>c.sql.startsWith('DROP DATABASE')));await f.advance(5000);await cleanup;
 assert.equal(f.r.report.cleanup.status,'unknown');assert.equal(f.admin.snapshot().dropUncertain,true);assert.equal(f.admin.snapshot().dropFinished,false);
 drop.resolve({rows:[]});await microtasks();assert.equal(f.r.report.cleanup.status,'unknown');assert.equal(f.admin.snapshot().dropFinished,false);
 assert.ok(!f.calls.some(c=>c.sql.startsWith('SELECT 1 FROM pg_database')));f.admin.close();
});

test('actual erasure replay planner retains operation/material and prior proof while renewing only revision/allocation/time',()=>{
 for(const n of [12,15]){
  const data=Array.from({length:n},(_,i)=>'old-'+i);data[0]='generation';data[1]=2;data[2]='retired-op';
  const before=[...data],job={generation:'generation',data},plan=erasedReplayPlan(job,{generation:'generation',revision:9},'forget-admission');
  assert.equal(plan.mode,n===12?'admission':'update');assert.deepEqual(plan.old,before);assert.deepEqual(data,before);assert.equal(plan.fresh[1],9);
  for(const i of [0,2,3,8,9,10,11,...(n===15?[12,13,14]:[])])assert.equal(plan.fresh[i],before[i]);
  assert.equal(plan.fresh[4],'erased-source-forget-admission');assert.equal(plan.fresh[5],'erased-topic-forget-admission');assert.equal(plan.fresh[6],'erased-discussion-forget-admission');assert.notEqual(plan.fresh[7],before[7]);assert.deepEqual(plan.unusedIds,plan.fresh.slice(4,7));assert.ok(Object.isFrozen(plan.fresh));
 }
 assert.throws(()=>erasedReplayPlan({generation:'g',data:Array(12).fill('x')},{generation:'other',revision:1},'valid'));
});

function committedTupleFixture(){
 const digest=x=>createHash('sha256').update(x).digest('hex'),body=Buffer.from('invented-body-wire'),title=Buffer.from('invented-title-wire');
 const material={url:'https://example.org/invented',title:'Invented title',extractorVersion:'main-text-prefix/v1',modelId:'invented-model',bodyHash:'a'.repeat(64),bodyWireHash:digest(body),titleWireHash:digest(title)};
 const data=['generation',1,'operation',JSON.stringify(material),'source','topic','discussion','created','stamp','body-array','title-array','node'];
 const receipt={sourceId:'source',sourceVersion:'1',topicId:'topic',discussionId:'discussion',inputHash:digest(data[3]),witnessHash:'b'.repeat(64),decisionHash:'c'.repeat(64)};
 const job={generation:'generation',operationId:'operation',data};
 const row={id:'source',url:material.url,title:material.title,extractor_version:material.extractorVersion,operation_id:'operation',source_version:'1',payload:{title:material.title,url:material.url,operationId:'operation',topicIds:['topic']},model_id:material.modelId,body_wire:body.toString('hex'),stamp:'stamp',topic_id:'topic',discussion_id:'discussion',linked_topic:'topic',canonical_operation:'operation',operation_digest:'d'.repeat(64),expected_digest:'d'.repeat(64),state:'complete',receipt:structuredClone(receipt)};
 const versions=[{source_version:'1',material:data[3],input_hash:receipt.inputHash,witness_hash:receipt.witnessHash,body_wire_hash:material.bodyWireHash,title_wire_hash:material.titleWireHash,source_stamp:'stamp',body_wire:body.toString('hex'),title_wire:title.toString('hex'),current_version:'1',decision_hash:receipt.decisionHash}];
 const queries=[],r={admin:{async query(sql,args){queries.push({sql,args});return {rows:sql.includes('SELECT s.id')?[row]:versions};}}};
 return {r,row,versions,queries,job,receipt,history:[data]};
}

test('actual held-state collector asserts committed canonical/input/history/receipt mirrors using bounded owner reads',async()=>{
 const f=committedTupleFixture();const result=await committedScopedTuple(f.r,f.job,f.receipt,f.history);
 assert.deepEqual(result,{sourceId:'source',sourceVersion:'1',topicId:'topic',discussionId:'discussion',historyVersions:1});
 assert.equal(f.queries.length,2);assert.deepEqual(f.queries[0].args,['source','generation','operation']);assert.deepEqual(f.queries[1].args,['source']);assert.ok(f.queries.every(q=>q.sql.startsWith('SELECT ')));
});

test('actual held-state collector refuses receipt-only success when a committed mirror or immutable history disagrees',async()=>{
 const mutations=[f=>f.row.id='other',f=>f.row.title='other',f=>f.row.url='other',f=>f.row.model_id='other',f=>f.row.source_version='2',f=>f.row.operation_id='other',f=>f.row.canonical_operation='other',f=>f.row.operation_digest='e'.repeat(64),f=>f.row.stamp='other',f=>f.row.topic_id='other',f=>f.row.discussion_id='other',f=>f.row.linked_topic='other',f=>f.row.state='leased',f=>f.row.receipt.sourceId='other',f=>f.row.payload.title='other',f=>f.row.payload.topicIds=['other'],f=>f.row.body_wire='00',f=>f.versions[0].material='{}',f=>f.versions[0].witness_hash='other',f=>f.versions[0].decision_hash='other',f=>f.versions[0].title_wire='00',f=>f.versions.length=0];
 for(const mutate of mutations){const f=committedTupleFixture();mutate(f);await assert.rejects(committedScopedTuple(f.r,f.job,f.receipt,f.history));}
});
