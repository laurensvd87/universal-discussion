// Fixed ordinary production semantic proof. Imports never start a cluster.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {SEMANTIC_CASES} from '../test/semantic-native-assertions.js';
import {PUBLIC_SUBJECT_NATIVE_CASES} from '../test/public-subject-native-assertions.js';
import {PUBLIC_SOURCE_NATIVE_CASES} from '../test/public-subject-source-native-assertions.js';
import {AUTOMATIC_SUBJECT_NATIVE_CASES} from '../test/automatic-subject-native-assertions.js';
import {AUTOMATIC_RETRIEVAL_NATIVE_CASES} from '../test/automatic-retrieval-native-assertions.js';
import {AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES} from '../test/automatic-author-context-native-assertions.js';
import {AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES} from '../test/automatic-author-insight-native-assertions.js';
import {AUTOMATIC_TOPIC_FEED_NATIVE_CASES} from '../test/automatic-topic-feed-native-assertions.js';
import {AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES} from '../test/automatic-topic-public-native-assertions.js';

const fail=()=>{throw new TypeError('Invalid semantic native result');};
function field(value,key){if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail();
 const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))fail();return d.value;}
function list(value,max){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype)fail();
 const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n>max||Reflect.ownKeys(value).length!==n+1)fail();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return d.value;});}
const uint=(value,max=0xffffffff)=>{if(!Number.isSafeInteger(value)||value<0||value>max)fail();return value;};
const bool=value=>{if(typeof value!=='boolean')fail();return value;};
const member=(value,choices)=>{if(!choices.includes(value))fail();return value;};
const finiteCode=value=>{if(typeof value!=='string'||!/^[A-Z0-9_]{1,64}$/u.test(value))fail();return value;};
const codes=value=>list(value,64).map(finiteCode);
const NAMES=['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'];

