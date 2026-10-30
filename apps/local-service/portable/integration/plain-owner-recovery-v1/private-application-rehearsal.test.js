import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createPrivateSerialDatabase,createPrivateHttpRequestForTest,createPrivateRawHttpRequestForTest,runPrivateApplicationRehearsalForTest,runPrivateModelApplicationRehearsalForTest,runPrivateProductApplicationRehearsalForTest,privateApplicationStoragePaths,PRIVATE_APPLICATION_CASES} from './private-application-rehearsal.js';
import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';
import {runPrivateAutomatic18ApplicationRehearsalForTest,runPrivateAutomatic18BrowserApplicationRehearsalForTest,PRIVATE_AUTOMATIC18_APPLICATION_CASES} from './private-application-rehearsal.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('fixed real-length SQLite path budgets journal suffix and NUL before storage allocation',()=>{
 const cluster=PRIVATE_RUN_ROOT+'\\run-'+'a'.repeat(48)+'\\cluster\\nhpg-ABC123';
 // Preserve the historical D: overflow regression, and independently verify
 // the shorter new C: path. The Windows MAX_PATH guard itself stays260.
 const legacy='D:\\GITProjekts\\universal-discussion-bootstrap\\apps\\local-service\\data\\canonical-migration-backups\\hierarchy-private-restore-runs'+'\\run-'+'a'.repeat(48)+'\\cluster\\nhpg-ABC123';
 const old=legacy+'\\application-rehearsal',short=cluster+'\\app';
 assert.equal((old+'\\private-conversations.sqlite').length,252);
 assert.equal((old+'\\private-conversations.sqlite-journal').length,260);
 assert.throws(()=>privateApplicationStoragePaths(old),{code:'APPLICATION_SQLITE_PATH'});
 const paths=privateApplicationStoragePaths(short);assert.equal(paths.accountDatabasePath,short+'\\accounts.sqlite');
 assert.equal((short+'\\private-conversations.sqlite-journal').length,183);
 const overhead='\\private-conversations.sqlite-journal'.length+1;
 assert.doesNotThrow(()=>privateApplicationStoragePaths('x'.repeat(260-overhead)));
 assert.throws(()=>privateApplicationStoragePaths('x'.repeat(261-overhead)),{code:'APPLICATION_SQLITE_PATH'});
});
test('actual HTTP client fixes destination4185 and waits response original even after request close',async()=>{
 let req;const request=createPrivateHttpRequestForTest(options=>{assert.equal(options.host,'127.0.0.1');assert.equal(options.port,4185);assert.equal(options.agent,false);assert.equal(options.headers.host,'127.0.0.1:4174');req=new EventEmitter();req.setTimeout=(ms,fn)=>assert.equal(ms,5000);req.end=()=>{};return req;});
 let settled=false;const pending=request({method:'GET',url:'/v1/health',headers:{host:'127.0.0.1:4174'},body:null}).then(value=>{settled=true;return value;});const response=new EventEmitter();response.statusCode=200;req.emit('response',response);req.emit('close');await turn();assert.equal(settled,false);response.emit('data',Buffer.from('{"protocol":"local-service/v1"}'));response.emit('end');assert.equal((await pending).value.protocol,'local-service/v1');
});
test('actual HTTP client refuses oversized/private response without exposing body or retaining original socket',async()=>{
 let req,response;const request=createPrivateHttpRequestForTest(()=>{req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>{};req.destroy=()=>req.emit('close');return req;});
 const pending=request({method:'GET',url:'/v1/health',headers:{},body:null});response=new EventEmitter();response.statusCode=200;response.destroy=()=>response.emit('close');req.emit('response',response);response.emit('data',Buffer.alloc(262145,65));await assert.rejects(pending,{code:'APPLICATION_HTTP_BOUND'});
});

test('raw browser proxy transport retains actual status, headers and bytes including an empty preflight',async()=>{
 for(const [status,body]of [[204,Buffer.alloc(0)],[403,Buffer.from('{ "error": "Denied" }')]]){
  let req;const request=createPrivateRawHttpRequestForTest(options=>{assert.equal(options.port,4185);req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>{};return req;});
  const pending=request({method:status===204?'OPTIONS':'POST',url:'/v1/commands',headers:{host:'127.0.0.1:4174'},body:null});
  const res=new EventEmitter();res.statusCode=status;res.headers={'access-control-allow-origin':'chrome-extension://'+'b'.repeat(32),'content-type':'application/json'};
  req.emit('response',res);res.emit('data',body);res.emit('end');req.emit('close');
  const result=await pending;assert.equal(result.status,status);assert.equal(result.headers,res.headers);assert.ok(result.body.equals(body));assert.equal(Object.hasOwn(result,'value'),false);
 }
});

