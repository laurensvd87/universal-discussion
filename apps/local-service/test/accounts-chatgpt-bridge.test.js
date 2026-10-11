import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AccountRepository } from '../src/accounts/account-repository.js';
import { AccountService } from '../src/accounts/account-service.js';
import { routeAccountRequest } from '../src/accounts/account-routes.js';
import { createChatGPTConnection } from '../src/ai/chatgpt-connection.js';
import { createChatGPTRuntime } from '../src/ai/chatgpt-runtime.js';
import { buildInsightContext } from '../../../spikes/topic-resolution/browser/core/insight-context.js';
import { demoService, deterministicDependencies } from './helpers.js';
import { createMemoryDemoService } from '../src/application/create-demo-service.js';
import { createRequestHandler } from '../src/http/request-handler.js';
import { validateStartupConfig } from '../src/http/startup-config.js';

const issuer = 'https://auth.openai.com';
const identity = {issuer,clientId:'oaiapp_fixture',subject:'subject-1'};
const NOW = Date.UTC(2026,9,11);
function fixture(t, {filename=':memory:',getIdentity=()=>identity, synthetic=false}={}) {
  const repository = new AccountRepository({filename}); t.after(()=>repository.close());
  const mail=[];
  const accounts = new AccountService({repository,hmacKey:Buffer.alloc(32,9),chatgptIdentity:getIdentity,
    fixtureOnly:synthetic,mailSink:synthetic?message=>{mail.push(message);}:null,now:()=>NOW});
  return {repository,accounts,mail};
}
function directory(t) {
  const dir=mkdtempSync(join(tmpdir(),'discussion-identity-fixture-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true})); return dir;
}

test('trusted identity maps stable own sessions and needs an explicit username; namespaces never match email',t=>{
  let selected=identity; const f=fixture(t,{getIdentity:()=>selected});
  assert.deepEqual(f.accounts.capabilities(),{chatGPTIdentity:true,emailCode:false});
  const a=f.accounts.signInChatGPT({});
  assert.equal(f.accounts.matchesChatGPTIdentity(a.account.id),true);
  assert.equal(f.accounts.matchesChatGPTIdentity('unmapped-account'),false);
  assert.equal(a.account.username,null);
  assert.deepEqual(f.accounts.publicActors(),[]);
  assert.throws(()=>f.accounts.resolvePrincipal(a.session.accessToken),/authentication-required/);
  f.accounts.setUsername(a.session.accessToken,{username:'ForumUser'});
  const repeat=f.accounts.signInChatGPT({},a.session.accessToken);
  assert.equal(repeat.account.id,a.account.id); assert.equal(repeat.account.username,'ForumUser');
  assert.notEqual(repeat.session.accessToken,a.session.accessToken);
  assert.deepEqual(f.accounts.resolvePrincipal(repeat.session.accessToken),{
    id:`account-${a.account.id}`,displayName:'ForumUser',type:'human',demo:false,accountId:a.account.id});
  assert.deepEqual(f.accounts.publicActors(),[f.accounts.resolvePrincipal(repeat.session.accessToken)]);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS n FROM account_emails').get().n,0);
  assert.ok(!JSON.stringify(repeat.account).includes(identity.subject));
  selected={...identity,clientId:'oaiapp_another'};
  assert.equal(f.accounts.matchesChatGPTIdentity(a.account.id),false);
  assert.throws(()=>f.accounts.signInChatGPT({},repeat.session.accessToken),/account-switch-required/);
  const b=f.accounts.signInChatGPT({}); assert.notEqual(a.account.id,b.account.id);
  selected={...identity,subject:'subject-2'};
  assert.notEqual(f.accounts.signInChatGPT({}).account.id,b.account.id);
});

test('disconnect and provider switching never invalidate app sessions or silently link existing accounts',t=>{
  let selected=identity; const f=fixture(t,{getIdentity:()=>selected,synthetic:true});
  const a=f.accounts.signInChatGPT({}); selected=null;
  assert.deepEqual(f.accounts.me(a.session.accessToken),a.account);
  assert.throws(()=>f.accounts.signInChatGPT({}),/chatgpt-unavailable/);
  const nonce='fixture-client-nonce-1234';
  const request=f.accounts.requestCode({email:'owner@example.test',clientNonce:nonce});
  const email=f.accounts.verifyCode({challengeId:request.challengeId,code:f.mail[0].code,clientNonce:nonce});
  selected=identity;
  assert.throws(()=>f.accounts.signInChatGPT({},email.session.accessToken),/account-switch-required/);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS n FROM external_identities').get().n,1);
});

test('identity proof is exact server adapter output; body injection, labels, getters and async adapters fail closed',t=>{
  for(const bad of [null,{clientId:identity.clientId,label:identity.subject},{...identity,issuer:'https://attacker.test'},
    {...identity,clientId:'dynamic_agent_client'},{...identity,subject:''},{...identity,subject:'bad\n'},
    {...identity,email:'owner@example.test'},Promise.resolve(identity)]) {
    const f=fixture(t,{getIdentity:()=>bad}); assert.equal(f.accounts.capabilities().chatGPTIdentity,false);
    assert.throws(()=>f.accounts.signInChatGPT({}),/chatgpt-unavailable/);
    assert.equal(f.repository.database.prepare('SELECT count(*) AS n FROM accounts').get().n,0);
  }
  let evaluated=false; const f=fixture(t,{getIdentity:()=>({issuer,clientId:identity.clientId,get subject(){evaluated=true;return 'victim';}})});
  assert.throws(()=>f.accounts.signInChatGPT({}),/chatgpt-unavailable/); assert.equal(evaluated,false);
  const valid=fixture(t);
  for(const body of [null,[],{subject:'victim'},{accountId:'victim'}, {issuer}]) assert.throws(()=>valid.accounts.signInChatGPT(body),/invalid-request/);
});

test('paired adapter exposes only flat capabilities and exact empty ChatGPT request; mail is disabled',t=>{
  const f=fixture(t); const headers={'content-type':'application/json'};
  const call=(method,path,body=null,extra={})=>routeAccountRequest({method,url:new URL(`http://127.0.0.1:4174${path}`),headers:{...headers,...extra},body},f.accounts);
  assert.deepEqual(call('GET','/v1/account/capabilities').value,{chatGPTIdentity:true,emailCode:false});
  const signed=call('POST','/v1/account/chatgpt','{}').value;
  assert.throws(()=>call('POST','/v1/account/chatgpt','{"subject":"victim"}'),/invalid-request/);
  assert.throws(()=>call('POST','/v1/account/chatgpt','{}',{'x-account-session':'invalid'}),/authentication-required/);
  assert.throws(()=>call('POST','/v1/account/email/request','{"email":"owner@example.com","clientNonce":"long-client-nonce"}'),/email-unavailable/);
  assert.equal(call('POST','/v1/account/chatgpt','{}',{'x-account-session':signed.session.accessToken}).value.account.id,signed.account.id);
});

test('blocked/deleting identities deny login; staged deletion revokes sessions and purges identifiers',t=>{
  const f=fixture(t); const a=f.accounts.signInChatGPT({}); const b=f.accounts.signInChatGPT({});
  f.accounts.setUsername(a.session.accessToken,{username:'Owner'});
  assert.deepEqual(f.accounts.exportOwnAccount(a.session.accessToken).identities,[identity]);
  f.repository.database.prepare("UPDATE accounts SET state='blocked' WHERE id=?").run(a.account.id);
  assert.throws(()=>f.accounts.signInChatGPT({}),/authentication-required/);
  f.repository.database.prepare("UPDATE accounts SET state='active' WHERE id=?").run(a.account.id);
  assert.deepEqual(f.accounts.beginDeletion(a.session.accessToken),{accountId:a.account.id});
  assert.deepEqual(f.accounts.listDeletingAccountIds(),[a.account.id]);
  assert.throws(()=>f.accounts.me(b.session.accessToken),/authentication-required/);
  assert.throws(()=>f.accounts.renew({refreshToken:b.session.refreshToken}),/authentication-required/);
  assert.throws(()=>f.accounts.signInChatGPT({}),/authentication-required/);
  assert.deepEqual(f.accounts.finishDeletion(a.account.id),{deleted:true});
  assert.deepEqual(f.accounts.finishDeletion(a.account.id),{deleted:true});
  assert.deepEqual(f.accounts.listDeletingAccountIds(),[]);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS n FROM external_identities').get().n,0);
  assert.equal(f.repository.database.prepare('SELECT username FROM accounts WHERE id=?').get(a.account.id).username,null);
  assert.notEqual(f.accounts.signInChatGPT({}).account.id,a.account.id);
});

test('session failure rolls back new identity and account mapping together',t=>{
  const f=fixture(t); f.accounts.session=()=>{throw new Error('fixture-failure');};
  assert.throws(()=>f.accounts.signInChatGPT({}),/fixture-failure/);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS n FROM accounts').get().n,0);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS n FROM external_identities').get().n,0);
});

