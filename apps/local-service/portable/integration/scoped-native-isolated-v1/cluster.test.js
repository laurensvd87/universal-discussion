import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createOwnedScopedPostgres,checkedScopedRequest,verifyScopedOwnership,createNativeUtility,createFileOps,SCOPED_CLUSTER as fixed} from './cluster.js';

// Invented capabilities ONLY. No utility, process, file, port or pg operation.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const request=(role='murmingle_app',database=fixed.database)=>({role,database,applicationName:'murmingle-adr167-scoped-native-test',statementTimeoutMs:5000,lockTimeoutMs:3000});
function fixture(options={}){
  let time=0,next=0,random=0,exited=false,ownership=0;const timers=new Map(),events=[],utilities=[],sockets=[],reports=[];
  const exit=deferred(),runDirectory=path.win32.join(fixed.parent,'adr173-TEST01'),dataDirectory=path.win32.join(runDirectory,'pgdata');let marker;
  const deps={platform:'win32',now:()=>time,setTimeout(fn,ms){const id=++next;timers.set(id,{at:time+ms,fn});return id;},clearTimeout(id){timers.delete(id);},
    randomBytes(length){return Buffer.alloc(length,++random);},resources(){events.push('resources');return {physicalFreeMiB:2048};},
    binaries(){events.push('binaries');return {postgres:'postgres.exe',initdb:'initdb.exe',pgCtl:'pg_ctl.exe'};},
    prepare(nonce){events.push('prepare');marker={schema:fixed.marker,nonce,runDirectory};return {runDirectory,dataDirectory,marker};},
    noReparse(paths){events.push('no-reparse');assert.deepEqual(paths,[dataDirectory]);},offlineAbsent(directory){assert.equal(directory,dataDirectory);events.push('offline-absent');},
    utility(executable,args,settings){events.push(args.includes('stop')?'smart-stop':'utility');utilities.push({executable,args,settings});
      if(options.utility)return options.utility(executable,args,settings);
      if(args.includes('stop')){assert.deepEqual(args,['-D',dataDirectory,'stop','-m','smart','-w','-t','15']);exited=true;exit.resolve();}},
    freePort(){events.push('fixed-port');if(options.occupied)throw new Error('invented occupied port');},
    spawnServer(executable,args,deadline){events.push('spawn');assert.equal(deadline,120000);assert.ok(args.includes('55433'));assert.ok(args.includes('max_connections=12'));
      return {pid:12345,exit:exit.promise,hasExited:()=>exited,unref(){events.push('unref');}};},
    ownership(scope){ownership++;events.push('ownership');assert.equal(scope.pid,12345);assert.equal(scope.expectedStart,ownership===1?null:1000);
      if(options.badStopOwnership&&ownership>1)throw new Error('invented changed ownership');return 1000;},
    createClient(config){events.push(`create-${config.application_name==='murmingle-adr173-bootstrap'?'bootstrap':config.user}`);
      assert.equal(config.host,'127.0.0.1');assert.equal(config.port,55433);assert.equal(config.ssl,false);
      const record={config,closed:false,connects:0,ends:0,queries:[]};sockets.push(record);
      const raw={connect(){record.connects++;events.push('connect');return options.connect?.(record);},
        query(sql,...args){record.queries.push(sql);events.push('query');if(options.query){const answer=options.query(sql,record,args);if(answer!==undefined)return answer;}
          if(sql.includes("current_setting('data_directory')"))return Promise.resolve({rows:[{directory:dataDirectory,listen:'127.0.0.1',port:55433,version:170011,started:1000,...options.bootstrapRow}]});
          if(sql.includes('pg_postmaster_start_time'))return Promise.resolve({rows:[{database:config.database,role:config.user,address:'127.0.0.1',port:55433,version:170011,started:1000,isolation:'read committed',...options.connectionRow}]});
          return Promise.resolve({rows:[{one:1}]});},
        end(){record.ends++;events.push(`end-${config.application_name==='murmingle-adr173-bootstrap'?'bootstrap':config.user}`);
          if(options.end)return options.end(record);record.closed=true;return Promise.resolve();}};record.raw=raw;return raw;},
    persist(directory,storedMarker,report){events.push('persist');assert.equal(directory,runDirectory);assert.deepEqual(storedMarker,marker);reports.push(structuredClone(report));if(typeof options.persist==='function')return options.persist();if(options.persist)throw new Error('invented persistence failure');},};
  const run=createOwnedScopedPostgres(deps);
  return {run,deps,events,utilities,sockets,reports,exit,runDirectory,dataDirectory,set(value){time=value;},
    async advance(target){for(let count=0;count<1000;count++){await flush();const due=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){time=target;await flush();return;}
      time=due[1].at;timers.delete(due[0]);due[1].fn();}throw new Error('invented timer capacity');}};
}

