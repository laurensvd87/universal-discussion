// ADR167 SOURCE ONLY. Inert import; only a reviewed root driver supplies clients.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,lstat,readdir,realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname,resolve,relative,extname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { seedCanonicalV4RuntimeFixture } from '../../../test/canonical-v4-runtime-fixture.js';
import { createCanonicalV4RuntimeRepository } from '../../runtime-repository.js';
import { createCanonicalV4IngestionRepository } from '../../ingestion-repository.js';
import { createCanonicalV4LifecycleRepository } from '../../lifecycle-repository.js';
import { prepareFastAdmission,pairedVectorWire,createFastRoot,reclassifyFastSource } from '../hierarchy-scoped-ingestion-v1/repository.js';
import { createRunControl } from '../hierarchy-scoped-native-v1/run-control.js';

export const SCRATCH_DATABASE='murmingle_adr167_scoped_test_20261020';
export const DRIVER_RELATIVE='apps/local-service/data/adr175-scoped-native-check-20261020.mjs';
// ADR175 source accepted by root and Trust; an authenticated fresh seal and
// separate frozen-audit/native decision are still required before connections.
export const SOURCE_STATUS='accepted-for-native-proof';
export const LIMITS=Object.freeze({clients:8,statementMs:5000,lockMs:3000,barrierMs:2000,admitMs:165000,wallMs:180000,cleanupMs:15000,rss:512*1024**2,cpuUs:30e6,resultBytes:256*1024,cases:64,files:2048,sourceBytes:64*1024**2});
const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../../../../../..');
const NS='hierarchy_scoped_ingestion_v1',LEGACY='hierarchy_scoped_legacy_v1',OWNER='murmingle_owner';
const APP='murmingle_app',CRAWLER='murmingle_crawler_submitter',WORKER='murmingle_ingest_worker';
const ROLES=Object.freeze(['postgres',APP,CRAWLER,WORKER]);
const seals=new WeakMap(),sealEpochs=new WeakMap(),usedSeals=new WeakSet(),rawClients=new WeakMap();
const sha=v=>createHash('sha256').update(v).digest('hex'),hash=n=>String(n).repeat(64);
const UNIT=Object.freeze([1,-0,...Array(382).fill(0)]),MODEL='e5-small-q8-browser-main-prefix-v1';
const RIDGE='593a52ba9a5495a49ef00f4dae38770684389632f961b60ec07067fd8784b3e4';
const ACTOR='account-11111111-1111-4111-8111-111111111111',OTHER='account-22222222-2222-4222-8222-222222222222';
const STAMP='2026-10-20T12:00:00.000Z';
const MIGRATIONS=['001-canonical-v4.sql','002-runtime-core.sql','003-execute-only-command-boundary.sql','004-ingestion-foundation.sql','005-ingestion-apply-and-lifecycle.sql','006-lifecycle-command-boundary.sql','007-exact-ridge-scan-single-pass.sql','008-independent-new-ingestion-admission.sql','009-fail-fast-new-ingestion-locks.sql'];
const SQL_PATHS=['apps/local-service/portable/canonical-v4/bootstrap/001-admin.sql',...MIGRATIONS.map(x=>'apps/local-service/portable/canonical-v4/migrations/'+x),...['schema.sql','boundary.sql'].map(x=>'apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-ingestion-v1/'+x)];
const OWNED_PATH='apps/local-service/portable/integration/scoped-native-isolated-v3/';
const ENTRY_PATHS=[DRIVER_RELATIVE,'apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v3/check.js',OWNED_PATH+'cluster.js'];
const ACCEPTED_INPUT_FILES=Object.freeze({
 'schema.sql':'a61a461de983da40a317a4217c6c7fe543c28fc1f70261083ca35b8c2e02bc61',
 'boundary.sql':'17bcc8ec649264d9b1090f34d400e50e9a1643e96d31c04ccdd1ad75af9aa5e7',
 'repository.js':'3d0b3bb8b8b293b567ae79f16a2b82ac3d378678578f92d5f8c2ab87458593cf',
 'test.js':'7ef4bac0be29b0ed16f8f4eace17aaaea5b37be3637f6d114834cc21b750bf46',
 'README.md':'7cedf358a23044608fc32022465c93f2e4a7c0283a1901f98abdec859693391f',
});
const fail=code=>{throw Object.assign(new Error('Bounded synthetic native check failed'),{code});};
const FAILURE_LABELS=new Set(['RESOURCE_LIMIT','DATABASE_NAME','INSTRUMENT_MARKER','RESULT_CAPACITY','SOURCE_PATH','SOURCE_FILE','SOURCE_LINK','SOURCE_COUNT','SOURCE_BYTES','PACKAGE_DEPTH','PACKAGE_LINK','DEPENDENCY_MISSING','PACKAGE_ROOT','INVENTORY_REPORT_CAPACITY','SOURCE_SEAL','SOURCE_DRIFT','SQL_NOT_CAPTURED','SQL_LITERAL','CLIENT_SCOPE','CLIENT_CONTRACT','CLIENT_BUSY','FRESH_IDENTITY','BARRIER_NOT_OBSERVED','BARRIER_EXPIRED','CASE_IDENTITY','RUN_CONTRACT','HEAP_LIMIT','NEGATIVE_PROBE','EXPIRY_NOT_OBSERVED','RUN_INCOMPLETE','RELEASE_TIMEOUT','CANCEL_TIMEOUT','QUERY_SETTLEMENT','RESTORE_TIMEOUT','CLIENTS_CLOSE','CLIENT_CLOSE','CLEANUP_IDENTITY','DROP_TIMEOUT','CREATION_OUTCOME_UNCERTAIN','MAINTENANCE_CLOSE','OWN_CLIENTS_UNSETTLED']);
export function sanitizeFailure(e){if(e instanceof assert.AssertionError)return 'ASSERTION';const d=e&&Object.getOwnPropertyDescriptor(e,'code');const code=d&&Object.hasOwn(d,'value')?d.value:null;return typeof code==='string'&&(/^[A-Z0-9]{5}$/u.test(code)||FAILURE_LABELS.has(code))?code:'CHECK_FAILED';}
export function exactIdentifier(name){if(name!==SCRATCH_DATABASE)fail('DATABASE_NAME');return '"'+SCRATCH_DATABASE+'"';}
export function replaceUnique(body,marker,addition){if(typeof body!=='string'||typeof marker!=='string'||!marker||body.split(marker).length!==2)fail('INSTRUMENT_MARKER');return body.replace(marker,()=>addition+marker);}
export function checkedReport(value){const encoded=JSON.stringify(value);if(Buffer.byteLength(encoded)>LIMITS.resultBytes)fail('RESULT_CAPACITY');return JSON.parse(encoded);}
export function assertBudget({elapsedMs,rss,cpuUs,cases},admitting=true){if(![elapsedMs,rss,cpuUs,cases].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||!Number.isInteger(cases)||rss>LIMITS.rss||cpuUs>LIMITS.cpuUs||cases>LIMITS.cases||elapsedMs>(admitting?LIMITS.admitMs:LIMITS.wallMs))fail('RESOURCE_LIMIT');}
// A measured observation bound, not independent cancellation or permission to
// free an unsettled physical query. The native entrypoint remains hard-closed.
export function assertBarrierWindow(started,finished){
 if(![started,finished].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||finished<started||finished-started>=LIMITS.barrierMs)fail('BARRIER_EXPIRED');
 return Object.freeze({elapsedMs:finished-started,limitMs:LIMITS.barrierMs});
}
/** Trusted fixture capabilities only. A timeout refuses success but does not
 * settle or cancel action; its real query remains owned by Run.pending. */
export async function runMeasuredBarrier({acquire,action,observe,during,release,clock=()=>performance.now()}){
 for(const fn of [acquire,action,observe,during,release,clock])assert.equal(typeof fn,'function');
 const started=clock();let locked=false,pending=null,failure=null;
 try{
  await acquire();locked=true;assertBarrierWindow(started,clock());
  pending=Promise.resolve().then(action);pending.catch(()=>{});
  await observe();assertBarrierWindow(started,clock());
  await during();assertBarrierWindow(started,clock());
  await observe();assertBarrierWindow(started,clock());
 }catch(error){failure=error;}
 finally{if(locked)try{await release();}catch(error){failure??=error;}}
 if(failure)throw failure;
 assertBarrierWindow(started,clock());return pending;
}
function relativeSource(path){const r=relative(ROOT,path).replaceAll('\\','/');if(!r||r.startsWith('../')||r.startsWith('apps/local-service/data/')&&r!==DRIVER_RELATIVE)fail('SOURCE_PATH');return r;}
async function ordinary(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>16*1024**2)fail('SOURCE_FILE');if(resolve(await realpath(path)).toLowerCase()!==resolve(path).toLowerCase())fail('SOURCE_LINK');return readFile(path);}