test('durable deleting state blocks sign-in after restart until trusted withdrawal finishes',t=>{
  const filename=join(directory(t),'accounts.sqlite');
  const f=fixture(t,{filename}); const a=f.accounts.signInChatGPT({});
  assert.throws(()=>f.accounts.finishDeletion(a.account.id),/authentication-required/);
  f.accounts.beginDeletion(a.session.accessToken); f.repository.close();
  const resumed=fixture(t,{filename});
  assert.deepEqual(resumed.accounts.listDeletingAccountIds(),[a.account.id]);
  assert.throws(()=>resumed.accounts.signInChatGPT({}),/authentication-required/);
  assert.throws(()=>resumed.accounts.me(a.session.accessToken),/authentication-required/);
  resumed.accounts.finishDeletion(a.account.id);
  assert.notEqual(resumed.accounts.signInChatGPT({}).account.id,a.account.id);
  resumed.repository.close();
});

test('v1 exact migration preserves synthetic account/session and rejects unexpected schema before mutation',t=>{
  const dir=directory(t),filename=join(dir,'accounts.sqlite');
  const original=fixture(t,{filename,synthetic:true});
  const request=original.accounts.requestCode({email:'owner@example.test',clientNonce:'fixture-client-nonce-1234'});
  const a=original.accounts.verifyCode({challengeId:request.challengeId,code:original.mail[0].code,clientNonce:'fixture-client-nonce-1234'});
  original.accounts.setUsername(a.session.accessToken,{username:'Preserved'});
  original.repository.database.exec("DROP TABLE external_identities; UPDATE auth_meta SET value='synthetic-accounts-v1'; PRAGMA user_version=1;");
  original.repository.close();
  const reopened=fixture(t,{filename}); assert.equal(reopened.accounts.me(a.session.accessToken).username,'Preserved');
  assert.equal(reopened.repository.database.prepare('PRAGMA user_version').get().user_version,2);
  const b=reopened.accounts.signInChatGPT({}); reopened.repository.close();
  const restarted=fixture(t,{filename}); assert.equal(restarted.accounts.signInChatGPT({}).account.id,b.account.id);
  restarted.repository.close();
  const changed=new DatabaseSync(filename);
  changed.exec("DROP TABLE external_identities; UPDATE auth_meta SET value='synthetic-accounts-v1'; PRAGMA user_version=1; CREATE VIEW impostor AS SELECT id FROM accounts;"); changed.close();
  assert.throws(()=>new AccountRepository({filename}),/unsupported-account-schema/);
  const unchanged=new DatabaseSync(filename); assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version,1); unchanged.close();
  assert.throws(()=>new AccountRepository({filename:join(dir,'demo.sqlite')}),/unsupported-account-schema/);
});

