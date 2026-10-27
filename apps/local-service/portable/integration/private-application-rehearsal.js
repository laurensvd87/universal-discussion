// Fixed private HTTP/SQL composition. Import starts no listener, DB or provider.
import http from 'node:http';
import path from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {lstat,realpath,mkdir,open,link} from 'node:fs/promises';
import {types} from 'node:util';
import {openDormantPostgresApplication} from '../../src/startup.js';
import {AccountRepository} from '../../src/accounts/account-repository.js';
import {AccountService} from '../../src/accounts/account-service.js';
import {createLoopbackServer} from '../../src/http/loopback-listener.js';
import {createCanonicalV4SemanticDiscussionRepository} from '../canonical-v4/semantic-discussion-repository.js';
import {createExclusiveSession} from './native-hierarchy-postgres-v2/session.js';
import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';

const fail=code=>Object.assign(new Error('Private application rehearsal failed'),{code});
const need=(value,code='APPLICATION_ASSERTION')=>{if(!value)throw fail(code);};
const sameVersion=(a,b)=>typeof a?.generation==='string'&&Number.isSafeInteger(a?.revision)&&a.generation===b?.generation&&a.revision===b?.revision;
const ORIGIN='chrome-extension://'+'a'.repeat(32),HOST='127.0.0.1:4174',PORT=4185,DATABASE='murmingle_hierarchy_fixture_20261026_a';
export const PRIVATE_APPLICATION_CASES=Object.freeze([
 'hierarchy17-http-health','independent-semantic-directory','saved-page-canonical-read','normal-login-unavailable','named-private-session',
 'human-root-and-reply','cross-actor-edit-withdraw-denied','human-edit-and-withdraw','forged-session-denied','demo-actor-denied',
 'reserved-ai-names-denied','host-origin-pairing-denied','owner-policy-refresh','bounded-concurrent-public-reads','revoked-session-denied','provider-unavailable',
]);
const requestRole=role=>({role,database:DATABASE,applicationName:'murmingle-native-hierarchy-http',statementTimeoutMs:5000,lockTimeoutMs:3000});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Bounded serial admission over ONE original issued physical connection.
 * Never reconnect/retry, and close waits every original operation. */