test('module is inert and exact fixed boundary/capacities do not accept endpoint options',()=>{
  assert.equal(fixed.host,'127.0.0.1');assert.equal(fixed.port,55433);assert.ok(fixed.parent.endsWith('portable\\data\\scoped-native-isolated'));
  assert.equal(fixed.startupMs,120000);assert.equal(fixed.callbackMs,195000);assert.equal(fixed.stopMs,20000);assert.equal(fixed.reportMs,25000);assert.equal(fixed.totalMs,360000);
  assert.ok(Object.isFrozen(fixed));assert.throws(()=>createOwnedScopedPostgres({}),{code:'OWNED_DEPENDENCIES'});
});

test('actual lifecycle uses offline four independent RAM passwords and closes bootstrap before fixed-role handoff',async()=>{
  const f=fixture();let calls=0,client;
  const result=await f.run(async connect=>{calls++;client=await connect(request(),()=>{});assert.equal(f.sockets[0].closed,true);await client.query('SELECT 1');await client.end();return {status:'passed'};});
  assert.equal(result.status,'passed');assert.equal(result.schema,'adr173-owned-postgres-lifecycle/v1');assert.deepEqual(result.checks,{status:'passed'});assert.equal(calls,1);
  assert.equal(result.cleanup.reason,'verified-own-server-smart-stopped');assert.equal(result.cleanup.stopped,true);assert.equal(result.cleanup.childExited,true);assert.equal(result.cleanup.physicalSettled,true);assert.equal(result.cleanup.clientsClosed,true);
  assert.ok(f.events.indexOf('end-bootstrap')<f.events.indexOf('create-murmingle_app'));assert.equal(f.sockets[1].ends,1);assert.equal(f.reports.length,1);
  const offline=f.utilities.find(item=>item.args[0]==='--single');assert.ok(offline);assert.ok(offline.args.includes('max_connections=12'));
  const credentials=[...offline.settings.input.matchAll(/PASSWORD '([A-Za-z0-9_-]{43})'/gu)].map(match=>match[1]);assert.equal(credentials.length,4);assert.equal(new Set(credentials).size,4);
  assert.match(offline.settings.input,/CREATE ROLE murmingle_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/u);
  assert.equal(offline.args.includes('-E'),false);assert.equal(offline.args.includes('-r'),false);for(const secret of credentials)assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(f.sockets[1].queries.some(sql=>sql.includes('data_directory')),false);
  assert.throws(()=>client.query('SELECT 1'),{code:'OWNED_LATE_DISPATCH'});
});

test('request validation is exact and accessor/proxy requests never create or look up a client',async()=>{
  let reads=0;const getter=request();Object.defineProperty(getter,'role',{enumerable:true,get(){reads++;return 'postgres';}});
  const f=fixture(),result=await f.run(async connect=>{
    for(const value of [{...request(),role:'murmingle_owner'},{...request(),database:'existing_owner_db'},{...request(),port:55432},{...request(),statementTimeoutMs:0},getter,new Proxy(request(),{})]){
      await assert.rejects(connect(value,()=>{}),{code:'OWNED_REQUEST'});}
    assert.equal(f.sockets.length,1);return {status:'passed'};
  });assert.equal(reads,0);assert.equal(result.status,'passed');assert.throws(()=>checkedScopedRequest(null),{code:'OWNED_REQUEST'});
});