const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...pair.publicKey.export({format:'jwk'}),kid:'fixture-key',use:'sig',alg:'RS256'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(nonce,changes={}) {
  const head=encode({alg:'RS256',kid:'fixture-key'});
  const body=encode({iss:issuer,aud:identity.clientId,sub:identity.subject,nonce,iat:NOW/1000,exp:NOW/1000+3600,...changes});
  const content=`${head}.${body}`;
  return `${content}.${sign('RSA-SHA256',Buffer.from(content),pair.privateKey).toString('base64url')}`;
}
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function connectionFixture({registration=null,saved=null,restoreToken=null,claims={},delay=null,planEnabled=true,refreshResponse=null}={}) {
  let nonce=null,calls=0,clock=NOW; const redirect='http://127.0.0.1:1455/auth/callback';
  const connection=createChatGPTConnection({hostId:'fixture-host',agentName:'Fixture',now:()=>clock,
    readRegistration:async()=>registration,writeRegistration:async value=>{registration=value;},
    refreshStore:saved?{read:async()=>saved,write:async value=>{saved=value;},clear:async()=>{saved=null;}}:null,
    fetchImpl:async(url,request)=>{
      calls++;
      if(url.endsWith('openid-configuration')) return json({issuer,authorization_endpoint:`${issuer}/api/accounts/authorize`,token_endpoint:`${issuer}/api/accounts/oauth/token`,jwks_uri:`${issuer}/jwks`,revocation_endpoint:`${issuer}/revoke`});
      if(url.endsWith('/jwks')) return json({keys:[jwk]});
      if(url.endsWith('/revoke')) return new Response(null,{status:200});
      if(delay) await delay();
      const refreshing=new URLSearchParams(request.body).get('grant_type')==='refresh_token';
      if(refreshing&&refreshResponse) return refreshResponse();
      return json({token_type:'Bearer',expires_in:3600,scope:planEnabled?'openid offline_access resource.invoke chatgpt.tokens.use.direct':'openid',access_token:'fixture-access',
        ...(planEnabled?{refresh_token:'fixture-refresh'}:{}),
        ...(refreshing?restoreToken?{id_token:restoreToken}:{}:{id_token:token(nonce,claims)})});
    }});
  return {connection,calls:()=>calls,saved:()=>saved,setClock:value=>{clock=value;},async login(){const auth=new URL(await connection.start({redirectUri:redirect})); nonce=auth.searchParams.get('nonce');
    const callback=new URL(redirect); callback.searchParams.set('code','fixture-code');callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('client_id',identity.clientId);
    return connection.completeCallback({redirectUri:redirect,url:callback.toString()});}};
}