/** Captures literal source, SQL and complete package code. No DB or credential IO. */
export async function captureNativeScopedInventory(){
 const epoch=Object.freeze({started:performance.now(),cpu:process.cpuUsage()});
 const files=new Map(),pending=ENTRY_PATHS.map(x=>resolve(ROOT,x)),packages=new Set();let bytes=0;
 async function add(path){path=resolve(path);if(files.has(path))return null;if(files.size>=LIMITS.files)fail('SOURCE_COUNT');
  relativeSource(path);const buffer=await ordinary(path);bytes+=buffer.length;if(bytes>LIMITS.sourceBytes)fail('SOURCE_BYTES');files.set(path,buffer);return buffer;}
 async function packageTree(directory){if(packages.has(directory))return;packages.add(directory);const pkg=JSON.parse((await add(join(directory,'package.json'))??files.get(join(directory,'package.json'))).toString('utf8'));
  const dirs=[directory];for(let n=0;n<dirs.length;n++){if(dirs.length>256)fail('PACKAGE_DEPTH');for(const entry of await readdir(dirs[n],{withFileTypes:true})){
   if(entry.isSymbolicLink())fail('PACKAGE_LINK');const path=join(dirs[n],entry.name);
   if(entry.isDirectory()){if(entry.name!=='node_modules'&&entry.name!=='.git')dirs.push(path);}
   else if(['.js','.cjs','.mjs','.json','.node','.wasm'].includes(extname(path)))await add(path);
  }}
  for(const dependency of Object.keys(pkg.dependencies??{})){const req=createRequire(join(directory,'package.json'));await locatePackage(dependency,req);}
 }
 async function locatePackage(specifier,req){if(specifier.startsWith('node:'))return;let entry;try{entry=req.resolve(specifier);}catch{fail('DEPENDENCY_MISSING');}
  let path=dirname(entry);for(let n=0;n<20;n++){try{const p=JSON.parse((await ordinary(join(path,'package.json'))).toString('utf8'));if(p.name){await packageTree(path);return;}}catch(e){if(e.code&&!['ENOENT','ENOTDIR'].includes(e.code))throw e;}const parent=dirname(path);if(parent===path)break;path=parent;}fail('PACKAGE_ROOT');}
 for(let n=0;n<pending.length;n++){const path=pending[n],buffer=await add(path);if(!buffer)continue;const text=buffer.toString('utf8'),req=createRequire(path);
  const imports=[...text.matchAll(/(?:\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\))/gu)].map(m=>m[1]??m[2]);
  for(const specifier of imports){if(specifier.startsWith('node:'))continue;if(specifier.startsWith('.')){const child=resolve(dirname(path),specifier);if(!pending.includes(child))pending.push(child);}else await locatePackage(specifier,req);}
 }
 // The thin driver's explicit createRequire is rooted in this portable package;
 // capture that complete pg dependency tree even though it is not a bare import.
 await locatePackage('pg',createRequire(resolve(ROOT,'apps/local-service/portable/package.json')));
 for(const p of [...SQL_PATHS,'apps/local-service/portable/package.json','apps/local-service/portable/package-lock.json','apps/local-service/package.json',
  'decisions/ADR-167-native-scoped-ingestion-proof.md','decisions/ADR-173-scoped-proof-owned-postgresql-cluster.md','decisions/ADR-174-owned-postgresql-address-proof.md','decisions/ADR-175-clear-update-fixture-identities.md',OWNED_PATH+'cluster.test.js',OWNED_PATH+'supervise.py',OWNED_PATH+'supervise.test.py',OWNED_PATH+'README.md','apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v3/test.js','apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v1/run-control.test.js','apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v3/README.md'])await add(resolve(ROOT,p));
 for(const [name,expected]of Object.entries(ACCEPTED_INPUT_FILES)){
  const path=resolve(ROOT,'apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-ingestion-v1',name);
  await add(path);if(sha(files.get(path))!==expected)fail('SOURCE_DRIFT');
 }
 const records=[...files].map(([path,b])=>({path:relativeSource(path),bytes:b.length,sha256:sha(b)})).sort((a,b)=>a.path.localeCompare(b.path,'en'));
 if(Buffer.byteLength(JSON.stringify(records))>128*1024)fail('INVENTORY_REPORT_CAPACITY');
 const seal=Object.freeze({schema:'adr167-source-seal/v1',files:records.length,bytes,digest:sha(JSON.stringify(records)),records:Object.freeze(records.map(Object.freeze))});seals.set(seal,files);sealEpochs.set(seal,epoch);return seal;
}
async function checkDrift(seal){const files=seals.get(seal);if(!files)fail('SOURCE_SEAL');for(const [path,buffer]of files)if(sha(await ordinary(path))!==sha(buffer))fail('SOURCE_DRIFT');}
function captured(seal,path){const b=seals.get(seal)?.get(resolve(ROOT,path));if(!b)fail('SQL_NOT_CAPTURED');return b.toString('utf8');}

export const GRANTS=Object.freeze({
 [APP]:['enqueue(text,text,text,jsonb,integer,text)','revoke(text,text,text,text)','list_jobs(text,text,integer)','create_root(text,text,text,text,text,text,text,text,text,text,text,text)','reclassify(text,text,text,text)'],
 [CRAWLER]:['enqueue(text,text,text,jsonb,integer,text)','revoke(text,text,text,text)','list_jobs(text,text,integer)'],
 [WORKER]:['claim(text,text,text,text,text,text,integer)','heartbeat(text,text,text,text,text,text,integer,integer)','complete(text,text,text,text,text,text,integer)','cleanup(text,text,text,text)']
});
export const CASE_NAMES=Object.freeze([
 'fresh-identity-source-role-audit','legacy-apply-held-admission-update-reply','scoped-held-growth-enqueue','last-watermark-contention','native-slot-snapshot-race',
 'update-before-root-reply','root-reply-before-update','root-replay-before-topic-delete','topic-delete-before-root-replay',
 'completion-before-forget','forget-before-completion','completion-before-account-withdraw','account-withdraw-before-completion','completion-before-revoke','revoke-before-completion',
 'clear-before-enqueue','enqueue-before-clear','clear-before-post','post-before-clear','clear-before-update','update-before-clear','legacy-implicit-lifecycle-negative',
 'literal-COMMIT-simple','literal-COMMIT-semicolon','literal-COMMIT-extended','unsupported-lowercase','unsupported-END','unsupported-WORK','unsupported-CHAIN','unsupported-comment','unsupported-multistatement','unsupported-PREPARE',
 'implicit-simple','implicit-extended','constraints-before','constraints-during','constraints-after','savepoint-late-commit','nested-literal-red-depth-green',
 'authority-expired-after-mutation','lease-expired-after-mutation','stale-epoch-after-reclaim','lost-response-reconciliation','ABC-replay-no-rewind','changed-actor-proof-conflict','final-wires-tuples-retirement'
]);
function literal(v){if(v===null)return 'NULL';if(typeof v==='number'){if(!Number.isSafeInteger(v))fail('SQL_LITERAL');return String(v);}if(typeof v!=='string'||Buffer.byteLength(v)>65536||v.includes('\0'))fail('SQL_LITERAL');return "'"+v.replaceAll("'","''")+"'";}
function completionSQL(job,extended=true){const args=[job.generation,job.operationId,job.principal,job.commandHash,job.worker,job.token,job.epoch];return extended?{text:`SELECT ${NS}.complete($1,$2,$3,$4,$5,$6,$7) AS result`,values:args}:{text:`SELECT ${NS}.complete(${args.map(literal).join(',')}) AS result`};}
export function explicitAdapter(client){return {dialect:'pg',query:(...a)=>client.query(...a),exec:sql=>client.query(sql),transaction:fn=>transaction(client,fn)};}
/** Trusted local seam for the actual Run query facade. No raw client or admin
 * capability is returned. Pending refers to physical SQL, not its observation. */
