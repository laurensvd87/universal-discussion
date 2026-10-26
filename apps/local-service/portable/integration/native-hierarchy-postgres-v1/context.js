// SOURCE only. Actual invocation requires a separately reviewed supervisor and
// decision; neither importing this module nor calling the fixture factory starts
// a cluster. No caller DB/options or callback can activate repository authority.
import {types} from 'node:util';
import {createExclusiveSession} from './session.js';
import {CASES,createAssertionLedger} from './suite.js';
const DATABASES=Object.freeze(['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b']);
const fail=code=>Object.assign(new Error('Owned native fixture refused'),{code});
function code(error){try{if(error&&typeof error==='object'&&!types.isProxy(error)){
 const d=Object.getOwnPropertyDescriptor(error,'code');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[A-Z0-9_]{1,64}$/u.test(d.value))return d.value;
}}catch{}return 'NATIVE_SQL_FAILURE';}
const REQUEST=database=>({database,role:'postgres',applicationName:'murmingle-native-hierarchy-sql',statementTimeoutMs:5000,lockTimeoutMs:3000});
const IDENTITY_SQL=`SELECT current_database() AS database,session_user AS role,
 pg_catalog.host(inet_server_addr()) AS address,inet_server_port() AS port,
 current_setting('server_version_num') AS version,
 extract(epoch FROM pg_postmaster_start_time()) AS started,
 (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid`;
const LOOKUP_SQL='SELECT oid::text AS oid,datname,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1';
function oid(value){if(typeof value!=='string'||!/^[1-9][0-9]{0,9}$/u.test(value)||Number(value)>4294967295)throw fail('NATIVE_DATABASE_OID');return value;}
function identity(value,database,reference){
 if(!value||value.database!==database||value.role!=='postgres'||value.address!=='127.0.0.1'||Number(value.port)!==55433||
  Number(value.version)!==170011||!Number.isFinite(Number(value.started))||Number(value.started)<=0||
  reference&&(Number(value.version)!==reference.version||Number(value.started)!==reference.started))throw fail('NATIVE_SERVER_IDENTITY');
 return Object.freeze({database,role:'postgres',address:'127.0.0.1',port:55433,version:Number(value.version),started:Number(value.started)});
}

/** Trusted pure test seam. Its returned sessions cannot register with the
 * repository factory: only runNativeSqlProof installs that private scope. */
export function createFixtureController({connectFixedRole,getOwnedIdentity,guard}={}){
 if(typeof connectFixedRole!=='function'||typeof getOwnedIdentity!=='function'||typeof guard!=='function')throw fail('NATIVE_DEPENDENCIES');
 let accepting=true,acquiring=false,finished=false,finishing=null,admin=null,server=null,used=0,adminClosed=false;
 const records=[],failures=[];
 function check(){guard();if(!accepting||finished)throw fail('NATIVE_SCOPE_RETIRED');if(failures.length)throw fail('NATIVE_SCOPE_FAILED');}
 async function adminQuery(sql,args=[]){guard();const out=await admin.query(sql,args);guard();return out;}
 async function prove(client,database,reference){
  const registered=identity(getOwnedIdentity(client),database,reference);guard();
  const response=await client.query(IDENTITY_SQL);guard();
  if(response?.rows?.length!==1)throw fail('NATIVE_SERVER_IDENTITY');
  const row=response.rows[0];identity(row,database,registered);return {identity:registered,oid:oid(row.oid)};
 }
 async function lookup(name){const out=await adminQuery(LOOKUP_SQL,[name]);if(!Array.isArray(out?.rows)||out.rows.length>1)throw fail('NATIVE_DATABASE_IDENTITY');return out.rows[0]??null;}
 async function verifyRecord(record){
  identity(getOwnedIdentity(admin),'postgres',server);
  const row=await lookup(record.name);
  if(!row||row.datname!==record.name||row.owner!=='postgres'||oid(row.oid)!==record.oid)throw fail('NATIVE_DATABASE_REPLACED');
 }
 async function retire(record){
  if(record.retiring)return record.retiring;
  record.retiring=(async()=>{
   if(record.session){await record.session.close();if(!record.session.snapshot().closed||record.session.snapshot().pending)throw fail('NATIVE_CLIENT_UNSETTLED');record.closed=true;}
   else if(record.client){await record.client.end();record.closed=true;}
   else record.closed=true;
   if(record.created&&!record.dropped){
    if(record.oid===null)throw fail('NATIVE_DATABASE_UNCERTAIN');await verifyRecord(record);
    const active=await adminQuery('SELECT count(*)::text AS n FROM pg_stat_activity WHERE datid=$1::oid',[record.oid]);
    if(active?.rows?.length!==1||active.rows[0].n!=='0')throw fail('NATIVE_CLIENT_UNSETTLED');
    // Both the identifier and OID belong to this exact fresh cluster. Never
    // FORCE, terminate sessions, drop a prefix, or adopt an existing database.
    await adminQuery('DROP DATABASE '+record.name);record.dropped=true;
    if(await lookup(record.name)!==null)throw fail('NATIVE_DATABASE_DROP_UNVERIFIED');
   }
  })();
  record.retiring.catch(error=>{failures.push(code(error));});return record.retiring;
 }
 async function acquire(){
  check();if(acquiring||used>=2||records.some(r=>!r.dropped))throw fail('NATIVE_FIXTURE_CAPACITY');
  acquiring=true;const record={name:DATABASES[used++],oid:null,created:false,dropped:false,closed:false,client:null,session:null,retiring:null};records.push(record);
  try{
   if(!admin){admin=await connectFixedRole(REQUEST('postgres'),check);check();server=(await prove(admin,'postgres',null)).identity;
    for(const name of DATABASES)if(await lookup(name)!==null)throw fail('NATIVE_DATABASE_ALREADY_EXISTS');
   }
   check();await adminQuery('CREATE DATABASE '+record.name+' TEMPLATE template0');record.created=true;
   const row=await lookup(record.name);if(!row||row.datname!==record.name||row.owner!=='postgres')throw fail('NATIVE_DATABASE_IDENTITY');record.oid=oid(row.oid);
   check();record.client=await connectFixedRole(REQUEST(record.name),check);check();
   const proof=await prove(record.client,record.name,server);if(proof.oid!==record.oid)throw fail('NATIVE_DATABASE_REPLACED');
   record.session=createExclusiveSession(record.client,check);
   await record.session.exec('CREATE EXTENSION vector');
   const extension=await record.session.query("SELECT extname,extversion FROM pg_extension WHERE extname='vector'");
   if(extension?.rows?.length!==1||extension.rows[0].extname!=='vector'||extension.rows[0].extversion!=='0.8.2')throw fail('NATIVE_VECTOR_IDENTITY');
   await record.session.exec('CREATE SCHEMA canonical_v4 AUTHORIZATION postgres');check();
   const session=record.session;
   return {dialect:'pg',query:(...args)=>session.query(...args),exec:(...args)=>session.exec(...args),
    transaction:(...args)=>session.transaction(...args),close:()=>retire(record)};
  }catch(primary){failures.push(code(primary));try{await retire(record);}catch{}throw primary;}
  finally{acquiring=false;}
 }
 function finish(){
  if(finishing)return finishing;accepting=false;
  finishing=Promise.resolve().then(async()=>{
   if(acquiring){failures.push('NATIVE_ACQUISITION_UNSETTLED');return snapshot();}
   for(const record of records)try{await retire(record);}catch{}
   if(admin)try{await admin.end();adminClosed=true;}catch(error){failures.push(code(error));}
   else adminClosed=true;
   finished=true;return snapshot();
  });return finishing;
 }
 function snapshot(){return Object.freeze({status:finished&&used===2&&adminClosed&&!acquiring&&!failures.length&&records.every(r=>r.closed&&r.dropped&&!(r.session?.snapshot().cleanupFailures.length))?'passed':'failed',
  used,accepting,acquiring,finished,adminClosed,server,failures:Object.freeze([...failures]),
  databases:Object.freeze(records.map(r=>Object.freeze({name:r.name,oid:r.oid,created:r.created,closed:r.closed,dropped:r.dropped,
   pending:r.session?.snapshot().pending??0,sessionCleanupFailures:r.session?.snapshot().cleanupFailures??Object.freeze([])})))});}
 return Object.freeze({acquire,finish,snapshot});
}

