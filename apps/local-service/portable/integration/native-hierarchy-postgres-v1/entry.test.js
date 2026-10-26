import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEntryResult} from './entry.js';
import {CASES} from './suite.js';
function fixture(){return {status:'passed',server:{port:55433,version:170011,ownershipVerified:true,private:'must-not-project'},
 cleanup:{reason:'verified-own-server-smart-stopped',stopped:true,childExited:true,clientsClosed:true,physicalSettled:true,directoryRetained:true},
 checks:{schema:'native-hierarchy-postgres-proof/v1',status:'passed',nativeExecuted:true,pendingAssertions:0,cases:CASES.map(r=>({...r,status:'passed'})),
  cleanup:{status:'passed',used:2,finished:true,adminClosed:true,failures:[],databases:[0,1].map(i=>({name:'murmingle_hierarchy_fixture_20261026_'+(i?'b':'a'),oid:String(100+i),created:true,closed:true,dropped:true,pending:0,sessionCleanupFailures:[]}))},
  concurrencyValidated:false,restrictedRoleValidated:false,semanticQualityMeasured:false},password:'must-not-project',failure:{raw:'must-not-project'}};}
test('invented complete result projection retains only fixed finite proof fields',()=>{
 const value=projectEntryResult(fixture());assert.equal(value.accepted,true);assert.equal(value.proof.cases.length,25);assert.ok(!JSON.stringify(value).includes('must-not-project'));
 assert.deepEqual(Object.keys(value),['schema','accepted','primary','server','cleanup','proof']);
});
test('exit-cleanup, pending work, missing assertions or mismatched OIDs cannot project success',()=>{
 const changes=[f=>{f.status='failed';},f=>{f.server.port=55432;},f=>{f.cleanup.physicalSettled=false;},f=>{f.cleanup.stopped=false;},
  f=>{f.checks.cases.pop();},f=>{f.checks.cases[3].status='failed';},f=>{f.checks.pendingAssertions=1;},f=>{f.checks.cleanup.adminClosed=false;},
  f=>{f.checks.cleanup.databases[1].oid='100';},f=>{f.checks.cleanup.databases[0].pending=1;},f=>{f.checks.cleanup.databases[0].sessionCleanupFailures=['XX001'];},
  f=>{f.checks.concurrencyValidated=true;},f=>{f.checks.restrictedRoleValidated=true;},f=>{f.checks.semanticQualityMeasured=true;},f=>{f.checks.primary='P2402';}];
 for(const change of changes){const f=fixture();change(f);assert.equal(projectEntryResult(f).accepted,false);}
});
test('unknown titles and arbitrary properties cannot enter structured output',()=>{
 const f=fixture();f.checks.cases[0].name='unknown';assert.throws(()=>projectEntryResult(f),{code:'NATIVE_RESULT_CONTRACT'});
 let reads=0;const g=fixture();Object.defineProperty(g,'checks',{get(){reads++;throw false;}});assert.throws(()=>projectEntryResult(g),{code:'NATIVE_RESULT_CONTRACT'});assert.equal(reads,0);
});
test('failed DTO fields cannot invoke serialization hooks or array/property accessors',()=>{
 let hooks=0;const hostile={toJSON(){hooks++;return 'private';}};
 const changes=[f=>{f.server.port=hostile;},f=>{f.cleanup.reason=hostile;},f=>{f.checks.status=hostile;},
  f=>{f.checks.cleanup.databases[0].created=hostile;},f=>{f.checks.cleanup.databases[0].pending=hostile;},
  f=>{Object.defineProperty(f.checks.cases,0,{get(){hooks++;return {};}});},
  f=>{f.checks.cases=new Proxy(f.checks.cases,{get(){hooks++;throw false;}});},
  f=>{f.checks.cleanup.failures=[hostile];}];
 for(const change of changes){const f=fixture();change(f);assert.throws(()=>projectEntryResult(f),{code:'NATIVE_RESULT_CONTRACT'});}assert.equal(hooks,0);
});