test('actual serial adapter queues bounded work on one connection and closes once after originals',async()=>{
 const held=deferred(),events=[];let dispatched=0,ends=0;
 const db=createPrivateSerialDatabase({query:async sql=>{events.push(sql);dispatched++;if(dispatched===1)await held.promise;return {command:'SELECT',rows:[]};},end:async()=>{ends++;events.push('END');}},()=>{});
 const originals=Array.from({length:8},(_,i)=>db.query('SELECT '+i));await assert.rejects(db.query('SELECT overflow'),{code:'APPLICATION_DATABASE_CAPACITY'});await turn();assert.equal(dispatched,1);
 const close=db.close();assert.equal(db.close(),close);await assert.rejects(db.query('SELECT late'),{code:'APPLICATION_DATABASE_CAPACITY'});assert.equal(ends,0);held.resolve();await Promise.all(originals);await close;assert.equal(dispatched,8);assert.equal(ends,1);assert.equal(events.at(-1),'END');assert.deepEqual(db.snapshot(),{admitted:0,closed:true,pending:0});
});
test('same-connection transaction preserves falsy failure, rolls back before next work and drains close',async()=>{
 const events=[];const db=createPrivateSerialDatabase({query:async sql=>{events.push(sql);return {command:sql==='COMMIT'?'COMMIT':'SELECT',rows:[]};},end:async()=>events.push('END')},()=>{});
 let caught='missing';try{await db.transaction(async tx=>{await tx.query('SELECT inside');throw false;});}catch(e){caught=e;}assert.equal(caught,false);await db.query('SELECT after');await db.close();assert.deepEqual(events,['BEGIN','SELECT inside','ROLLBACK','SELECT after','END']);
});