export function projectSemanticNativeResult(lifecycle){
 const server=field(lifecycle,'server'),cleanup=field(lifecycle,'cleanup'),proof=field(lifecycle,'checks'),dbCleanup=field(proof,'cleanup');
 const primary=field(proof,'primary');if(primary!==null)finiteCode(primary);
 const publicSubjectCases=list(field(proof,'publicSubjectCases'),PUBLIC_SUBJECT_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==PUBLIC_SUBJECT_NATIVE_CASES[i])fail();
  return {name:PUBLIC_SUBJECT_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const publicSourceBindingCases=list(field(proof,'publicSourceBindingCases'),PUBLIC_SOURCE_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==PUBLIC_SOURCE_NATIVE_CASES[i])fail();
  return {name:PUBLIC_SOURCE_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const automaticSubjectCases=list(field(proof,'automaticSubjectCases'),AUTOMATIC_SUBJECT_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==AUTOMATIC_SUBJECT_NATIVE_CASES[i])fail();
  return {name:AUTOMATIC_SUBJECT_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const automaticRetrievalCases=list(field(proof,'automaticRetrievalCases'),AUTOMATIC_RETRIEVAL_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==AUTOMATIC_RETRIEVAL_NATIVE_CASES[i])fail();
  return {name:AUTOMATIC_RETRIEVAL_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const automaticAuthorContextCases=list(field(proof,'automaticAuthorContextCases'),AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES[i])fail();
  return {name:AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const automaticAuthorInsightCases=list(field(proof,'automaticAuthorInsightCases'),AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES[i])fail();
  return {name:AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const automaticTopicFeedCases=list(field(proof,'automaticTopicFeedCases'),AUTOMATIC_TOPIC_FEED_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==AUTOMATIC_TOPIC_FEED_NATIVE_CASES[i])fail();
  return {name:AUTOMATIC_TOPIC_FEED_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const automaticTopicPublicCases=list(field(proof,'automaticTopicPublicCases'),AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES.length).map((row,i)=>{
  if(field(row,'name')!==AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES[i])fail();
  return {name:AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES[i],status:member(field(row,'status'),['passed','failed','running'])};
 });
 const cases=list(field(proof,'cases'),25).map((row,i)=>{
  if(field(row,'name')!==SEMANTIC_CASES[i].name||field(row,'depth')!==SEMANTIC_CASES[i].depth)fail();
  return {name:SEMANTIC_CASES[i].name,depth:SEMANTIC_CASES[i].depth,status:member(field(row,'status'),['passed','failed','running'])};
 });
 const databases=list(field(dbCleanup,'databases'),2).map((row,i)=>{
  if(field(row,'name')!==NAMES[i])fail();const oid=field(row,'oid');
  if(oid!==null&&(typeof oid!=='string'||!/^[1-9][0-9]{0,9}$/u.test(oid)||Number(oid)>0xffffffff))fail();
  return {name:NAMES[i],oid,...Object.fromEntries(['created','closed','dropped'].map(key=>[key,bool(field(row,key))])),
   pending:uint(field(row,'pending'),32),cleanupFailures:codes(field(row,'sessionCleanupFailures')).length};
 });
 let diagnostic=field(proof,'lastObservedSqlFailure');
 if(diagnostic!==null){const sqlState=field(diagnostic,'sqlState');if(typeof sqlState!=='string'||!/^[A-Z0-9]{5}$/u.test(sqlState))fail();
  diagnostic={caseIndex:uint(field(diagnostic,'caseIndex'),24),role:member(field(diagnostic,'role'),['owner','postgres','murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter']),sqlState};}
 const result={schema:'canonical-semantic-postgres-result/v1',accepted:false,primary,
  server:{port:uint(field(server,'port'),65535),version:uint(field(server,'version')),ownershipVerified:bool(field(server,'ownershipVerified'))},
  cleanup:{reason:member(field(cleanup,'reason'),['verified-own-server-smart-stopped','verified-smart-stop-refused-or-timed-out-no-kill','unknown-work-client-or-ownership-no-stop','own-server-still-running','own-server-exited','not-started']),
   ...Object.fromEntries(['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].map(key=>[key,bool(field(cleanup,key))]))},
  proof:{schema:member(field(proof,'schema'),['canonical-semantic-postgres-proof/v1']),status:member(field(proof,'status'),['passed','failed']),
   nativeExecuted:bool(field(proof,'nativeExecuted')),pendingAssertions:uint(field(proof,'pendingAssertions'),64),cases,publicSubjectCases,publicSourceBindingCases,automaticSubjectCases,automaticRetrievalCases,automaticAuthorContextCases,automaticAuthorInsightCases,automaticTopicFeedCases,automaticTopicPublicCases,
   restrictedRoleValidated:bool(field(proof,'restrictedRoleValidated')),
   concurrencyScope:member(field(proof,'concurrencyScope'),['head-switch-vs-apply-and-mvcc-read']),
   multiUserLoadValidated:bool(field(proof,'multiUserLoadValidated')),semanticQualityMeasured:bool(field(proof,'semanticQualityMeasured')),
   lastObservedSqlFailure:diagnostic,
   cleanup:{status:member(field(dbCleanup,'status'),['passed','failed']),used:uint(field(dbCleanup,'used'),2),finished:bool(field(dbCleanup,'finished')),
    adminClosed:bool(field(dbCleanup,'adminClosed')),failureCount:codes(field(dbCleanup,'failures')).length,databases}}};
 result.accepted=primary===null&&field(lifecycle,'status')==='passed'&&result.server.port===55433&&result.server.version===170011&&result.server.ownershipVerified&&
  result.cleanup.reason==='verified-own-server-smart-stopped'&&['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].every(key=>result.cleanup[key]===true)&&
  result.proof.status==='passed'&&result.proof.nativeExecuted&&result.proof.pendingAssertions===0&&cases.length===25&&cases.every(row=>row.status==='passed')&&
  publicSubjectCases.length===PUBLIC_SUBJECT_NATIVE_CASES.length&&publicSubjectCases.every(row=>row.status==='passed')&&
  publicSourceBindingCases.length===PUBLIC_SOURCE_NATIVE_CASES.length&&publicSourceBindingCases.every(row=>row.status==='passed')&&
  automaticSubjectCases.length===AUTOMATIC_SUBJECT_NATIVE_CASES.length&&automaticSubjectCases.every(row=>row.status==='passed')&&
  automaticRetrievalCases.length===AUTOMATIC_RETRIEVAL_NATIVE_CASES.length&&automaticRetrievalCases.every(row=>row.status==='passed')&&
  automaticAuthorContextCases.length===AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES.length&&automaticAuthorContextCases.every(row=>row.status==='passed')&&
  automaticAuthorInsightCases.length===AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES.length&&automaticAuthorInsightCases.every(row=>row.status==='passed')&&
  automaticTopicFeedCases.length===AUTOMATIC_TOPIC_FEED_NATIVE_CASES.length&&automaticTopicFeedCases.every(row=>row.status==='passed')&&
  automaticTopicPublicCases.length===AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES.length&&automaticTopicPublicCases.every(row=>row.status==='passed')&&
  result.proof.restrictedRoleValidated&&result.proof.multiUserLoadValidated===false&&result.proof.semanticQualityMeasured===false&&diagnostic===null&&
  result.proof.cleanup.status==='passed'&&result.proof.cleanup.used===2&&result.proof.cleanup.finished&&result.proof.cleanup.adminClosed&&result.proof.cleanup.failureCount===0&&
  databases.length===2&&databases[0].oid!==databases[1].oid&&databases.every(row=>row.oid!==null&&row.created&&row.closed&&row.dropped&&row.pending===0&&row.cleanupFailures===0);
 if(Buffer.byteLength(JSON.stringify(result))>32768)fail();return result;
}

export async function runSemanticNativeCheck(){
 if(arguments.length)fail();const {runSemanticNativeProof}=await import('./semantic-native-context.js');
 return projectSemanticNativeResult(await runSemanticNativeProof());
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){process.stderr.write('Semantic native check accepts no selectors.\n');process.exitCode=2;}
 else void runSemanticNativeCheck().then(result=>{process.stdout.write(JSON.stringify(result)+'\n');if(!result.accepted)process.exitCode=1;},()=>{
  process.stdout.write('{"schema":"canonical-semantic-postgres-result/v1","accepted":false,"failure":"semantic-proof-incomplete"}\n');process.exitCode=1;
 });
}
