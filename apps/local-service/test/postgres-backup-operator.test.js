import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createPostgresBackupOperatorForTest,main} from '../src/ops/postgres-backup-operator.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const dump=Buffer.concat([Buffer.from('PGDMP'),Buffer.alloc(190000,73)]);
async function fixture(t,{version=17,queryFailure=null,closeFailure=false,childMode='ok'}={}){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'murmingle-backup-test-'));t.after(async()=>{
  const target=path.resolve(dataDir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('murmingle-backup-test-'));await rm(target,{recursive:true,force:true});
 });
 const queries=[],events=[],timers=new Map();let time=Date.parse('2026-10-27T00:00:00.000Z'),clock=0,spawnCount=0,unwrapCount=0,child;
 const migrations=Array.from({length:version},(_,i)=>({version:i+1,hash:sha(String(i))}));
 const deps={dataDir,systemRoot:'C:\\Windows',now:()=>time,monotonic:()=>clock,
  setTimer(fn,delay){const key={fn,delay};timers.set(key,key);return key;},clearTimer:key=>timers.delete(key),
  freeBytes:async()=>8*1073741824,manifest:async()=>migrations,password:async()=>'invented-test-only',
  protection:{prepareDirectory:dir=>mkdir(dir,{recursive:true}),wrapKey:async key=>Buffer.from(key),unwrapKey:async key=>{unwrapCount++;return Buffer.from(key);}},
  openOwner:async()=>({close:async()=>events.push('owner-closed'),transaction:async work=>{events.push('begin');try{const value=await work({query:async sql=>{
   queries.push(sql);if(queryFailure&&sql.startsWith(queryFailure.at))throw queryFailure.value;if(closeFailure&&sql==='CLOSE backup_rows')throw new Error('invented secondary cursor failure');
   if(sql.startsWith('SELECT current_database'))return {rows:[{database:'murmingle_canonical',role:'murmingle_owner',address:'127.0.0.1',port:55432}]};
   if(sql.startsWith('SELECT meta.generation'))return {rows:[{generation:'generation-1',revision:'23',logical_sha256:'a'.repeat(64)}]};
   if(sql.startsWith('SELECT (SELECT count'))return {rows:[{topics:'2',discussions:'3',sources:'4',source_links:'4',contributions:'5'}]};
   if(sql.startsWith('SELECT version,hash'))return {rows:migrations};
   if(sql.startsWith('FETCH'))return {rows:[{row_sha:'b'.repeat(64)}]};
   if(sql.startsWith('SELECT pg_export_snapshot'))return {rows:[{snapshot:'00000003-0000001B-1'}]};
   return {rows:[]};}});events.push('commit');return value;}catch(e){events.push('rollback');throw e;}}}),
  spawn(exe,args,options){spawnCount++;events.push('spawn');assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.deepEqual(options.stdio,['pipe','pipe','pipe']);
   assert.ok(exe.endsWith('pg_dump.exe'));assert.ok(args.includes('--snapshot=00000003-0000001B-1'));assert.equal(options.env.PGCONNECT_TIMEOUT,'5');
   child=new EventEmitter();child.stdout=new PassThrough({highWaterMark:65536});child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.resume();
   child.kill=()=>{events.push('kill');if(childMode!=='unsettled'){child.stdout.end();child.stderr.end();setImmediate(()=>child.emit('close',7));}};
   if(childMode==='ok')setImmediate(async()=>{for(let p=0;p<dump.length;p+=32000){if(!child.stdout.write(Buffer.from(dump.subarray(p,p+32000))))await new Promise(r=>child.stdout.once('drain',r));}child.stdout.end();child.stderr.end();events.push('physical-close');child.emit('close',0);});
   return child;
  }};
 return {operator:createPostgresBackupOperatorForTest(deps),deps,queries,events,timers,directory:path.join(dataDir,'canonical-migration-backups'),get spawnCount(){return spawnCount;},get unwrapCount(){return unwrapCount;},advance(ms){clock+=ms;},expire(){time+=604800001;},async fire(delay){await turn();const timer=[...timers.values()].find(x=>x.delay===delay);assert.ok(timer);timer.fn();await turn();}};
}
const target=()=>({host:'127.0.0.1',port:55433,database:'murmingle_hierarchy_fixture_20261026_a',oid:'16384',serverStarted:1793018803.125,owned:true,fresh:true,empty:true});