test('each allowed login receives same-server proof and no privileged directory query',async()=>{
  const f=fixture(),result=await f.run(async connect=>{
    for(const role of ['postgres','murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker']){
      const client=await connect(request(role,role==='postgres'?'postgres':fixed.database),()=>{});await client.end();}
    return {status:'passed'};
  });assert.equal(result.status,'passed');assert.equal(f.sockets.length,5);
  for(const socket of f.sockets.slice(1)){assert.ok(socket.queries.some(sql=>sql.includes('pg_postmaster_start_time')));assert.equal(socket.queries.some(sql=>sql.includes('data_directory')),false);}
});

test('connector checks deadline/guard before creation, connect, setup and identity proof',async()=>{
  const f=fixture();let guards=0;
  const result=await f.run(async connect=>{const client=await connect(request(),()=>{guards++;});assert.ok(guards>=5);await client.end();
    const before=f.sockets.length;await assert.rejects(connect(request(),()=>{throw new Error('invented revoked work lane');}));assert.equal(f.sockets.length,before);return {status:'passed'};});
  assert.equal(result.status,'passed');
});

test('same-server wrong role/address/start/version/isolation refuses handoff and still closes owned socket',async()=>{
  for(const connectionRow of [{role:'foreign'},{address:'127.0.0.2'},{started:NaN},{started:null},{started:2000},{version:170012},{isolation:'serializable'}]){
    const f=fixture({connectionRow}),result=await f.run(async connect=>{await connect(request(),()=>{});return {status:'passed'};});
    assert.equal(result.status,'failed');assert.equal(result.failure.code,'OWNED_CONNECTION_PROOF');assert.equal(f.sockets[1].closed,true);assert.equal(result.cleanup.stopped,true);}
});

test('fixed occupied port refuses instead of fallback and starts no postmaster',async()=>{
  const f=fixture({occupied:true}),result=await f.run(()=>{throw new Error('must not run');});assert.equal(result.status,'failed');assert.equal(f.events.includes('spawn'),false);assert.equal(f.sockets.length,0);
  assert.equal(f.events.filter(event=>event==='fixed-port').length,1);
});

test('bootstrap identity must bind exact directory/listen/version/start before callback',async()=>{
  for(const bootstrapRow of [{directory:'D:\\foreign'},{listen:'*'},{version:NaN},{started:null},{started:2000}]){
    const f=fixture({bootstrapRow});let calls=0;const result=await f.run(()=>{calls++;return {status:'passed'};});assert.equal(result.status,'failed');assert.equal(calls,0);assert.equal(f.sockets[0].closed,true);assert.equal(result.cleanup.stopped,false);}
});

test('eight total diagnostic slots are independent from physically ended bootstrap',async()=>{
  const f=fixture(),result=await f.run(async connect=>{
    for(let i=0;i<8;i++){const client=await connect(request(),()=>{});await client.end();}
    await assert.rejects(connect(request(),()=>{}));assert.equal(f.sockets.length,9);return {status:'passed'};
  });assert.equal(result.status,'passed');assert.equal(result.cleanup.clientsClosed,true);
});

test('callback-style queries cannot hide physical work from the promise tracker',async()=>{
  const f=fixture(),result=await f.run(async connect=>{const client=await connect(request(),()=>{});assert.throws(()=>client.query('SELECT 1',()=>{}),{code:'OWNED_QUERY_STYLE'});await client.end();return {status:'passed'};});assert.equal(result.status,'passed');
});

test('callback timeout never counts original continuation as settled or triggers normal smart stop',async()=>{
  const held=deferred(),f=fixture(),run=f.run(()=>held.promise);await flush();await f.advance(215000);const result=await run;
  assert.equal(result.status,'failed');assert.equal(result.cleanup.physicalSettled,false);assert.equal(result.cleanup.stopped,false);assert.equal(f.events.includes('smart-stop'),false);
  held.resolve({status:'passed'});await flush();assert.equal(result.status,'failed');assert.equal(result.cleanup.physicalSettled,false);
});

