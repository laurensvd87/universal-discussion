// Pure projection tests. Never invoke runSemanticNativeCheck or acquire a DB.
import assert from 'node:assert/strict';
import test from 'node:test';
import {projectSemanticNativeResult} from './semantic-native-check.js';
import {SEMANTIC_CASES,runSemanticAssertions} from '../test/semantic-native-assertions.js';
import {PUBLIC_SUBJECT_NATIVE_CASES} from '../test/public-subject-native-assertions.js';
import {PUBLIC_SOURCE_NATIVE_CASES} from '../test/public-subject-source-native-assertions.js';
import {AUTOMATIC_SUBJECT_NATIVE_CASES} from '../test/automatic-subject-native-assertions.js';
import {AUTOMATIC_RETRIEVAL_NATIVE_CASES} from '../test/automatic-retrieval-native-assertions.js';
import {AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES} from '../test/automatic-author-context-native-assertions.js';
import {AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES} from '../test/automatic-author-insight-native-assertions.js';
import {AUTOMATIC_TOPIC_FEED_NATIVE_CASES} from '../test/automatic-topic-feed-native-assertions.js';
import {AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES} from '../test/automatic-topic-public-native-assertions.js';

test('public topic bridge evidence cannot be omitted or replaced by lower-level feed reports',()=>{
 for(const length of [0,1,8]){const input=lifecycle();input.checks.automaticTopicPublicCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['running','failed']){const input=lifecycle();input.checks.automaticTopicPublicCases[6].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.automaticTopicPublicCases[0].name=AUTOMATIC_TOPIC_FEED_NATIVE_CASES[0];assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 const absent=lifecycle();delete absent.checks.automaticTopicPublicCases;assert.throws(()=>projectSemanticNativeResult(absent),TypeError);
});

test('named feed and global search evidence cannot be omitted or borrowed from author-scope cases',()=>{
 for(const length of [0,1,8]){const input=lifecycle();input.checks.automaticTopicFeedCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['running','failed']){const input=lifecycle();input.checks.automaticTopicFeedCases[5].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.automaticTopicFeedCases[0].name=AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES[0];assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 const absent=lifecycle();delete absent.checks.automaticTopicFeedCases;assert.throws(()=>projectSemanticNativeResult(absent),TypeError);
});

test('authored AI lifecycle reports cannot be omitted or substituted by human context reports',()=>{
 for(const length of [0,1,6]){const input=lifecycle();input.checks.automaticAuthorInsightCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['running','failed']){const input=lifecycle();input.checks.automaticAuthorInsightCases[5].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.automaticAuthorInsightCases[0].name=AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES[0];assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 const absent=lifecycle();delete absent.checks.automaticAuthorInsightCases;assert.throws(()=>projectSemanticNativeResult(absent),TypeError);
});

test('authored context cases cannot be omitted or borrowed from another proof',()=>{
 for(const length of [0,1,9]){const input=lifecycle();input.checks.automaticAuthorContextCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['running','failed']){const input=lifecycle();input.checks.automaticAuthorContextCases[7].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.automaticAuthorContextCases[0].name=AUTOMATIC_RETRIEVAL_NATIVE_CASES[0];assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 const absent=lifecycle();delete absent.checks.automaticAuthorContextCases;assert.throws(()=>projectSemanticNativeResult(absent),TypeError);
});

const names=['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'];
function lifecycle(){return {
 status:'passed',server:{port:55433,version:170011,ownershipVerified:true},
 cleanup:{reason:'verified-own-server-smart-stopped',stopped:true,childExited:true,clientsClosed:true,physicalSettled:true,directoryRetained:true},
 checks:{schema:'canonical-semantic-postgres-proof/v1',status:'passed',primary:null,nativeExecuted:true,pendingAssertions:0,
  cases:SEMANTIC_CASES.map(row=>({...row,status:'passed'})),publicSubjectCases:PUBLIC_SUBJECT_NATIVE_CASES.map(name=>({name,status:'passed'})),
  publicSourceBindingCases:PUBLIC_SOURCE_NATIVE_CASES.map(name=>({name,status:'passed'})),restrictedRoleValidated:true,
  automaticSubjectCases:AUTOMATIC_SUBJECT_NATIVE_CASES.map(name=>({name,status:'passed'})),
  automaticRetrievalCases:AUTOMATIC_RETRIEVAL_NATIVE_CASES.map(name=>({name,status:'passed'})),
  automaticAuthorContextCases:AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES.map(name=>({name,status:'passed'})),
  automaticAuthorInsightCases:AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES.map(name=>({name,status:'passed'})),
  automaticTopicFeedCases:AUTOMATIC_TOPIC_FEED_NATIVE_CASES.map(name=>({name,status:'passed'})),
  automaticTopicPublicCases:AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES.map(name=>({name,status:'passed'})),
  concurrencyScope:'head-switch-vs-apply-and-mvcc-read',multiUserLoadValidated:false,semanticQualityMeasured:false,lastObservedSqlFailure:null,
  cleanup:{status:'passed',used:2,finished:true,adminClosed:true,failures:[],databases:names.map((name,i)=>({name,oid:String(17001+i),created:true,closed:true,dropped:true,pending:0,sessionCleanupFailures:[]}))}},
};}

test('inert import exposes projection and explicit runner without registering or invoking native work',async()=>{
 const imported=await import('./semantic-native-check.js');
 assert.equal(imported.projectSemanticNativeResult,projectSemanticNativeResult);assert.equal(typeof imported.runSemanticNativeCheck,'function');
 assert.equal(SEMANTIC_CASES.length,25);assert.equal(SEMANTIC_CASES.filter(row=>row.depth===0).length,3);
 assert.equal(SEMANTIC_CASES.filter(row=>row.depth===1).length,22);assert.equal(new Set(SEMANTIC_CASES.map(row=>row.name)).size,25);
});

test('original semantic assertion failure survives cleanup errors while every acquired role is closed',async()=>{
 const primary=Object.assign(new Error('invented first assertion'),{code:'INVENTED_FIRST'}),cleanup=Error('invented cleanup');let closed=0;
 const db={query:async()=>{throw primary;},exec:async()=>{throw primary;},transaction:async work=>work(db),close:async()=>{closed++;throw cleanup;}};
 const fixture={database:db,connect:async()=>db,close:async()=>{closed++;throw cleanup;}};
 await assert.rejects(runSemanticAssertions(async(_name,work)=>work({test:async(_child,fn)=>fn()}),{acquireFixture:async()=>fixture}),e=>e===primary);
 assert.equal(closed,5,'worker/app/submitter/observer and fixture cleanup are all attempted');
});

test('invented fixture trains and compiles the actual child before a sentinel stops all SQL acquisition',async()=>{
 const sentinel=new Error('pure fixture setup stop');let callbacks=0,acquisitions=0;
 await assert.rejects(runSemanticAssertions(()=>{callbacks++;throw sentinel;},{acquireFixture:async()=>{acquisitions++;assert.fail('no SQL fixture may be acquired');}}),error=>error===sentinel);
 assert.equal(callbacks,1);assert.equal(acquisitions,0);
});

test('complete exact semantic25 lifecycle projects accepted without mutating or borrowing input rows',()=>{
 const input=lifecycle(),before=structuredClone(input),result=projectSemanticNativeResult(input);
 assert.equal(result.schema,'canonical-semantic-postgres-result/v1');assert.equal(result.accepted,true);assert.deepEqual(input,before);
 assert.deepEqual(result.proof.cases,SEMANTIC_CASES.map(row=>({...row,status:'passed'})));
 assert.deepEqual(result.proof.cleanup.databases.map(row=>({name:row.name,oid:row.oid})),names.map((name,i)=>({name,oid:String(17001+i)})));
 input.checks.cases[0].status='failed';assert.equal(result.proof.cases[0].status,'passed');
 assert.equal(result.proof.restrictedRoleValidated,true);assert.equal(result.proof.multiUserLoadValidated,false);assert.equal(result.proof.semanticQualityMeasured,false);
});

test('case identity, order, depth and status bind the new ledger exactly; partial prefixes cannot pass',()=>{
 for(const alter of [
  x=>{x.checks.cases[0].name='historical unrelated suite';},
  x=>{[x.checks.cases[1],x.checks.cases[2]]=[x.checks.cases[2],x.checks.cases[1]];},
  x=>{x.checks.cases[1].depth=0;},x=>{x.checks.cases[0].depth='0';},
  x=>{x.checks.cases[0].status='skipped';},x=>{x.checks.cases.push({...x.checks.cases[0]});},
  x=>{delete x.checks.cases[1];},
 ]){const input=lifecycle();alter(input);assert.throws(()=>projectSemanticNativeResult(input),TypeError);}
 for(const length of [0,1,24]){const input=lifecycle();input.checks.cases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['running','failed']){const input=lifecycle();input.checks.cases[12].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
});

test('additional public registry cases are required separately and never replace original semantic25',()=>{
 for(const length of [0,1,7]){const input=lifecycle();input.checks.publicSubjectCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['failed','running']){const input=lifecycle();input.checks.publicSubjectCases[2].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.publicSubjectCases[0].name='borrowed assertion';assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 const absent=lifecycle();delete absent.checks.publicSubjectCases;assert.throws(()=>projectSemanticNativeResult(absent),TypeError);
});

test('Source binding and concurrency cases cannot be replaced by passing metadata cases',()=>{
 for(const length of [0,1,9]){const input=lifecycle();input.checks.publicSourceBindingCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['failed','running']){const input=lifecycle();input.checks.publicSourceBindingCases[6].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.publicSourceBindingCases[0].name=PUBLIC_SUBJECT_NATIVE_CASES[0];assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 let hooks=0;const getter=lifecycle();Object.defineProperty(getter.checks.publicSourceBindingCases[0],'name',{get(){hooks++;throw Error();}});assert.throws(()=>projectSemanticNativeResult(getter),TypeError);assert.equal(hooks,0);
});

test('generic subject persistence and erasure cases are mandatory independently of Wikipedia cases',()=>{
 for(const length of [0,1,11]){const input=lifecycle();input.checks.automaticSubjectCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['running','failed']){const input=lifecycle();input.checks.automaticSubjectCases[7].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.automaticSubjectCases[0].name=PUBLIC_SUBJECT_NATIVE_CASES[0];assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 const absent=lifecycle();delete absent.checks.automaticSubjectCases;assert.throws(()=>projectSemanticNativeResult(absent),TypeError);
});

test('indexed retrieval, coordinator, first-parent attachment and retention cases cannot be borrowed from registry cases',()=>{
 for(const length of [0,1,9]){const input=lifecycle();input.checks.automaticRetrievalCases.length=length;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 for(const status of ['running','failed']){const input=lifecycle();input.checks.automaticRetrievalCases[7].status=status;assert.equal(projectSemanticNativeResult(input).accepted,false);}
 const wrong=lifecycle();wrong.checks.automaticRetrievalCases[0].name=AUTOMATIC_SUBJECT_NATIVE_CASES[0];assert.throws(()=>projectSemanticNativeResult(wrong),TypeError);
 const absent=lifecycle();delete absent.checks.automaticRetrievalCases;assert.throws(()=>projectSemanticNativeResult(absent),TypeError);
});

test('incomplete or failed server, proof and database cleanup remain explicitly unaccepted',()=>{
 for(const alter of [
  x=>{x.status='failed';},x=>{x.server.port=55434;},x=>{x.server.version=170010;},x=>{x.server.ownershipVerified=false;},
  x=>{x.cleanup.reason='unknown-work-client-or-ownership-no-stop';},
  ...['stopped','childExited','clientsClosed','physicalSettled','directoryRetained'].map(key=>x=>{x.cleanup[key]=false;}),
  x=>{x.checks.primary='SEMANTIC_SQL_FAILURE';},x=>{x.checks.status='failed';},x=>{x.checks.nativeExecuted=false;},x=>{x.checks.pendingAssertions=1;},
  x=>{x.checks.cleanup.status='failed';},x=>{x.checks.cleanup.used=1;},x=>{x.checks.cleanup.finished=false;},x=>{x.checks.cleanup.adminClosed=false;},
  x=>{x.checks.cleanup.failures=['ADMIN_CLOSE_FAILED'];},x=>{x.checks.cleanup.databases.length=1;},
  x=>{x.checks.cleanup.databases[0].oid=null;},x=>{x.checks.cleanup.databases[1].oid=x.checks.cleanup.databases[0].oid;},
  ...['created','closed','dropped'].map(key=>x=>{x.checks.cleanup.databases[0][key]=false;}),
  x=>{x.checks.cleanup.databases[0].pending=1;},x=>{x.checks.cleanup.databases[0].sessionCleanupFailures=['SESSION_CLOSE_FAILED'];},
 ]){const input=lifecycle();alter(input);assert.equal(projectSemanticNativeResult(input).accepted,false);}
});

test('restricted roles are required; narrow contention cannot be reported as load or semantic quality',()=>{
 for(const alter of [x=>{x.checks.restrictedRoleValidated=false;},x=>{x.checks.multiUserLoadValidated=true;},x=>{x.checks.semanticQualityMeasured=true;}]){
  const input=lifecycle();alter(input);assert.equal(projectSemanticNativeResult(input).accepted,false);
 }
 const input=lifecycle();input.checks.concurrencyScope='multi-user-load';assert.throws(()=>projectSemanticNativeResult(input),TypeError);
});

test('strict OID, boolean, finite counters and SQL diagnostic projection reject ambiguous or unsafe values',()=>{
 for(const oid of [0,17001,'0','01','-1','+1','1.0','1e2','１２','4294967296','12345678901',' 17']){
  const input=lifecycle();input.checks.cleanup.databases[0].oid=oid;assert.throws(()=>projectSemanticNativeResult(input),TypeError);
 }
 const limit=lifecycle();limit.checks.cleanup.databases[0].oid='4294967295';assert.equal(projectSemanticNativeResult(limit).accepted,true);
 for(const alter of [x=>{x.server.ownershipVerified=1;},x=>{x.cleanup.stopped='true';},x=>{x.checks.nativeExecuted=null;},
  x=>{x.checks.restrictedRoleValidated='false';},x=>{x.checks.cleanup.databases[0].closed=1;},x=>{x.checks.cleanup.adminClosed=0;},
  x=>{x.checks.pendingAssertions=NaN;},x=>{x.checks.cleanup.databases[0].pending=33;},x=>{x.checks.cleanup.used=2.5;},
  x=>{x.checks.cleanup.failures=['contains private text'];}]){
  const input=lifecycle();alter(input);assert.throws(()=>projectSemanticNativeResult(input),TypeError);
 }
 const diagnostic=lifecycle();diagnostic.checks.lastObservedSqlFailure={caseIndex:7,role:'murmingle_ingest_worker',sqlState:'42501',message:'private SQL must disappear',query:'private material'};
 const result=projectSemanticNativeResult(diagnostic);assert.equal(result.accepted,false);
 assert.deepEqual(result.proof.lastObservedSqlFailure,{caseIndex:7,role:'murmingle_ingest_worker',sqlState:'42501'});assert.equal(JSON.stringify(result).includes('private'),false);
 for(const alter of [d=>{d.caseIndex=25;},d=>{d.role='unreviewed-role';},d=>{d.sqlState='42p01';}]){
  const input=structuredClone(diagnostic);alter(input.checks.lastObservedSqlFailure);assert.throws(()=>projectSemanticNativeResult(input),TypeError);
 }
});

test('used-field accessors, proxies, sparse lists and nonplain records refuse without invoking hooks',()=>{
 let hooks=0;
 const getter=()=>{hooks++;throw new Error('hook must not run');};
 const traps={get:getter,ownKeys:getter,getOwnPropertyDescriptor:getter,getPrototypeOf:getter};
 for(const alter of [
  x=>{Object.defineProperty(x,'server',{get:getter});},x=>{x.server=new Proxy(x.server,traps);},
  x=>{x.checks.cases=new Proxy(x.checks.cases,traps);},x=>{Object.defineProperty(x.checks.cases[0],'name',{get:getter});},
  x=>{x.checks.cleanup.databases[0]=Object.create(x.checks.cleanup.databases[0]);},
  x=>{Object.defineProperty(x.checks.cleanup.databases[0],'oid',{get:getter});},
  x=>{x.checks.lastObservedSqlFailure=new Proxy({},traps);},
 ]){const input=lifecycle();alter(input);assert.throws(()=>projectSemanticNativeResult(input),TypeError);}
 assert.throws(()=>projectSemanticNativeResult(new Proxy(lifecycle(),traps)),TypeError);assert.equal(hooks,0);
 const unused=lifecycle();Object.defineProperty(unused,'privateUnused',{get:getter});assert.equal(projectSemanticNativeResult(unused).accepted,true);assert.equal(hooks,0);
});