let activeScope=null,proofUsed=false;
export async function acquireNativeFixture(){
 if(arguments.length||activeScope===null||!activeScope.live)throw fail('NATIVE_NO_OWNED_SCOPE');
 const scope=activeScope,result=await scope.controller.acquire();
 if(activeScope!==scope||!scope.live){try{await result.close();}catch{}throw fail('NATIVE_SCOPE_RETIRED');}
 return result;
}

/** SOURCE-only no-options proof composition. No CLI calls this until a new
 * supervisor, exact catalog/binaries and separate actual decision are accepted. */
export async function runNativeSqlProof(){
 if(arguments.length||proofUsed||activeScope!==null)throw fail('NATIVE_PROOF_ONESHOT');proofUsed=true;
 const {runWithOwnedScopedPostgres,getOwnedIdentity}=await import('./cluster.js');
 const {runAssertions}=await import('../../canonical-v4/experimental/hierarchy-native-postgres-fixture-v1/assertions.js');
 return runWithOwnedScopedPostgres(async connectFixedRole=>{
  let callbackOpen=true,hasPrimary=false,primary;
  const guard=()=>{if(!callbackOpen)throw fail('NATIVE_SCOPE_RETIRED');};
  const controller=createFixtureController({connectFixedRole,getOwnedIdentity,guard}),scope={live:true,controller};
  const ledger=createAssertionLedger({guard});let outer=0,cases=null,cleanup;
  try{
   await runAssertions(async(...args)=>{
    if(outer===1){if(args[0]!==CASES[1].name||ledger.snapshot().cursor!==1)throw fail('ASSERTION_INVENTORY');activeScope=scope;}
    outer++;return ledger.test(...args);
   });cases=ledger.finish();
  }catch(error){hasPrimary=true;primary=error;}
  finally{
   scope.live=false;activeScope=null;cleanup=await controller.finish();callbackOpen=false;
  }
  const observed=ledger.snapshot();
  return {schema:'native-hierarchy-postgres-proof/v1',status:!hasPrimary&&cases?.length===25&&cleanup.status==='passed'&&observed.pending===0?'passed':'failed',
   primary:hasPrimary?code(primary):null,cases:cases??observed.rows,pendingAssertions:observed.pending,cleanup,
   nativeExecuted:true,concurrencyValidated:false,restrictedRoleValidated:false,semanticQualityMeasured:false};
 });
}