function fixture({failAt=null,closeFails=false,automaticTopics=false}={}){
 const identities=new WeakMap(),events=[],tokens=['one-private-test-token-'.padEnd(43,'1'),'two-private-test-token-'.padEnd(43,'2')];let config,policy=automaticTopics?5:1,edited=false,withdrawn=false,revoked=false,proof=null,serial=0;
 const run=PRIVATE_RUN_ROOT+'\\run-'+'a'.repeat(48),cluster=run+'\\cluster\\nhpg-TEST01';
  const value={clusterDirectory:cluster,outputDirectory:run+'\\output',ownerDatabase:{async query(sql,args){events.push('owner-query');if(sql.startsWith('SELECT id FROM'))return {rows:[{id:'topic-empty'}]};if(sql.startsWith('SELECT l.source_id')){assert.match(sql,/s.provenance='owner-local-page-embedding\/v1'/u);assert.match(sql,/NOT EXISTS/u);return {rows:[{source_id:'source-saved',topic_id:'topic-saved'}]};}if(sql.includes('semantic_set_owner_policy'))return {rows:[{revision:String(++policy)}]};if(sql.includes(' AS operations,')){events.push('model-owner-join');assert.equal(args.length,10);assert.match(sql,/array_send\(e.values_double\)=pg_catalog.array_send\(i.body_values\)/u);assert.match(sql,/o.operation_id=\$1/u);return {rows:[{operations:1,sources:1,observations:1}]};}if(sql.includes('FOR UPDATE')){events.push('isolation-lane');return {rows:[{active_operation_id:null,active_lease_token:null,active_lease_until:null}]};}if(sql.includes('LIMIT 17')){events.push('isolation-jobs');return {rows:[]};}if(sql.includes(' AS live_jobs,')){events.push('isolation-empty');return {rows:[{live_jobs:0,lane_empty:true}]};}throw Error('Unexpected fake query');},
   async transaction(work){events.push('isolation-begin');try{const result=await work({query:(...args)=>value.ownerDatabase.query(...args)});events.push('isolation-commit');return result;}catch(error){events.push('isolation-rollback');throw error;}}},
  async connectFixedRole(request,guard){guard();assert.equal(request.role,serial<2?'murmingle_app':serial===2?'murmingle_ingest_worker':'murmingle_crawler_submitter');assert.equal(request.database,'murmingle_hierarchy_fixture_20261026_a');const number=++serial;events.push('connect-'+number);const client={query:async sql=>{events.push('query-'+number);return {command:sql==='COMMIT'?'COMMIT':'SELECT',rows:[]};},end:async()=>{events.push('end-'+number);}};identities.set(client,{database:request.database,role:request.role,address:'127.0.0.1',port:55433,started:1000});return client;},
  getOwnedIdentity:client=>identities.get(client),checkDeadline:()=>{},deadline:300000,upgrade:Object.freeze({schemaVersion:automaticTopics?18:17,preservedLegacyTables:automaticTopics?27:18,legacyRowsUnchanged:true})};
 const training=[{id:'real-train-01',sourceInputHash:'a'.repeat(64),url:'https://en.wikipedia.org/wiki/Tetris',title:'Tetris - Wikipedia',extractorVersion:'crawler-static-html-prefix/v1'},
  {id:'real-train-04',sourceInputHash:'b'.repeat(64),url:'https://fr.wikipedia.org/wiki/Octopoda',title:'Octopoda',extractorVersion:'crawler-static-html-prefix/v1'}];
 const ports={now:()=>1,randomBytes:n=>Buffer.alloc(n,3),randomUUID:()=> 'invented-id',
  async readTraining(){events.push('training-read');return training;},
  async model(options){events.push('model-run');assert.equal(options.foregroundSourceId,'source-saved');assert.notEqual(options.workerDatabase,options.submitterDatabase);assert.equal(await options.readCapturedTrainingInputs(),training);
   await options.workerDatabase.query('SELECT worker');await options.submitterDatabase.query('SELECT submitter');await options.readHttp('context',{sourceId:'source-saved'});
   return {status:'passed',testComposition:true,installed:{matcherIdentityHash:'c'.repeat(64)},completed:training.map((row,index)=>({id:row.id,sourceInputHash:row.sourceInputHash,operationId:'model-operation-'+index,operationDigest:'d'.repeat(64),sourceId:'model-source-'+index,sourceVersion:'1',topicId:'model-topic-'+index,supportedPath:['games']}))};},
  async prepareStorage(a){events.push('prepare');assert.equal(a.privateAppDirectory,cluster+'\\app');return {databasePath:'invented-application.sqlite',accountDatabasePath:'invented-accounts.sqlite'};},
  async seedAccounts(filename,key){events.push('seed-close');assert.equal(key.length,32);return [{token:tokens[0],username:'RehearsalOne'},{token:tokens[1],username:'RehearsalTwo'}];},
  async openApplication(options){events.push('app-open');assert.equal(Object.hasOwn(options,'ai'),false);assert.equal(Object.hasOwn(options,'chatgptFetchImpl'),false);assert.equal(options.hierarchicalTopics,true);assert.notEqual(options.canonicalDatabase,options.urlSelectionDatabase);config=options.config;
   assert.equal(options.automaticTopics,automaticTopics?true:undefined);
   await options.canonicalDatabase.transaction(tx=>tx.query('SELECT startup'));return {handle:()=>{},close:async()=>{events.push('app-close');if(closeFails)throw Error('PRIVATE SECONDARY MUST NOT LEAK');}};},
  async listen(){events.push('listen');return {close:async()=>events.push('server-close')};},
  async request({method,url,headers,body}){events.push('http');await Promise.resolve();if(url===failAt)throw false;const input=body===null?null:JSON.parse(body);const response=(status,value)=>({status,value});
   if(headers.host!=='127.0.0.1:4174'||headers.origin!==config.origin)return response(403,{});if(headers.authorization!=='Bearer '+config.capability)return response(401,{});
   const session=headers['x-account-session'];if(Object.hasOwn(headers,'x-demo-actor'))return response(403,{});if(session&&(session!==tokens[0]&&session!==tokens[1]||session===tokens[1]&&revoked))return response(401,{});
   if(url==='/v1/health')return response(200,{protocol:'local-service/v1'});
   if(url==='/v1/semantic/capabilities/v2'){assert.equal(method,'POST');assert.deepEqual(input,{});return response(200,{protocol:'semantic-topics/v2',authorContext:'authored-topics/v2',topicSearch:'named-topics/v2'});}
   if(url==='/v1/semantic/search'){assert.equal(headers['x-murmingle-semantic'],'2');assert.deepEqual(input,{query:'',limit:10,cursor:null});events.push('modern-search');return response(200,{topics:[],nextCursor:null});}
   if(url==='/v1/version')return response(200,{version:{generation:'generation-private',revision:1}});
   if(url==='/v1/semantic/topics')return response(200,{policyRevision:policy,topics:Array.from({length:16},(_,i)=>({id:'node-'+i}))});
   if(url==='/v1/catalog/context'){assert.deepEqual(input,{sourceId:'source-saved',topicId:'topic-saved'});return response(200,{version:{generation:'generation-private',revision:1},sources:[{id:'source-saved',topicId:'topic-saved',provenance:'owner-local-page-embedding/v1',url:'https://example.test/actual-saved'}]});}
   if(url==='/v1/catalog/url-selection'){events.push('url-reader-used');assert.deepEqual(input,{url:'https://example.test/actual-saved'});return response(200,{catalog:{version:{generation:'generation-private',revision:1},sources:[{id:'source-saved',topicId:'topic-saved',provenance:'owner-local-page-embedding/v1',url:input.url}]},discussion:{version:{generation:'generation-private',revision:1},topic:{id:'topic-saved'},roots:[]}});}
   if(url==='/v1/discussions/page'){assert.deepEqual(input,{topicId:'topic-saved',limit:1,cursor:null});return response(200,{version:{generation:'generation-private',revision:1},topic:{id:'topic-saved'},items:[]});}
   if(url==='/v1/semantic/context')return response(200,automaticTopics?{status:'classified',selectedPath:['games']}:{status:'pending',selectedPath:[]});
   if(url==='/v1/account/capabilities')return response(200,{emailCode:false,chatGPTIdentity:false});
   if(url==='/v1/account/email/request')return response(409,{});
   if(url==='/v1/account/me')return response(200,{id:session===tokens[0]?'private-account-one':'private-account-two',username:session===tokens[0]?'RehearsalOne':'RehearsalTwo'});
   if(url==='/v1/account/username'){assert.ok(['AI','ai_bot','_aibot'].includes(input.username));return response(409,{});}
   if(url==='/v1/account/session/logout'){revoked=true;return response(200,{loggedOut:true});}
   if(url==='/v1/ai/status')return response(404,{});
   if(url.startsWith('/v1/topics/'))return response(200,{discussionId:'discussion-private',roots:[{id:'root-private',state:withdrawn?'deleted':'visible',replies:[{id:'reply-private',edited}]}]});
   if(url==='/v1/commands'){const c=input.command;if(session===tokens[1])return response(403,{});if(c.type==='edit')edited=true;if(c.type==='withdraw')withdrawn=true;return response(200,{result:{contributionId:c.type==='reply'?'reply-private':'root-private'}});}
   throw Error('Unexpected invented HTTP route');
  },
  async publishProof(a,value){events.push('proof');proof=structuredClone(value);const raw=Buffer.from(JSON.stringify(value)+'\n');assert.ok(raw.length<=32768);for(const secret of [...tokens,config?.capability,'Private rehearsal root','PRIVATE SECONDARY MUST NOT LEAK'])if(secret)assert.equal(raw.includes(secret),false);return {sha256:sha(raw),bytes:raw.length};},
 };
 return {value,ports,events,get proof(){return proof;}};
}
test('full fake-port orchestration keeps normal app composition and separate finite16-case proof',async()=>{
 const f=fixture(),result=await runPrivateApplicationRehearsalForTest(f.value,f.ports);assert.equal(result.status,'passed');assert.match(result.proofSha256,/^[a-f0-9]{64}$/);assert.equal(f.proof.cases.length,16);assert.deepEqual(f.proof.cases.map(x=>x.name),PRIVATE_APPLICATION_CASES);assert.ok(f.proof.cases.every(x=>x.status==='passed'));assert.equal(f.proof.pendingCases,0);assert.equal(f.proof.scope.testComposition,true);assert.equal(f.proof.scope.realHttp,false);assert.equal(f.proof.scope.provider,false);assert.equal(f.proof.upgrade.legacyRowsUnchanged,true);assert.equal(f.proof.counts.fixtureActors,2);assert.equal(f.proof.counts.maximumConcurrentHttp,4);
 assert.equal(f.events.filter(x=>x==='url-reader-used').length,1);assert.ok(f.events.indexOf('seed-close')<f.events.indexOf('app-open'));for(const event of ['server-close','app-close','end-1','end-2'])assert.ok(f.events.indexOf(event)<f.events.indexOf('proof'));assert.deepEqual(f.proof.cleanup,{serverClosed:true,applicationClosed:true,appClientClosed:true,urlClientClosed:true,pendingHttp:0,pendingDatabase:0});
 assert.equal(f.events.includes('training-read'),false);assert.equal(f.events.includes('model-run'),false);assert.equal(Object.hasOwn(f.proof,'model'),false);
});

