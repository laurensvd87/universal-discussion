// SOURCE-only ADR220 native fixture adaptation of immutable ADR175 cluster lifecycle.
// Caller-available commit is not derived from freemem; a future supervisor must enforce it.
// Opt-in owned-process fixture. Imports/default evaluation perform no actions.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {lstat,realpath,mkdir,mkdtemp,writeFile,readFile,statfs,open,link} from 'node:fs/promises';
import {freemem} from 'node:os';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import path from 'node:path';
import {establishFixedClient} from './client.js';

export const FIXED=Object.freeze({host:'127.0.0.1',port:55433,
  parent:'D:\\GITProjekts\\universal-discussion-bootstrap\\apps\\local-service\\portable\\data\\native-hierarchy-postgres-v2',
  bin:'D:\\PostgreSQL\\17\\bin',powershell:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  database:'murmingle_hierarchy_fixture_20261026_a',databaseA:'murmingle_hierarchy_fixture_20261026_a',databaseB:'murmingle_hierarchy_fixture_20261026_b',marker:'native-hierarchy-postgres/v2',
  startupMs:120000,callbackMs:195000,stopMs:20000,reportMs:25000,totalMs:360000,clients:8});
export const SCOPED_CLUSTER=FIXED;
const ownedIdentities=new WeakMap();
export function getOwnedIdentity(client){
  const entry=ownedIdentities.get(client);
  if(!entry||!entry.state.active||entry.record.closed||entry.record.ending)throw failure('OWNED_CLIENT_IDENTITY');
  return entry.identity;
}
const ROLES=Object.freeze(['postgres','murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker']);
const FIELDS=['applicationName','database','lockTimeoutMs','role','statementTimeoutMs'];
const errors=new WeakSet();
function failure(code){const error=Object.assign(new Error('Owned PostgreSQL fixture refused or failed'),{code});errors.add(error);return error;}
const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.win32.resolve(a).toLowerCase()===path.win32.resolve(b).toLowerCase();
const safeCode=error=>errors.has(error)?error.code:'OWNED_CLUSTER_FAILED';
const SERVER_SQL=`SELECT current_database() AS database,session_user AS role,pg_catalog.host(pg_catalog.inet_server_addr()) AS address,
  inet_server_port() AS port,current_setting('server_version_num') AS version,
  extract(epoch FROM pg_postmaster_start_time()) AS started,current_setting('transaction_isolation') AS isolation`;
const BOOTSTRAP_SQL=`SELECT current_setting('data_directory') AS directory,current_setting('listen_addresses') AS listen,
  current_setting('port') AS port,current_setting('server_version_num') AS version,
  extract(epoch FROM pg_postmaster_start_time()) AS started`;

function ownData(value,key){
  if(!value||typeof value!=='object'||types.isProxy(value))return undefined;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;
}
function startupNumber(value){
  if(typeof value!=='number'&&(typeof value!=='string'||value.length>32||!/^[0-9]+(?:\.[0-9]+)?$/u.test(value)))return null;
  const number=Number(value);return Number.isFinite(number)&&number>0?number:null;
}
function bootstrapIdentity(result){
  const rows=ownData(result,'rows');
  if(!Array.isArray(rows)||types.isProxy(rows))throw failure('OWNED_SERVER_PROOF');
  const row=ownData(rows,'0'),directory=ownData(row,'directory'),listen=ownData(row,'listen');
  if(typeof directory!=='string'||typeof listen!=='string')throw failure('OWNED_SERVER_PROOF');
  return {directory,listen,port:startupNumber(ownData(row,'port')),
    version:startupNumber(ownData(row,'version')),started:startupNumber(ownData(row,'started'))};
}