export function createPrivateSerialDatabase(client,guard){
 const session=createExclusiveSession(client,guard);let admitted=0,closed=false,closing=null,tail=Promise.resolve();
 function admit(work){if(closed||admitted>=8)return Promise.reject(fail('APPLICATION_DATABASE_CAPACITY'));guard();admitted++;
  const original=tail.then(()=>{guard();return work();});tail=original.then(()=>{},()=>{});
  original.then(()=>admitted--,()=>admitted--);return original;
 }
 return Object.freeze({dialect:'pg',query:(sql,args=[])=>admit(()=>session.query(sql,args)),exec:sql=>admit(()=>session.exec(sql)),transaction:work=>admit(()=>session.transaction(work)),
  close(){if(!closing){closed=true;closing=tail.then(()=>session.close()).then(()=>{const s=session.snapshot();need(s.pending===0&&s.closed&&s.cleanupFailures.length===0,'APPLICATION_DATABASE_CLOSE');});}return closing;},
  snapshot:()=>({admitted,closed:session.snapshot().closed,pending:session.snapshot().pending}),
 });
}
function context(value){
 need(value&&typeof value==='object'&&!types.isProxy(value),'APPLICATION_CONTEXT');
 const keys=['connectFixedRole','ownerDatabase','getOwnedIdentity','clusterDirectory','outputDirectory','checkDeadline','deadline','upgrade'];need(Reflect.ownKeys(value).length===keys.length,'APPLICATION_CONTEXT');const out={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable&&Object.hasOwn(d,'value'),'APPLICATION_CONTEXT');out[key]=d.value;}
 need(['connectFixedRole','getOwnedIdentity','checkDeadline'].every(k=>typeof out[k]==='function')&&typeof out.ownerDatabase?.query==='function'&&Number.isFinite(out.deadline),'APPLICATION_CONTEXT');
 const prefix=PRIVATE_RUN_ROOT+'\\run-',p=out.clusterDirectory;need(typeof p==='string'&&p.startsWith(prefix)&&p===path.win32.normalize(p),'APPLICATION_PATH');
 const remainder=p.slice(prefix.length);need(/^[a-f0-9]{48}\\cluster\\nhpg-[A-Za-z0-9]{6}$/u.test(remainder),'APPLICATION_PATH');
 need(out.outputDirectory===PRIVATE_RUN_ROOT+'\\run-'+remainder.slice(0,48)+'\\output','APPLICATION_PATH');
 need(out.upgrade?.schemaVersion===17&&out.upgrade?.preservedLegacyTables===18&&out.upgrade?.legacyRowsUnchanged===true&&Object.keys(out.upgrade).length===3,'APPLICATION_UPGRADE');
 return {...out,privateAppDirectory:path.win32.join(out.clusterDirectory,'application-rehearsal')};
}
async function directories(directory){for(let name=directory;;name=path.win32.dirname(name)){const s=await lstat(name);need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(name)===name,'APPLICATION_PATH');if(path.win32.dirname(name)===name)break;}}
async function prepareStorage(a){await directories(path.win32.dirname(a.privateAppDirectory));a.checkDeadline();await mkdir(a.privateAppDirectory);a.checkDeadline();await directories(a.privateAppDirectory);return {databasePath:path.win32.join(a.privateAppDirectory,'application.sqlite'),accountDatabasePath:path.win32.join(a.privateAppDirectory,'accounts.sqlite')};}
async function seedAccounts(filename,key){const repository=new AccountRepository({filename});let first=false,primary;try{
 let delivered;const accounts=new AccountService({repository,hmacKey:key,fixtureOnly:true,mailSink:message=>{delivered=message;}}),result=[];
 for(const [index,username]of ['RehearsalOne','RehearsalTwo'].entries()){const clientNonce=randomBytes(24).toString('hex');accounts.requestCode({email:`private-rehearsal-${index}@example.test`,clientNonce});const verified=accounts.verifyCode({challengeId:delivered.challengeId,code:delivered.code,clientNonce});delivered=null;accounts.setUsername(verified.session.accessToken,{username});result.push({token:verified.session.accessToken,username});}
 return result;
 }catch(e){first=true;primary=e;throw e;}finally{try{repository.close();}catch(e){if(!first)throw e;}if(first)void primary;}}
async function listen(handle){const server=createLoopbackServer({handle});try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:PORT,exclusive:true,backlog:8},resolve);});need(server.address()?.address==='127.0.0.1'&&server.address()?.port===PORT,'APPLICATION_LISTENER');}
 catch(e){server.close();throw e;}let closing=null;return {close(){if(!closing)closing=new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections?.();});return closing;}};}