test('detached pending physical query prevents normal success even after callback returns',async()=>{
  const held=deferred(),f=fixture({query(sql){if(sql==='SELECT held')return held.promise;}}),result=await f.run(async connect=>{
    const client=await connect(request(),()=>{});client.query('SELECT held');return {status:'passed'};
  });assert.equal(result.status,'failed');assert.equal(result.cleanup.physicalSettled,false);assert.equal(result.cleanup.stopped,false);assert.equal(f.events.includes('smart-stop'),false);
  held.reject(new Error('late invented query rejection'));await flush();
});

test('timed-out physical initial connect cannot become clean bootstrap merely because end settled',async()=>{
  const held=deferred(),f=fixture({connect(){return held.promise;}}),run=f.run(()=>({status:'passed'}));await flush();await f.advance(2000);const result=await run;
  assert.equal(result.status,'failed');assert.equal(result.cleanup.physicalSettled,false);assert.equal(result.cleanup.stopped,false);assert.equal(f.events.includes('smart-stop'),false);held.resolve();await flush();
});

test('unsettled owned-client close prevents smart stop and clean success',async()=>{
  const held=deferred(),f=fixture({end(record){if(record.config.user==='murmingle_app')return held.promise;record.closed=true;return Promise.resolve();}});
  const run=f.run(async connect=>{await connect(request(),()=>{});return {status:'passed'};});await flush();await f.advance(20000);const result=await run;
  assert.equal(result.cleanup.clientsClosed,false);assert.equal(result.cleanup.physicalSettled,false);assert.equal(result.cleanup.stopped,false);assert.equal(result.status,'failed');held.resolve();await flush();
});

test('changed ownership prevents smart stop, and failed reporting never becomes success',async()=>{
  const f=fixture({badStopOwnership:true}),result=await f.run(()=>({status:'passed'}));assert.equal(result.status,'failed');assert.equal(result.cleanup.stopped,false);assert.equal(f.events.includes('smart-stop'),false);
  const g=fixture({persist:true}),failed=await g.run(()=>({status:'passed'}));assert.equal(failed.status,'failed');assert.equal(failed.resultPersistence,'refused-or-failed-no-overwrite');
});

test('pure ownership verifier binds fresh fixed parent, marker nonce, PID, directory, port and start',()=>{
  const runDirectory=path.win32.join(fixed.parent,'adr173-TEST01'),dataDirectory=path.win32.join(runDirectory,'pgdata'),marker={schema:fixed.marker,nonce:'a'.repeat(48),runDirectory};
  const scope={runDirectory,dataDirectory,marker,pid:12345,expectedStart:1000,markerText:JSON.stringify(marker),pidText:`12345\n${dataDirectory}\n1000\n55433\n`};
  assert.equal(verifyScopedOwnership(scope),1000);
  for(const change of [{runDirectory:'D:\\foreign\\adr173-TEST01'},{dataDirectory:'D:\\foreign'},{pid:42},{expectedStart:1001},{pidText:`12345\n${dataDirectory}\n1000\n55432\n`},{markerText:'{}'}])assert.throws(()=>verifyScopedOwnership({...scope,...change}));
});

test('smart-stop and reporting retain their own20s/25s caps and never count pending utilities or writes as settled',async()=>{
  const stop=deferred(),f=fixture({utility(executable,args){if(args.includes('stop'))return stop.promise;}}),run=f.run(()=>({status:'passed'}));
  await flush();await f.advance(20000);const failed=await run;assert.equal(failed.status,'failed');assert.equal(failed.cleanup.stopped,false);assert.equal(failed.cleanup.physicalSettled,false);stop.resolve();await flush();
  const persist=deferred(),g=fixture({persist:()=>persist.promise}),report=g.run(()=>({status:'passed'}));await flush();await g.advance(25000);const unknown=await report;
  assert.equal(unknown.status,'failed');assert.equal(unknown.resultPersistence,'refused-or-failed-no-overwrite');assert.equal(unknown.cleanup.physicalSettled,false);assert.equal(unknown.elapsedMilliseconds,25000);persist.resolve();await flush();assert.equal(unknown.status,'failed');
});