test('separate automatic18 composition requires18/27, retains all16 HTTP checks and proves modern search',async()=>{
 const f=fixture({automaticTopics:true});assert.equal((await runPrivateAutomatic18ApplicationRehearsalForTest(f.value,f.ports)).status,'passed');
 assert.equal(f.proof.schema,'private-automatic18-application-http-proof/v1');assert.deepEqual(f.proof.cases.map(x=>x.name),PRIVATE_AUTOMATIC18_APPLICATION_CASES);
 assert.equal(f.proof.cases.length,18);assert.ok(f.proof.cases.every(x=>x.status==='passed'));assert.equal(f.proof.pendingCases,0);
 assert.deepEqual(f.proof.upgrade,{schemaVersion:18,preservedLegacyTables:27,legacyRowsUnchanged:true});assert.equal(f.events.filter(x=>x==='modern-search').length,1);
 assert.equal(f.proof.scope.realHttp,false);assert.equal(f.proof.cleanup.pendingDatabase,0);
 await assert.rejects(runPrivateApplicationRehearsalForTest(f.value,f.ports),{code:'APPLICATION_UPGRADE'});
 const old=fixture();await assert.rejects(runPrivateAutomatic18ApplicationRehearsalForTest(old.value,old.ports),{code:'APPLICATION_UPGRADE'});assert.equal(old.events.length,0);
});

test('automatic18 capability and search failures cannot pass using only the preserved legacy HTTP cases',async()=>{
 for(const failAt of ['/v1/semantic/capabilities/v2','/v1/semantic/search']){
  const f=fixture({automaticTopics:true,failAt});assert.equal((await runPrivateAutomatic18ApplicationRehearsalForTest(f.value,f.ports)).status,'failed');
  assert.ok(f.proof.cases.slice(0,16).every(x=>x.status==='passed'));assert.ok(f.proof.cases.slice(16).some(x=>x.status!=='passed'));
  assert.equal(f.proof.cleanup.serverClosed,true);assert.equal(f.proof.cleanup.appClientClosed,true);assert.equal(f.proof.cleanup.pendingHttp,0);
 }
});

