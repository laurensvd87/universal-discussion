import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AccountRepository } from '../src/accounts/account-repository.js';
import { AccountService } from '../src/accounts/account-service.js';
import { createAccountLifecycle } from '../src/accounts/account-lifecycle.js';
import { createMemoryDemoService } from '../src/application/create-demo-service.js';
import { createSqliteDemoService } from '../src/application/create-sqlite-demo-service.js';
import { createChatGPTRuntime } from '../src/ai/chatgpt-runtime.js';
import { createRequestHandler } from '../src/http/request-handler.js';
import { validateStartupConfig } from '../src/http/startup-config.js';
import { buildInsightContext } from '../../../spikes/topic-resolution/browser/core/insight-context.js';
import { deterministicDependencies } from './helpers.js';
import { openDormantLocalApplication } from '../src/startup.js';

const ORIGIN=`chrome-extension://${'b'.repeat(32)}`;
const PAIRING='fixture-account-activation-pairing-only';
const config=validateStartupConfig({host:'127.0.0.1',port:4174,origin:ORIGIN,capability:PAIRING});
const TOPIC='reserved-domain-demo', SOURCE='reserved-example-com';
const IDENTITY={issuer:'https://auth.openai.com',clientId:'oaiapp_activation_fixture',subject:'alice-fixture'};
function fixture(t,{accountPath=':memory:',discussionPath=null}={}) {
  t.mock.method(globalThis,'fetch',()=>{throw new Error('network-denied');});
  let selected=IDENTITY;
  const repository=new AccountRepository({filename:accountPath});
  const accounts=new AccountService({repository,hmacKey:Buffer.alloc(32,21),mailSink:null,fixtureOnly:false,chatgptIdentity:()=>selected});
  const options={...deterministicDependencies(),resolveAccountActor:id=>accounts.principalForAccountId(id),readAccountActors:()=>accounts.publicActors()};
  const application=discussionPath?createSqliteDemoService({...options,databasePath:discussionPath}):null;
  const service=application?.service??createMemoryDemoService(options);
  const providerCalls=[];
  const ai=createChatGPTRuntime({service,
    connectionAdapter:{accountIdentity:()=>selected,status:()=>({connected:selected!==null,planEnabled:selected!==null,account:selected?{clientId:selected.clientId,label:'fixture-label'}:null}),
      disconnect:async()=>{selected=null;return {revocationConfirmed:false};},connect:async()=>({authorizationUrl:'http://127.0.0.1/fixture'}),dispose(){}},
    insightsAdapter:{createInsight:async input=>{providerCalls.push(input);return {body:'Fixture AI result',citations:[],model:'fixture'};},cancel(){},dispose(){},listModels:async()=>[]}});
  const lifecycle=createAccountLifecycle({accounts,service,ai});
  const handle=createRequestHandler({service,accounts,ai,config,accountWrites:true,accountLifecycle:lifecycle});
  let closed=false;
  const close=()=>{if(closed)return;closed=true;ai.dispose();application?.close();repository.close();};t.after(close);
  const req=async(path,body=undefined,token=undefined,extra={})=>{
    const response=await handle({method:body===undefined?'GET':'POST',url:path,
      headers:{host:config.hostHeader,origin:ORIGIN,authorization:`Bearer ${PAIRING}`,...(body===undefined?{}:{'content-type':'application/json'}),
        ...(token===undefined?{}:{'x-account-session':token}),...extra},body:body===undefined?null:JSON.stringify(body)});
    return {...response,value:JSON.parse(response.body)};
  };
  const command=(token,command)=>req('/v1/commands',{expected:service.catalog().version,command},token);
  async function login(subject,username) {
    selected={...IDENTITY,subject};const response=await req('/v1/account/chatgpt',{});assert.equal(response.status,200);
    const signed=response.value;const named=await req('/v1/account/username',{username},signed.session.accessToken);assert.equal(named.status,200);
    return {...signed,account:named.value,token:signed.session.accessToken,actorId:`account-${signed.account.id}`};
  }
  async function human(token,body='Fixture human root') {
    const response=await command(token,{type:'create-root',topicId:TOPIC,originSourceId:SOURCE,body});assert.equal(response.status,200);return response.value.result.contributionId;
  }
  async function generate(signed,operationId='fixture-ai-operation') {
    selected={...IDENTITY,subject:'alice-fixture'};
    const catalog=service.catalog(),context=buildInsightContext({catalog,discussion:service.discussion(TOPIC),related:service.related(SOURCE,20),sourceId:SOURCE,topicId:TOPIC});
    const response=await req('/v1/ai/insights',{operationId,model:'fixture',context,articleText:'Public fixture text',allowWebResearch:false,expected:catalog.version},signed.token);
    assert.equal(response.status,200);await Promise.resolve();await Promise.resolve();
    return command(signed.token,{type:'share-insight',operationId,topicId:TOPIC,originSourceId:SOURCE,body:'Fixture AI result'});
  }
  return {repository,accounts,service,ai,lifecycle,req,command,login,human,generate,close,providerCalls,select:value=>{selected=value;}};
}