test('fast bootstrap refusals pause100ms between finite attempts before ready succeeds',async()=>{
  let attempts=0;const f=fixture({connect(){if(++attempts<=3)return Promise.reject(new Error('invented fast refusal'));}}),run=f.run(()=>({status:'passed'}));
  await flush();assert.equal(attempts,1);await f.advance(99);assert.equal(attempts,1);
  await f.advance(100);assert.equal(attempts,2);await f.advance(200);assert.equal(attempts,3);await f.advance(300);
  const result=await run;assert.equal(attempts,4);assert.equal(result.status,'passed');assert.equal(result.elapsedMilliseconds,300);
  assert.equal(f.sockets.filter(record=>record.config.application_name==='murmingle-adr173-bootstrap').every(record=>record.closed),true);
});

test('bootstrap pause cannot slide originalstartup deadline or admit another attempt after expiration',async()=>{
  let attempts=0;const f=fixture({connect(){attempts++;return Promise.reject(new Error('invented fast refusal'));}}),prepare=f.deps.prepare;
  f.deps.prepare=(...args)=>{f.set(119950);return prepare(...args);};
  const run=f.run(()=>({status:'passed'}));await flush();assert.equal(attempts,1);await f.advance(120000);const result=await run;
  assert.equal(result.status,'failed');assert.equal(result.failure.phase,'bootstrap');assert.equal(result.failure.code,'OWNED_DEADLINE');assert.equal(attempts,1);
  assert.equal(result.cleanup.physicalSettled,false);assert.equal(result.cleanup.stopped,false);
  await f.advance(120050);assert.equal(attempts,1);assert.equal(result.status,'failed');
});

function realFileFixture(options={}){
  let time=0,launches=0;const events=[],ordinary={isSymbolicLink:()=>false,isFile:()=>true,isDirectory:()=>true,size:100};
  const runDirectory=path.win32.join(fixed.parent,'adr173-FILES01'),marker={schema:fixed.marker,nonce:'a'.repeat(48),runDirectory};
  const launchers=createNativeUtility({now:()=>time,environment(){options.environment?.();return {};},setTimeout:()=>1,clearTimeout:()=>{},
    spawn(){launches++;events.push('spawn');const child=new EventEmitter();child.pid=12345;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
      child.stdin.end=()=>queueMicrotask(()=>{child.stdout.emit('data',Buffer.from('checked'));child.emit('close',0);});child.kill=()=>{events.push('kill');child.emit('close',1);};child.unref=()=>{};return child;}});
  const fs={async lstat(name){events.push('lstat');return options.lstat?options.lstat(name,ordinary):ordinary;},async realpath(name){events.push('realpath');return options.realpath?options.realpath(name):name;},
    async mkdir(){events.push('mkdir');},async mkdtemp(){events.push('mkdtemp');return options.mkdtemp?options.mkdtemp():runDirectory;},
    async writeFile(){events.push('writeFile');},async readFile(){events.push('readFile');return options.readFile?options.readFile():JSON.stringify(marker);},
    async open(name,flag){assert.equal(flag,'wx');assert.ok(name.endsWith('ownership.pending'));events.push('open-pending');
      return {async writeFile(){events.push('write-pending');if(options.pendingWrite)return options.pendingWrite();},async close(){events.push('close-pending');if(options.pendingClose)return options.pendingClose();}};},
    async link(from,to){events.push('link-final');assert.ok(from.endsWith('ownership.pending'));assert.ok(to.endsWith('ownership.json'));if(options.link)throw new Error('invented EEXIST');}};
  return {files:createFileOps({fs,utility:launchers.utility,now:()=>time}),launchers,events,fs,marker,runDirectory,ordinary,set(value){time=value;},get launches(){return launches;}};
}

test('actual utility/postmaster launch wrapper checks finite current deadline immediately before spawn',async()=>{
  const f=realFileFixture();f.set(10);await assert.rejects(f.launchers.utility('invented.exe',[],{deadline:10}),{code:'OWNED_DEADLINE'});
  assert.throws(()=>f.launchers.spawnServer('invented.exe',[],10),{code:'OWNED_DEADLINE'});assert.equal(f.launches,0);
  f.set(NaN);await assert.rejects(f.launchers.utility('invented.exe',[],{deadline:100}),{code:'OWNED_CLOCK'});assert.equal(f.launches,0);
  let g;g=realFileFixture({environment(){g.set(100);}});await assert.rejects(g.launchers.utility('invented.exe',[],{deadline:100}),{code:'OWNED_DEADLINE'});assert.equal(g.launches,0);
  assert.throws(()=>g.launchers.spawnServer('invented.exe',[],100),{code:'OWNED_DEADLINE'});assert.equal(g.launches,0);
});