function productFixture(settings={}){
 const f=fixture(settings),origin='chrome-extension://'+'b'.repeat(32),ownerQuery=f.value.ownerDatabase.query;let result=null,closing=null,rawRequest;
 f.value.ownerDatabase.query=async(sql,args)=>{
  if(sql.includes(' AS original_root_high_watermark')){f.events.push('original-root-high-watermark');return {rows:[{original_root_high_watermark:'97'}]};}
  if(sql.includes(' AS manual_snapshots')){f.events.push('browser-owner-join');assert.equal(args.length,7);assert.equal(args[4],'account-private-account-one');
   assert.match(sql,/c.origin_source_id IS NULL AND c.anchor_source_id IS NULL/u);assert.match(sql,/r.payload::jsonb->>'body'=\$6/u);return {rows:[{roots:1,replies:1,manual_snapshots:0}]};}
  return ownerQuery(sql,args);
 };
 f.ports.requestRaw=async input=>{f.events.push('browser-raw-http');assert.equal(input.headers.Host,'127.0.0.1:4174');if(input.method==='GET'){assert.equal(Object.hasOwn(input.headers,'Origin'),false);return {status:200,headers:{'content-type':'application/json'},body:Buffer.from('{}')};}assert.equal(input.headers.Origin,origin);return {status:204,headers:{'access-control-allow-origin':origin},body:Buffer.alloc(0)};};
 f.ports.legacy=async input=>{f.events.push('original-legacy-run');assert.equal(input.ownerDatabase,f.value.ownerDatabase);assert.equal(input.workerDatabase.dialect,'pg');assert.equal(input.originalRootHighWatermark,'97');assert.equal(input.deadline,f.value.deadline);return {status:'passed',resourcesClosed:true,testComposition:true};};
 f.ports.openBrowser=async options=>{
  f.events.push('browser-open');assert.equal(f.events.includes('app-open'),false);assert.equal(options.profileDirectory,f.value.clusterDirectory+'\\app\\c-aaaaaaaa');assert.equal(options.outputDirectory,f.value.outputDirectory);rawRequest=options.request;
  return {origin,async exercise(input){f.events.push('browser-exercise');assert.ok(f.events.includes('listen'));assert.deepEqual(input.actors.map(row=>row.actorId),['account-private-account-one','account-private-account-two']);
   const response=await rawRequest({method:'OPTIONS',url:'/v1/commands',headers:{Host:'127.0.0.1:4174',Origin:origin,'Access-Control-Request-Method':'POST'},body:null});assert.equal(response.status,204);
   for(const url of ['/v1/health','/v1/version']){const reply=await rawRequest({method:'GET',url,headers:{Host:'127.0.0.1:4174',Authorization:'Bearer '+input.capability},body:null});assert.equal(reply.status,200);assert.equal(Object.hasOwn(reply.headers,'access-control-allow-origin'),false);}
   result={status:'passed',origin,canonical:{topicId:'topic-empty',discussionId:'browser-discussion',rootId:'browser-root',replyId:'browser-reply'},scope:{realBrowser:false},...(settings.automaticTopics?{directoryProtocol:'semantic-topics/v2'}:{})};
  },close(){if(!closing){f.events.push('browser-close');closing=Promise.resolve(result);}return closing;},get result(){return result;}};
 };
 return {...f,get proof(){return f.proof;},get rawRequest(){return rawRequest;}};
}

test('product composition discovers genuine origin before app startup, closes UI before encoder and joins original stored rows',async()=>{
 const f=productFixture();assert.equal((await runPrivateProductApplicationRehearsalForTest(f.value,f.ports)).status,'passed');
 assert.ok(f.events.indexOf('browser-open')<f.events.indexOf('app-open'));assert.ok(f.events.indexOf('browser-exercise')<f.events.indexOf('browser-close'));
 assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('model-run'));assert.ok(f.events.indexOf('browser-owner-join')<f.events.indexOf('model-run'));
 assert.deepEqual(f.proof.browser.ownerVerification,{roots:1,replies:1,manualSnapshots:0});assert.equal(f.proof.browser.ui.origin,'chrome-extension://'+'b'.repeat(32));assert.equal(f.proof.cleanup.browserClosed,true);assert.equal(f.proof.scope.browser,false);assert.equal(f.proof.scope.testComposition,true);
 assert.ok(f.events.indexOf('original-root-high-watermark')<f.events.indexOf('browser-open'));assert.ok(f.events.indexOf('model-owner-join')<f.events.indexOf('original-legacy-run'));assert.equal(f.proof.legacy.testComposition,true);
});