function createRequestHttp(launch){return function requestHttp({method,url,headers,body}){
 return new Promise((resolve,reject)=>{let responseValue,failed=false,primary,bytes=0,chunks=[],closed=false,responseSeen=false,responseSettled=false;const req=launch({host:'127.0.0.1',port:PORT,method,path:url,headers,agent:false});
  const remember=e=>{if(!failed){failed=true;primary=e;}};req.on('error',()=>remember(fail('APPLICATION_HTTP')));req.setTimeout(5000,()=>{remember(fail('APPLICATION_HTTP_TIMEOUT'));req.destroy();});
  const finish=()=>{if(!closed||responseSeen&&!responseSettled)return;if(failed)reject(primary);else if(!responseValue)reject(fail('APPLICATION_HTTP'));else resolve(responseValue);};
  req.on('response',res=>{responseSeen=true;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>262144){remember(fail('APPLICATION_HTTP_BOUND'));res.destroy();req.destroy();}else chunks.push(chunk);});res.on('error',()=>remember(fail('APPLICATION_HTTP')));res.on('end',()=>{try{responseValue={status:res.statusCode,value:JSON.parse(Buffer.concat(chunks).toString('utf8'))};}catch{remember(fail('APPLICATION_HTTP_JSON'));}chunks=[];responseSettled=true;finish();});res.on('close',()=>{if(!responseSettled)remember(fail('APPLICATION_HTTP'));responseSettled=true;chunks=[];finish();});});
  req.once('close',()=>{closed=true;finish();});
  if(body!==null)req.end(body);else req.end();
 });
};}
const requestHttp=createRequestHttp(options=>http.request(options));
export function createPrivateHttpRequestForTest(launch){need(typeof launch==='function','APPLICATION_TEST_PORTS');return createRequestHttp(launch);}
async function publishProof(a,proof){await directories(a.outputDirectory);a.checkDeadline();const bytes=Buffer.from(JSON.stringify(proof)+'\n');need(bytes.length<=32768,'APPLICATION_PROOF_BOUND');
 const pending=path.win32.join(a.outputDirectory,'application-proof.pending.json'),final=path.win32.join(a.outputDirectory,'application-proof.json'),fd=await open(pending,'wx');
 try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}a.checkDeadline();await directories(a.outputDirectory);await link(pending,final);a.checkDeadline();
 const s=await lstat(final),p=await lstat(pending);need(s.isFile()&&!s.isSymbolicLink()&&s.dev===p.dev&&s.ino===p.ino&&s.size===bytes.length&&s.nlink===2,'APPLICATION_PROOF_LINK');
 const reader=await open(final,'r');try{const data=Buffer.alloc(bytes.length+1);let used=0;for(;;){const {bytesRead}=await reader.read(data,used,data.length-used,null);used+=bytesRead;if(!bytesRead||used===data.length)break;}const after=await reader.stat();need(used===bytes.length&&data.subarray(0,used).equals(bytes)&&after.dev===s.dev&&after.ino===s.ino&&after.size===s.size&&after.mtimeMs===s.mtimeMs&&after.ctimeMs===s.ctimeMs,'APPLICATION_PROOF_BYTES');}finally{await reader.close();}a.checkDeadline();return {bytes:bytes.length,sha256:sha(bytes)};
}
const REAL={prepareStorage,seedAccounts,openApplication:openDormantPostgresApplication,listen,request:requestHttp,publishProof,now:()=>performance.now(),randomBytes,randomUUID};