test('canonical account roots/replies own trusted principals and legacy content stays unclaimed',async t=>{
  const f=fixture(t);
  const legacyId=f.service.command(f.service.catalog().version,{type:'create-root',topicId:TOPIC,originSourceId:SOURCE,body:'Unclaimed legacy'},'demo-alex').result.contributionId;
  const legacy=f.service.discussion(TOPIC).roots[0];
  const alice=await f.login('alice-fixture','Alice');const rootId=await f.human(alice.token);
  const bob=await f.login('bob-fixture','Bob');
  const reply=await f.command(bob.token,{type:'reply',discussionId:f.service.discussion(TOPIC).discussionId,rootId,replyToId:rootId,body:'Other person reply'});assert.equal(reply.status,200);
  const feed=f.service.discussion(TOPIC);const root=feed.roots.find(post=>post.id===rootId);
  assert.equal(root.authorId,alice.actorId);assert.equal(root.replies[0].authorId,bob.actorId);assert.equal(root.actorType,'human');
  assert.deepEqual(feed.roots.find(post=>post.id===legacyId),legacy);
  assert.equal(f.accounts.exportOwnAccount(alice.token).identities[0].subject,'alice-fixture');
  assert.ok(!JSON.stringify((await f.req('/v1/catalog')).value).includes('alice-fixture'));
  assert.equal(f.providerCalls.length,0);
});

test('paired guests read but session ownership, Origin and forged demo headers fence writes',async t=>{
  const f=fixture(t);const alice=await f.login('alice-fixture','Alice'),rootId=await f.human(alice.token);
  assert.equal((await f.req(`/v1/topics/${TOPIC}/discussion`)).status,200);
  assert.equal((await f.req('/v1/catalog')).status,200);
  const cmd={type:'create-root',topicId:TOPIC,body:'Denied'};
  assert.notEqual((await f.command(undefined,cmd)).status,200);
  assert.notEqual((await f.req('/v1/commands',{expected:f.service.catalog().version,command:cmd},alice.token,{'x-demo-actor':'demo-alex'})).status,200);
  assert.notEqual((await f.req('/v1/commands',{expected:f.service.catalog().version,command:cmd},alice.token,{origin:'https://attacker.test'})).status,200);
  assert.notEqual((await f.req(`/v1/topics/${TOPIC}/discussion`,undefined,undefined,{authorization:'Bearer wrong'})).status,200);
  const bob=await f.login('bob-fixture','Bob');
  for(const command of [{type:'withdraw',contributionId:rootId},{type:'edit',contributionId:rootId,body:'Takeover'}]) assert.notEqual((await f.command(bob.token,command)).status,200);
  assert.equal(f.service.discussion(TOPIC).roots.find(post=>post.id===rootId).body,'Fixture human root');
});

test('real accounts cannot issue management commands or reset canonical data',async t=>{
  const f=fixture(t);const alice=await f.login('alice-fixture','Alice');await f.human(alice.token);
  const before=f.service.catalog().version;
  for(const command of [{type:'create-topic',title:'Not permitted',kind:'general'}, {type:'correct-source',sourceId:SOURCE,topicId:null},
    {type:'import-insight',topicId:TOPIC,body:'Forged agent'}]) assert.notEqual((await f.command(alice.token,command)).status,200);
  assert.notEqual((await f.req('/v1/demo/reset',{expected:before,confirmation:'RESET DEMO STATE'},alice.token)).status,200);
  assert.deepEqual(f.service.catalog().version,before);
});