test('separate18 browser purpose retains all18 HTTP cases and verifies browser rows without opening encoder roles',async()=>{
 const f=productFixture({automaticTopics:true}),r=await runPrivateAutomatic18BrowserApplicationRehearsalForTest(f.value,f.ports);
 assert.equal(r.status,'passed',f.proof?.failure?.stage);assert.deepEqual(f.proof.cases.map(c=>c.name),PRIVATE_AUTOMATIC18_APPLICATION_CASES);
 assert(f.proof.cases.every(c=>c.status==='passed'));assert.equal(f.proof.browser.ui.directoryProtocol,'semantic-topics/v2');
 assert.deepEqual(f.proof.browser.ownerVerification,{roots:1,replies:1,manualSnapshots:0});assert.equal(f.proof.cleanup.browserClosed,true);
 assert.equal(Object.hasOwn(f.proof,'model'),false);assert.equal(Object.hasOwn(f.proof,'legacy'),false);
 assert(!f.events.includes('training-read')&&!f.events.includes('model-run')&&!f.events.includes('original-legacy-run'));
 assert.equal(f.proof.scope.encoder,false);assert.equal(f.proof.scope.testComposition,true);
 assert.equal(f.proof.cleanup.pendingHttp,0);assert.equal(f.proof.cleanup.pendingDatabase,0);
 assert(!f.events.includes('end-3')&&!f.events.includes('end-4'));
});

test('18 browser purpose refuses a v1 or missing directory protocol even when all fake browser operations passed',async()=>{
 for(const protocol of [undefined,'semantic-topics/v1']){
  const f=productFixture({automaticTopics:true}),open=f.ports.openBrowser;
  f.ports.openBrowser=async input=>{const browser=await open(input);return {...browser,async close(){return {...await browser.close(),directoryProtocol:protocol};}};};
  const r=await runPrivateAutomatic18BrowserApplicationRehearsalForTest(f.value,f.ports);assert.equal(r.status,'failed');
  assert.equal(f.proof.failure.stage,'browser-close');assert.equal(f.proof.cleanup.browserClosed,true);assert(f.events.includes('end-1')&&f.events.includes('end-2'));
  assert(!f.events.includes('browser-owner-join'));
 }
});

test('unavailable original legacy roots remain explicit while failed, unclosed or scan-bound work blocks product acceptance',async()=>{
 for(const [result,expected]of [[{status:'not-applicable',reason:'no-eligible-original-root',resourcesClosed:true},'passed'],
  [{status:'not-applicable',reason:'original-scan-bound',resourcesClosed:true},'failed'],[{status:'passed',resourcesClosed:false},'failed'],[{status:'failed',resourcesClosed:true},'failed']]){
  const f=productFixture();f.ports.legacy=async()=>result;assert.equal((await runPrivateProductApplicationRehearsalForTest(f.value,f.ports)).status,expected);
  assert.deepEqual(f.proof.legacy,result);assert.ok(f.events.includes('end-3')&&f.events.includes('end-4'));
 }
});

test('failed real-row browser binding blocks encoder while retiring original browser and HTTP/database handles',async()=>{
 const f=productFixture(),query=f.value.ownerDatabase.query;f.value.ownerDatabase.query=async(sql,args)=>sql.includes(' AS manual_snapshots')?{rows:[{roots:0,replies:1,manual_snapshots:0}]}:query(sql,args);
 assert.equal((await runPrivateProductApplicationRehearsalForTest(f.value,f.ports)).status,'failed');assert.equal(f.proof.failure.stage,'browser-owner-verification');assert.equal(f.events.includes('model-run'),false);assert.equal(f.proof.cleanup.browserClosed,true);assert.ok(f.events.includes('app-close')&&f.events.includes('end-1')&&f.events.includes('end-2'));
});

test('browser request origin/capability/selector substitutions never dispatch through the actual HTTP port',async()=>{
 for(const patch of [{url:'https://example.test/v1/health'},{headers:{host:'127.0.0.1:4174',origin:'https://example.test'}},{method:'DELETE'}]){
  const f=productFixture(),open=f.ports.openBrowser;f.ports.openBrowser=async options=>{const browser=await open(options);return {...browser,async exercise(){await options.request({method:'GET',url:'/v1/health',headers:{host:'127.0.0.1:4174',origin:browser.origin,authorization:'Bearer wrong'},body:null,...patch});}};};
  assert.equal((await runPrivateProductApplicationRehearsalForTest(f.value,f.ports)).status,'failed');assert.equal(f.proof.failure.stage,'browser-exercise');assert.equal(f.events.includes('browser-raw-http'),false);assert.equal(f.events.includes('model-run'),false);assert.equal(f.proof.cleanup.browserClosed,true);
 }
});

test('parent permits omission only on exact public GETs; POST, preflight and wrong present origins remain refused',async()=>{
 for(const variant of [{method:'POST',url:'/v1/account/me'}, {method:'OPTIONS',url:'/v1/commands'},
  {method:'GET',url:'/v1/version?extra=1'}, {method:'GET',url:'/v1/account/me'},
  {method:'GET',url:'/v1/version',origin:''},{method:'GET',url:'/v1/version',origin:'null'},
  {method:'GET',url:'/v1/version',origin:'https://example.test'}]){
  const f=productFixture(),open=f.ports.openBrowser;f.ports.openBrowser=async options=>{const browser=await open(options);return {...browser,async exercise(input){
   const headers={Host:'127.0.0.1:4174',...(variant.method==='OPTIONS'?{}:{Authorization:'Bearer '+input.capability}),...(Object.hasOwn(variant,'origin')?{Origin:variant.origin}:{})};
   await options.request({method:variant.method,url:variant.url,headers,body:null});
  }};};
  assert.equal((await runPrivateProductApplicationRehearsalForTest(f.value,f.ports)).status,'failed');assert.equal(f.proof.failure.stage,'browser-exercise');assert.equal(f.events.includes('browser-raw-http'),false);
 }
});