export function checkedScopedRequest(request){
  if(!request||types.isProxy(request)||Object.getPrototypeOf(request)!==Object.prototype||Reflect.ownKeys(request).length!==FIELDS.length)throw failure('OWNED_REQUEST');
  const value={};for(const name of FIELDS){const d=Object.getOwnPropertyDescriptor(request,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw failure('OWNED_REQUEST');value[name]=d.value;}
  if(!ROLES.includes(value.role)||!([FIXED.databaseA,FIXED.databaseB].includes(value.database)||value.role==='postgres'&&value.database==='postgres')||
    typeof value.applicationName!=='string'||!/^murmingle-native-hierarchy(?:-[a-z0-9-]{1,32})?$/u.test(value.applicationName)||
    value.statementTimeoutMs!==5000||value.lockTimeoutMs!==3000)throw failure('OWNED_REQUEST');return Object.freeze(value);
}
export function verifyScopedOwnership({runDirectory,dataDirectory,marker,pid,expectedStart=null,markerText,pidText}){
  if(!samePath(path.win32.dirname(runDirectory),FIXED.parent)||!/^nhpg2-[a-zA-Z0-9]+$/u.test(path.win32.basename(runDirectory))||
    !samePath(dataDirectory,path.win32.join(runDirectory,'pgdata')))throw failure('OWNERSHIP_PATH');
  if(typeof markerText!=='string'||typeof pidText!=='string'||Buffer.byteLength(markerText)>4096||Buffer.byteLength(pidText)>4096)throw failure('OWNERSHIP_SIZE');
  let stored;try{stored=JSON.parse(markerText);}catch{throw failure('OWNERSHIP_MARKER');}
  if(stored.schema!==FIXED.marker||stored.nonce!==marker.nonce||stored.runDirectory!==runDirectory||!/^[0-9a-f]{48}$/u.test(marker.nonce))throw failure('OWNERSHIP_MARKER');
  const lines=pidText.split(/\r?\n/u),start=Number(lines[2]);
  if(!Number.isSafeInteger(pid)||pid<1||Number(lines[0])!==pid||!samePath(lines[1],dataDirectory)||Number(lines[3])!==FIXED.port||
    !Number.isSafeInteger(start)||start<1||expectedStart!==null&&start!==expectedStart)throw failure('OWNERSHIP_PID');return start;
}

/** Trusted dependency factory is only for invented adapter tests. Production
 * calls the fixed no-options entrypoint below; no environment/config override.
 */
export function createOwnedScopedPostgres(deps){
  const required=['now','setTimeout','clearTimeout','randomBytes','resources','binaries','prepare','noReparse','offlineAbsent','utility','freePort','spawnServer','ownership','createClient','persist'];
  if(!deps||required.some(name=>typeof deps[name]!=='function'))throw failure('OWNED_DEPENDENCIES');
  return async function run(runChecks){
    const started=deps.now();if(!Number.isFinite(started)||started<0)throw failure('OWNED_CLOCK');let last=started;
    const startup=started+FIXED.startupMs,overall=started+FIXED.totalMs;
    let phase='preflight',native,runDirectory,dataDirectory,marker,server,proof=null,sqlProof=null,callback=null,callbackSettled=true,callbackDeadline=null;
    let bootstrapClosed=true,alive=true,closeDeadline=overall-FIXED.reportMs,unknownAcquisition=false,stopVerified=false;
    const physical=new Set(),clients=[],passwords=new Map(),identityState={active:true};
    const report={schema:'native-hierarchy-postgres-lifecycle/v2',status:'failed',syntheticOnly:true,runDirectory:null,connectionRefusal:null,
      startup:{pidStart:null,sqlStart:null},
      cleanup:{stopped:true,childExited:true,clientsClosed:true,physicalSettled:true,directoryRetained:false,reason:'not-started'}};
    function clock(){const time=deps.now();if(!Number.isFinite(time)||time<last)throw failure('OWNED_CLOCK');last=time;return time;}
    function check(deadline){if(clock()>=deadline)throw failure('OWNED_DEADLINE');}
    function actual(fn){const entry={};physical.add(entry);let promise;try{promise=Promise.resolve(fn());}catch(error){promise=Promise.reject(error);}
      entry.promise=promise;promise.then(()=>physical.delete(entry),()=>physical.delete(entry));return promise;}
    function bounded(promise,deadline){const observed=new Promise((resolve,reject)=>{let done=false,timer;
      const finish=(ok,value)=>{if(done)return;done=true;try{deps.clearTimeout(timer);}catch{}
        try{check(deadline);}catch(error){reject(error);return;}if(ok)resolve(value);else reject(value);};
      promise.then(value=>finish(true,value),error=>finish(false,error));
      try{check(deadline);timer=deps.setTimeout(()=>finish(false,failure('OWNED_DEADLINE')),Math.max(1,deadline-clock()));}
      catch(error){done=true;reject(error);}});observed.catch(()=>{});return observed;}
    function step(fn,deadline){check(deadline);return bounded(actual(fn),deadline);}
    function ownedClient(config,bootstrap=false){
      if(config.host!==FIXED.host||config.port!==FIXED.port||config.ssl!==false||!ROLES.includes(config.user)||
        !([FIXED.databaseA,FIXED.databaseB].includes(config.database)||config.user==='postgres'&&config.database==='postgres'))throw failure('OWNED_CONFIG');
      if(!bootstrap&&clients.filter(c=>!c.bootstrap).length>=FIXED.clients)throw failure('OWNED_CLIENT_CAPACITY');
      const raw=deps.createClient(config),record={raw,bootstrap,closed:false,ending:null,pending:new Set()};clients.push(record);
      if(!raw||!['connect','query','end'].every(name=>typeof raw[name]==='function'))throw failure('OWNED_CLIENT');
      raw.on?.('error',()=>{unknownAcquisition=true;});
      const ownedActual=fn=>{const promise=actual(fn);record.pending.add(promise);promise.then(()=>record.pending.delete(promise),()=>record.pending.delete(promise));return promise;};
      const client={connect(){return ownedActual(()=>raw.connect());},query(...args){if(!alive)throw failure('OWNED_LATE_DISPATCH');
        if(args.some(value=>typeof value==='function'))throw failure('OWNED_QUERY_STYLE');
        check(bootstrap?startup:callbackDeadline);return ownedActual(()=>raw.query(...args));},
        end(){if(!record.ending){record.ending=ownedActual(()=>raw.end());record.ending.then(()=>{record.closed=true;},()=>{});}return record.ending;}};
      record.client=client;return client;
    }
    async function closeRecord(record,deadline){if(record.closed)return;await bounded(record.client.end(),deadline);if(!record.closed)throw failure('OWNED_CLIENT_CLOSE');}
    async function connector(request,beforeDispatch){
      const value=checkedScopedRequest(request);if(typeof beforeDispatch!=='function')throw failure('OWNED_REQUEST');
      if(!bootstrapClosed||!sqlProof||!alive||!callbackDeadline)throw failure('OWNED_CONNECTOR_STATE');
      const guard=()=>{check(callbackDeadline);if(!alive)throw failure('OWNED_LATE_DISPATCH');beforeDispatch();};
      guard();let client;const firstClient=clients.length;
      try{
        client=await establishFixedClient(value,{createClient:config=>ownedClient(config),passwordProvider:role=>{
          if(!ROLES.includes(role)||!passwords.has(role))throw failure('OWNED_ROLE');return ()=>passwords.get(role);},beforeDispatch:guard,
          timers:{setTimeout:deps.setTimeout,clearTimeout:deps.clearTimeout}});
        guard();let row;
        try{row=(await client.query(SERVER_SQL))?.rows?.[0];}
        catch(error){report.connectionRefusal??=Object.freeze({stage:'identity-query-unavailable'});throw error;}
        guard();
        if(!row){report.connectionRefusal??=Object.freeze({stage:'identity-row-unavailable'});throw failure('OWNED_CONNECTION_PROOF');}
        const matches=Object.freeze({database:row.database===value.database,role:row.role===value.role,address:row.address===FIXED.host,
          port:Number(row.port)===FIXED.port,version:Number(row.version)===sqlProof.version,
          start:startupNumber(ownData(row,'started'))===sqlProof.sqlStart,isolation:row.isolation==='read committed'});
        if(!Object.values(matches).every(match=>match===true)){
          report.connectionRefusal??=Object.freeze({stage:'identity-comparison',matches});throw failure('OWNED_CONNECTION_PROOF');
        }
        const record=clients.find(entry=>entry.client===client);
        ownedIdentities.set(client,{state:identityState,record,identity:Object.freeze({database:row.database,role:row.role,address:row.address,port:Number(row.port),version:Number(row.version),started:Number(row.started)})});
        return client;
      }catch(error){
        if(client)try{await bounded(client.end(),Math.min(clock()+15000,callbackDeadline));}catch{}
        if(clients.slice(firstClient).some(record=>!record.closed||record.pending.size))unknownAcquisition=true;
        throw errors.has(error)?error:failure('OWNED_CONNECT_FAILED');
      }
    }
    try{
      if(deps.platform!=='win32'||typeof runChecks!=='function')throw failure('OWNED_PLATFORM');
      report.resources=await step(()=>deps.resources(),startup);native=await step(()=>deps.binaries(startup),startup);
      const nonceBytes=deps.randomBytes(24);if(!(nonceBytes instanceof Uint8Array)||nonceBytes.length!==24)throw failure('OWNED_RANDOM');
      const nonce=Buffer.from(nonceBytes).toString('hex');nonceBytes.fill(0);
      const directories=await step(()=>deps.prepare(nonce,startup),startup);({runDirectory,dataDirectory,marker}=directories);
      verifyScopedOwnership({runDirectory,dataDirectory,marker,pid:1,markerText:JSON.stringify(marker),pidText:`1\n${dataDirectory}\n1\n55433\n`});
      report.runDirectory=runDirectory;report.cleanup.directoryRetained=true;
      for(const role of ROLES){const bytes=deps.randomBytes(32);if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw failure('OWNED_RANDOM');
        const password=Buffer.from(bytes).toString('base64url');bytes.fill(0);if(!/^[A-Za-z0-9_-]{43}$/u.test(password)||[...passwords.values()].includes(password))throw failure('OWNED_RANDOM');passwords.set(role,password);}
      phase='initdb';await step(()=>deps.utility(native.initdb,['-D',dataDirectory,'--username=postgres','--auth-local=reject','--auth-host=scram-sha-256','--encoding=UTF8','--no-locale','--no-instructions'],{deadline:startup}),startup);
      await step(()=>deps.noReparse([dataDirectory],startup),startup);await step(()=>deps.offlineAbsent(dataDirectory,startup),startup);
      phase='offline-scram-roles';
      const script=[`ALTER USER postgres WITH PASSWORD '${passwords.get('postgres')}';`,
        'CREATE ROLE murmingle_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;',
        ...ROLES.slice(1).map(role=>`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${passwords.get(role)}';`)].join('\n')+'\n';
      await step(()=>deps.utility(native.postgres,['--single','-D',dataDirectory,'-c','shared_buffers=16MB','-c','max_connections=12','-c','max_worker_processes=0','-c','max_wal_senders=0',
        '-c','password_encryption=scram-sha-256','-c','logging_collector=off','-c','log_statement=none','-c','log_min_error_statement=panic','-c','exit_on_error=on','postgres'],{input:script,deadline:startup}),startup);
      phase='fixed-port';await step(()=>deps.freePort(),Math.min(clock()+5000,startup));
      phase='postmaster';check(startup);server=deps.spawnServer(native.postgres,['-D',dataDirectory,'-h','127.0.0.1','-p','55433','-c','shared_buffers=16MB','-c','work_mem=1MB','-c','maintenance_work_mem=8MB',
        '-c','temp_buffers=1MB','-c','wal_buffers=1MB','-c','min_wal_size=32MB','-c','max_wal_size=64MB','-c','max_connections=12','-c','max_worker_processes=0',
        '-c','max_parallel_workers=0','-c','max_wal_senders=0','-c','autovacuum=off','-c','jit=off','-c','logging_collector=off','-c','log_statement=none','-c','log_min_error_statement=panic'],startup);
      report.cleanup.stopped=false;report.cleanup.childExited=false;
      if(!server||!Number.isSafeInteger(server.pid)||server.pid<1||!server.exit||typeof server.hasExited!=='function')throw failure('OWNED_POSTMASTER');
      phase='bootstrap';let bootstrapResponse,boot,bootstrapSucceeded=false,lastReadinessFailure,hasReadinessFailure=false;
      for(let attempt=0;attempt<25;attempt++){
        check(startup);if(server.hasExited())throw failure('OWNED_POSTMASTER_EXITED');
        boot=ownedClient({host:'127.0.0.1',port:55433,user:'postgres',database:'postgres',password:passwords.get('postgres'),ssl:false,
          connectionTimeoutMillis:1000,application_name:'murmingle-nhpg2-bootstrap',options:'-c statement_timeout=5000 -c lock_timeout=3000'},true);bootstrapClosed=false;
        try{await bounded(boot.connect(),Math.min(clock()+2000,startup));bootstrapResponse=await bounded(boot.query(BOOTSTRAP_SQL),Math.min(clock()+5000,startup));bootstrapSucceeded=true;break;}
        catch(error){lastReadinessFailure=error;hasReadinessFailure=true;
          await closeRecord(clients.at(-1),Math.min(clock()+5000,startup));if(physical.size)throw failure('OWNED_BOOTSTRAP_UNSETTLED');
          // Only known-settled readiness failures may retry. Keep the inherited
          //100ms pause as an actual tracked timer promise under ORIGINAL startup.
          if(attempt<24)await step(()=>new Promise(resolve=>deps.setTimeout(resolve,100)),startup);
        }
      }
      if(physical.size||unknownAcquisition)throw failure('OWNED_BOOTSTRAP_UNSETTLED');
      // PID-file MyStartTime and SQL PgStartTime belong to different startup
      // phases. Physical ownership authorizes cleanup only, never SQL handoff.
      try{
        const pidStart=await step(()=>deps.ownership({runDirectory,dataDirectory,marker,pid:server.pid,expectedStart:null},startup),startup);
        if(!Number.isSafeInteger(pidStart)||pidStart<1)throw failure('OWNERSHIP_PID');
        proof={pid:server.pid,pidStart};report.startup.pidStart=pidStart;
      }catch(error){if(!bootstrapSucceeded&&hasReadinessFailure)throw lastReadinessFailure;throw error;}
      if(!bootstrapSucceeded){if(hasReadinessFailure)throw lastReadinessFailure;throw failure('OWNED_SERVER_PROOF');}
      const ready=bootstrapIdentity(bootstrapResponse);report.startup.sqlStart=ready.started;
      if(!samePath(ready.directory,dataDirectory)||ready.listen!=='127.0.0.1'||ready.port!==55433||!Number.isSafeInteger(ready.version)||ready.version<170000||ready.version>=180000||
        ready.started===null)throw failure('OWNED_SERVER_PROOF');
      sqlProof=Object.freeze({sqlStart:ready.started,version:ready.version});
      report.server={port:55433,postmasterPid:server.pid,version:sqlProof.version,ownershipVerified:true};
      await closeRecord(clients.at(-1),Math.min(clock()+15000,startup));bootstrapClosed=clients.filter(c=>c.bootstrap).every(c=>c.closed);
      if(!bootstrapClosed||physical.size)throw failure('OWNED_BOOTSTRAP_UNSETTLED');
      phase='checks';callbackDeadline=clock()+FIXED.callbackMs;check(Math.min(callbackDeadline,overall-FIXED.stopMs-FIXED.reportMs));
      callbackSettled=false;callback=Promise.resolve().then(()=>runChecks(connector));callback.then(()=>{callbackSettled=true;},()=>{callbackSettled=true;});
      report.checks=await bounded(callback,callbackDeadline);
      if(report.checks?.status!=='passed')throw failure('OWNED_CHECKS_FAILED');report.status='passed';
    }catch(error){report.failure={phase,code:safeCode(error)};}
    finally{
      identityState.active=false;alive=false;closeDeadline=Math.min(clock()+FIXED.stopMs,overall-FIXED.reportMs);
      if(callback&&!callbackSettled)try{await bounded(callback,closeDeadline);}catch{}
      for(const record of clients)if(!record.closed&&record.client)try{await closeRecord(record,closeDeadline);}catch{}
      report.cleanup.clientsClosed=clients.every(c=>c.closed);report.cleanup.physicalSettled=physical.size===0&&callbackSettled&&!unknownAcquisition;
      if(server&&!server.hasExited()){
        if(proof&&report.cleanup.clientsClosed&&report.cleanup.physicalSettled){
          try{await step(()=>deps.ownership({runDirectory,dataDirectory,marker,pid:proof.pid,expectedStart:proof.pidStart},closeDeadline),closeDeadline);
            await step(()=>deps.utility(native.pgCtl,['-D',dataDirectory,'stop','-m','smart','-w','-t','15'],{deadline:closeDeadline}),closeDeadline);
            await bounded(server.exit,closeDeadline);report.cleanup.stopped=server.hasExited();report.cleanup.childExited=server.hasExited();
            stopVerified=report.cleanup.stopped;report.cleanup.reason=stopVerified?'verified-own-server-smart-stopped':'own-server-still-running';
          }catch{report.cleanup.reason='verified-smart-stop-refused-or-timed-out-no-kill';}
        }else report.cleanup.reason='unknown-work-client-or-ownership-no-stop';
      }else{report.cleanup.stopped=true;report.cleanup.childExited=true;report.cleanup.reason=server?'own-server-exited':'not-started';}
      report.cleanup.physicalSettled=physical.size===0&&callbackSettled&&!unknownAcquisition;
      if(!stopVerified||!report.cleanup.stopped||!report.cleanup.clientsClosed||!report.cleanup.physicalSettled||unknownAcquisition||report.connectionRefusal!==null)report.status='failed';
      if(server&&!server.hasExited())server.unref?.();passwords.clear();report.elapsedMilliseconds=Math.round(clock()-started);
      const reportDeadline=Math.min(clock()+FIXED.reportMs,overall);
      if(runDirectory){try{await step(()=>deps.persist(runDirectory,marker,report,reportDeadline),reportDeadline);}catch{report.status='failed';report.resultPersistence='refused-or-failed-no-overwrite';}}
      report.cleanup.physicalSettled=physical.size===0&&callbackSettled&&!unknownAcquisition;
      if(!report.cleanup.physicalSettled)report.status='failed';report.elapsedMilliseconds=Math.round(clock()-started);
    }
    return report;
  };
}

const FILE_SCRIPT=String.raw`$ErrorActionPreference='Stop';try{$paths=[Console]::In.ReadToEnd()|ConvertFrom-Json;foreach($p in $paths){$item=Get-Item -LiteralPath ([string]$p) -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){exit 1}};[Console]::Out.Write('checked')}catch{exit 1}`;
function environment(){return Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT','ComSpec'].filter(key=>typeof process.env[key]==='string').map(key=>[key,process.env[key]]));}
function deadlineCheck(now){let last=null;return deadline=>{const time=now();
  if(!Number.isFinite(time)||time<0||last!==null&&time<last||!Number.isFinite(deadline)||deadline<0)throw failure('OWNED_CLOCK');
  last=time;if(time>=deadline)throw failure('OWNED_DEADLINE');return time;};}
/** Pure trusted launch seam: tests inject invented spawn/clock/timers only. */
export function createNativeUtility({spawn:launch,now,setTimeout:schedule,clearTimeout:cancel,environment:env}){
  const check=deadlineCheck(now);
  function utility(executable,args,{input='',deadline,collect=false}){
    return new Promise((resolve,reject)=>{let child,timer,bytes=0,output='',failed=false,launchedAt;
      try{const settings={shell:false,windowsHide:true,env:env(),stdio:['pipe','pipe','pipe']};launchedAt=check(deadline);child=launch(executable,args,settings);}
      catch(error){reject(errors.has(error)?error:failure('OWNED_UTILITY_START'));return;}
      child.once('error',()=>{failed=true;});child.stdout.on('data',chunk=>{bytes+=chunk.length;if(collect&&bytes<=1024)output+=chunk.toString('utf8');if(bytes>65536){failed=true;child.kill();}});
      child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){failed=true;child.kill();}});child.stdin.on('error',()=>{failed=true;});
      child.once('close',code=>{cancel(timer);if(failed||code!==0||collect&&bytes>1024)reject(failure('OWNED_UTILITY_FAILED'));else resolve(collect?output:'');});
      try{timer=schedule(()=>{failed=true;child.kill();},Math.max(1,deadline-launchedAt));child.stdin.end(input);}
      catch{failed=true;child.kill();}
    });
  }
  function spawnServer(executable,args,deadline){const settings={shell:false,windowsHide:true,env:env(),stdio:['ignore','ignore','ignore']};
    check(deadline);const child=launch(executable,args,settings);let exited=false;
    const exit=new Promise(resolve=>{child.once('error',()=>{});child.once('close',()=>{exited=true;resolve();});});
    return {pid:child.pid,exit,hasExited:()=>exited,unref:()=>child.unref()};
  }
  return Object.freeze({utility,spawnServer});
}
function ancestors(filename){const result=[];let cursor=path.win32.resolve(filename);while(true){result.push(cursor);const next=path.win32.dirname(cursor);if(next===cursor)return result.reverse();cursor=next;}}
/** Actual filesystem orchestration with trusted injected filesystem and clock.
 * Every continuation rechecks its original deadline before mutation or launch.
 */