test('connection identity exposes verified namespace only, performs no network and clears before disconnect completes',async()=>{
  const f=connectionFixture(); assert.equal(f.connection.accountIdentity(),null); await f.login();
  const calls=f.calls(); assert.deepEqual(f.connection.accountIdentity(),identity); assert.equal(f.calls(),calls);
  assert.equal(Object.isFrozen(f.connection.accountIdentity()),true);
  assert.equal(JSON.stringify(f.connection.status()).includes(identity.subject),true); // Existing label compatibility is presentation only.
  const disconnected=f.connection.disconnect(); assert.equal(f.connection.accountIdentity(),null); await disconnected;
});

test('wrong signed issuer/audience/subject and nonce never produce account identity',async()=>{
  for(const claims of [{iss:'https://attacker.test'},{aud:'different-client'},{sub:''},{nonce:'wrong'}]) {
    const f=connectionFixture({claims}); await assert.rejects(f.login()); assert.equal(f.connection.accountIdentity(),null); f.connection.dispose();
  }
});

test('editable registration alone is never restore identity; protected association must match and returned ID token must verify',async()=>{
  const registration={clientId:identity.clientId,subject:identity.subject,label:'edited-label'};
  const bare=connectionFixture({registration}); assert.equal(await bare.connection.restore(),false); assert.equal(bare.calls(),0);
  const mismatch=connectionFixture({registration,saved:{clientId:identity.clientId,subject:'victim',refreshToken:'fixture-refresh'}});
  assert.equal(await mismatch.connection.restore(),false); assert.equal(mismatch.connection.accountIdentity(),null); assert.equal(mismatch.calls(),0);
  const restored=connectionFixture({registration,saved:{...registration,refreshToken:'fixture-refresh'}});
  assert.equal(await restored.connection.restore(),true); assert.deepEqual(restored.connection.accountIdentity(),identity);
  const changed=connectionFixture({registration,saved:{...registration,refreshToken:'fixture-refresh'},restoreToken:token(null,{sub:'other-subject'})});
  assert.equal(await changed.connection.restore(),false); assert.equal(changed.connection.accountIdentity(),null);
});

test('late restore cannot reactivate identity after dispose',async()=>{
  let release; const delayed=new Promise(resolve=>{release=resolve;});
  const registration={clientId:identity.clientId,subject:identity.subject};
  const f=connectionFixture({registration,saved:{...registration,refreshToken:'fixture-refresh'},delay:()=>delayed});
  const restoring=f.connection.restore();
  await new Promise(resolve=>setImmediate(resolve)); f.connection.dispose(); release();
  assert.equal(await restoring,false); assert.equal(f.connection.accountIdentity(),null);
});