async function run(value,ports,testComposition){const a=context(value);a.checkDeadline();const began=ports.now(),states=PRIVATE_APPLICATION_CASES.map(name=>({name,status:'not-attempted'}));let stage='setup',failed=false,primary;
 let appDatabase=null,urlDatabase=null,application=null,server=null,appClient=null,urlClient=null;const pendingHttp=new Set();let httpRequests=0,maximumConcurrentHttp=0;
 const cleanup={serverClosed:false,applicationClosed:false,appClientClosed:false,urlClientClosed:false,pendingHttp:0,pendingDatabase:0};
 const key=ports.randomBytes(32),token=ports.randomBytes(32).toString('base64url');need(Buffer.isBuffer(key)&&key.length===32&&token.length>=32,'APPLICATION_RANDOM');
 const cfg={host:'127.0.0.1',port:4174,origin:ORIGIN,capability:token};
 const remember=e=>{if(!failed){failed=true;primary=e;}};
 async function call(url,input=null,session=null,patch={}){a.checkDeadline();need(pendingHttp.size<4,'APPLICATION_HTTP_CAPACITY');const headers={host:HOST,origin:ORIGIN,authorization:'Bearer '+token,...(input!==null?{'content-type':'application/json'}:{}),...(session?{'x-account-session':session}:{}),...patch};const body=input===null?null:JSON.stringify(input);need(body===null||Buffer.byteLength(body)<=65536,'APPLICATION_HTTP_BOUND');
  const original=Promise.resolve().then(()=>ports.request({method:input===null?'GET':'POST',url,headers,body}));pendingHttp.add(original);httpRequests++;maximumConcurrentHttp=Math.max(maximumConcurrentHttp,pendingHttp.size);try{const result=await original;a.checkDeadline();return result;}finally{pendingHttp.delete(original);}}
 async function ok(url,input=null,session=null){const r=await call(url,input,session);need(r.status===200);return r.value;}
 async function version(){return (await ok('/v1/version')).version;}
 async function command(session,command){return ok('/v1/commands',{expected:await version(),command},session);}
 async function caseRun(name,work){stage=name;const state=states.find(x=>x.name===name);try{await work();a.checkDeadline();state.status='passed';}catch(e){state.status='failed';throw e;}}
 try{
  const storage=await ports.prepareStorage(a);a.checkDeadline();const actors=await ports.seedAccounts(storage.accountDatabasePath,key);a.checkDeadline();need(Array.isArray(actors)&&actors.length===2&&actors.every(x=>typeof x.token==='string'&&x.token.length===43),'APPLICATION_ACCOUNTS');
  appClient=await a.connectFixedRole(requestRole('murmingle_app'),a.checkDeadline);urlClient=await a.connectFixedRole(requestRole('murmingle_app'),a.checkDeadline);
  const appIdentity=a.getOwnedIdentity(appClient),urlIdentity=a.getOwnedIdentity(urlClient);need(appClient!==urlClient&&[appIdentity,urlIdentity].every(x=>x.database===DATABASE&&x.role==='murmingle_app'&&x.address==='127.0.0.1'&&x.port===55433)&&appIdentity.started===urlIdentity.started,'APPLICATION_ROLE');
  appDatabase=createPrivateSerialDatabase(appClient,a.checkDeadline);urlDatabase=createPrivateSerialDatabase(urlClient,a.checkDeadline);
  application=await ports.openApplication({config:cfg,...storage,nextId:kind=>kind+'-'+ports.randomUUID(),now:()=>new Date().toISOString(),canonicalDatabase:appDatabase,urlSelectionDatabase:urlDatabase,accountsEnabled:true,accountHmacKey:key,hierarchicalTopics:true});a.checkDeadline();server=await ports.listen(application.handle);a.checkDeadline();
  const [one,two]=actors;let topicId,sourceId,discussionId,rootId,replyId;
  await caseRun('hierarchy17-http-health',async()=>{need((await ok('/v1/health')).protocol==='local-service/v1');});
  await caseRun('independent-semantic-directory',async()=>{const r=await ok('/v1/semantic/topics',{});need(Array.isArray(r.topics)&&r.topics.length>=16&&r.policyRevision===1);});
  await caseRun('saved-page-canonical-read',async()=>{
   const selected=await a.ownerDatabase.query("SELECT id FROM canonical_v4.topics t WHERE NOT EXISTS(SELECT 1 FROM canonical_v4.discussions d JOIN canonical_v4.contributions c ON c.discussion_id=d.id WHERE d.topic_id=t.id) ORDER BY id COLLATE \"C\" LIMIT 1");topicId=selected.rows[0]?.id;need(typeof topicId==='string');
   // The URL projection hydrates the whole selected discussion. Pick an actual
   // learned linked Source with no comments, so this remains bounded without
   // changing the production route or inventing a saved URL/topic pair.
   const saved=await a.ownerDatabase.query("SELECT l.source_id,l.topic_id FROM canonical_v4.source_links l JOIN canonical_v4.sources s ON s.id=l.source_id WHERE s.provenance='owner-local-page-embedding/v1' AND NOT EXISTS(SELECT 1 FROM canonical_v4.discussions d JOIN canonical_v4.contributions c ON c.discussion_id=d.id WHERE d.topic_id=l.topic_id) ORDER BY l.source_id COLLATE \"C\" LIMIT 1");
   sourceId=saved.rows[0]?.source_id;const savedTopic=saved.rows[0]?.topic_id;need(typeof sourceId==='string'&&typeof savedTopic==='string');
   const selection=await ok('/v1/catalog/context',{sourceId,topicId:savedTopic}),source=selection.sources?.find(s=>s.id===sourceId);
   need(source?.topicId===savedTopic&&source.provenance==='owner-local-page-embedding/v1'&&typeof source.url==='string');
   const urlSelection=await ok('/v1/catalog/url-selection',{url:source.url}),urlSources=urlSelection.catalog?.sources?.filter(s=>s.url===source.url&&s.provenance==='owner-local-page-embedding/v1');
   need(urlSources?.length===1&&urlSources[0].id===sourceId&&urlSources[0].topicId===savedTopic&&urlSelection.discussion?.topic?.id===savedTopic&&urlSelection.discussion.roots?.length===0&&sameVersion(selection.version,urlSelection.catalog.version)&&sameVersion(urlSelection.catalog.version,urlSelection.discussion.version));
   const page=await ok('/v1/discussions/page',{topicId:savedTopic,limit:1,cursor:null});need(page.topic.id===savedTopic&&Array.isArray(page.items)&&page.items.length===0&&sameVersion(page.version,selection.version));
   const r=await ok('/v1/semantic/context',{sourceId});need(r.status==='pending'&&r.selectedPath.length===0);
  });
  await caseRun('normal-login-unavailable',async()=>{const r=await ok('/v1/account/capabilities',{});need(r.emailCode===false&&r.chatGPTIdentity===false);need((await call('/v1/account/email/request',{email:'unused@example.test',clientNonce:'private-no-email-xxxxxxxx'})).status===409);});
  await caseRun('named-private-session',async()=>{for(const actor of actors)need((await ok('/v1/account/me',{},actor.token)).username===actor.username);});
  await caseRun('human-root-and-reply',async()=>{rootId=(await command(one.token,{type:'create-root',topicId,body:'Private rehearsal root',originSourceId:null})).result.contributionId;const view=await ok('/v1/topics/'+encodeURIComponent(topicId)+'/discussion');discussionId=view.discussionId;need(view.roots.some(r=>r.id===rootId&&r.state==='visible'));replyId=(await command(one.token,{type:'reply',discussionId,rootId,replyToId:rootId,body:'Private rehearsal reply',originSourceId:null})).result.contributionId;need(typeof replyId==='string');});
  await caseRun('cross-actor-edit-withdraw-denied',async()=>{for(const c of [{type:'edit',contributionId:rootId,body:'Denied alteration'},{type:'withdraw',contributionId:rootId}])need((await call('/v1/commands',{expected:await version(),command:c},two.token)).status===403);});
  await caseRun('human-edit-and-withdraw',async()=>{await command(one.token,{type:'edit',contributionId:replyId,body:'Private rehearsal edited reply'});let view=await ok('/v1/topics/'+encodeURIComponent(topicId)+'/discussion');need(view.roots.find(r=>r.id===rootId).replies.find(r=>r.id===replyId).edited===true);await command(one.token,{type:'withdraw',contributionId:rootId});view=await ok('/v1/topics/'+encodeURIComponent(topicId)+'/discussion');need(view.roots.find(r=>r.id===rootId).state==='deleted');});
  await caseRun('forged-session-denied',async()=>{need((await call('/v1/account/me',{},'x'.repeat(43))).status===401);});
  await caseRun('demo-actor-denied',async()=>{need((await call('/v1/account/me',{},one.token,{'x-demo-actor':'demo-alex'})).status===403);});
  await caseRun('reserved-ai-names-denied',async()=>{for(const username of ['AI','ai_bot','_aibot'])need((await call('/v1/account/username',{username},one.token)).status===409);});
  await caseRun('host-origin-pairing-denied',async()=>{need((await call('/v1/health',null,null,{host:'127.0.0.1:4185'})).status===403);need((await call('/v1/health',null,null,{origin:'https://example.test'})).status===403);need((await call('/v1/health',null,null,{authorization:'Bearer wrong'})).status===401);});
  await caseRun('owner-policy-refresh',async()=>{const before=await ok('/v1/semantic/topics',{}),policy=createCanonicalV4SemanticDiscussionRepository({database:a.ownerDatabase});await policy.setOwnerPolicy({expectedRevision:before.policyRevision,defaultMaxDepth:2,overrides:[]});const after=await ok('/v1/semantic/topics',{});need(after.policyRevision===before.policyRevision+1&&after.topics.length>=before.topics.length);});
  await caseRun('bounded-concurrent-public-reads',async()=>{const rows=await Promise.all(Array.from({length:4},()=>ok('/v1/semantic/topics',{})));need(rows.every(r=>r.policyRevision===rows[0].policyRevision));});
  await caseRun('revoked-session-denied',async()=>{need((await ok('/v1/account/session/logout',{},two.token)).loggedOut===true);need((await call('/v1/account/me',{},two.token)).status===401);});
  await caseRun('provider-unavailable',async()=>{need((await call('/v1/ai/status')).status===404);});
 }catch(e){remember(e);}
 finally{
  const settle=async(work,mark)=>{try{await work();cleanup[mark]=true;}catch(e){remember(e);}};
  if(server)await settle(()=>server.close(),'serverClosed');else cleanup.serverClosed=true;
  await Promise.allSettled([...pendingHttp]);cleanup.pendingHttp=pendingHttp.size;
  if(application)await settle(()=>application.close(),'applicationClosed');else cleanup.applicationClosed=true;
  if(appDatabase)await settle(()=>appDatabase.close(),'appClientClosed');else if(appClient)await settle(()=>appClient.end(),'appClientClosed');else cleanup.appClientClosed=true;
  if(urlDatabase)await settle(()=>urlDatabase.close(),'urlClientClosed');else if(urlClient)await settle(()=>urlClient.end(),'urlClientClosed');else cleanup.urlClientClosed=true;
  cleanup.pendingDatabase=(appDatabase?.snapshot().pending??0)+(urlDatabase?.snapshot().pending??0)+(appDatabase?.snapshot().admitted??0)+(urlDatabase?.snapshot().admitted??0);key.fill(0);
 }
 need(cleanup.pendingHttp===0&&cleanup.pendingDatabase===0,'APPLICATION_PENDING');
 const proof={schema:'private-application-http-proof/v1',status:failed?'failed':'passed',cases:states,pendingCases:states.filter(x=>x.status!=='passed').length,
  server:{destinationPort:PORT,canonicalHost:HOST,loopbackOnly:true},upgrade:{...a.upgrade},counts:{httpRequests,maximumConcurrentHttp,fixtureActors:2},cleanup,
  scope:{realHttp:!testComposition,realDatabase:!testComposition,browser:false,encoder:false,provider:false,externalLoginVerified:false,productionCapacityValidated:false,testComposition},
  failure:failed?{stage,code:'APPLICATION_CASE_OR_CLEANUP_FAILED'}:null,elapsedMs:Math.max(0,Math.round(ports.now()-began))};
 if(failed)void primary;a.checkDeadline();const file=await ports.publishProof(a,proof);a.checkDeadline();return Object.freeze({status:proof.status,proofSha256:file.sha256,proofBytes:file.bytes});
}
export async function runPrivateApplicationRehearsal(value){if(arguments.length!==1)throw fail('APPLICATION_CONTEXT');return run(value,REAL,false);}
export async function runPrivateApplicationRehearsalForTest(value,ports){need(arguments.length===2&&ports&&Object.keys(REAL).every(k=>typeof ports[k]==='function'),'APPLICATION_TEST_PORTS');return run(value,ports,true);}