test('actual noReparse filesystem continuation cannot spawn PowerShell after deferred lstat or realpath expires',async()=>{
  const stat=deferred(),f=realFileFixture({lstat:()=>stat.promise});const first=f.files.noReparse(['D:\\invented'],10);
  f.set(10);stat.resolve(f.ordinary);await assert.rejects(first,{code:'OWNED_DEADLINE'});assert.equal(f.launches,0);
  const resolved=deferred(),g=realFileFixture({realpath:()=>resolved.promise}),second=g.files.noReparse(['D:\\invented'],10);
  await flush();g.set(10);resolved.resolve('D:\\');await assert.rejects(second,{code:'OWNED_DEADLINE'});assert.equal(g.launches,0);
});

test('actual prepare cannot publish or spawn after its pending mkdtemp crosses the original deadline',async()=>{
  const pending=deferred(),f=realFileFixture({mkdtemp:()=>pending.promise}),run=f.files.prepare('a'.repeat(48),10);
  for(let i=0;i<10&&!f.events.includes('mkdtemp');i++)await flush();
  assert.ok(f.events.includes('mkdtemp'));const before=f.launches;f.set(10);pending.resolve(f.runDirectory);
  await assert.rejects(run,{code:'OWNED_DEADLINE'});assert.equal(f.events.includes('open-pending'),false);assert.equal(f.events.includes('link-final'),false);assert.equal(f.launches,before);
});

test('actual ownership/read/report continuations refuse expired metadata without further spawn or mutation',async()=>{
  const read=deferred(),f=realFileFixture({readFile:()=>read.promise}),scope={runDirectory:f.runDirectory,dataDirectory:path.win32.join(f.runDirectory,'pgdata'),marker:f.marker,pid:12345,expectedStart:1000};
  const ownership=f.files.ownership(scope,10);await flush();const before=f.launches;f.set(10);read.resolve(JSON.stringify(f.marker));await assert.rejects(ownership,{code:'OWNED_DEADLINE'});assert.equal(f.launches,before);
  const saved=deferred(),g=realFileFixture({readFile:()=>saved.promise}),persist=g.files.persist(g.runDirectory,g.marker,{status:'invented'},10);
  await flush();const spawned=g.launches;g.set(10);saved.resolve(JSON.stringify(g.marker));await assert.rejects(persist,{code:'OWNED_DEADLINE'});assert.equal(g.launches,spawned);assert.equal(g.events.includes('writeFile'),false);
});

test('actual ownership publisher closes complete pending metadata before exclusive link publication',async()=>{
  const f=realFileFixture();await f.files.publishOwnership(f.runDirectory,f.marker,10);
  assert.deepEqual(f.events,['open-pending','write-pending','close-pending','link-final']);
  const g=realFileFixture({pendingWrite(){throw new Error('invented failed write');}});await assert.rejects(g.files.publishOwnership(g.runDirectory,g.marker,10));
  assert.deepEqual(g.events,['open-pending','write-pending','close-pending']);
  const h=realFileFixture({pendingClose(){throw new Error('invented unsettled close');}});await assert.rejects(h.files.publishOwnership(h.runDirectory,h.marker,10));assert.equal(h.events.includes('link-final'),false);
  const j=realFileFixture({link:true});await assert.rejects(j.files.publishOwnership(j.runDirectory,j.marker,10));assert.equal(j.events.filter(e=>e==='link-final').length,1);
});

test('actual metadata publisher cannot link after awaited close exceeds original deadline',async()=>{
  const close=deferred(),f=realFileFixture({pendingClose:()=>close.promise}),run=f.files.publishOwnership(f.runDirectory,f.marker,10);
  await flush();assert.equal(f.events.includes('close-pending'),true);f.set(10);close.resolve();await assert.rejects(run,{code:'OWNED_DEADLINE'});assert.equal(f.events.includes('link-final'),false);
});