test('internal runtime subject binding invalidates results with identical provider labels without leaking identity',async()=>{
  const service=demoService(); let selected=identity; const providerRequests=[];
  const runtime=createChatGPTRuntime({service,
    connectionAdapter:{status:()=>({connected:true,planEnabled:true,account:{clientId:identity.clientId,label:'same-label'}}),
      accountIdentity:()=>selected,dispose(){}},
    insightsAdapter:{createInsight:async input=>{providerRequests.push(input);return {body:'Fixture result',citations:[],model:'fixture'};},cancel(){},dispose(){}}});
  try {
    const sourceId='reserved-example-com',topicId='reserved-domain-demo',catalog=service.catalog();
    const context=buildInsightContext({catalog,discussion:service.discussion(topicId),related:service.related(sourceId,20),sourceId,topicId});
    runtime.create({operationId:'same-label-subject-switch',model:'fixture',context,articleText:'Public fixture text',allowWebResearch:false,expected:catalog.version},'demo-alex');
    await Promise.resolve();await Promise.resolve();
    assert.equal(runtime.result({operationId:'same-label-subject-switch'},'demo-alex').state,'completed');
    assert.ok(!JSON.stringify(providerRequests).includes(identity.subject));
    assert.ok(!JSON.stringify(runtime.resumable('demo-alex')).includes(identity.subject));
    selected={...identity,subject:'other-subject'};
    assert.deepEqual(runtime.result({operationId:'same-label-subject-switch'},'demo-alex'),{
      operationId:'same-label-subject-switch',state:'failed',error:'stale-context'});
    assert.deepEqual(runtime.resumable('demo-alex'),{job:null});
  } finally {runtime.dispose();}
});

test('account cancellation removes its recovered results without cancelling another account',async()=>{
  const service=demoService();let cancelled=0;
  const runtime=createChatGPTRuntime({service,
    connectionAdapter:{status:()=>({connected:true,planEnabled:true}),dispose(){}},
    insightsAdapter:{createInsight:async()=>({body:'Fixture result',citations:[],model:'fixture'}),cancel(){cancelled++;},dispose(){}}});
  try {
    const sourceId='reserved-example-com',topicId='reserved-domain-demo',catalog=service.catalog();
    const context=buildInsightContext({catalog,discussion:service.discussion(topicId),related:service.related(sourceId,20),sourceId,topicId});
    const request={model:'fixture',context,articleText:'Public fixture text',allowWebResearch:false,expected:catalog.version};
    runtime.create({...request,operationId:'alice-result'},'demo-alex');await Promise.resolve();await Promise.resolve();
    runtime.create({...request,operationId:'blair-result'},'demo-blair');await Promise.resolve();await Promise.resolve();
    runtime.cancelAccount('demo-alex');
    assert.throws(()=>runtime.result({operationId:'alice-result'},'demo-alex'),error=>error.code==='not-found');
    assert.deepEqual(runtime.resumable('demo-alex'),{job:null});
    assert.equal(runtime.result({operationId:'blair-result'},'demo-blair').state,'completed');
    assert.equal(cancelled,0);
  } finally {runtime.dispose();}
});

