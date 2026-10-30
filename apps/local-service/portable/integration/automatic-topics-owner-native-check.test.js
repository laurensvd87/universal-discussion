// Invented bounded ports only. No owner data, native, DB or credentials opened.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createAutomatic18OwnerCheckForTest,projectAutomatic18OwnerResult,AUTOMATIC18_OWNER_INPUTS,AUTOMATIC18_OWNER_PHASES,main,runAutomatic18BrowserOwnerNativeCheck} from './automatic-topics-owner-native-check.js';
const hash=b=>createHash('sha256').update(b).digest('hex');

test('browser owner entry rejects selectors before any native, archive or database work',async()=>{
 await assert.rejects(runAutomatic18BrowserOwnerNativeCheck({database:'other'}),{code:'AUTOMATIC18_OWNER_ONESHOT'});
 for(const args of [['--with-browser','other'],['--with-browser=other'],['--with-model']])assert.equal(await main(args),2);
});
const names=['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'];
function fixture(fault={}){
 const events=[],phases=[],version={generation:'invented',revision:7},header={version,migrations:Array.from({length:17},(_,i)=>hash('migration'+i)),counts:{sources:7},dumpBytes:16,dumpSha256:hash('dump')};
 const receipt={...header,verified:true,cleanupVerified:true,filename:'invented-only',headerSha256:hash(JSON.stringify(header))},raw=Buffer.from(JSON.stringify(receipt));
 const inputs={filename:receipt.filename,receiptBytes:raw.length,receiptSha256:hash(raw),archiveBytes:50,archiveSha256:hash('encrypted'),dumpBytes:header.dumpBytes,dumpSha256:header.dumpSha256,headerSha256:receipt.headerSha256};
 const identity={database:names[0],role:'postgres',address:'127.0.0.1',port:55433,version:170011,started:77};
 let acquired=0;
 const cleanup={status:'passed',used:2,finished:true,adminClosed:true,failures:[],databases:names.map((name,i)=>({name,oid:String(17001+i),created:true,closed:true,dropped:true,pending:0,sessionCleanupFailures:[]}))};
 const nativeCleanup={reason:'verified-own-server-smart-stopped',stopped:true,childExited:true,clientsClosed:true,physicalSettled:true,directoryRetained:true};
 const upgrade={schema:'private-restored-automatic18-upgrade/v1',status:'passed',schemaVersion:18,restoredTables:28,preservedLegacyTables:27,legacyRowsUnchanged:true,matcherUnchanged:true,policyUnchanged:true,runtimeVersionUnchanged:true,generatedSequencesSafe:true,testComposition:true};
 const deps={testComposition:true,async lifecycle(work){const checks=await work({connectFixedRole:async()=>({}),checkDeadline:()=>{},deadline:300000,async restoreArchive(){events.push('restore-child');return {closed:true,stdoutEof:true,stderrEof:true,exitCode:fault.child?1:0};}});return {status:checks.status,syntheticOnly:false,server:{port:55433,version:170011,ownershipVerified:true},cleanup:nativeCleanup,checks};},
  controller({connectFixedRole}){return {async acquire(){const i=acquired++;await connectFixedRole({database:names[i],role:'postgres'},()=>{});return {async query(sql){if(sql.includes('AS database,session_user'))return {rows:[{...identity,version:'170011',started:'77',oid:'17001'}]};if(sql.includes('pg_depend'))return {rows:[{owner:'postgres',objects:'0'}]};throw Error('unexpected invented query');},async exec(sql){events.push(sql);},async close(){events.push('db-close');}};},async finish(){events.push('controller-finish');return cleanup;}};},
  identity:()=>identity,async phase(stage){phases.push(stage);},async readData(){events.push('read');return {receiptRaw:raw,archiveBytes:inputs.archiveBytes,archiveSha256:inputs.archiveSha256,async verify(){events.push('verify-input');},async close(){events.push('close-input');}};},
  async restore(filename,port){assert.equal(filename,inputs.filename);const target=await port.inspect();await port.restore({identity:target,dump:{invented:true},dumpBytes:inputs.dumpBytes,dumpSha256:inputs.dumpSha256});await port.verifyRestored({header:fault.header?{...header,counts:{sources:8}}:header});return {restored:true,dumpSha256:inputs.dumpSha256,targetDatabase:names[0],targetOid:target.oid};},
  async upgrade(a){events.push('upgrade');assert.equal(a.receipt.version.generation,version.generation);if(fault.upgrade)throw false;return upgrade;},async directories(){return {clusterDirectory:'invented',outputDirectory:'invented'};},
  async application(a){events.push('application');assert.equal(a.upgrade.schemaVersion,18);assert.equal(a.upgrade.preservedLegacyTables,27);return {status:fault.application?'failed':'passed',proofSha256:hash('application'),proofBytes:1500};},
 };
 return {deps,inputs,events,phases,upgrade,nativeCleanup,cleanup};
}
test('fixed private17 archive is separately pinned without changing the historical9 input limit',()=>{
 assert.equal(AUTOMATIC18_OWNER_INPUTS.archiveBytes,1354426025);assert.equal(AUTOMATIC18_OWNER_INPUTS.receiptBytes,7445);
 assert.equal(AUTOMATIC18_OWNER_INPUTS.archiveSha256,'88600b8b3c31b3a3327611b0abe0730b1cf63bc2915d34c3f126d4f74ee8393c');
});
test('full fake restoration authenticates original before drop and upgrade before18 application; both fixtures retire',async()=>{
 const f=fixture(),r=await createAutomatic18OwnerCheckForTest(f.deps,f.inputs)();assert.equal(r.status,'passed');assert.deepEqual(f.phases,AUTOMATIC18_OWNER_PHASES);
 assert.ok(f.events.indexOf('DROP SCHEMA canonical_v4')<f.events.indexOf('restore-child'));assert.ok(f.events.indexOf('upgrade')<f.events.indexOf('application'));
 assert.deepEqual(f.events.slice(-3),['controller-finish','verify-input','close-input']);assert.equal(projectAutomatic18OwnerResult(r).accepted,false);
 r.checks.upgrade={...r.checks.upgrade,testComposition:false};const projected=projectAutomatic18OwnerResult(r);assert.equal(projected.accepted,true);
 assert.equal(projected.proof.upgrade.restoredTables,28);assert.equal(projected.proof.upgrade.preservedLegacyTables,27);
});
test('bad authenticated header or unsettled restore child prevents migration/application and still closes inputs',async()=>{
 for(const fault of [{header:true},{child:true},{upgrade:true},{application:true}]){
  const f=fixture(fault),r=await createAutomatic18OwnerCheckForTest(f.deps,f.inputs)();assert.equal(r.status,'failed');assert.equal(projectAutomatic18OwnerResult(r).accepted,false);assert.ok(f.events.includes('controller-finish')&&f.events.includes('close-input'));
  if(fault.header||fault.child)assert.equal(f.events.includes('upgrade'),false);if(!fault.application)assert.equal(f.events.includes('application'),false);
  assert.equal(f.phases.includes('inputs-closed'),false);
 }
});
test('wrong archive pin fails before database allocation',async()=>{
 const f=fixture();const r=await createAutomatic18OwnerCheckForTest(f.deps,{...f.inputs,archiveSha256:hash('wrong')})();assert.equal(r.status,'failed');assert.equal(f.events.includes('DROP SCHEMA canonical_v4'),false);assert.equal(f.events.includes('upgrade'),false);assert.ok(f.events.includes('close-input'));
});
test('all owner data preservation and normal retirement flags are required independently',async()=>{
 const f=fixture(),r=await createAutomatic18OwnerCheckForTest(f.deps,f.inputs)();r.checks.upgrade={...r.checks.upgrade,testComposition:false};
 for(const key of ['legacyRowsUnchanged','matcherUnchanged','policyUnchanged','runtimeVersionUnchanged','generatedSequencesSafe']){const copy=structuredClone(r);copy.checks.upgrade[key]=false;assert.equal(projectAutomatic18OwnerResult(copy).accepted,false);}
 for(const key of ['stopped','childExited','clientsClosed','physicalSettled','directoryRetained']){const copy=structuredClone(r);copy.cleanup[key]=false;assert.equal(projectAutomatic18OwnerResult(copy).accepted,false);}
 const copy=structuredClone(r);copy.checks.cleanup.databases[1].oid=copy.checks.cleanup.databases[0].oid;assert.equal(projectAutomatic18OwnerResult(copy).accepted,false);
});
test('projection drops unknown private helper fields and CLI rejects selectors without IO',async()=>{
 const f=fixture(),r=await createAutomatic18OwnerCheckForTest(f.deps,f.inputs)();r.checks.upgrade.private='PRIVATE MUST NOT LEAK';r.checks.application.private='PRIVATE MUST NOT LEAK';assert.equal(JSON.stringify(projectAutomatic18OwnerResult(r)).includes('PRIVATE MUST NOT LEAK'),false);
 for(const args of [['--archive=other'],['--with-model'],['extra'],null])assert.equal(await main(args),2);
});
