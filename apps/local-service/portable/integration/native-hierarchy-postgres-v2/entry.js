// Fixed native proof entry SOURCE. Import and invalid CLI requests are inert.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {CASES} from './suite.js';
const NAMES=['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'];
const failed=()=>Object.assign(new Error('Native result projection refused'),{code:'NATIVE_RESULT_CONTRACT'});
const own=(v,key)=>{if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)throw failed();const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!Object.hasOwn(d,'value'))throw failed();return d.value;};
const bool=v=>{if(typeof v!=='boolean')throw failed();return v;};
const uint=(v,max=0xffffffff)=>{if(!Number.isSafeInteger(v)||v<0||v>max)throw failed();return v;};
const member=(v,values)=>{if(typeof v!=='string'||!values.includes(v))throw failed();return v;};
const finiteCode=v=>{if(typeof v!=='string'||!/^[A-Z0-9_]{1,64}$/u.test(v))throw failed();return v;};
function items(value,max){
 if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype)throw failed();
 const n=uint(Object.getOwnPropertyDescriptor(value,'length').value,max);if(Reflect.ownKeys(value).length!==n+1)throw failed();
 const out=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))throw failed();out.push(d.value);}return out;
}
const codes=value=>items(value,64).map(finiteCode);

/** Pure finite projection; never serializes arbitrary provider errors, passwords,
 * SQL text, filesystem paths or unused lifecycle metadata. */
export function projectEntryResult(lifecycle){
 const checks=own(lifecycle,'checks'),cleanup=own(lifecycle,'cleanup'),server=own(lifecycle,'server');
 const rawCases=items(own(checks,'cases'),25),databaseCleanup=own(checks,'cleanup');
 const cases=rawCases.map(r=>({name:member(own(r,'name'),CASES.map(c=>c.name)),depth:uint(own(r,'depth'),1),status:member(own(r,'status'),['passed','failed','running'])}));
 if(cases.some((r,i)=>r.name!==CASES[i].name||r.depth!==CASES[i].depth||!['passed','failed','running'].includes(r.status)))throw failed();
 const databases=items(own(databaseCleanup,'databases'),2);
 const dbs=databases.map((r,i)=>{
  const name=member(own(r,'name'),NAMES),oid=own(r,'oid');if(name!==NAMES[i]||oid!==null&&(typeof oid!=='string'||!/^[1-9][0-9]{0,9}$/u.test(oid)||Number(oid)>0xffffffff))throw failed();
  return {name,oid,created:bool(own(r,'created')),closed:bool(own(r,'closed')),dropped:bool(own(r,'dropped')),pending:uint(own(r,'pending'),32),cleanupFailures:codes(own(r,'sessionCleanupFailures')).length};
 });
 const primaryDescriptor=Object.getOwnPropertyDescriptor(checks,'primary'),primary=primaryDescriptor&&Object.hasOwn(primaryDescriptor,'value')?primaryDescriptor.value:null;
 if(primaryDescriptor&&!Object.hasOwn(primaryDescriptor,'value'))throw failed();if(primary!==null)finiteCode(primary);
 const result={schema:'native-hierarchy-postgres-result/v2',accepted:false,primary,
  server:{port:uint(own(server,'port'),65535),version:uint(own(server,'version')),ownershipVerified:bool(own(server,'ownershipVerified'))},
  cleanup:{reason:member(own(cleanup,'reason'),['verified-own-server-smart-stopped','verified-smart-stop-refused-or-timed-out-no-kill','unknown-work-client-or-ownership-no-stop','own-server-still-running','own-server-exited','not-started']),
   ...Object.fromEntries(['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].map(k=>[k,bool(own(cleanup,k))]))},
  proof:{schema:member(own(checks,'schema'),['native-hierarchy-postgres-proof/v2']),status:member(own(checks,'status'),['passed','failed']),nativeExecuted:bool(own(checks,'nativeExecuted')),pendingAssertions:uint(own(checks,'pendingAssertions'),64),cases,
   cleanup:{status:member(own(databaseCleanup,'status'),['passed','failed']),used:uint(own(databaseCleanup,'used'),2),finished:bool(own(databaseCleanup,'finished')),adminClosed:bool(own(databaseCleanup,'adminClosed')),
    failureCount:codes(own(databaseCleanup,'failures')).length,databases:dbs},
   concurrencyValidated:bool(own(checks,'concurrencyValidated')),restrictedRoleValidated:bool(own(checks,'restrictedRoleValidated')),semanticQualityMeasured:bool(own(checks,'semanticQualityMeasured'))}};
 member(own(lifecycle,'status'),['passed','failed']);
 result.accepted=primary===null&&own(lifecycle,'status')==='passed'&&result.server.port===55433&&result.server.version===170011&&result.server.ownershipVerified===true&&
  result.cleanup.reason==='verified-own-server-smart-stopped'&&['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].every(k=>result.cleanup[k]===true)&&
  result.proof.schema==='native-hierarchy-postgres-proof/v2'&&result.proof.status==='passed'&&result.proof.nativeExecuted===true&&result.proof.pendingAssertions===0&&
  cases.length===25&&cases.every(r=>r.status==='passed')&&result.proof.cleanup.status==='passed'&&result.proof.cleanup.used===2&&result.proof.cleanup.finished===true&&
  result.proof.cleanup.adminClosed===true&&result.proof.cleanup.failureCount===0&&dbs.length===2&&dbs[0].oid!==dbs[1].oid&&
  dbs.every(r=>r.oid!==null&&r.created===true&&r.closed===true&&r.dropped===true&&r.pending===0&&r.cleanupFailures===0)&&
  result.proof.concurrencyValidated===false&&result.proof.restrictedRoleValidated===false&&result.proof.semanticQualityMeasured===false;
 if(Buffer.byteLength(JSON.stringify(result))>32768)throw failed();return result;
}
export async function runEntry(){
 if(arguments.length)throw failed();
 const {runNativeSqlProof}=await import('./context.js');return projectEntryResult(await runNativeSqlProof());
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){process.stderr.write('Fixed native entry accepts no selectors.\n');process.exitCode=2;}
 else void runEntry().then(result=>{process.stdout.write(JSON.stringify(result)+'\n');if(!result.accepted)process.exitCode=1;},()=>{
  process.stdout.write('{"schema":"native-hierarchy-postgres-result/v2","accepted":false,"failure":"native-proof-incomplete"}\n');process.exitCode=1;
 });
}
