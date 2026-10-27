import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRestoreArchivePump,createOwnedScopedPostgres,FIXED,verifyScopedOwnership} from '../integration/hierarchy-native-cluster.js';
import {PRIVATE_RUN_ROOT} from '../integration/private-owner-storage.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function pumpFixture({hold=false,exitCode=0}={}){
 let time=0,child,callback,timer;const chunks=[],events=[],data=Buffer.from('PGDMPprivate-invented-data');
 const pump=createRestoreArchivePump({now:()=>time,setTimeout(fn){timer=fn;return 1;},clearTimeout(){timer=null;},environment:()=>({TEMP:'invented-private'}),spawn(exe,args,options){
  assert.equal(exe,'D:\\PostgreSQL\\17\\bin\\pg_restore.exe');assert.deepEqual(args,['--host=127.0.0.1','--port=55433','--username=postgres','--dbname='+FIXED.databaseA,'--exit-on-error','--single-transaction','--no-password']);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);
  child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.stdin=new Writable({highWaterMark:65536,write(chunk,encoding,done){chunks.push(Buffer.from(chunk));events.push('write');if(hold)callback=done;else setImmediate(done);},final(done){events.push('end');done();setImmediate(()=>{child.stdout.end();child.stderr.end();child.emit('close',exitCode);});}});
  child.kill=()=>{events.push('kill');child.stdout.end();child.stderr.end();child.emit('close',7);};return child;
 }});
 async function* input(){const chunk=Buffer.from(data);try{yield chunk;}finally{events.push('producer-released');chunk.fill(0);}}
 return {pump,data,events,chunks,input,request:()=>({password:'invented-only',dump:input(),dumpBytes:data.length,dumpSha256:sha(data),deadline:100}),release(){callback();},get waiting(){return !!callback;},expire(){time=101;timer();}};
}
test('actual pump waits write callback even write(true), and closes only after full authenticated stream',async()=>{
 const f=pumpFixture({hold:true}),pending=f.pump(f.request());while(!f.waiting)await turn();assert.deepEqual(f.events,['write']);assert.equal(f.events.includes('producer-released'),false);f.release();
 assert.deepEqual(await pending,{closed:true,stdoutEof:true,stderrEof:true,exitCode:0});assert.equal(Buffer.concat(f.chunks).equals(f.data),true);assert.ok(f.events.indexOf('end')>f.events.indexOf('producer-released'));
});
test('pump refuses digest/length/nonzero exit and discards raw failure output',async()=>{
 for(const mode of ['digest','length','exit']){const f=pumpFixture({exitCode:mode==='exit'?7:0}),request=f.request();if(mode==='digest')request.dumpSha256='a'.repeat(64);if(mode==='length')request.dumpBytes++;
  await assert.rejects(f.pump(request));}
});
test('deadline does not invent physical write retirement while original callback remains pending',async()=>{
 const f=pumpFixture({hold:true});let settled=false;const pending=f.pump(f.request()).finally(()=>{settled=true;});const observed=pending.catch(e=>e);while(!f.waiting)await turn();f.expire();await turn();assert.equal(settled,false);assert.equal(f.events.includes('producer-released'),false);f.release();assert.equal((await observed).code,'OWNED_DEADLINE');
});
function lifecycle({aclFailure=false,wrongOid=false,canonicalPresent=false,privateMode=true,bootstrapAt=0}={}){
 let time=0,next=0,random=0,exited=false;const exit=deferred(),timers=new Map(),events=[];const root=privateMode?PRIVATE_RUN_ROOT:'D:\\GITProjekts\\universal-discussion-bootstrap\\apps\\local-service\\portable\\data\\hierarchy-native-runs',parent=root+'\\run-'+'a'.repeat(48)+'\\cluster',runDirectory=parent+'\\nhpg-TEST01',dataDirectory=runDirectory+'\\pgdata';
 const deps={privateOwnerData:privateMode,ownedParent:parent,platform:'win32',now:()=>time,setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),randomBytes:n=>Buffer.alloc(n,++random),resources:async()=>({}),binaries:async()=>({postgres:'postgres',initdb:'initdb',pgCtl:'pg_ctl'}),
  verifyPrivateStorage:async(deadline,clusterReady=false)=>{events.push('acl');events.push(clusterReady?'acl-with-cluster':'acl-before-cluster');if(!clusterReady)assert.equal(events.includes('prepare'),false);else assert.equal(events.includes('prepare'),true);if(aclFailure)throw Error('invented ACL refusal');return true;},prepare:async nonce=>{events.push('prepare');return {runDirectory,dataDirectory,marker:{schema:privateMode?'private-native-hierarchy-postgres/maintained':FIXED.marker,nonce,runDirectory}};},noReparse:async()=>{},offlineAbsent:async()=>{},freePort:async()=>{},
  utility:async(exe,args)=>{events.push(args.includes('stop')?'stop':args.includes('--single')?'roles':'initdb');if(args.includes('--username=postgres'))assert.ok(args.includes(privateMode?'--locale=German_Germany.1252':'--no-locale'));if(args.includes('stop')){exited=true;exit.resolve();}},
  spawnServer:()=>({pid:12345,exit:exit.promise,hasExited:()=>exited}),ownership:async()=>1000,persist:async()=>{},
  restoreProcess:async request=>{events.push('restore');assert.equal(request.password.length,43);assert.equal(request.deadline,Math.min(bootstrapAt+300000,315000));for await(const b of request.dump)assert.ok(Buffer.isBuffer(b));return {closed:true,stdoutEof:true,stderrEof:true,exitCode:0};},
  createClient:config=>({connect:async()=>{},end:async()=>{},query:async sql=>{
   if(sql.includes("current_setting('data_directory')")){time=bootstrapAt;return {rows:[{directory:dataDirectory,listen:'127.0.0.1',port:55433,version:170011,started:1000.25}]};}
   if(sql.includes('pg_postmaster_start_time'))return {rows:[{database:config.database,role:config.user,address:'127.0.0.1',port:55433,version:170011,started:1000.25,isolation:'read committed'}]};
   if(sql.includes('canonical_absent'))return {rows:[{oid:wrongOid?'16385':'16384',canonical_absent:!canonicalPresent}]};return {rows:[]};}})};
 return {deps,events,run:createOwnedScopedPostgres(deps),parent,runDirectory,dataDirectory,set(value){time=value;},async advance(target){for(let n=0;n<100;n++){for(let i=0;i<40;i++)await Promise.resolve();const due=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){time=target;for(let i=0;i<40;i++)await Promise.resolve();return;}time=due[1].at;timers.delete(due[0]);due[1].fn();}throw Error('invented timer bound');}};
}
const request=()=>({role:'postgres',database:FIXED.databaseA,applicationName:'murmingle-native-hierarchy-restore',statementTimeoutMs:5000,lockTimeoutMs:3000});
async function* data(){yield Buffer.from('PGDMP');}
test('private actual lifecycle verifies ACL before prepare/credentials and issues one fresh-target restore',async()=>{
 const f=lifecycle();const result=await f.run(async cap=>{assert.ok(Object.isFrozen(cap));assert.deepEqual(Object.keys(cap).sort(),['checkDeadline','connectFixedRole','deadline','restoreArchive']);
  const client=await cap.connectFixedRole(request(),()=>{});const value={client,oid:'16384',dump:data(),dumpBytes:5,dumpSha256:sha('PGDMP')};assert.equal((await cap.restoreArchive(value)).exitCode,0);await assert.rejects(cap.restoreArchive(value),{code:'OWNED_RESTORE_ONESHOT'});await client.end();return {status:'passed'};});
 assert.equal(result.status,'passed');assert.equal(result.syntheticOnly,false);assert.equal(result.ownerData,true);assert.equal(result.cleanup.physicalSettled,true);assert.ok(f.events.indexOf('acl-before-cluster')<f.events.indexOf('prepare'));assert.ok(f.events.indexOf('prepare')<f.events.indexOf('acl-with-cluster'));assert.ok(f.events.indexOf('acl-with-cluster')<f.events.indexOf('initdb'));assert.ok(f.events.indexOf('acl-with-cluster')<f.events.indexOf('roles'));assert.equal(f.events.filter(e=>e==='restore').length,1);
});
test('private ACL refusal precedes PG files/roles and foreign authentic-looking client cannot restore',async()=>{
 const refused=lifecycle({aclFailure:true}),result=await refused.run(async()=>{throw Error('not reached');});assert.equal(result.status,'failed');assert.equal(refused.events.includes('prepare'),false);assert.equal(refused.events.includes('roles'),false);
 const f=lifecycle();const rejected=await f.run(async cap=>{await assert.rejects(cap.restoreArchive({client:{},oid:'16384',dump:data(),dumpBytes:5,dumpSha256:sha('PGDMP')}),{code:'OWNED_RESTORE_TARGET'});return {status:'passed'};});assert.equal(rejected.status,'passed');assert.equal(f.events.includes('restore'),false);
});
test('private ownership purpose cannot be substituted into ordinary synthetic scope',()=>{
 const f=lifecycle(),marker={schema:'private-native-hierarchy-postgres/maintained',nonce:'a'.repeat(48),runDirectory:f.runDirectory},scope={ownedParent:f.parent,runDirectory:f.runDirectory,dataDirectory:f.dataDirectory,marker,pid:12345,markerText:JSON.stringify(marker),pidText:`12345\n${f.dataDirectory}\n1000\n55433\n`};
 assert.equal(verifyScopedOwnership({...scope,privateOwnerData:true}),1000);assert.throws(()=>verifyScopedOwnership(scope),{code:'OWNERSHIP_PATH'});assert.throws(()=>verifyScopedOwnership({...scope,privateOwnerData:true,markerText:JSON.stringify({...marker,schema:FIXED.marker})}),{code:'OWNERSHIP_MARKER'});
});
test('wrong OID or nonempty/undropped schema cannot reach the restore process',async()=>{
 for(const option of [{wrongOid:true},{canonicalPresent:true}]){const f=lifecycle(option);const result=await f.run(async cap=>{const client=await cap.connectFixedRole(request(),()=>{});await assert.rejects(cap.restoreArchive({client,oid:'16384',dump:data(),dumpBytes:5,dumpSha256:sha('PGDMP')}),{code:'OWNED_RESTORE_TARGET'});await client.end();return {status:'passed'};});assert.equal(result.status,'passed');assert.equal(f.events.includes('restore'),false);}
});
test('pg_restore backend is reserved inside eight lifetime clients, without refund on client close',async()=>{
 const f=lifecycle();const result=await f.run(async cap=>{const client=await cap.connectFixedRole(request(),()=>{});await cap.restoreArchive({client,oid:'16384',dump:data(),dumpBytes:5,dumpSha256:sha('PGDMP')});await client.end();
  for(let i=0;i<6;i++){const other=await cap.connectFixedRole(request(),()=>{});await other.end();}
  await assert.rejects(cap.connectFixedRole(request(),()=>{}),{code:'OWNED_CONNECT_FAILED'});return {status:'passed'};});assert.equal(result.status,'passed');assert.equal(f.events.filter(e=>e==='restore').length,1);
});
test('original restore work pending after callback expiry cannot authorize smart-stop',async()=>{
 const f=lifecycle(),held=deferred();let entered=false;f.deps.restoreProcess=async()=>{entered=true;return held.promise;};
 const pending=f.run(async cap=>{const client=await cap.connectFixedRole(request(),()=>{});try{await cap.restoreArchive({client,oid:'16384',dump:data(),dumpBytes:5,dumpSha256:sha('PGDMP')});return {status:'passed'};}finally{await client.end();}});
 while(!entered)await turn();await f.advance(300001);await f.advance(320001);const result=await pending;assert.equal(result.status,'failed');assert.equal(result.callbackMs,300000);assert.equal(result.cleanup.physicalSettled,false);assert.equal(result.cleanup.stopped,false);assert.equal(f.events.includes('stop'),false);
 held.resolve({closed:true,stdoutEof:true,stderrEof:true,exitCode:0});await turn();
});
test('private callback uses300s initially and clamps after late bootstrap to original cleanup/report reserve',async()=>{
 for(const bootstrapAt of [0,110000,119000]){const f=lifecycle({bootstrapAt});const result=await f.run(async cap=>{assert.equal(cap.deadline,Math.min(bootstrapAt+300000,315000));cap.checkDeadline();return {status:'passed'};});assert.equal(result.status,'passed');assert.equal(result.callbackMs,Math.min(300000,315000-bootstrapAt));assert.ok(result.callbackMs<=300000);}
});
test('default callback remains195s and omits private available-budget metadata',async()=>{
 assert.equal(FIXED.callbackMs,195000);const immediate=lifecycle({privateMode:false}),done=await immediate.run(async connect=>{assert.equal(typeof connect,'function');return {status:'passed'};});assert.equal(done.status,'passed');assert.equal(Object.hasOwn(done,'callbackMs'),false);assert.equal(done.syntheticOnly,true);
 const f=lifecycle({privateMode:false}),held=deferred();let entered=false,settled=false;const pending=f.run(async()=>{entered=true;return held.promise;}).then(value=>{settled=true;return value;});while(!entered)await turn();await f.advance(194999);assert.equal(settled,false);await f.advance(195001);await f.advance(215001);const result=await pending;assert.equal(result.status,'failed');assert.equal(result.failure.code,'OWNED_DEADLINE');assert.equal(Object.hasOwn(result,'callbackMs'),false);held.resolve({status:'passed'});await turn();
});
test('late-bootstrap private original pending work remains unsettled past clamped cutoff',async()=>{
 const f=lifecycle({bootstrapAt:110000}),held=deferred();let entered=false;f.deps.restoreProcess=async()=>{entered=true;return held.promise;};const pending=f.run(async cap=>{assert.equal(cap.deadline,315000);const client=await cap.connectFixedRole(request(),()=>{});try{await cap.restoreArchive({client,oid:'16384',dump:data(),dumpBytes:5,dumpSha256:sha('PGDMP')});return {status:'passed'};}finally{await client.end();}});
 while(!entered)await turn();await f.advance(315001);await f.advance(335001);const result=await pending;assert.equal(result.callbackMs,205000);assert.equal(result.status,'failed');assert.equal(result.cleanup.physicalSettled,false);assert.equal(result.cleanup.stopped,false);assert.equal(f.events.includes('stop'),false);held.resolve({closed:true,stdoutEof:true,stderrEof:true,exitCode:0});await turn();
});