test('generated posts require exact one-shot runtime proof and a matching connected external namespace',async t=>{
  const f=fixture(t),alice=await f.login('alice-fixture','Alice');
  const forged={type:'share-insight',operationId:'nonexistent',topicId:TOPIC,originSourceId:SOURCE,body:'Fake result'};
  assert.notEqual((await f.command(alice.token,forged)).status,200);
  const posted=await f.generate(alice);assert.equal(posted.status,200);assert.equal(f.providerCalls.length,1);
  const aiPost=f.service.discussion(TOPIC).roots.find(post=>post.id===posted.value.result.contributionId);
  assert.equal(aiPost.actorType,'agent');assert.equal(aiPost.insight.operatorId,alice.actorId);
  assert.notEqual((await f.command(alice.token,{...forged,operationId:'fixture-ai-operation',body:'Fixture AI result'})).status,200);
  await f.login('bob-fixture','Bob');
  assert.notEqual((await f.req('/v1/ai/models',undefined,alice.token)).status,200);
  assert.equal(f.providerCalls.length,1);
  f.select(null);assert.equal((await f.req('/v1/account/me',undefined,alice.token)).status,200);
  assert.equal((await f.command(alice.token,{type:'reply',discussionId:f.service.discussion(TOPIC).discussionId,rootId:aiPost.id,replyToId:aiPost.id,body:'Human still works'})).status,200);
});

test('private export pages one bounded revision with version; malformed and foreign cursors cannot leak another account',async t=>{
  const f=fixture(t),alice=await f.login('alice-fixture','Alice');const body='汉'.repeat(7990),rootId=await f.human(alice.token,body);
  for(const text of ['Second revision','Third revision']) assert.equal((await f.command(alice.token,{type:'edit',contributionId:rootId,body:text})).status,200);
  const bob=await f.login('bob-fixture','Bob');const bobId=await f.human(bob.token,'Private Bob contribution');
  let after=null;const revisions=[];
  do {
    const response=await f.req('/v1/account/data',{after},alice.token);assert.equal(response.status,200);
    assert.ok(Buffer.byteLength(response.body,'utf8')<=32768);assert.deepEqual(response.value.version,f.service.catalog().version);
    assert.equal(response.value.posts.length,1);const post=response.value.posts[0];
    assert.equal(post.id,rootId);assert.equal(post.revisions.length,1);assert.equal(post.totalRevisions,3);
    revisions.push(post.revisions[0].body);after=response.value.next;
  } while(after!==null);
  assert.deepEqual(revisions,[body,'Second revision','Third revision']);
  assert.notEqual((await f.req('/v1/account/data',{after:`${bobId}:0`},alice.token)).status,200);
  assert.notEqual((await f.req('/v1/account/data',{after:null,accountId:bob.account.id},alice.token)).status,200);
  assert.notEqual((await f.req('/v1/account/data',{after:null})).status,200);
});

test('account deletion purges identifiers and all owned human/AI revisions, keeping other author reply and legacy root',async t=>{
  const f=fixture(t);const legacyId=f.service.command(f.service.catalog().version,{type:'create-root',topicId:TOPIC,body:'Legacy unchanged'},'demo-alex').result.contributionId;
  const alice=await f.login('alice-fixture','Alice'),rootId=await f.human(alice.token,'Erased original');
  await f.command(alice.token,{type:'edit',contributionId:rootId,body:'Erased edit'});const generated=await f.generate(alice);assert.equal(generated.status,200);
  const bob=await f.login('bob-fixture','Bob');
  const reply=await f.command(bob.token,{type:'reply',discussionId:f.service.discussion(TOPIC).discussionId,rootId,replyToId:rootId,body:'Retained Bob reply'});assert.equal(reply.status,200);
  assert.notEqual((await f.req('/v1/account/delete',{confirmation:'DELETE MY ACCOUNT',accountId:bob.account.id},alice.token)).status,200);
  assert.notEqual((await f.req('/v1/account/delete',{confirmation:'wrong'},alice.token)).status,200);
  assert.equal((await f.req('/v1/account/delete',{confirmation:'DELETE MY ACCOUNT'},alice.token)).status,200);
  assert.notEqual((await f.req('/v1/account/me',undefined,alice.token)).status,200);
  assert.equal((await f.req('/v1/account/me',undefined,bob.token)).status,200);
  assert.equal(f.accounts.db.prepare('SELECT count(*) AS n FROM external_identities WHERE account_id=?').get(alice.account.id).n,0);
  assert.equal(f.accounts.db.prepare('SELECT username FROM accounts WHERE id=?').get(alice.account.id).username,null);
  const feed=f.service.discussion(TOPIC),deleted=feed.roots.find(post=>post.id===rootId);
  assert.equal(deleted.state,'deleted');assert.equal(deleted.replies[0].body,'Retained Bob reply');
  assert.ok(!JSON.stringify(feed).includes('Erased'));assert.ok(!JSON.stringify(feed).includes('Fixture AI result'));
  assert.equal(feed.roots.find(post=>post.id===legacyId).body,'Legacy unchanged');
  assert.deepEqual(f.service.accountContributions(alice.actorId),[]);
});