export function createWorkQueryFacade({work,key,raw,pending,entry,canDispatch}){
 if(!work||typeof work.check!=='function'||typeof work.dispatch!=='function'||typeof raw?.query!=='function'||!(pending instanceof Map)||!entry||typeof canDispatch!=='function')fail('CLIENT_CONTRACT');
 return Object.freeze({entry,query:(...args)=>{
  work.check();if(!canDispatch())fail('CLIENT_SCOPE');
  return work.dispatch(key,()=>{
   if(pending.has(entry))fail('CLIENT_BUSY');work.check();
   const p=Promise.resolve(raw.query(...args));pending.set(entry,p);
   const settled=()=>{if(pending.get(entry)===p)pending.delete(entry);};p.then(settled,settled);return p;
  });
 }});
}
async function transaction(client,fn,commit='COMMIT'){await client.query('BEGIN');try{assert.equal((await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation,'read committed');const result=await fn({dialect:'pg',query:(...a)=>client.query(...a),exec:sql=>client.query(sql)});await client.query(commit);return result;}catch(e){try{await client.query('ROLLBACK');}catch{}throw e;}}
async function result(client,name,args){const r=await client.query(`SELECT ${NS}.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args);assert.equal(r.rows.length,1);return r.rows[0].result;}
async function call(client,name,args){return transaction(client,()=>result(client,name,args));}

class Run {
 constructor(connect,seal,work,establish,registerController){this.connect=connect;this.seal=seal;this.work=work;this.establish=establish;this.registerController=registerController;const epoch=sealEpochs.get(seal);if(!epoch)fail('SOURCE_SEAL');this.started=epoch.started;this.cpu=epoch.cpu;this.clients=[];this.pending=new Map();this.establishments=new Set();this.barriers=new Set();this.restores=[];this.counter=0;this.identity=null;this.createAttempted=false;this.created=false;this.report={schema:'adr167-native-result/v1',status:'failed',source:seal,cases:CASE_NAMES.map(name=>({name,status:'not-executed'})),waitGraphs:[],instrumentation:[],cleanup:{status:'not-created'},nativeExecuted:false};}
 budget(admitting=true){this.work.check();const cpu=process.cpuUsage(this.cpu);assertBudget({elapsedMs:performance.now()-this.started,rss:process.memoryUsage().rss,cpuUs:cpu.user+cpu.system,cases:this.report.cases.filter(x=>x.status!=='not-executed').length},admitting);}
 async client(role,database=SCRATCH_DATABASE){this.budget();if(!ROLES.includes(role)||![SCRATCH_DATABASE,'postgres'].includes(database)||database==='postgres'&&role!=='postgres'||this.clients.length>=LIMITS.clients)fail('CLIENT_SCOPE');
  const first=this.clients.length===0,key=first?'controller':'client-'+this.clients.length;
  const applicationName='murmingle-adr167-scoped-native';
  const entry={key,role,database,applicationName,pid:null,backendStart:null,closed:false};this.clients.push(entry);
  const initialize=async()=>{
   const raw=await this.connect(Object.freeze({role,database,applicationName,statementTimeoutMs:5000,lockTimeoutMs:3000}),()=>this.work.check());
   if(!raw||typeof raw.query!=='function'||typeof raw.end!=='function')fail('CLIENT_CONTRACT');rawClients.set(entry,raw);
   this.work.check();await raw.query("SET statement_timeout='5s'; SET lock_timeout='3s'; SET default_transaction_isolation='read committed'");
   this.work.check();const row=(await raw.query(`SELECT current_database() AS database,current_user AS current_user,session_user AS session_user,pg_backend_pid() AS pid,host(inet_server_addr()) AS host,inet_server_port() AS port,
    current_setting('statement_timeout') AS statement_timeout,current_setting('lock_timeout') AS lock_timeout,current_setting('transaction_isolation') AS isolation,
    current_setting('server_version_num') AS server_version,a.backend_start::text AS backend_start,a.application_name FROM pg_stat_activity a WHERE a.pid=pg_backend_pid()`)).rows[0];
   assert.equal(row.database,database);assert.equal(row.current_user,role);assert.equal(row.session_user,role);assert.equal(row.host,'127.0.0.1');assert.equal(Number(row.port),55433);assert.ok(Number(row.server_version)>=170000&&Number(row.server_version)<180000);assert.equal(row.statement_timeout,'5s');assert.equal(row.lock_timeout,'3s');assert.equal(row.isolation,'read committed');assert.equal(row.application_name,applicationName);assert.equal(typeof row.backend_start,'string');assert.ok(row.backend_start.length>0&&row.backend_start.length<=128);entry.pid=Number(row.pid);assert.ok(Number.isSafeInteger(entry.pid)&&entry.pid>0);entry.backendStart=row.backend_start;
  };
  await this.establish(key,()=>{const physical=initialize();this.establishments.add(physical);const settled=()=>this.establishments.delete(physical);physical.then(settled,settled);return physical;});
  if(first)this.registerController(key);
  const client=createWorkQueryFacade({work:this.work,key,raw:rawClients.get(entry),pending:this.pending,entry,canDispatch:()=>!first||!this.provisioned});entry.client=client;return client;}
 async verifyFixture(client,owner=false){if(!this.identity||!this.created)fail('FRESH_IDENTITY');const r=(await client.query(`SELECT current_database() AS name,d.oid::text AS oid,pg_get_userbyid(d.datdba) AS owner,current_user AS role FROM pg_database d WHERE datname=current_database()`)).rows[0];assert.equal(r.name,SCRATCH_DATABASE);assert.equal(r.oid,this.identity.oid);assert.equal(r.owner,OWNER);if(owner)assert.equal(r.role,OWNER);}
 async ownWait(waiter,blocker){const started=performance.now();for(let i=0;i<100;i++){this.budget(false);const rows=(await this.admin.query(`SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datid=$1::oid AND pid=$2`,[this.identity.oid,waiter.entry.pid])).rows;
   if(rows.length===1&&rows[0].blockers.map(Number).includes(blocker.entry.pid)){const allowed=new Set(this.clients.map(x=>x.pid));const w={pid:waiter.entry.pid,blockers:rows[0].blockers.map(Number).filter(p=>allowed.has(p)),type:rows[0].wait_event_type==='Lock'?'Lock':'other',event:['advisory','transactionid','tuple','relation'].includes(rows[0].wait_event)?rows[0].wait_event:'other'};this.report.waitGraphs.push(w);return w;}
   if(performance.now()-started>LIMITS.barrierMs)break;await delay(10);
  }fail('BARRIER_NOT_OBSERVED');}
 async barrier(key,action,waiter,during){
  this.budget();return runMeasuredBarrier({
   acquire:async()=>{await this.admin.query('SELECT pg_advisory_lock(914092167,$1)',[key]);this.barriers.add(key);},action,
   observe:()=>this.ownWait(waiter,this.admin),during,
   release:async()=>{const unlocked=await this.admin.query('SELECT pg_advisory_unlock(914092167,$1) AS unlocked',[key]);assert.equal(unlocked.rows[0].unlocked,true);this.barriers.delete(key);}
  });
 }
 async instrument(signature,marker,addition){await this.verifyFixture(this.owner,true);const old=(await this.owner.query('SELECT pg_get_functiondef($1::regprocedure) AS body',[signature])).rows[0].body;const body=replaceUnique(old,marker,addition);assert.equal(body.replace(addition,''),old);this.restores.push({signature,old});await this.owner.query(body);this.report.instrumentation.push({signature,before:sha(old),after:sha(body),marker:sha(marker),addition:sha(addition)});return old;}
 async restore(){while(this.restores.length){const r=this.restores[this.restores.length-1];await this.owner.query(r.old);assert.equal(sha((await this.owner.query('SELECT pg_get_functiondef($1::regprocedure) AS body',[r.signature])).rows[0].body),sha(r.old));this.restores.pop();}}
 async case(name,fn){this.budget();await checkDrift(this.seal);this.work.check();const row=this.report.cases.find(x=>x.name===name);if(!row||row.status!=='not-executed')fail('CASE_IDENTITY');const start=performance.now();try{const evidence=await fn();this.work.check();row.status='passed';if(evidence!==undefined)row.evidence=evidence;}catch(e){row.status='failed';row.code=sanitizeFailure(e);throw e;}finally{row.ms=Math.round((performance.now()-start)*100)/100;checkedReport(this.report);}}
 async version(){const row=(await this.admin.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton')).rows[0];assert.ok(row);const revision=Number(row.revision);assert.ok(Number.isSafeInteger(revision)&&revision>=0);return {generation:row.generation,revision};}
 async input(suffix){const expected=await this.version();return {expected:{generation:expected.generation,revision:Number(expected.revision)},operationId:'native-op-'+suffix,sourceId:'native-source-'+suffix,topicId:'native-topic-'+suffix,discussionId:'native-discussion-'+suffix,createdAt:STAMP,url:'https://example.org/adr167/'+suffix,title:'Synthetic '+suffix,extractorVersion:'main-text-prefix/v1',modelId:MODEL,bodyHash:hash(6),builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),documentHash:hash(7),bodyVector:[...UNIT],titleVector:[...UNIT],nodeId:'games'};}
 async queued(suffix,{mode='admission',parameters=null,principal=ACTOR,seconds=30,leaseSeconds=15,claim=true}={}){const input=parameters?null:await this.input(suffix),p=parameters??prepareFastAdmission(input).parameters;
  const q=await call(principal==='crawler-public/v1'?this.crawler:this.app,'enqueue',[principal==='crawler-public/v1'?'crawler':'actor',principal,mode,JSON.stringify(p),seconds,hash(8)]);
  const j={generation:p[0],operationId:p[2],principal,commandHash:q.commandHash??q.command_hash,worker:'native-worker',token:'native-token-'+suffix,data:p,input};
  if(claim){const c=await call(this.worker,'claim',[j.generation,j.operationId,principal,j.commandHash,j.worker,j.token,leaseSeconds]);j.epoch=c.epoch;}return j;}
 async complete(j,client=this.worker){return transaction(client,async()=> (await client.query(completionSQL(j))).rows[0].result);}
 async admitted(suffix,options){const j=await this.queued(suffix,options);return {job:j,receipt:await this.complete(j)};}
 async exists(j){return Number((await this.admin.query('SELECT count(*) AS n FROM canonical_v4.sources WHERE id=$1',[j.data[4]])).rows[0].n);}
 async update(j,r,suffix,changes={}){const v=await this.version(),a={...j.input,...changes,expected:{generation:v.generation,revision:Number(v.revision)},operationId:'native-op-'+suffix,title:'Updated '+suffix};const p=[...prepareFastAdmission(a).parameters,r.sourceVersion,r.witnessHash,r.decisionHash];return this.queued(suffix,{mode:'update',parameters:p,principal:j.principal});}
 async root(r,suffix,actor=ACTOR,client=this.app){return createFastRoot(explicitAdapter(client),{actorId:actor,requestId:'native-request-'+suffix,generation:r.version.generation,topicId:r.topicId,body:'Synthetic root '+suffix,sourceId:r.sourceId,rootId:'native-root-'+suffix,createdAt:STAMP,witnessHash:r.witnessHash,decisionHash:r.decisionHash});}
 async reply(r,rootId,suffix,client=this.app){const repo=createCanonicalV4RuntimeRepository({database:explicitAdapter(client),nextId:()=> 'native-reply-'+suffix,now:()=>STAMP});const v=await this.version();return repo.command({actorId:OTHER,requestId:'native-request-'+suffix,expected:{generation:v.generation,revision:Number(v.revision)},command:{type:'reply',discussionId:r.discussionId,rootId,replyToId:null,body:'Synthetic reply '+suffix,originSourceId:null}});}
 async lifecycle(command,{implicit=false}={}){const base=explicitAdapter(this.app);const db=implicit?base:{...base,query:(sql,args)=>transaction(this.app,()=>this.app.query(sql,args))};return createCanonicalV4IngestionRepository({database:db}).lifecycle(await this.version(),command);}
}

/** Only root's fixed-role connector and a privately minted captured source seal. */
export async function runNativeScopedProof(options){
 if(SOURCE_STATUS!=='accepted-for-native-proof')fail('SOURCE_NOT_ACCEPTED');
 if(!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).sort().join(',')!=='connectFixedRole,sourceSeal')fail('RUN_CONTRACT');
 const {connectFixedRole,sourceSeal}=options;if(typeof connectFixedRole!=='function'||!seals.has(sourceSeal)||usedSeals.has(sourceSeal))fail('SOURCE_SEAL');
 if(!process.execArgv.includes('--max-old-space-size=256'))fail('HEAP_LIMIT');usedSeals.add(sourceSeal);
 const epoch=sealEpochs.get(sourceSeal);if(!epoch)fail('SOURCE_SEAL');
 let faultSignal,finishOriginal,entered=false;
 const faulted=new Promise(resolve=>{faultSignal=resolve;}),originalFinished=new Promise(resolve=>{finishOriginal=resolve;});
 // The sink only wakes a root-context continuation; it never enters cleanup
 // from the ALS context of the work callback that detected the fault.
 const {work,admin}=createRunControl({epoch:epoch.started,now:()=>performance.now(),schedule:(fn,ms)=>setTimeout(fn,ms),cancel:id=>clearTimeout(id),
  usage:()=>{const cpu=process.cpuUsage(epoch.cpu);return {rss:process.memoryUsage().rss,cpuUs:cpu.user+cpu.system};},onFault:()=>faultSignal()});
 const run=new Run(connectFixedRole,sourceSeal,work,(key,fn)=>admin.establish(key,fn),key=>admin.registerController(key));
 try{
  const observed=work.run(async()=>{entered=true;try{await checkDrift(sourceSeal);work.check();await provision(run);run.provisioned=true;run.report.nativeExecuted=true;await nativeCases(run);work.check();run.report.status='passed';}finally{finishOriginal();}});
  observed.catch(()=>{});
  await Promise.race([observed,faulted.then(()=>{throw Object.assign(new Error('Native work admission closed'),{code:'CONTROL_FAULT'});})]);
 }catch(e){if(!entered)finishOriginal();run.report.status='failed';run.report.failure=sanitizeFailure(e);}
 finally{
  try{await cleanupOwnedNativeRun(run,admin,originalFinished,entry=>rawClients.get(entry));}catch(e){run.report.status='failed';run.report.cleanup={status:'unknown',reason:sanitizeFailure(e)};}
  run.report.control=admin.close();
  try{await checkDrift(sourceSeal);}catch(e){run.report.status='failed';run.report.failure=sanitizeFailure(e);}
 }
 return checkedReport(run.report);
}

async function provision(r){
 r.maintenance=await r.client('postgres','postgres');
 assert.equal((await r.maintenance.query('SELECT 1 FROM pg_database WHERE datname=$1',[SCRATCH_DATABASE])).rows.length,0);
 r.createAttempted=true;await r.maintenance.query(`CREATE DATABASE ${exactIdentifier(SCRATCH_DATABASE)} OWNER murmingle_owner TEMPLATE template0`);r.created=true;
 const identities=(await r.maintenance.query('SELECT oid::text AS oid,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[SCRATCH_DATABASE])).rows;
 assert.equal(identities.length,1);assert.equal(identities[0].owner,OWNER);r.identity=Object.freeze(identities[0]);
 await r.maintenance.query(`REVOKE CONNECT,CREATE,TEMP ON DATABASE ${exactIdentifier(SCRATCH_DATABASE)} FROM PUBLIC`);
 await r.maintenance.query(`GRANT CONNECT ON DATABASE ${exactIdentifier(SCRATCH_DATABASE)} TO murmingle_owner,murmingle_app,murmingle_crawler_submitter,murmingle_ingest_worker`);
 r.admin=await r.client('postgres');await r.verifyFixture(r.admin);await r.admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 await transaction(r.admin,async tx=>tx.exec(captured(r.seal,SQL_PATHS[0])));
 r.owner=await r.client('postgres');await r.owner.query('SET ROLE murmingle_owner');await r.verifyFixture(r.owner,true);
 await transaction(r.owner,async tx=>{
  await tx.query('CREATE TABLE canonical_v4.schema_migrations(version integer PRIMARY KEY,hash text NOT NULL)');
  for(let i=0;i<MIGRATIONS.length;i++){const sql=captured(r.seal,SQL_PATHS[1+i]);await tx.exec(sql);await tx.query('INSERT INTO canonical_v4.schema_migrations VALUES($1,$2)',[i+1,sha(sql)]);}
 });
 r.fixture=await seedCanonicalV4RuntimeFixture(explicitAdapter(r.owner));
 await transaction(r.owner,async tx=>{await tx.exec(captured(r.seal,SQL_PATHS[10]));await tx.exec(captured(r.seal,SQL_PATHS[11]));
  await tx.query(`SELECT ${NS}.publish($1::jsonb,$2::jsonb)`,[JSON.stringify({builderHash:hash(1),encoderHash:hash(2),representationHash:hash(3),modelHash:hash(4),policyHash:hash(5),modelId:MODEL}),JSON.stringify(['games','nature'])]);
  for(const role of [APP,CRAWLER,WORKER]){
   // Scratch-only manifest defeats inherited/default explicit function grants;
   // global memberships/default privileges are NEVER modified.
   await tx.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${NS} FROM ${role}`);
   await tx.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${NS} FROM ${role}`);
   await tx.query(`GRANT USAGE ON SCHEMA ${NS} TO ${role}`);
   for(const signature of GRANTS[role])await tx.query(`GRANT EXECUTE ON FUNCTION ${NS}.${signature} TO ${role}`);
  }
 });
 r.app=await r.client(APP);r.app2=await r.client(APP);r.crawler=await r.client(CRAWLER);r.worker=await r.client(WORKER);r.worker2=await r.client(WORKER);
 r.baseline=(await r.admin.query('SELECT id,author_id,discussion_id,payload,write_version FROM canonical_v4.contributions ORDER BY id')).rows;
 r.baselineRevisions=(await r.admin.query('SELECT * FROM canonical_v4.revisions ORDER BY contribution_id,ordinal')).rows;
 r.baselineSources=(await r.admin.query('SELECT * FROM canonical_v4.sources ORDER BY id')).rows;
 await r.case('fresh-identity-source-role-audit',async()=>{
  for(const c of [r.app,r.app2,r.crawler,r.worker,r.worker2])await auditRole(r,c);
  // Build a complete valid reference using the ACTUAL canonical producer APIs,
  // not a partial owner-written reference with inconsistent Topic mirrors.
  const ids=kind=>'native-reference-'+kind;
  const submit=createCanonicalV4IngestionRepository({database:explicitAdapter(r.crawler)});
  const worker=createCanonicalV4IngestionRepository({database:explicitAdapter(r.worker),nextId:ids,now:()=>STAMP});
  const v=await r.version();
  await submit.enqueueCrawler({expected:{generation:v.generation,revision:Number(v.revision)},operationId:'native-reference-operation',url:'https://example.org/adr167/reference-seed',title:'Synthetic legacy reference seed',embedding:{modelId:MODEL,values:[...UNIT]},extractorVersion:'main-text-prefix/v1'},{authorityToken:'native-reference-authority',authoritySeconds:30});
  const claim=await worker.claim({workerId:'native-reference-worker',leaseToken:'native-reference-token',leaseSeconds:30});
  r.legacyReference=await worker.apply(claim,{representedValues:[...UNIT]});
  assert.equal(Number((await r.admin.query('SELECT count(*) AS n FROM canonical_v4.fixed_references WHERE source_id=$1',[r.legacyReference.sourceId])).rows[0].n),1);
  return {databaseOid:r.identity.oid,loginConnections:5,maximumClients:r.clients.length,nonemptyFixedReferences:1,isolation:'read committed',referenceSource:r.legacyReference.sourceId,referenceTopic:r.legacyReference.topicId};
 });
}
async function deny(client,sql,args=[],codes=['42501']){let error;try{await client.query(sql,args);}catch(e){error=e;}if(!error||!codes.includes(error.code))fail('NEGATIVE_PROBE');return error.code;}
async function auditRole(r,c){await r.verifyFixture(c);const role=c.entry.role;
 const flags=(await c.query(`SELECT rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,pg_has_role(current_user,'murmingle_owner','MEMBER') AS owner_member,pg_has_role(current_user,'murmingle_owner','SET') AS owner_set FROM pg_roles WHERE rolname=current_user`)).rows[0];
 assert.equal(flags.rolcanlogin,true);for(const k of ['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','owner_member','owner_set'])assert.equal(flags[k],false,k);
 const escape=(await c.query(`SELECT has_database_privilege(current_user,current_database(),'CREATE') AS db_create,has_database_privilege(current_user,current_database(),'TEMP') AS db_temp,
  EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' AND (nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) OR has_schema_privilege(current_user,oid,'CREATE'))) AS schema_escape,
  EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('canonical_v4','${NS}','${LEGACY}','public') AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_relation,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('canonical_v4','${NS}','${LEGACY}','public') AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_function`)).rows[0];
 for(const v of Object.values(escape))assert.equal(v,false);
 const writes=(await c.query(`SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('canonical_v4','${NS}','${LEGACY}') AND c.relkind IN('r','p','v') AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS table_dml,
  EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('canonical_v4','${NS}','${LEGACY}') AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(current_user,c.oid,a.attnum,'INSERT,UPDATE,REFERENCES')) AS column_dml,
  EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('canonical_v4','${NS}','${LEGACY}') AND c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS sequence_dml`)).rows[0];
 for(const v of Object.values(writes))assert.equal(v,false);
 const functions=(await c.query(`SELECT p.oid::text AS oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.proconfig,pg_get_userbyid(p.proowner) AS owner,has_function_privilege(current_user,p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('${NS}','${LEGACY}')`)).rows;
 for(const f of functions){assert.equal(f.owner,OWNER);assert.deepEqual(f.proconfig,['search_path=pg_catalog']);
  const expected=f.nspname===NS&&GRANTS[role].some(x=>x.startsWith(f.proname+'('));assert.equal(f.allowed,expected);
  if(expected){const exact=(await r.admin.query('SELECT to_regprocedure($1)::oid::text AS oid',[NS+'.'+GRANTS[role].find(x=>x.startsWith(f.proname+'('))])).rows;assert.equal(exact[0].oid,f.oid);}
 }
 await deny(c,'CREATE TEMP TABLE adr167_forbidden_temp(id integer)');await deny(c,'CREATE SCHEMA adr167_forbidden_schema');
 await deny(c,`UPDATE ${NS}.jobs SET code='forbidden'`);await deny(c,`SELECT ${NS}.admit_new(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)`);
 await deny(c,'SET ROLE murmingle_owner');await deny(c,"SET session_replication_role='replica'");
 // Successful escape probes would be fatal; never reset one and call it safe.
}
/** Root-owned cleanup, also executable with invented sockets and capabilities.
 * rawOf is a trusted private lookup, never supplied by a runtime/API request. */
export async function cleanupOwnedNativeRun(r,admin,originalFinished,rawOf){
 if(typeof rawOf!=='function')fail('CLIENT_CONTRACT');
 r.report.status=r.report.status==='passed'&&r.report.cases.every(x=>x.status==='passed')?'passed':'failed';
 const controller=r.maintenance?.entry;
 // Only this root cleanup closure retains admin. Run and late work callbacks
 // have a WORK-only query facade and cannot borrow these dispatch capabilities.
 const cleanupQuery=(entry,sql,args)=>admin.dispatch(entry.key,()=>rawOf(entry).query(sql,args));
 let safe=true;
 try{
  await admin.cleanup(async()=>{
   // No PID-based cancellation: an incarnation check in pg_stat_activity is
   // not atomic with pg_cancel_backend(pid). Configured statement/lock timeouts
   // are NOT proof of client/socket settlement. Await actual establishment,
   // setup and query promises within this SAME original cleanup deadline.
   await Promise.allSettled([...r.pending.values(),...(r.establishments??[])]);
   // This is the ORIGINAL callback's finally, not its rejected observation.
   // If it never ends, the cleanup lane expires and no DROP becomes eligible.
   await originalFinished;
   for(const entry of r.clients){if(entry!==controller&&entry.client&&rawOf(entry))await cleanupQuery(entry,'ROLLBACK');}
   if(r.admin)for(const key of [...r.barriers]){
    const result=await cleanupQuery(r.admin.entry,'SELECT pg_advisory_unlock(914092167,$1) AS unlocked',[key]);
    assert.equal(result.rows[0].unlocked,true);r.barriers.delete(key);
   }
   while(r.restores.length){
    const saved=r.restores[r.restores.length-1];if(!r.owner)fail('RESTORE_TIMEOUT');
    await cleanupQuery(r.owner.entry,saved.old);
    const restored=(await cleanupQuery(r.owner.entry,'SELECT pg_get_functiondef($1::regprocedure) AS body',[saved.signature])).rows[0];
    assert.equal(sha(restored.body),sha(saved.old));r.restores.pop();
   }
   for(const entry of r.clients)if(entry!==controller&&rawOf(entry)){
    await admin.closeClient(entry.key,()=>rawOf(entry).end());entry.closed=true;
   }
  });
  await admin.join();
 }catch(e){safe=false;r.report.cleanup={status:r.created?'retained':'unknown',reason:sanitizeFailure(e)};r.report.status='failed';}
 // Failed acquisitions remain permanent uncertainty even after late settlement
 // and successful end(). Closing what is known never proves an unknown socket
 // could not subsequently connect or an ambiguous CREATE did not commit.
 const state=admin.snapshot();
 if(state.acquisitionUncertain||state.closeUncertain||state.pendingPhysical||state.pendingTasks){safe=false;r.report.cleanup={status:'unknown',reason:'OWN_CLIENTS_UNSETTLED'};r.report.status='failed';}
 if(safe&&r.created&&r.identity){
  try{
   await admin.drop(async()=>{
    const query=(sql,args)=>admin.dropDispatch(()=>rawOf(controller).query(sql,args));
    const rows=(await query(`SELECT d.oid::text AS oid,pg_get_userbyid(d.datdba) AS owner,
     (SELECT count(*)::integer FROM pg_stat_activity WHERE datid=d.oid) AS sessions FROM pg_database d WHERE datname=$1`,[SCRATCH_DATABASE])).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].oid,r.identity.oid);assert.equal(rows[0].owner,OWNER);assert.equal(rows[0].sessions,0);
    await query(`DROP DATABASE ${exactIdentifier(SCRATCH_DATABASE)}`);
    assert.equal((await query('SELECT 1 FROM pg_database WHERE datname=$1',[SCRATCH_DATABASE])).rows.length,0);
   });
   r.report.cleanup={status:'dropped',oid:r.identity.oid};
  }catch(e){r.report.cleanup={status:admin.snapshot().dropUncertain?'unknown':'retained',reason:sanitizeFailure(e),oid:r.identity.oid};r.report.status='failed';}
 }else if(r.createAttempted&&!r.identity){r.report.cleanup={status:'unknown',reason:'CREATION_OUTCOME_UNCERTAIN'};r.report.status='failed';}
 else if(safe&&!r.created)r.report.cleanup={status:'not-created'};
 // Root may still attempt each known idle close after a cleanup refusal, within
 // that SAME original cleanup/drop deadline. Never close a physically busy slot.
 for(const entry of r.clients)if(!entry.closed&&rawOf(entry)){
  try{await admin.closeClient(entry.key,()=>rawOf(entry).end());entry.closed=true;}
  catch{r.report.status='failed';r.report.cleanup={...r.report.cleanup,clientClosure:'unproved'};}
 }
 r.report.elapsedMs=Math.round(performance.now()-r.started);r.report.closedClients=r.clients.filter(x=>x.closed).length;
}

const completeSignature=NS+'.complete(text,text,text,text,text,text,integer)';
const legacySignature=LEGACY+'.ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean)';
async function absent(r,j){assert.equal(await r.exists(j),0);for(const table of ['input_versions','current_inputs','decisions','receipts','operations']){
 const n=(await r.admin.query(`SELECT count(*) AS n FROM ${NS}.${table} WHERE source_id=$1`,[j.data[4]])).rows[0].n;assert.equal(Number(n),0);}}
export function erasedReplayPlan(job,version,suffix){
 assert.ok(Array.isArray(job.data)&&[12,15].includes(job.data.length));assert.equal(version.generation,job.generation);assert.ok(Number.isSafeInteger(version.revision)&&version.revision>=0);assert.match(suffix,/^[a-z0-9-]{1,80}$/u);
 const old=[...job.data],fresh=[...job.data];fresh[1]=version.revision;fresh[4]='erased-source-'+suffix;fresh[5]='erased-topic-'+suffix;fresh[6]='erased-discussion-'+suffix;fresh[7]='2026-10-20T14:00:00.000Z';
 return Object.freeze({mode:job.data.length===12?'admission':'update',old:Object.freeze(old),fresh:Object.freeze(fresh),unusedIds:Object.freeze(fresh.slice(4,7))});
}
async function assertErasedReplay(r,job,suffix){
 const plan=erasedReplayPlan(job,await r.version(),suffix);
 const before=(await r.admin.query(`SELECT s.id,s.payload,s.write_version,
  (SELECT jsonb_agg(i ORDER BY source_version) FROM ${NS}.input_versions i WHERE i.source_id=s.id) AS inputs,
  (SELECT jsonb_agg(c ORDER BY source_version) FROM ${NS}.current_inputs c WHERE c.source_id=s.id) AS current_input
  FROM canonical_v4.sources s WHERE id=$1`,[job.data[4]])).rows;
 for(const params of [plan.old,plan.fresh]){
  await assert.rejects(call(r.app,'enqueue',['actor',job.principal,plan.mode,JSON.stringify(params),30,hash(8)]),e=>e.code==='P2302');
  for(const table of ['jobs','authorities','final_intents'])assert.equal(Number((await r.admin.query(`SELECT count(*) AS n FROM ${NS}.${table} WHERE generation=$1 AND operation_id=$2`,[job.generation,job.operationId])).rows[0].n),0);
  assert.equal(Number((await r.admin.query('SELECT count(*) AS n FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[plan.unusedIds])).rows[0].n),0);
 }
 const after=(await r.admin.query(`SELECT s.id,s.payload,s.write_version,
  (SELECT jsonb_agg(i ORDER BY source_version) FROM ${NS}.input_versions i WHERE i.source_id=s.id) AS inputs,
  (SELECT jsonb_agg(c ORDER BY source_version) FROM ${NS}.current_inputs c WHERE c.source_id=s.id) AS current_input
  FROM canonical_v4.sources s WHERE id=$1`,[job.data[4]])).rows;
 assert.deepEqual(after,before);
 const retired=(await r.admin.query(`SELECT generation,operation_id,kind FROM ${NS}.retired_operations WHERE generation=$1 AND operation_id=$2`,[job.generation,job.operationId])).rows;
 assert.deepEqual(retired,[{generation:job.generation,operation_id:job.operationId,kind:plan.mode}]);
}
export async function committedScopedTuple(r,job,receipt,history){
 const rows=(await r.admin.query(`SELECT s.id,s.url,s.title,s.extractor_version,s.operation_id,s.write_version::text AS source_version,s.payload::jsonb AS payload,
  e.model_id,encode(array_send(e.values_double),'hex') AS body_wire,t.stamp,c.topic_id,c.discussion_id,l.topic_id AS linked_topic,
  o.operation_id AS canonical_operation,o.operation_digest,
  coalesce(u.command_hash,a.operation_digest) AS expected_digest,j.state,j.receipt
  FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
  JOIN canonical_v4.runtime_source_stamps t ON t.source_id=s.id JOIN ${NS}.containers c ON c.source_id=s.id
  JOIN canonical_v4.source_links l ON l.source_id=s.id JOIN canonical_v4.operation_receipts o ON o.source_id=s.id
  JOIN ${NS}.jobs j ON j.generation=$2 AND j.operation_id=$3
  LEFT JOIN ${NS}.operations u ON u.operation_id=j.operation_id LEFT JOIN ${NS}.receipts a ON a.operation_id=j.operation_id WHERE s.id=$1`,[receipt.sourceId,job.generation,job.operationId])).rows;
 assert.equal(rows.length,1);const row=rows[0],material=JSON.parse(job.data[3]);
 assert.equal(row.id,job.data[4]);assert.equal(row.url,material.url);assert.equal(row.title,material.title);assert.equal(row.extractor_version,material.extractorVersion);assert.equal(row.model_id,material.modelId);
 assert.equal(row.source_version,receipt.sourceVersion);assert.equal(row.operation_id,job.operationId);assert.equal(row.canonical_operation,job.operationId);assert.equal(row.operation_digest,row.expected_digest);assert.match(row.operation_digest,/^[a-f0-9]{64}$/u);
 assert.equal(row.stamp,job.data[8]);assert.equal(row.topic_id,receipt.topicId);assert.equal(row.linked_topic,receipt.topicId);assert.equal(row.discussion_id,receipt.discussionId);assert.equal(row.state,'complete');assert.deepEqual(row.receipt,receipt);
 assert.equal(row.payload.title,material.title);assert.equal(row.payload.url,material.url);assert.equal(row.payload.operationId,job.operationId);assert.deepEqual(row.payload.topicIds,[receipt.topicId]);assert.equal(sha(Buffer.from(row.body_wire,'hex')),material.bodyWireHash);
 const versions=(await r.admin.query(`SELECT i.source_version::text AS source_version,i.material,i.input_hash,i.witness_hash,i.body_wire_hash,i.title_wire_hash,i.source_stamp,
  encode(array_send(i.body_values),'hex') AS body_wire,encode(array_send(i.title_values),'hex') AS title_wire,
  c.source_version::text AS current_version,c.decision_hash FROM ${NS}.input_versions i
  LEFT JOIN ${NS}.current_inputs c ON c.source_id=i.source_id AND c.source_version=i.source_version WHERE i.source_id=$1 ORDER BY i.source_version`,[receipt.sourceId])).rows;
 assert.equal(versions.length,history.length);assert.equal(String(history.length),receipt.sourceVersion);
 for(const [index,version]of versions.entries()){
  const expected=JSON.parse(history[index][3]);assert.equal(version.source_version,String(index+1));assert.deepEqual(JSON.parse(version.material),expected);assert.equal(version.source_stamp,history[index][8]);
  assert.equal(version.body_wire_hash,expected.bodyWireHash);assert.equal(version.title_wire_hash,expected.titleWireHash);assert.equal(sha(Buffer.from(version.body_wire,'hex')),expected.bodyWireHash);assert.equal(sha(Buffer.from(version.title_wire,'hex')),expected.titleWireHash);
  if(index===versions.length-1){assert.equal(version.current_version,receipt.sourceVersion);assert.equal(version.input_hash,receipt.inputHash);assert.equal(version.witness_hash,receipt.witnessHash);assert.equal(version.decision_hash,receipt.decisionHash);}else{assert.equal(version.current_version,null);assert.equal(version.decision_hash,null);}
 }
 return {sourceId:row.id,sourceVersion:row.source_version,topicId:row.topic_id,discussionId:row.discussion_id,historyVersions:versions.length};
}
async function elapsedDeadline(r,j,lease=false){const start=performance.now();for(let i=0;i<200;i++){r.budget(false);const row=(await r.admin.query(`SELECT clock_timestamp()>=${lease?'j.lease_until':'a.deadline'} AS expired FROM ${NS}.jobs j JOIN ${NS}.authorities a USING(generation,operation_id) WHERE j.generation=$1 AND j.operation_id=$2`,[j.generation,j.operationId])).rows[0];if(row?.expired)return;if(performance.now()-start>2000)break;await delay(15);}fail('EXPIRY_NOT_OBSERVED');}
async function newUpdate(r,suffix,options){const base=await r.admitted(suffix+'-base',options);const update=await r.update(base.job,base.receipt,suffix+'-change',{bodyHash:hash(9)});return {...base,update};}
/** Fixture preparation only. Exact literal inputs precede every collaborator.
 * Update cases reuse the already checked distinct base/change construction. */
export async function prepareClearCaseFixture(r,other,clearFirst){
 if(!['enqueue','post','update'].includes(other)||typeof clearFirst!=='boolean')fail('CASE_IDENTITY');
 const suffix='clear-'+other+'-'+clearFirst;
 if(other==='update'){const base=await newUpdate(r,suffix);return {...base,queued:base.update};}
 return {...await r.admitted(suffix),queued:undefined};
}
async function nativeCases(r){
 await r.case('legacy-apply-held-admission-update-reply',async()=>{
  const base=await r.admitted('overlap-base'),update=await r.update(base.job,base.receipt,'overlap-change',{bodyHash:hash(9)}),admission=await r.queued('overlap-admission',{claim:false,principal:OTHER});
  // Revoke this preflight reservation: the actual admission below must enqueue
  // while legacy apply is held, not merely complete an earlier reservation.
  await call(r.app,'revoke',[admission.generation,admission.operationId,OTHER,admission.commandHash]);await call(r.worker,'cleanup',[admission.generation,admission.operationId,OTHER,admission.commandHash]);
  const legacy=createCanonicalV4IngestionRepository({database:explicitAdapter(r.crawler),nextId:kind=>'legacy-'+kind+'-held',now:()=>STAMP});
  const v=await r.version(),request={expected:{generation:v.generation,revision:Number(v.revision)},operationId:'legacy-operation-held',url:'https://example.org/adr167/legacy-held',title:'Synthetic exact scan',embedding:{modelId:MODEL,values:[...UNIT]},extractorVersion:'main-text-prefix/v1'};
  await legacy.enqueueCrawler(request,{authorityToken:'synthetic-legacy-authority',authoritySeconds:30});
  const workerRepo=createCanonicalV4IngestionRepository({database:explicitAdapter(r.worker),nextId:kind=>'legacy-'+kind+'-held',now:()=>STAMP});
  const claim=await workerRepo.claim({workerId:'legacy-worker-held',leaseToken:'legacy-token-held',leaseSeconds:30});assert.equal(claim.operationId,request.operationId);
  const marker='  -- The watermark is the last shared canonical row acquired.';
  await r.instrument(legacySignature,marker,'  PERFORM pg_catalog.pg_advisory_xact_lock(914092167,1);\n');
  let ar,ur,reply,committedTuples;
  try{const legacyResult=await r.barrier(1,()=>workerRepo.apply(claim,{representedValues:[...UNIT]}),r.worker,async()=>{
   await assert.rejects(transaction(r.owner,tx=>tx.query('SELECT 1 FROM canonical_v4.catalog_ingest_lane WHERE singleton FOR UPDATE NOWAIT')),e=>e.code==='55P03');
   // The actual legacy scan matched the actual seeded legacy reference.
   await assert.rejects(transaction(r.owner,tx=>tx.query('SELECT 1 FROM canonical_v4.topics WHERE id=$1 FOR UPDATE NOWAIT',[r.legacyReference.topicId])),e=>e.code==='55P03');
   const j=await r.queued('overlap-live-admission',{principal:OTHER,claim:false});const c=await call(r.worker2,'claim',[j.generation,j.operationId,j.principal,j.commandHash,j.worker,j.token,15]);j.epoch=c.epoch;ar=await r.complete(j,r.worker2);
   ur=await r.complete(update,r.worker2);
   reply=await r.reply({discussionId:r.fixture.discussionA},r.fixture.historicalRoot,'overlap-unrelated',r.app2);
   assert.equal(ur.topicId,base.receipt.topicId);assert.equal(ur.discussionId,base.receipt.discussionId);
   const admittedTuple=await committedScopedTuple(r,j,ar,[j.data]),updatedTuple=await committedScopedTuple(r,update,ur,[base.job.data,update.data]);
   const replyTuple=await immutablePostTuple(r,reply.result.contributionId);assert.equal(replyTuple.id,reply.result.contributionId);assert.equal(replyTuple.discussion_id,r.fixture.discussionA);assert.equal(replyTuple.root_id,r.fixture.historicalRoot);assert.equal(replyTuple.author_id,OTHER);assert.equal(replyTuple.revisions[0].body,'Synthetic reply overlap-unrelated');
   const destination=(await r.admin.query('SELECT topic_id FROM canonical_v4.discussions WHERE id=$1',[replyTuple.discussion_id])).rows;
   assert.deepEqual(destination,[{topic_id:r.fixture.topicA}]);assert.notEqual(r.fixture.topicA,r.legacyReference.topicId);assert.notEqual(r.fixture.topicA,ur.topicId);assert.notEqual(r.fixture.topicA,ar.topicId);
   committedTuples={admission:admittedTuple,update:updatedTuple,replyId:replyTuple.id,replyTopic:r.fixture.topicA};
   assert.ok(Number(ar.version.revision)<Number(ur.version.revision));assert.ok(Number(ur.version.revision)<Number(reply.version.revision));
  });assert.ok(Number(legacyResult.version.revision)>Number(reply.version.revision));assert.equal(legacyResult.topicId,r.legacyReference.topicId);
   return {legacySource:legacyResult.sourceId,legacyTopic:r.legacyReference.topicId,updatingTopic:base.receipt.topicId,replyTopic:r.fixture.topicA,committedTuplesWhileHeld:committedTuples,revisions:[ar.version.revision,ur.version.revision,reply.version.revision,legacyResult.version.revision]};
  }finally{await r.restore();}
 });
 await r.case('scoped-held-growth-enqueue',async()=>{
  const j=await r.queued('scoped-held',{principal:OTHER}),otherInput=await r.input('enqueue-during-scoped');
  await r.instrument(NS+'.before_publish()',` SELECT * INTO a FROM ${NS}.authorities WHERE generation=c.generation`,
   ` IF c.operation_id=${literal(j.operationId)} THEN PERFORM pg_catalog.pg_advisory_xact_lock(914092167,2);END IF;\n`);
  try{return await r.barrier(2,()=>r.complete(j),r.worker,async()=>{
   await transaction(r.owner,async tx=>assert.equal((await tx.query('SELECT pg_try_advisory_xact_lock(914092008,1) AS available')).rows[0].available,true));
   const p=prepareFastAdmission(otherInput).parameters;const q=await call(r.app2,'enqueue',['actor',ACTOR,'admission',JSON.stringify(p),30,hash(8)]);assert.equal(q.state,'pending');
  });}finally{await r.restore();}
 });
 await r.case('last-watermark-contention',async()=>{
  const j=await r.queued('watermark-last');
  await runMeasuredBarrier({acquire:async()=>{await r.admin.query('BEGIN');try{await r.admin.query('SELECT 1 FROM canonical_v4.runtime_state WHERE singleton FOR UPDATE');}catch(error){try{await r.admin.query('ROLLBACK');}catch{}throw error;}},
   action:()=>r.complete(j),observe:()=>r.ownWait(r.worker,r.admin),during:async()=>{},release:()=>r.admin.query('COMMIT')});
  assert.equal(await r.exists(j),1);
 });
 await r.case('native-slot-snapshot-race',()=>nativeSlotRace(r));
 await r.case('update-before-root-reply',async()=>{const b=await newUpdate(r,'update-first');const next=await r.complete(b.update);const root=await r.root(next,'after-update');await r.reply(next,root.result.contributionId,'after-update');assert.equal(next.topicId,b.receipt.topicId);});
 await r.case('root-reply-before-update',async()=>{const b=await newUpdate(r,'root-first');const root=await r.root(b.receipt,'before-update');await r.reply(b.receipt,root.result.contributionId,'before-update');const before=await immutablePostTuple(r,root.result.contributionId);assert.equal(before.revisions[0].body,'Synthetic root before-update');await r.complete(b.update);assert.deepEqual(await immutablePostTuple(r,root.result.contributionId),before);await r.reply(b.receipt,root.result.contributionId,'after-pin');});
 for(const first of [true,false])await r.case(first?'root-replay-before-topic-delete':'topic-delete-before-root-replay',async()=>{const b=await r.admitted(first?'root-replay-first':'topic-delete-first');await r.root(b.receipt,'replay-'+first);if(first)await r.root(b.receipt,'replay-'+first);await r.lifecycle({type:'delete-learned-topic',topicId:b.receipt.topicId,confirmation:'DELETE TOPIC AND DISCUSSION'});await assert.rejects(r.root(b.receipt,'replay-'+first));await assert.rejects(call(r.app,'enqueue',['actor',ACTOR,'admission',JSON.stringify(b.job.data),30,hash(8)]));await absent(r,b.job);});
 for(const kind of ['forget','account-withdraw','revoke'])for(const completionFirst of [true,false]){
  const name=completionFirst?'completion-before-'+kind:kind+'-before-completion';await r.case(name,async()=>{
   const b=await newUpdate(r,name,{principal:kind==='account-withdraw'?OTHER:ACTOR});
   if(kind==='account-withdraw')await r.root(b.receipt,'account-withdraw-'+completionFirst,OTHER);
   const erase=async()=>{if(kind==='forget')return r.lifecycle({type:'forget-source',sourceId:b.receipt.sourceId});
    if(kind==='account-withdraw'){const base=explicitAdapter(r.app);const adapter={...base,query:(sql,args)=>transaction(r.app,()=>r.app.query(sql,args))};return createCanonicalV4LifecycleRepository({database:adapter}).withdrawAccountContributions(OTHER);}
    return call(r.app,'revoke',[b.update.generation,b.update.operationId,b.update.principal,b.update.commandHash]);};
   if(completionFirst){await r.complete(b.update);const outcome=await erase();if(kind==='revoke')assert.equal(outcome,false);}
   else{await erase();if(kind==='revoke'){await call(r.worker,'cleanup',[b.update.generation,b.update.operationId,b.update.principal,b.update.commandHash]);await assert.rejects(r.complete(b.update));}else await assert.rejects(r.complete(b.update));}
   if(kind==='forget')await absent(r,b.job);
   if(kind==='account-withdraw')assert.equal(Number((await r.admin.query(`SELECT count(*) AS n FROM ${NS}.jobs WHERE principal=$1`,[OTHER])).rows[0].n),0);
   if(kind==='forget'||kind==='account-withdraw'){
    await assertErasedReplay(r,b.job,name+'-admission');await assertErasedReplay(r,b.update,name+'-update');
    if(kind==='forget')await absent(r,b.job);
   }
  });
 }
 for(const other of ['enqueue','post','update'])for(const clearFirst of [true,false])await r.case(clearFirst?'clear-before-'+other:other+'-before-clear',async()=>{
  const b=await prepareClearCaseFixture(r,other,clearFirst);let queued=b.queued;
  const action=async()=>{if(other==='enqueue'){const p=prepareFastAdmission({...b.job.input,operationId:'clear-capture-'+clearFirst}).parameters;return call(r.app,'enqueue',['actor',ACTOR,'admission',JSON.stringify(p),30,hash(8)]);}if(other==='post')return r.root(b.receipt,'clear-post-'+clearFirst);return r.complete(queued);};
  if(!clearFirst&&other==='enqueue'){queued=await r.queued('clear-pending-new-'+clearFirst,{claim:false});}
  else if(!clearFirst)await action();
  await r.lifecycle({type:'clear-learned-data',confirmation:'CLEAR LEARNED DATA'});
  if(clearFirst)await assert.rejects(action());else if(queued)await assert.rejects(call(r.app,'enqueue',['actor',ACTOR,queued.data.length===15?'update':'admission',JSON.stringify(queued.data),30,hash(8)]));
  await absent(r,b.job);assert.equal(Number((await r.admin.query(`SELECT count(*) AS n FROM ${NS}.final_intents`)).rows[0].n),0);
 });
 await r.case('legacy-implicit-lifecycle-negative',async()=>{const b=await r.admitted('implicit-lifecycle');await r.root(b.receipt,'implicit-lifecycle');await assert.rejects(r.lifecycle({type:'forget-source',sourceId:b.receipt.sourceId},{implicit:true}));assert.equal(await r.exists(b.job),1);await r.lifecycle({type:'forget-source',sourceId:b.receipt.sourceId});await absent(r,b.job);});
 await protocolCases(r);await replayCases(r);
}

async function nativeSlotRace(r){
 const waiter=await r.queued('slot-waiter',{principal:ACTOR}),occupant=await r.queued('slot-occupant',{principal:OTHER});
 await r.owner.query(`CREATE FUNCTION ${NS}.diag_slot_snapshot_pause() RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(914092167,3);RETURN true;END $$;REVOKE ALL ON FUNCTION ${NS}.diag_slot_snapshot_pause() FROM PUBLIC;
 CREATE TABLE ${NS}.diag_slot_trace(operation_id text,slot integer,occupied boolean)`);
 const marker='  SELECT s.slot INTO proof_slot FROM '+NS+'.finalization_slots s';
 await r.instrument(completeSignature,marker,`  WITH snapshot_pause AS MATERIALIZED(SELECT CASE WHEN p_operation=${literal(waiter.operationId)} THEN ${NS}.diag_slot_snapshot_pause() ELSE true END AS ready)\n`);
 await r.instrument(completeSignature,'NOT(s.slot=ANY(visited_slots))',`(SELECT ready FROM snapshot_pause) AND `);
 await r.instrument(completeSignature,`  IF NOT EXISTS(SELECT 1 FROM ${NS}.final_intents WHERE slot=proof_slot) THEN EXIT;END IF;`,
  `  INSERT INTO ${NS}.diag_slot_trace SELECT p_operation,proof_slot,EXISTS(SELECT 1 FROM ${NS}.final_intents WHERE slot=proof_slot);\n`);
 // The CTE is evaluated in this SAME selection statement's snapshot, before
 // LockRows, not by a preceding PERFORM with a different command snapshot.
 const query=`WITH snapshot_pause AS MATERIALIZED(SELECT ${NS}.diag_slot_snapshot_pause() AS ready) SELECT s.slot FROM ${NS}.finalization_slots s WHERE (SELECT ready FROM snapshot_pause) AND NOT(s.slot=ANY(ARRAY[]::integer[])) AND NOT EXISTS(SELECT 1 FROM ${NS}.final_intents i WHERE i.slot=s.slot) ORDER BY s.slot FOR UPDATE OF s SKIP LOCKED LIMIT 1`;
 const plan=(await r.owner.query('EXPLAIN (FORMAT JSON) '+query)).rows[0]['QUERY PLAN'];const nodes=[];function visit(node){if(!node||typeof node!=='object')return;if(node['Node Type'])nodes.push(node['Node Type']);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}visit(plan);
 assert.ok(nodes.includes('LockRows'));assert.ok(nodes.includes('CTE Scan'));assert.ok(JSON.stringify(plan).includes('snapshot_pause'));
 try{let occupied;const accepted=await r.barrier(3,()=>r.complete(waiter,r.worker),r.worker,async()=>{occupied=await r.complete(occupant,r.worker2);});
  const slots=(await r.admin.query(`SELECT operation_id,slot FROM ${NS}.final_intents WHERE operation_id=ANY($1::text[]) ORDER BY operation_id`,[[waiter.operationId,occupant.operationId]])).rows;assert.equal(slots.length,2);assert.notEqual(slots[0].slot,slots[1].slot);assert.equal(await r.exists(waiter),1);
  const trace=(await r.admin.query(`SELECT slot,occupied FROM ${NS}.diag_slot_trace WHERE operation_id=$1 ORDER BY slot`,[waiter.operationId])).rows;
  const occupiedSlot=slots.find(s=>s.operation_id===occupant.operationId).slot,acceptedSlot=slots.find(s=>s.operation_id===waiter.operationId).slot;
  assert.deepEqual(trace,[{slot:occupiedSlot,occupied:true},{slot:acceptedSlot,occupied:false}]);
  return {planNodes:nodes,slots,trace,waiterSource:accepted.sourceId,occupantSource:occupied.sourceId,isolation:'read committed'};
 }finally{await r.restore();await r.owner.query(`DROP FUNCTION ${NS}.diag_slot_snapshot_pause();DROP TABLE ${NS}.diag_slot_trace`);}
}

// These cases use actual pg protocol messages only when the separately gated
// native runner is invoked. Merely importing this module does not execute them.
async function rolledBack(r,j){
 await absent(r,j);
 const row=(await r.admin.query(`SELECT j.state,a.accepted FROM ${NS}.jobs j JOIN ${NS}.authorities a USING(generation,operation_id) WHERE j.generation=$1 AND j.operation_id=$2`,[j.generation,j.operationId])).rows[0];
 assert.deepEqual(row,{state:'leased',accepted:false});
 assert.equal(Number((await r.admin.query(`SELECT count(*) AS n FROM ${NS}.final_intents WHERE generation=$1 AND operation_id=$2`,[j.generation,j.operationId])).rows[0].n),0);
}
async function immutablePostTuple(r,id){return (await r.admin.query(`SELECT c.id,c.author_id,c.discussion_id,c.root_id,c.created_at,
 (SELECT jsonb_agg(v.payload::jsonb ORDER BY v.ordinal) FROM canonical_v4.revisions v WHERE v.contribution_id=c.id) AS revisions
 FROM canonical_v4.contributions c WHERE c.id=$1`,[id])).rows[0];}
async function failedCommit(r,j,{commit='COMMIT',before=null,after=null,codes=['P2305'],extended=true}={}){
 await r.worker.query('BEGIN');
 try{
  if(before)await before(r.worker);
  await r.worker.query(completionSQL(j,extended));
  if(after)await after(r.worker);
  await r.worker.query(commit);
  fail('NEGATIVE_PROBE');
 }catch(e){assert.ok(codes.includes(e.code),'Expected finite commit-boundary SQLSTATE');}
 finally{await r.worker.query('ROLLBACK');}
 await rolledBack(r,j);
}
async function protocolCases(r){
 for(const [name,commit,extendedCommit] of [
  ['literal-COMMIT-simple','COMMIT',false],['literal-COMMIT-semicolon','COMMIT;',false],['literal-COMMIT-extended','COMMIT',true],
 ])await r.case(name,async()=>{
  const j=await r.queued(name);
  const receipt=await transaction(r.worker,async()=> (await r.worker.query(completionSQL(j,!name.endsWith('simple')))).rows[0].result,
   extendedCommit?{text:commit,queryMode:'extended'}:commit);
  assert.equal(await r.exists(j),1);assert.equal(receipt.sourceId,j.data[4]);
  const proof=(await r.admin.query(`SELECT finalized_at IS NOT NULL AS finalized,finalized_at<deadline AND finalized_at<lease_until AS timely FROM ${NS}.final_intents WHERE operation_id=$1`,[j.operationId])).rows[0];
  assert.deepEqual(proof,{finalized:true,timely:true});return {commitProtocol:extendedCommit?'extended':'simple',completionProtocol:name.endsWith('simple')?'simple':'extended'};
 });
 for(const [name,commit] of [
  ['unsupported-lowercase','commit'],['unsupported-END','END'],['unsupported-WORK','COMMIT WORK'],['unsupported-CHAIN','COMMIT AND CHAIN'],
  ['unsupported-comment','/* fixture */COMMIT'],['unsupported-multistatement','COMMIT; SELECT 1'],['unsupported-PREPARE',"PREPARE TRANSACTION 'adr167_fixture_unsupported'"],
 ])await r.case(name,async()=>failedCommit(r,await r.queued(name),{commit,codes:name==='unsupported-PREPARE'?['P2305','55000']:['P2305']}));
 for(const extended of [false,true])await r.case(extended?'implicit-extended':'implicit-simple',async()=>{
  const j=await r.queued(extended?'implicit-extended':'implicit-simple');
  await assert.rejects(r.worker.query(completionSQL(j,extended)),e=>e.code==='P2305');await rolledBack(r,j);
 });
 await r.case('constraints-before',async()=>failedCommit(r,await r.queued('constraints-before'),{before:c=>c.query('SET CONSTRAINTS ALL IMMEDIATE')}));
 await r.case('constraints-after',async()=>failedCommit(r,await r.queued('constraints-after'),{after:c=>c.query('SET CONSTRAINTS ALL IMMEDIATE')}));
 await r.case('constraints-during',async()=>{
  const j=await r.queued('constraints-during');
  await r.owner.query(`CREATE FUNCTION ${NS}.diag_early_flush() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN SET CONSTRAINTS ALL IMMEDIATE;RETURN NEW;END $$;
   REVOKE ALL ON FUNCTION ${NS}.diag_early_flush() FROM PUBLIC;
   CREATE TRIGGER diag_early_flush BEFORE INSERT ON canonical_v4.sources FOR EACH ROW WHEN(NEW.id=${literal(j.data[4])}) EXECUTE FUNCTION ${NS}.diag_early_flush()`);
  try{await failedCommit(r,j);}finally{await r.owner.query(`DROP TRIGGER diag_early_flush ON canonical_v4.sources;DROP FUNCTION ${NS}.diag_early_flush()`);}
 });
 await r.case('savepoint-late-commit',async()=>{
  const j=await r.queued('savepoint-late-commit',{seconds:1});
  await failedCommit(r,j,{codes:['P2306'],after:async c=>{
   await c.query('SAVEPOINT before_early_flush');
   await assert.rejects(c.query('SET CONSTRAINTS ALL IMMEDIATE'),e=>e.code==='P2305');
   await c.query('ROLLBACK TO SAVEPOINT before_early_flush');await elapsedDeadline(r,j);
  }});
 });
 await r.case('nested-literal-red-depth-green',()=>nestedProtocol(r));
}

async function savedDefinition(r,signature){return (await r.owner.query('SELECT pg_get_functiondef($1::regprocedure) AS body',[signature])).rows[0].body;}
async function replaceFixtureDefinition(r,signature,original,changed){
 assert.notEqual(original,changed);assert.equal(await savedDefinition(r,signature),original);
 await r.verifyFixture(r.owner,true);r.restores.push({signature,old:original});await r.owner.query(changed);
 r.report.instrumentation.push({signature,before:sha(original),after:sha(changed),kind:'declared-adversarial-fixture'});
}
async function nestedProtocol(r){
 const signature=NS+'.finalize_commit()',gateSignature=NS+'.enter_gate(boolean)';
 const original=await savedDefinition(r,signature),gate=await savedDefinition(r,gateSignature);
 const depth=' OR pg_catalog.pg_trigger_depth()<>1';assert.equal(original.split(depth).length,2);
 const entry=" IF pg_catalog.pg_trigger_depth()<>0 THEN RAISE EXCEPTION 'External trigger entry rejected' USING ERRCODE='P2301';END IF;";
 assert.equal(gate.split(entry).length,2);
 await r.owner.query(`CREATE TABLE ${NS}.diag_commit_callback(id integer PRIMARY KEY,g text,op text,principal text,h text,worker text,token text,epoch integer);
 CREATE FUNCTION ${NS}.diag_nested_flush() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 PERFORM ${NS}.complete(NEW.g,NEW.op,NEW.principal,NEW.h,NEW.worker,NEW.token,NEW.epoch);
 SET CONSTRAINTS ${NS}.scoped_authorized_commit IMMEDIATE;
 PERFORM pg_catalog.pg_sleep(1);RETURN NULL;END $$;
 REVOKE ALL ON FUNCTION ${NS}.diag_nested_flush() FROM PUBLIC;
 CREATE CONSTRAINT TRIGGER diag_nested_first AFTER INSERT ON ${NS}.diag_commit_callback DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${NS}.diag_nested_flush()`);
 const insert=(j,id)=>r.owner.query(`INSERT INTO ${NS}.diag_commit_callback VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,j.generation,j.operationId,j.principal,j.commandHash,j.worker,j.token,j.epoch]);
 try{
  // Remove the separate entry fence equally in both branches, isolating the
  // finalizer's depth defense. No serving role owns or creates this callback.
  await replaceFixtureDefinition(r,gateSignature,gate,gate.replace(entry,''));
  const red=await r.queued('nested-red');
  await replaceFixtureDefinition(r,signature,original,original.replace(depth,''));
  await r.owner.query(`UPDATE ${NS}.authorities SET deadline=clock_timestamp()+interval '0.75 seconds' WHERE operation_id=$1`,[red.operationId]);
  await transaction(r.owner,()=>insert(red,1));assert.equal(await r.exists(red),1);
  assert.equal((await r.admin.query(`SELECT deadline<clock_timestamp() AS expired FROM ${NS}.authorities WHERE operation_id=$1`,[red.operationId])).rows[0].expired,true);
  // Restore only the finalizer first; retain the same entry-fence fixture in
  // the green branch so the intrinsic depth check is the decisive difference.
  await r.owner.query(original);
  const green=await r.queued('nested-green');
  await assert.rejects(transaction(r.owner,()=>insert(green,2)),e=>e.code==='P2305');await rolledBack(r,green);
  assert.equal(Number((await r.admin.query(`SELECT count(*) AS n FROM ${NS}.diag_commit_callback WHERE id=2`)).rows[0].n),0);
  return {literalOnlyAcceptedExpired:true,intrinsicDepthRejected:true};
 }finally{await r.restore();await r.owner.query(`DROP TABLE ${NS}.diag_commit_callback;DROP FUNCTION ${NS}.diag_nested_flush()`);}
}