export function createFileOps({fs,utility,now}){
  const check=deadlineCheck(now);
  async function noReparse(paths,deadline){check(deadline);const names=[...new Set(paths.flatMap(ancestors))];if(names.length>128)throw failure('OWNED_PATH_CAPACITY');
    for(const name of names){check(deadline);const info=await fs.lstat(name);check(deadline);if(info.isSymbolicLink())throw failure('REPARSE_TARGET');
      const resolved=await fs.realpath(name);check(deadline);if(!samePath(resolved,name))throw failure('REPARSE_TARGET');}
    check(deadline);const answer=await utility(FIXED.powershell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(FILE_SCRIPT,'utf16le').toString('base64')],
      {input:JSON.stringify(names),deadline,collect:true});check(deadline);if(answer!=='checked')throw failure('REPARSE_TARGET');}
  async function ordinaryText(filename,deadline){await noReparse([filename],deadline);check(deadline);const info=await fs.lstat(filename);check(deadline);
    if(!info.isFile()||info.size>4096)throw failure('OWNERSHIP_SIZE');const text=await fs.readFile(filename,'utf8');check(deadline);return text;}
  async function binaries(deadline){check(deadline);const files=['postgres.exe','initdb.exe','pg_ctl.exe'].map(name=>path.win32.join(FIXED.bin,name));
    for(const file of [...files,FIXED.powershell]){check(deadline);const info=await fs.lstat(file);check(deadline);if(!info.isFile())throw failure('BINARY_NOT_REGULAR');}
    await noReparse([...files,FIXED.powershell],deadline);check(deadline);return {postgres:files[0],initdb:files[1],pgCtl:files[2]};}
  async function prepare(nonce,deadline){check(deadline);const dataParent=path.win32.dirname(FIXED.parent);await noReparse([path.win32.dirname(dataParent)],deadline);check(deadline);
    for(const name of [dataParent,FIXED.parent]){check(deadline);try{await fs.mkdir(name);}catch(error){if(error.code!=='EEXIST')throw error;}check(deadline);
      const info=await fs.lstat(name);check(deadline);if(!info.isDirectory())throw failure('OWNED_PARENT');await noReparse([name],deadline);check(deadline);}
    check(deadline);const runDirectory=await fs.mkdtemp(path.win32.join(FIXED.parent,'nhpg2-'));check(deadline);
    const dataDirectory=path.win32.join(runDirectory,'pgdata'),marker={schema:FIXED.marker,nonce,runDirectory};
    await publishOwnership(runDirectory,marker,deadline);check(deadline);
    await noReparse([runDirectory,path.win32.join(runDirectory,'ownership.pending'),path.win32.join(runDirectory,'ownership.json')],deadline);check(deadline);return {runDirectory,dataDirectory,marker};}
  async function publishOwnership(runDirectory,marker,deadline){
    const pending=path.win32.join(runDirectory,'ownership.pending'),final=path.win32.join(runDirectory,'ownership.json');
    check(deadline);const handle=await fs.open(pending,'wx');
    try{check(deadline);await handle.writeFile(JSON.stringify(marker)+'\n','utf8');check(deadline);}
    finally{await handle.close();}
    // Publishing an already closed complete inode avoids the observer seeing a
    // partially written final marker. link is exclusive: no overwrite/replacement.
    check(deadline);await fs.link(pending,final);check(deadline);
  }
  async function offlineAbsent(directory,deadline){check(deadline);try{await fs.lstat(path.win32.join(directory,'postmaster.pid'));check(deadline);throw failure('UNEXPECTED_POSTMASTER');}
    catch(error){check(deadline);if(error.code!=='ENOENT')throw error;}}
  async function ownership(scope,deadline){check(deadline);const markerText=await ordinaryText(path.win32.join(scope.runDirectory,'ownership.json'),deadline);check(deadline);
    const pidText=await ordinaryText(path.win32.join(scope.dataDirectory,'postmaster.pid'),deadline);check(deadline);return verifyScopedOwnership({...scope,markerText,pidText});}
  async function persist(runDirectory,marker,report,deadline){check(deadline);const data=JSON.stringify(report);if(Buffer.byteLength(data)>262144)throw failure('OWNED_REPORT_CAPACITY');
    const saved=JSON.parse(await ordinaryText(path.win32.join(runDirectory,'ownership.json'),deadline));check(deadline);
    if(saved.schema!==marker.schema||saved.nonce!==marker.nonce||saved.runDirectory!==runDirectory)throw failure('OWNERSHIP_MARKER');
    check(deadline);await fs.writeFile(path.win32.join(runDirectory,'native-result.json'),data+'\n',{flag:'wx'});check(deadline);}
  return Object.freeze({noReparse,binaries,prepare,publishOwnership,offlineAbsent,ownership,persist});
}
async function realDependencies(){
  const require=createRequire(new URL('../../package.json',import.meta.url)),{Client}=require('pg');
  const launchers=createNativeUtility({spawn,now:()=>performance.now(),setTimeout,clearTimeout,environment});
  const files=createFileOps({fs:{lstat,realpath,mkdir,mkdtemp,writeFile,readFile,open,link},utility:launchers.utility,now:()=>performance.now()});
  return {platform:process.platform,now:()=>performance.now(),setTimeout,clearTimeout,randomBytes,
    async resources(){const[c,d]=await Promise.all([statfs('C:\\',{bigint:true}),statfs('D:\\',{bigint:true})]),mib=1024**2;
      if(c.bavail*c.bsize<BigInt(2048*mib)||d.bavail*d.bsize<BigInt(4096*mib)||freemem()<1024*mib)throw failure('RESOURCE_PREFLIGHT');return {cFreeMiB:Number(c.bavail*c.bsize/BigInt(mib)),dFreeMiB:Number(d.bavail*d.bsize/BigInt(mib)),physicalFreeMiB:Math.floor(freemem()/mib)};},
    ...files,...launchers,async freePort(){const server=createServer();try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:55433,exclusive:true},resolve);});
      if(server.address()?.port!==55433)throw failure('OWNED_PORT');}finally{if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}},
    createClient:config=>new Client(config),};
}

/** Root invokes ONLY after its exact supervisor handshake and source/binary gate. */
export async function runWithOwnedScopedPostgres(runChecks){return createOwnedScopedPostgres(await realDependencies())(runChecks);}