test('crashed staged deletion is completed on SQLite restart before re-enabling account writes',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'discussion-account-activation-fixture-'));
  const paths={accountPath:join(directory,'accounts.sqlite'),discussionPath:join(directory,'contributions.sqlite')};
  const first=fixture(t,paths),alice=await first.login('alice-fixture','Alice');await first.human(alice.token,'Crash-withdraw body');
  first.accounts.beginDeletion(alice.token);first.close();
  const restarted=fixture(t,paths);
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  assert.deepEqual(restarted.accounts.listDeletingAccountIds(),[alice.account.id]);
  assert.notEqual((await restarted.req('/v1/account/chatgpt',{})).status,200);
  restarted.lifecycle.resume();assert.deepEqual(restarted.accounts.listDeletingAccountIds(),[]);
  assert.deepEqual(restarted.service.accountContributions(alice.actorId),[]);
  assert.ok(!JSON.stringify(restarted.service.discussion(TOPIC)).includes('Crash-withdraw body'));
  const replacement=await restarted.login('alice-fixture','AliceAgain');assert.notEqual(replacement.account.id,alice.account.id);
  restarted.close();
});

test('account-aware resolver cannot turn a forged X-Demo-Actor account UUID into authority when writes are disabled',async t=>{
  const f=fixture(t),alice=await f.login('alice-fixture','Alice');
  const handle=createRequestHandler({service:f.service,config,accounts:f.accounts,accountWrites:false});
  const before=f.service.catalog().version;
  const response=await handle({method:'POST',url:'/v1/commands',headers:{host:config.hostHeader,origin:ORIGIN,
    authorization:`Bearer ${PAIRING}`,'content-type':'application/json','x-demo-actor':alice.actorId},
    body:JSON.stringify({expected:before,command:{type:'create-root',topicId:TOPIC,body:'Forged disabled account'}})});
  assert.equal(response.status,403);assert.deepEqual(f.service.catalog().version,before);
});

test('account read POST empty-object equivalents preserve exact-Origin, pairing, auth, method and body fences',async t=>{
  const f=fixture(t),alice=await f.login('alice-fixture','Alice');
  const handle=createRequestHandler({service:f.service,accounts:f.accounts,config,accountWrites:true});
  const request=(method,path,body,origin=ORIGIN,token=alice.token)=>handle({method,url:path,
    headers:{host:config.hostHeader,authorization:`Bearer ${PAIRING}`,'content-type':'application/json',
      ...(origin===null?{}:{origin}),...(token===null?{}:{'x-account-session':token})},body});
  for(const path of ['/v1/account/capabilities','/v1/account/me']) {
    const post=await request('POST',path,'{}');assert.equal(post.status,200);
    const get=await request('GET',path,null);assert.equal(get.status,200);assert.deepEqual(JSON.parse(post.body),JSON.parse(get.body));
    for(const body of [null,'','null','[]','1','true','{"accountId":"other"}','{"unexpected":false}','{']) {
      assert.equal((await request('POST',path,body)).status,400);
    }
    assert.equal((await request('GET',path,'{}')).status,400);
    assert.notEqual((await request('PUT',path,'{}')).status,200);
    for(const method of ['POST','GET']) {
      const body=method==='POST'?'{}':null;
      assert.equal((await request(method,path,body,null)).status,403);
      assert.equal((await request(method,path,body,'https://attacker.test')).status,403);
    }
  }
  assert.equal((await request('POST','/v1/account/me','{}',ORIGIN,null)).status,401);
  assert.equal((await request('POST','/v1/account/capabilities','{}',ORIGIN,null)).status,200);
  const unpaired=await handle({method:'POST',url:'/v1/account/capabilities',headers:{host:config.hostHeader,origin:ORIGIN,
    authorization:'Bearer wrong','content-type':'application/json'},body:'{}'});assert.equal(unpaired.status,401);
});