async function replayCases(r){
 for(const lease of [false,true])await r.case(lease?'lease-expired-after-mutation':'authority-expired-after-mutation',async()=>{
  const j=await r.queued(lease?'lease-expired':'authority-expired',{seconds:lease?30:1,leaseSeconds:lease?1:15});
  await failedCommit(r,j,{codes:['P2306'],after:()=>elapsedDeadline(r,j,lease)});
 });
 await r.case('stale-epoch-after-reclaim',async()=>{
  const j=await r.queued('reclaim-native',{leaseSeconds:1});
  const authority=await authorityDeadline(r,j);await elapsedDeadline(r,j,true);
  const next={...j,token:'native-reclaimed-token'};
  const claim=await call(r.worker,'claim',[next.generation,next.operationId,next.principal,next.commandHash,next.worker,next.token,15]);
  next.epoch=claim.epoch;assert.equal(next.epoch,j.epoch+1);assert.equal(await authorityDeadline(r,j),authority);
  await assert.rejects(r.complete(j),e=>e.code==='P2302');
  await r.complete(next);assert.equal(await r.exists(j),1);assert.equal(await authorityDeadline(r,j),authority);
  return {originalEpoch:j.epoch,acceptedEpoch:next.epoch,originalAuthorityPreserved:true};
 });
 await r.case('lost-response-reconciliation',async()=>{
  const j=await r.queued('discarded-response');const before=await r.version();
  // Deliberately discard one successful acknowledgement. No second mutation
  // is issued to discover its outcome; this is not a real socket-loss claim.
  await r.complete(j);
  const state=(await r.admin.query(`SELECT j.state,j.command_hash,j.receipt,a.accepted FROM ${NS}.jobs j JOIN ${NS}.authorities a USING(generation,operation_id) WHERE j.generation=$1 AND j.operation_id=$2`,[j.generation,j.operationId])).rows[0];
  assert.equal(state.state,'complete');assert.equal(state.command_hash,j.commandHash);assert.equal(state.accepted,true);assert.equal(state.receipt.sourceId,j.data[4]);
  assert.equal(await r.exists(j),1);assert.equal(Number((await r.version()).revision),Number(before.revision)+1);
  const exact=(await r.admin.query('SELECT operation_id FROM canonical_v4.operation_receipts WHERE source_id=$1',[j.data[4]])).rows;
  assert.deepEqual(exact,[{operation_id:j.operationId}]);
  return {simulatedDiscardedAcknowledgement:true,completionCalls:1,reconciliationOnly:true,realTransportLossTested:false};
 });
 await r.case('ABC-replay-no-rewind',async()=>{
  const a=await r.admitted('history-a');const root=await r.root(a.receipt,'history-a');
  const post=await immutablePostTuple(r,root.result.contributionId);
  const binding=(await r.admin.query(`SELECT * FROM ${NS}.root_snapshots WHERE root_id=$1`,[root.result.contributionId])).rows[0];
  const bj=await r.update(a.job,a.receipt,'history-b',{bodyHash:hash(9)}),b=await r.complete(bj);
  const cj=await r.update(a.job,b,'history-c',{bodyHash:hash(8)}),c=await r.complete(cj);
  assert.equal(c.sourceVersion,'3');
  const replay=await call(r.app,'enqueue',['actor',bj.principal,'update',JSON.stringify(bj.data),30,hash(8)]);
  assert.equal(replay.state,'complete');assert.deepEqual(replay.receipt,b);
  assert.equal((await r.admin.query(`SELECT source_version::text AS v FROM ${NS}.current_inputs WHERE source_id=$1`,[c.sourceId])).rows[0].v,'3');
  await assert.rejects(r.root(b,'stale-history'));
  assert.deepEqual(await immutablePostTuple(r,root.result.contributionId),post);
  assert.deepEqual((await r.admin.query(`SELECT * FROM ${NS}.root_snapshots WHERE root_id=$1`,[root.result.contributionId])).rows[0],binding);
  await r.reply(c,root.result.contributionId,'history-reply');
  return {versions:[a.receipt.sourceVersion,b.sourceVersion,c.sourceVersion],replayVersion:replay.receipt.sourceVersion,currentVersion:'3',originalDestinationPreserved:true};
 });
 await r.case('changed-actor-proof-conflict',async()=>{
  const a=await r.admitted('external-command-conflicts');
  for(const [principal,proof,data] of [[OTHER,hash(8),a.job.data],[ACTOR,hash(9),a.job.data],[ACTOR,hash(8),a.job.data.map((v,i)=>i===11?'nature':v)]]){
   await assert.rejects(call(r.app,'enqueue',['actor',principal,'admission',JSON.stringify(data),30,proof]),e=>e.code==='P2302');
  }
  const allocation=[...a.job.data];allocation[4]='unused-native-source';allocation[5]='unused-native-topic';allocation[6]='unused-native-discussion';allocation[7]='2026-10-20T13:00:00.000Z';
  const same=await call(r.app,'enqueue',['actor',ACTOR,'admission',JSON.stringify(allocation),30,hash(8)]);assert.deepEqual(same.receipt,a.receipt);
  assert.equal(Number((await r.admin.query("SELECT count(*) AS n FROM canonical_v4.id_registry WHERE id IN('unused-native-source','unused-native-topic','unused-native-discussion')")).rows[0].n),0);
 });
 await r.case('final-wires-tuples-retirement',async()=>{
  const a=await r.admitted('final-wire-check');
  const wires=(await r.admin.query(`SELECT encode(array_send(i.body_values),'hex') AS body,encode(array_send(i.title_values),'hex') AS title,encode(array_send(e.values_double),'hex') AS canonical,
   i.body_wire_hash,i.title_wire_hash FROM ${NS}.inputs i JOIN canonical_v4.embeddings e ON e.source_id=i.source_id WHERE i.source_id=$1`,[a.receipt.sourceId])).rows[0];
  for(const key of ['body','title','canonical'])assert.equal(Object.is(Buffer.from(wires[key],'hex').readDoubleBE(36),-0),true);
  assert.equal(wires.body,wires.canonical);assert.equal(sha(Buffer.from(wires.body,'hex')),pairedVectorWire(UNIT).wireHash);assert.equal(sha(Buffer.from(wires.title,'hex')),wires.title_wire_hash);
  const oldIds=r.baseline.map(x=>x.id),oldSourceIds=r.baselineSources.map(x=>x.id);
  assert.deepEqual((await r.admin.query('SELECT id,author_id,discussion_id,payload,write_version FROM canonical_v4.contributions WHERE id=ANY($1::text[]) ORDER BY id',[oldIds])).rows,r.baseline);
  assert.deepEqual((await r.admin.query('SELECT * FROM canonical_v4.revisions WHERE contribution_id=ANY($1::text[]) ORDER BY contribution_id,ordinal',[oldIds])).rows,r.baselineRevisions);
  assert.deepEqual((await r.admin.query('SELECT * FROM canonical_v4.sources WHERE id=ANY($1::text[]) ORDER BY id',[oldSourceIds])).rows,r.baselineSources);
  const columns=(await r.admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='retired_operations' ORDER BY ordinal_position",[NS])).rows.map(x=>x.column_name);
  assert.deepEqual(columns,['generation','operation_id','kind']);
  assert.ok(Number((await r.admin.query(`SELECT count(*) AS n FROM ${NS}.retired_operations`)).rows[0].n)>0);
  return {bodyArraySend:wires.body,titleArraySend:wires.title,legacyPostsUnchanged:true,legacySourcesUnchanged:true,minimalRetirementColumns:columns};
 });
}
async function authorityDeadline(r,j){const value=(await r.admin.query(`SELECT deadline::text AS deadline FROM ${NS}.authorities WHERE generation=$1 AND operation_id=$2`,[j.generation,j.operationId])).rows[0];assert.ok(value);return value.deadline;}
