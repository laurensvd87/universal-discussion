import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createPrivateSerialDatabase,createPrivateHttpRequestForTest,runPrivateApplicationRehearsalForTest,PRIVATE_APPLICATION_CASES} from './private-application-rehearsal.js';
import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('actual HTTP client fixes destination4185 and waits response original even after request close',async()=>{
 let req;const request=createPrivateHttpRequestForTest(options=>{assert.equal(options.host,'127.0.0.1');assert.equal(options.port,4185);assert.equal(options.agent,false);assert.equal(options.headers.host,'127.0.0.1:4174');req=new EventEmitter();req.setTimeout=(ms,fn)=>assert.equal(ms,5000);req.end=()=>{};return req;});
 let settled=false;const pending=request({method:'GET',url:'/v1/health',headers:{host:'127.0.0.1:4174'},body:null}).then(value=>{settled=true;return value;});const response=new EventEmitter();response.statusCode=200;req.emit('response',response);req.emit('close');await turn();assert.equal(settled,false);response.emit('data',Buffer.from('{"protocol":"local-service/v1"}'));response.emit('end');assert.equal((await pending).value.protocol,'local-service/v1');
});
test('actual HTTP client refuses oversized/private response without exposing body or retaining original socket',async()=>{
 let req,response;const request=createPrivateHttpRequestForTest(()=>{req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>{};req.destroy=()=>req.emit('close');return req;});
 const pending=request({method:'GET',url:'/v1/health',headers:{},body:null});response=new EventEmitter();response.statusCode=200;response.destroy=()=>response.emit('close');req.emit('response',response);response.emit('data',Buffer.alloc(262145,65));await assert.rejects(pending,{code:'APPLICATION_HTTP_BOUND'});
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

function fixture({failAt=null,closeFails=false}={}){
 const identities=new WeakMap(),events=[],tokens=['one-private-test-token-'.padEnd(43,'1'),'two-private-test-token-'.padEnd(43,'2')];let config,policy=1,edited=false,withdrawn=false,revoked=false,proof=null,serial=0;
 const run=PRIVATE_RUN_ROOT+'\\run-'+'a'.repeat(48),cluster=run+'\\cluster\\nhpg-TEST01';
  const value={clusterDirectory:cluster,outputDirectory:run+'\\output',ownerDatabase:{async query(sql){events.push('owner-query');if(sql.startsWith('SELECT id FROM'))return {rows:[{id:'topic-empty'}]};if(sql.startsWith('SELECT l.source_id')){assert.match(sql,/s.provenance='owner-local-page-embedding\/v1'/u);assert.match(sql,/NOT EXISTS/u);return {rows:[{source_id:'source-saved',topic_id:'topic-saved'}]};}if(sql.includes('semantic_set_owner_policy'))return {rows:[{revision:String(++policy)}]};throw Error('Unexpected fake query');}},
  async connectFixedRole(request,guard){guard();assert.equal(request.role,'murmingle_app');assert.equal(request.database,'murmingle_hierarchy_fixture_20261026_a');const number=++serial;events.push('connect-'+number);const client={query:async sql=>{events.push('query-'+number);return {command:sql==='COMMIT'?'COMMIT':'SELECT',rows:[]};},end:async()=>{events.push('end-'+number);}};identities.set(client,{database:request.database,role:request.role,address:'127.0.0.1',port:55433,started:1000});return client;},
  getOwnedIdentity:client=>identities.get(client),checkDeadline:()=>{},deadline:300000,upgrade:Object.freeze({schemaVersion:17,preservedLegacyTables:18,legacyRowsUnchanged:true})};
 const ports={now:()=>1,randomBytes:n=>Buffer.alloc(n,3),randomUUID:()=> 'invented-id',
  async prepareStorage(a){events.push('prepare');assert.equal(a.privateAppDirectory,cluster+'\\application-rehearsal');return {databasePath:'invented-application.sqlite',accountDatabasePath:'invented-accounts.sqlite'};},
  async seedAccounts(filename,key){events.push('seed-close');assert.equal(key.length,32);return [{token:tokens[0],username:'RehearsalOne'},{token:tokens[1],username:'RehearsalTwo'}];},
  async openApplication(options){events.push('app-open');assert.equal(Object.hasOwn(options,'ai'),false);assert.equal(Object.hasOwn(options,'chatgptFetchImpl'),false);assert.equal(options.hierarchicalTopics,true);assert.notEqual(options.canonicalDatabase,options.urlSelectionDatabase);config=options.config;
   await options.canonicalDatabase.transaction(tx=>tx.query('SELECT startup'));return {handle:()=>{},close:async()=>{events.push('app-close');if(closeFails)throw Error('PRIVATE SECONDARY MUST NOT LEAK');}};},
  async listen(){events.push('listen');return {close:async()=>events.push('server-close')};},
  async request({method,url,headers,body}){events.push('http');await Promise.resolve();if(url===failAt)throw false;const input=body===null?null:JSON.parse(body);const response=(status,value)=>({status,value});
   if(headers.host!=='127.0.0.1:4174'||headers.origin!==config.origin)return response(403,{});if(headers.authorization!=='Bearer '+config.capability)return response(401,{});
   const session=headers['x-account-session'];if(Object.hasOwn(headers,'x-demo-actor'))return response(403,{});if(session&&(session!==tokens[0]&&session!==tokens[1]||session===tokens[1]&&revoked))return response(401,{});
   if(url==='/v1/health')return response(200,{protocol:'local-service/v1'});
   if(url==='/v1/version')return response(200,{version:{generation:'generation-private',revision:1}});
   if(url==='/v1/semantic/topics')return response(200,{policyRevision:policy,topics:Array.from({length:16},(_,i)=>({id:'node-'+i}))});
   if(url==='/v1/catalog/context'){assert.deepEqual(input,{sourceId:'source-saved',topicId:'topic-saved'});return response(200,{version:{generation:'generation-private',revision:1},sources:[{id:'source-saved',topicId:'topic-saved',provenance:'owner-local-page-embedding/v1',url:'https://example.test/actual-saved'}]});}
   if(url==='/v1/catalog/url-selection'){events.push('url-reader-used');assert.deepEqual(input,{url:'https://example.test/actual-saved'});return response(200,{catalog:{version:{generation:'generation-private',revision:1},sources:[{id:'source-saved',topicId:'topic-saved',provenance:'owner-local-page-embedding/v1',url:input.url}]},discussion:{version:{generation:'generation-private',revision:1},topic:{id:'topic-saved'},roots:[]}});}
   if(url==='/v1/discussions/page'){assert.deepEqual(input,{topicId:'topic-saved',limit:1,cursor:null});return response(200,{version:{generation:'generation-private',revision:1},topic:{id:'topic-saved'},items:[]});}
   if(url==='/v1/semantic/context')return response(200,{status:'pending',selectedPath:[]});
   if(url==='/v1/account/capabilities')return response(200,{emailCode:false,chatGPTIdentity:false});
   if(url==='/v1/account/email/request')return response(409,{});
   if(url==='/v1/account/me')return response(200,{username:session===tokens[0]?'RehearsalOne':'RehearsalTwo'});
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
test('URL-selection case refuses different Source/topic or incoherent snapshot while retaining cleanup',async()=>{
 for(const mutate of [r=>{r.catalog.sources[0].id='different-source';},r=>{r.discussion.topic.id='different-topic';},r=>{r.discussion.version.revision=2;},r=>{r.discussion.roots.push({id:'unexpected-existing-root'});}]){
  const f=fixture(),request=f.ports.request;f.ports.request=async args=>{const response=await request(args);if(args.url==='/v1/catalog/url-selection')mutate(response.value);return response;};
  const result=await runPrivateApplicationRehearsalForTest(f.value,f.ports);assert.equal(result.status,'failed');assert.equal(f.proof.failure.stage,'saved-page-canonical-read');assert.equal(f.proof.cases[2].status,'failed');assert.equal(f.proof.cases.slice(3).every(x=>x.status==='not-attempted'),true);assert.equal(f.proof.cleanup.appClientClosed,true);assert.equal(f.proof.cleanup.urlClientClosed,true);
 }
});