test('POST resumable reads only authoritative own jobs with strict empty input and no provider grant requirement',async t=>{
  const f=fixture(t),alice=await f.login('alice-fixture','Alice');
  const catalog=f.service.catalog(),context=buildInsightContext({catalog,discussion:f.service.discussion(TOPIC),
    related:f.service.related(SOURCE,20),sourceId:SOURCE,topicId:TOPIC});
  const generated=await f.req('/v1/ai/insights',{operationId:'resume-owned-private',model:'fixture',context,articleText:'Public fixture text',
    allowWebResearch:false,expected:catalog.version},alice.token);assert.equal(generated.status,200);
  await Promise.resolve();await Promise.resolve();
  const own=await f.req('/v1/ai/insights/resumable',{},alice.token);assert.equal(own.status,200);
  assert.equal(own.value.job.operationId,'resume-owned-private');assert.ok(!own.body.includes('Fixture AI result'));
  const legacy=await f.req('/v1/ai/insights/resumable',undefined,alice.token);assert.equal(legacy.status,200);assert.deepEqual(legacy.value,own.value);
  const bob=await f.login('bob-fixture','Bob');f.select(IDENTITY);
  const foreign=await f.req('/v1/ai/insights/resumable',{},bob.token);assert.equal(foreign.status,200);assert.deepEqual(foreign.value,{job:null});
  assert.equal((await f.req('/v1/ai/insights/resumable',{},alice.token)).value.job.operationId,'resume-owned-private');
  for(const body of [null,[],true,1,{operationId:'resume-owned-private'},{actorId:alice.actorId},{accountId:alice.account.id}]) {
    assert.equal((await f.req('/v1/ai/insights/resumable',body,alice.token)).status,400);
  }
  assert.notEqual((await f.req('/v1/ai/insights/resumable',{})).status,200);
  assert.equal((await f.req('/v1/ai/insights/resumable',{},alice.token,{'x-demo-actor':alice.actorId})).status,403);
  assert.equal((await f.req('/v1/ai/insights/resumable',{},alice.token,{origin:'https://attacker.test'})).status,403);
  const handle=createRequestHandler({service:f.service,accounts:f.accounts,ai:f.ai,config,accountWrites:true});
  const missing=await handle({method:'POST',url:'/v1/ai/insights/resumable',headers:{host:config.hostHeader,
    authorization:`Bearer ${PAIRING}`,'content-type':'application/json','x-account-session':alice.token},body:'{}'});assert.equal(missing.status,403);
  f.select(null);
  const disconnected=await f.req('/v1/ai/insights/resumable',{},alice.token);assert.equal(disconnected.status,200);
  assert.deepEqual(disconnected.value,{job:null});assert.equal(f.providerCalls.length,1);
});

function startupRequest(application,path,body=undefined,token=undefined) {
  return application.handle({method:body===undefined?'GET':'POST',url:path,
    headers:{host:config.hostHeader,origin:ORIGIN,authorization:`Bearer ${PAIRING}`,...(body===undefined?{}:{'content-type':'application/json'}),
      ...(token===undefined?{}:{'x-account-session':token})},body:body===undefined?null:JSON.stringify(body)});
}
function storedDocument(filename) {
  const db=new DatabaseSync(filename);try{return db.prepare('SELECT document FROM demo_state').get().document;}finally{db.close();}
}