test('model composition uses exactly two additional roles and joins both completions on the original owner connection',async()=>{
 const f=fixture();assert.equal((await runPrivateModelApplicationRehearsalForTest(f.value,f.ports)).status,'passed');
 assert.deepEqual(f.proof.model.ownerVerification,{operations:2,sources:2,observations:2});assert.equal(f.proof.scope.testComposition,true);assert.equal(f.proof.scope.encoder,false);
 assert.deepEqual(f.proof.model.fixtureIsolation,{retiredHistoricalJobs:0,emptyBeforeModel:true});
 assert.ok(f.events.indexOf('isolation-lane')<f.events.indexOf('isolation-jobs'));assert.ok(f.events.indexOf('isolation-commit')<f.events.indexOf('connect-3'));
 assert.equal(f.events.filter(e=>e==='model-owner-join').length,2);assert.equal(f.events.filter(e=>e.startsWith('connect-')).length,4);
 for(const event of ['end-3','end-4','server-close','app-close'])assert.ok(f.events.indexOf(event)<f.events.indexOf('proof'));
 assert.equal(f.proof.cleanup.workerClientClosed,true);assert.equal(f.proof.cleanup.submitterClientClosed,true);assert.equal(f.proof.cleanup.pendingDatabase,0);
});

test('copied historical leases retire only via exact official revocation before worker allocation',async()=>{
 const f=fixture(),query=f.value.ownerDatabase.query,old=[{operation_id:'copied-one',operation_digest:'e'.repeat(64),authority_token:'private-copied-token-one'},
  {operation_id:'copied-two',operation_digest:'f'.repeat(64),authority_token:'private-copied-token-two'}];let revoked=0;
 f.value.ownerDatabase.query=async(sql,args)=>{if(sql.includes('LIMIT 17'))return {rows:structuredClone(old)};
  if(sql.includes('ingest_revoke_authority')){assert.deepEqual(args,Object.values(old[revoked++]));assert.ok(!f.events.includes('connect-3'));return {rows:[{revoked:true}]};}return query(sql,args);};
 assert.equal((await runPrivateModelApplicationRehearsalForTest(f.value,f.ports)).status,'passed');assert.equal(revoked,2);
 assert.deepEqual(f.proof.model.fixtureIsolation,{retiredHistoricalJobs:2,emptyBeforeModel:true});
 for(const row of old)assert.equal(JSON.stringify(f.proof).includes(row.authority_token),false);
});

test('unexpected copied queue size, failed revocation or nonempty lane rolls back before any worker connection or model',async()=>{
 for(const fault of ['too-many','revoke-false','live','lane','commit']){
  const f=fixture(),query=f.value.ownerDatabase.query,transaction=f.value.ownerDatabase.transaction;
  f.value.ownerDatabase.query=async(sql,args)=>{if(sql.includes('LIMIT 17'))return {rows:fault==='too-many'?Array.from({length:17},()=>({})):fault==='revoke-false'?[{operation_id:'old',operation_digest:'e'.repeat(64),authority_token:'private-old'}]:[]};
   if(sql.includes('ingest_revoke_authority'))return {rows:[{revoked:false}]};if(sql.includes(' AS live_jobs,'))return {rows:[{live_jobs:fault==='live'?1:0,lane_empty:fault!=='lane'}]};return query(sql,args);};
  if(fault==='commit')f.value.ownerDatabase.transaction=async work=>transaction(async tx=>{await work(tx);throw false;});
  assert.equal((await runPrivateModelApplicationRehearsalForTest(f.value,f.ports)).status,'failed');assert.equal(f.proof.failure.stage,'model-fixture-isolation');
  assert.ok(f.events.includes('isolation-rollback'));assert.equal(f.events.includes('connect-3'),false);assert.equal(f.events.includes('model-run'),false);
 }
});

test('wrong owner material or observation join fails model acceptance and still retires both added roles',async()=>{
 for(const key of ['operations','sources','observations']){
  const f=fixture(),query=f.value.ownerDatabase.query;f.value.ownerDatabase.query=async(...args)=>{const r=await query(...args);if(args[0].includes(' AS operations,'))r.rows[0][key]=0;return r;};
  assert.equal((await runPrivateModelApplicationRehearsalForTest(f.value,f.ports)).status,'failed');assert.equal(f.proof.failure.stage,'model-owner-verification');
  assert.ok(f.events.includes('end-3')&&f.events.includes('end-4'));assert.equal(Object.hasOwn(f.proof.model,'ownerVerification'),false);
 }
});