for(const version of [9,16,17])test(`streamed V1 roundtrip and same-snapshot current fingerprint, schema${version}`,async t=>{
 const f=await fixture(t,{version});const result=await f.operator.create();assert.equal(result.dumpSha256,sha(dump));assert.equal(result.dumpBytes,dump.length);assert.equal(result.cleanupVerified,true);
 assert.equal(result.currentRowsFingerprint.tables.length,version===9?19:28);assert.equal(result.baselineLogicalDigest,'a'.repeat(64));assert.equal(result.fingerprintBinding.dumpSha256,result.dumpSha256);
 assert.equal(result.fingerprintBinding.headerSha256,result.headerSha256);assert.equal(result.fingerprintBinding.currentRowsFingerprintSha256,result.currentRowsFingerprint.sha256);
 assert.equal(f.events.indexOf('commit')>f.events.indexOf('physical-close'),true);assert.equal(f.queries[0],'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const metadataAt=f.queries.findIndex(sql=>sql.startsWith('SELECT meta.generation'));
 for(const setting of ["SET LOCAL TimeZone='UTC'","SET LOCAL DateStyle='ISO, YMD'",'SET LOCAL extra_float_digits=3'])assert.ok(f.queries.indexOf(setting)>0&&f.queries.indexOf(setting)<metadataAt);
 assert.ok(f.queries.some(sql=>sql.includes('host(inet_server_addr()) address')));
 assert.equal(f.queries.filter(s=>s.startsWith('DECLARE')).length,result.currentRowsFingerprint.tables.length);assert.ok(f.queries.some(s=>s.includes('array_send(t.body_values)'))=== (version>=16));
 const bytes=await readFile(path.join(f.directory,result.filename));assert.equal(bytes.subarray(0,8).toString(),'MURPG001');assert.equal(bytes.includes(dump.subarray(0,100)),false);
 assert.equal((await readdir(f.directory)).length,1);assert.equal(f.timers.size,0);assert.equal((await f.operator.verify(result.filename)).dumpSha256,result.dumpSha256);
 let consumed=0;const digest=createHash('sha256');const restored=await f.operator.restoreToOwnedFixture(result.filename,{inspect:async({deadline})=>{assert.equal(deadline,360000);return target();},restore:async({dump:input,identity,deadline})=>{
  assert.equal(identity.port,55433);assert.equal(deadline,360000);for await(const part of input){assert.ok(part.length<=65536);consumed+=part.length;digest.update(part);}return {closed:true,stdoutEof:true,stderrEof:true,exitCode:0};},verifyRestored:async({deadline})=>{assert.equal(deadline,360000);return true;}});
 assert.equal(restored.restored,true);assert.equal(consumed,dump.length);assert.equal(digest.digest('hex'),sha(dump));
});

test('GCM tampering rejects before a restore capability is inspected',async t=>{
 const f=await fixture(t);const r=await f.operator.create();const filename=path.join(f.directory,r.filename),bytes=await readFile(filename);bytes[bytes.length-1]^=1;await writeFile(filename,bytes);
 let called=0;await assert.rejects(f.operator.restoreToOwnedFixture(r.filename,{inspect:async()=>{called++;return target();},restore:async()=>{},verifyRestored:async()=>true}));assert.equal(called,0);
});
test('filename traversal, truncated archive, changed schema manifest fail closed',async t=>{
 const f=await fixture(t);await assert.rejects(f.operator.verify('../foreign'));assert.equal(f.unwrapCount,0);
 const r=await f.operator.create(),filename=path.join(f.directory,r.filename),bytes=await readFile(filename);await writeFile(filename,bytes.subarray(0,24));await assert.rejects(f.operator.verify(r.filename));
 await writeFile(filename,bytes);f.deps.manifest=async()=>[];await assert.rejects(f.operator.verify(r.filename));
});
test('falsy exporter failure is preserved and no dump starts',async t=>{
 const f=await fixture(t,{queryFailure:{at:'FETCH',value:false},closeFailure:true});let caught='missing';try{await f.operator.create();}catch(e){caught=e;}assert.equal(caught,false);assert.equal(f.spawnCount,0);assert.ok(f.events.includes('rollback'));assert.ok(f.events.includes('owner-closed'));assert.deepEqual(await readdir(f.directory),[]);
});
test('original deadline kills and physically drains the child before retiring partials',async t=>{
 const f=await fixture(t,{childMode:'held'}),pending=f.operator.create();while(!f.timers.size)await turn();await f.fire(330000);await assert.rejects(pending,{code:'child-deadline'});assert.equal(f.timers.size,0);assert.ok(f.events.includes('kill'));assert.deepEqual(await readdir(f.directory),[]);
});
test('unconfirmed retirement never deletes encrypted partial evidence',async t=>{
 const f=await fixture(t,{childMode:'unsettled'}),pending=f.operator.create();const observed=pending.catch(e=>e);while(!f.timers.size)await turn();await f.fire(330000);await f.fire(360000);assert.equal((await observed).code,'child-deadline');assert.equal((await readdir(f.directory)).filter(x=>x.endsWith('.encrypted-spool')).length,1);await assert.rejects(f.operator.create(),{code:'retirement-unconfirmed'});assert.equal(f.spawnCount,1);
});
test('restore refuses non-owned target and a port which never consumes its dump',async t=>{
 const f=await fixture(t),r=await f.operator.create();let restores=0;const port={inspect:async()=>({...target(),port:55432}),restore:async()=>{restores++;return {closed:true,stdoutEof:true,stderrEof:true,exitCode:0};},verifyRestored:async()=>true};
 await assert.rejects(f.operator.restoreToOwnedFixture(r.filename,port),{code:'restore-target'});assert.equal(restores,0);port.inspect=async()=>target();await assert.rejects(f.operator.restoreToOwnedFixture(r.filename,port),{code:'restore-unsettled'});
});
test('cleanup authenticates expiration and retains corrupt or unknown partials',async t=>{
 const f=await fixture(t),r=await f.operator.create();await writeFile(path.join(f.directory,'.unknown.encrypted-spool'),'encrypted-partial');assert.deepEqual(await f.operator.cleanup(),{removed:0});f.expire();assert.deepEqual(await f.operator.cleanup(),{removed:1});assert.deepEqual(await readdir(f.directory),['.unknown.encrypted-spool']);
});
test('strict CLI has no restore or path selector and invalid invocations are inert',async()=>{
 assert.equal(await main(['restore','anything']),2);assert.equal(await main(['create','anything']),2);assert.equal(await main([]),2);
});
test('one active operation cannot overlap another dump and capacity retires after physical settlement',async t=>{
 const f=await fixture(t,{childMode:'held'}),first=f.operator.create(),observed=first.catch(e=>e);while(!f.timers.size)await turn();await assert.rejects(f.operator.create(),{code:'busy'});assert.equal(f.spawnCount,1);await f.fire(330000);assert.equal((await observed).code,'child-deadline');assert.deepEqual(await f.operator.cleanup(),{removed:0});
});
test('disk admission and schema mismatch refuse before spawning any child',async t=>{
 const f=await fixture(t);f.deps.freeBytes=async()=>0;await assert.rejects(f.operator.create(),{code:'disk-reserve'});assert.equal(f.spawnCount,0);
 f.deps.freeBytes=async()=>8*1073741824;f.deps.manifest=async()=>[];await assert.rejects(f.operator.create(),{code:'schema'});assert.equal(f.spawnCount,0);assert.deepEqual(await readdir(f.directory),[]);
});
test('cleanup shares the original absolute deadline and unknown retirement poisons further admission',async t=>{
 const f=await fixture(t),openOwner=f.deps.openOwner;let finish,attempts=0;
 f.deps.openOwner=async()=>{const db=await openOwner();return {...db,close:()=>{attempts++;return new Promise(resolve=>{finish=resolve;});}};};
 const pending=f.operator.create(),observed=pending.catch(e=>e);while(!finish)await turn();f.advance(360000);await f.fire(360000);assert.equal((await observed).code,'cleanup');assert.equal(attempts,1);await assert.rejects(f.operator.create(),{code:'retirement-unconfirmed'});finish();await turn();
});
test('same original restore deadline reaches all ports and late verification cannot publish success',async t=>{
 const f=await fixture(t),r=await f.operator.create();let release,verificationEntered=false;
 const pending=f.operator.restoreToOwnedFixture(r.filename,{inspect:async({deadline})=>{assert.equal(deadline,360000);return target();},restore:async({dump:input,deadline})=>{assert.equal(deadline,360000);for await(const b of input)assert.ok(b.length<=65536);return {closed:true,stdoutEof:true,stderrEof:true,exitCode:0};},verifyRestored:({deadline})=>{assert.equal(deadline,360000);verificationEntered=true;return new Promise(resolve=>{release=resolve;});}});
 while(!verificationEntered)await turn();f.advance(360001);release(true);await assert.rejects(pending,{code:'deadline'});
});
test('late target inspection cannot dispatch a restore',async t=>{
 const f=await fixture(t),r=await f.operator.create();let calls=0;
 await assert.rejects(f.operator.restoreToOwnedFixture(r.filename,{inspect:async({deadline})=>{assert.equal(deadline,360000);f.advance(330001);return target();},restore:async()=>{calls++;},verifyRestored:async()=>true}),{code:'deadline'});assert.equal(calls,0);
});