test('actual dormant startup composes separate accounts and resumes interrupted erasure before returning handler',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw new Error('network-denied');});
  const directory=mkdtempSync(join(tmpdir(),'discussion-dormant-account-fixture-'));
  let app=null;
  t.after(()=>{app?.close();rmSync(directory,{recursive:true,force:true});});
  const databasePath=join(directory,'contributions.sqlite'),accountDatabasePath=join(directory,'accounts.sqlite'),accountHmacKey=Buffer.alloc(32,31);
  let cancels=0,disposals=0;
  const ai=()=>({accountIdentity:()=>IDENTITY,cancelAccount(){cancels++;},dispose(){disposals++;}});
  const open=()=>openDormantLocalApplication({config:{host:'127.0.0.1',port:4174,origin:ORIGIN,capability:PAIRING},
    databasePath,accountDatabasePath,accountHmacKey,accountsEnabled:true,ai:ai(),...deterministicDependencies()});
  app=open();
  const capability=await startupRequest(app,'/v1/account/capabilities');assert.equal(capability.status,200);
  assert.deepEqual(JSON.parse(capability.body),{chatGPTIdentity:true,emailCode:false});
  assert.equal((await startupRequest(app,`/v1/topics/${TOPIC}/discussion`)).status,200);
  const signed=JSON.parse((await startupRequest(app,'/v1/account/chatgpt',{})).body);
  assert.equal((await startupRequest(app,'/v1/account/username',{username:'StartupOwner'},signed.session.accessToken)).status,200);
  const expected=JSON.parse((await startupRequest(app,'/v1/catalog')).body).version;
  assert.equal((await startupRequest(app,'/v1/commands',{expected,command:{type:'create-root',topicId:TOPIC,body:'Startup crash sentinel'}},signed.session.accessToken)).status,200);
  app.close();app=null;
  const repository=new AccountRepository({filename:accountDatabasePath});
  const accounts=new AccountService({repository,hmacKey:accountHmacKey,fixtureOnly:false,mailSink:null,chatgptIdentity:()=>IDENTITY});
  accounts.beginDeletion(signed.session.accessToken);repository.close();
  app=open();assert.equal(cancels,1);
  assert.notEqual((await startupRequest(app,'/v1/account/me',undefined,signed.session.accessToken)).status,200);
  assert.ok(!JSON.stringify(JSON.parse((await startupRequest(app,`/v1/topics/${TOPIC}/discussion`)).body)).includes('Startup crash sentinel'));
  const inspected=new AccountRepository({filename:accountDatabasePath});
  assert.equal(inspected.database.prepare('SELECT state FROM accounts WHERE id=?').get(signed.account.id).state,'deleted');
  assert.equal(inspected.database.prepare('SELECT count(*) AS n FROM external_identities WHERE account_id=?').get(signed.account.id).n,0);inspected.close();
  assert.ok(!storedDocument(databasePath).includes('Startup crash sentinel'));
  app.close();app=null;assert.equal(disposals,2);
});

test('account startup keeps legacy document exact until deliberate write; v3 persists and failed commands cannot downgrade it',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'discussion-v3-activation-fixture-'));
  let app=null;
  t.after(()=>{app?.close();rmSync(directory,{recursive:true,force:true});});
  const databasePath=join(directory,'contributions.sqlite');
  const old=createSqliteDemoService({databasePath,...deterministicDependencies()});
  old.service.command(old.service.catalog().version,{type:'create-root',topicId:TOPIC,body:'Exact old fixture body'},'demo-alex');old.close();
  const original=storedDocument(databasePath),legacy=JSON.parse(original).contributions[0];assert.equal(JSON.parse(original).schema,'demo-state/v2');
  const options={config:{host:'127.0.0.1',port:4174,origin:ORIGIN,capability:PAIRING},databasePath,
    accountDatabasePath:join(directory,'accounts.sqlite'),accountsEnabled:true,accountHmacKey:Buffer.alloc(32,32)};
  const deps=deterministicDependencies();let extraId=100;
  const open=()=>openDormantLocalApplication({...options,...deps,nextId:prefix=>`${prefix}-${++extraId}`,ai:{accountIdentity:()=>IDENTITY,dispose(){}}});
  app=open();assert.equal(storedDocument(databasePath),original);
  const signed=JSON.parse((await startupRequest(app,'/v1/account/chatgpt',{})).body);
  await startupRequest(app,'/v1/account/username',{username:'V3Owner'},signed.session.accessToken);
  assert.equal(storedDocument(databasePath),original);
  const expected=JSON.parse((await startupRequest(app,'/v1/catalog')).body).version;
  const created=await startupRequest(app,'/v1/commands',{expected,command:{type:'create-root',topicId:TOPIC,body:'New account contribution'}},signed.session.accessToken);
  assert.equal(created.status,200);
  const v3=storedDocument(databasePath),parsed=JSON.parse(v3);assert.equal(parsed.schema,'demo-state/v3');assert.deepEqual(parsed.contributions[0],legacy);
  assert.notEqual((await startupRequest(app,'/v1/commands',{expected:JSON.parse(created.body).version,command:{type:'create-topic',title:'Denied',kind:'general'}},signed.session.accessToken)).status,200);
  assert.equal(storedDocument(databasePath),v3);
  app.close();app=null;app=open();assert.equal(storedDocument(databasePath),v3);
  const feed=JSON.parse((await startupRequest(app,`/v1/topics/${TOPIC}/discussion`)).body);
  assert.equal(feed.roots.find(post=>post.body==='New account contribution').authorId,`account-${signed.account.id}`);
  assert.equal(feed.roots.find(post=>post.body==='Exact old fixture body').authorId,'demo-alex');
  assert.equal((await startupRequest(app,'/v1/account/me',undefined,signed.session.accessToken)).status,200);
});