test('expired access retains verified refreshable identity without getter network and permits provider authority before refresh',async t=>{
  const provider=connectionFixture();await provider.login();t.after(()=>provider.connection.dispose());
  const f=fixture(t,{getIdentity:()=>provider.connection.accountIdentity()});const signed=f.accounts.signInChatGPT({});
  provider.setClock(NOW+3_601_000);const calls=provider.calls();
  assert.deepEqual(provider.connection.accountIdentity(),identity);
  assert.equal(f.accounts.matchesChatGPTIdentity(signed.account.id),true);
  assert.deepEqual(f.accounts.capabilities(),{chatGPTIdentity:true,emailCode:false});
  assert.equal(provider.calls(),calls);
  f.accounts.setUsername(signed.session.accessToken,{username:'RefreshableOwner'});
  const service=createMemoryDemoService({...deterministicDependencies(),resolveAccountActor:id=>f.accounts.principalForAccountId(id),readAccountActors:()=>f.accounts.publicActors()});
  const runtime=createChatGPTRuntime({service,connectionAdapter:provider.connection,
    insightsAdapter:{async createInsight(){assert.equal(await provider.connection.getAccessToken(),'fixture-access');return {body:'Offline expiry result',citations:[],model:'fixture'};},cancel(){},dispose(){}}});
  t.after(()=>runtime.dispose());
  const origin=`chrome-extension://${'c'.repeat(32)}`,pairing='fixture-expiry-provider-authority-only';
  const config=validateStartupConfig({host:'127.0.0.1',port:4174,origin,capability:pairing});
  const handle=createRequestHandler({service,accounts:f.accounts,ai:runtime,config,accountWrites:true});
  const catalog=service.catalog(),sourceId='reserved-example-com',topicId='reserved-domain-demo';
  const context=buildInsightContext({catalog,discussion:service.discussion(topicId),related:service.related(sourceId,20),sourceId,topicId});
  const response=await handle({method:'POST',url:'/v1/ai/insights',headers:{host:config.hostHeader,origin,authorization:`Bearer ${pairing}`,
    'content-type':'application/json','x-account-session':signed.session.accessToken},body:JSON.stringify({operationId:'expired-provider-authority',model:'fixture',
      context,articleText:'Public offline fixture',allowWebResearch:false,expected:catalog.version})});
  assert.equal(response.status,200);await new Promise(resolve=>setImmediate(resolve));assert.equal(provider.calls(),calls+1);
  assert.equal(runtime.result({operationId:'expired-provider-authority'},`account-${signed.account.id}`).state,'completed');
  assert.deepEqual(provider.connection.accountIdentity(),identity);
});

test('expired identity-only connection without refresh permission never supplies account identity',async()=>{
  const f=connectionFixture({planEnabled:false});await f.login();assert.deepEqual(f.connection.accountIdentity(),identity);
  const calls=f.calls();f.setClock(NOW+3_601_000);assert.equal(f.connection.accountIdentity(),null);assert.equal(f.calls(),calls);
  f.connection.dispose();assert.equal(f.connection.accountIdentity(),null);
});

test('changed subject, invalid signature or malformed refreshed ID token clears active and protected identity binding',async()=>{
  const future={iat:NOW/1000+3601,exp:NOW/1000+7201};
  const signed=token(null,future),parts=signed.split('.');parts[2]=`${parts[2][0]==='A'?'B':'A'}${parts[2].slice(1)}`;
  for(const idToken of [token(null,{...future,sub:'switched-subject'}),token(null,{...future,iss:'https://attacker.test'}),
    parts.join('.'),'malformed',42,'']) {
    const f=connectionFixture({saved:{clientId:identity.clientId,subject:identity.subject,refreshToken:'old-fixture'},
      refreshResponse:()=>json({token_type:'Bearer',expires_in:3600,scope:'openid offline_access resource.invoke chatgpt.tokens.use.direct',
        access_token:'next-fixture-access',refresh_token:'next-fixture-refresh',id_token:idToken})});
    await f.login();f.setClock(NOW+3_601_000);assert.deepEqual(f.connection.accountIdentity(),identity);
    await assert.rejects(f.connection.getAccessToken());assert.equal(f.connection.accountIdentity(),null);
    assert.equal(f.connection.status().connected,false);assert.equal(f.saved(),null);f.connection.dispose();
  }
});

test('temporary refresh failure preserves verified refreshable identity and later ordinary retry succeeds',async()=>{
  let unavailable=true;
  const f=connectionFixture({saved:{clientId:identity.clientId,subject:identity.subject,refreshToken:'old-fixture'},
    refreshResponse:()=>unavailable?new Response('unavailable',{status:503}):json({token_type:'Bearer',expires_in:3600,
      scope:'openid offline_access resource.invoke chatgpt.tokens.use.direct',access_token:'retry-fixture-access',refresh_token:'retry-fixture-refresh'})});
  await f.login();f.setClock(NOW+3_601_000);await assert.rejects(f.connection.getAccessToken());
  const calls=f.calls();assert.deepEqual(f.connection.accountIdentity(),identity);assert.equal(f.calls(),calls);assert.ok(f.saved());
  unavailable=false;assert.equal(await f.connection.getAccessToken(),'retry-fixture-access');assert.deepEqual(f.connection.accountIdentity(),identity);
  f.connection.dispose();
});