test('model inputs, worker acquisition, submitter acquisition and helper failures cannot leak added physical clients',async()=>{
 for(const failAt of ['training','worker','submitter','model']){
  const f=fixture(),connect=f.value.connectFixedRole;
  if(failAt==='training')f.ports.readTraining=async()=>{throw false;};
  if(failAt==='model')f.ports.model=async()=>{throw false;};
  f.value.connectFixedRole=async(request,guard)=>{if(request.role===(failAt==='worker'?'murmingle_ingest_worker':failAt==='submitter'?'murmingle_crawler_submitter':'none'))throw false;return connect(request,guard);};
  assert.equal((await runPrivateModelApplicationRehearsalForTest(f.value,f.ports)).status,'failed');
  assert.equal(f.proof.cleanup.workerClientClosed,true);assert.equal(f.proof.cleanup.submitterClientClosed,true);assert.equal(f.proof.cleanup.pendingDatabase,0);
 }
});

test('a helper result arriving at the original cutoff retains copied-queue retirement evidence without owner acceptance',async()=>{
 const f=fixture(),model=f.ports.model;let expired=false,completed;
 f.value.checkDeadline=()=>{if(expired)throw false;};
 f.ports.model=async value=>{completed=await model(value);expired=true;return completed;};
 await assert.rejects(runPrivateModelApplicationRehearsalForTest(f.value,f.ports),value=>value===false);
 assert.ok(f.events.includes('end-3')&&f.events.includes('end-4'));assert.equal(f.events.includes('model-owner-join'),false);
 assert.deepEqual(completed.fixtureIsolation,{retiredHistoricalJobs:0,emptyBeforeModel:true});
 // The same original deadline prohibits publishing a disk proof after expiry.
 assert.equal(f.events.includes('proof'),false);
});
test('falsy original case failure survives cleanup failure as bounded stage and complete not-attempted suffix',async()=>{
 const f=fixture({failAt:'/v1/health',closeFails:true}),result=await runPrivateApplicationRehearsalForTest(f.value,f.ports);assert.equal(result.status,'failed');assert.equal(f.proof.failure.stage,'hierarchy17-http-health');assert.equal(f.proof.cases[0].status,'failed');assert.equal(f.proof.cases.slice(1).every(x=>x.status==='not-attempted'),true);assert.equal(f.proof.cleanup.applicationClosed,false);assert.ok(f.events.includes('end-1')&&f.events.includes('end-2'));
});
test('foreign path/upgrade/context substitutions refuse before any fake resource allocation',async()=>{
 for(const patch of [{clusterDirectory:'D:\\foreign'}, {outputDirectory:'D:\\foreign'}, {upgrade:{schemaVersion:17,preservedLegacyTables:18,legacyRowsUnchanged:false}}, {deadline:NaN}]){const f=fixture();await assert.rejects(runPrivateApplicationRehearsalForTest({...f.value,...patch},f.ports));assert.deepEqual(f.events,[]);}
});
test('late/failing second role acquisition still retires the original issued first client',async()=>{
 const f=fixture(),connect=f.value.connectFixedRole;let calls=0;f.value.connectFixedRole=async(...args)=>{if(++calls===2)throw false;return connect(...args);};const result=await runPrivateApplicationRehearsalForTest(f.value,f.ports);assert.equal(result.status,'failed');assert.ok(f.events.includes('end-1'));assert.equal(f.proof.cleanup.appClientClosed,true);assert.equal(f.proof.cleanup.pendingHttp,0);
});

test('setup failures retain finite substage and retire originals without starting HTTP',async()=>{
 for(const [port,stage]of [['prepareStorage','setup-storage'],['seedAccounts','setup-accounts'],['openApplication','setup-application'],['listen','setup-listener']]){
  const f=fixture();f.ports[port]=async()=>{throw false;};
  const result=await runPrivateApplicationRehearsalForTest(f.value,f.ports);
  assert.equal(result.status,'failed');assert.equal(f.proof.failure.stage,stage);
  assert.equal(f.proof.counts.httpRequests,0);assert.ok(f.proof.cases.every(x=>x.status==='not-attempted'));
  assert.equal(f.proof.cleanup.appClientClosed,true);assert.equal(f.proof.cleanup.urlClientClosed,true);
  assert.equal(f.proof.cleanup.pendingDatabase,0);assert.equal(f.proof.cleanup.pendingHttp,0);
 }
});
test('URL-selection case refuses different Source/topic or incoherent snapshot while retaining cleanup',async()=>{
 for(const mutate of [r=>{r.catalog.sources[0].id='different-source';},r=>{r.discussion.topic.id='different-topic';},r=>{r.discussion.version.revision=2;},r=>{r.discussion.roots.push({id:'unexpected-existing-root'});}]){
  const f=fixture(),request=f.ports.request;f.ports.request=async args=>{const response=await request(args);if(args.url==='/v1/catalog/url-selection')mutate(response.value);return response;};
  const result=await runPrivateApplicationRehearsalForTest(f.value,f.ports);assert.equal(result.status,'failed');assert.equal(f.proof.failure.stage,'saved-page-canonical-read');assert.equal(f.proof.cases[2].status,'failed');assert.equal(f.proof.cases.slice(3).every(x=>x.status==='not-attempted'),true);assert.equal(f.proof.cleanup.appClientClosed,true);assert.equal(f.proof.cleanup.urlClientClosed,true);
 }
});
