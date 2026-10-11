import assert from "node:assert/strict";
import test from "node:test";
import { AccountRepository } from "../src/accounts/account-repository.js";
import { AccountService } from "../src/accounts/account-service.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { demoService } from "./helpers.js";
import { createAccountClient } from "../../../spikes/topic-resolution/browser/core/account-client.js";
import { createAccountController } from "../../../spikes/topic-resolution/browser/core/account-controller.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const PAIRING = "synthetic-account-pairing-capability-only";
const config = validateStartupConfig({host:"127.0.0.1",port:4174,origin:ORIGIN,capability:PAIRING});
function fixture(t, enabled = true) {
  const repository = new AccountRepository(); t.after(() => repository.close());
  const mail = [];
  const accounts = new AccountService({repository,hmacKey:Buffer.alloc(32,7),mailSink:message=>mail.push(message)});
  const service = demoService();
  const handle = createRequestHandler({service,config,...(enabled?{accounts}: {})});
  const req = (url, body, extra = {}) => handle({method:body===undefined?"GET":"POST",url,
    headers:{host:config.hostHeader,origin:ORIGIN,authorization:`Bearer ${PAIRING}`,
      ...(body===undefined?{}:{"content-type":"application/json"}),...extra},body:body===undefined?null:JSON.stringify(body)});
  const client = createAccountClient({getPairingToken:()=>PAIRING,fetchImpl:async(url,options)=>{
    assert.equal(options.credentials,"omit"); assert.equal(options.redirect,"error");
    const response = await handle({method:options.method,url:new URL(url).pathname,
      headers:{host:config.hostHeader,origin:ORIGIN,...Object.fromEntries(Object.entries(options.headers).map(([k,v])=>[k.toLowerCase(),v]))},body:options.body??null});
    return new Response(response.body,{status:response.status,headers:response.headers});
  }});
  return {accounts,service,handle,req,client,mail};
}
test("dormant account routes require explicit injection and preserve device pairing",async t=>{
  const off=fixture(t,false);
  assert.equal((await off.req("/v1/account/email/request",{email:"reader@example.test",clientNonce:"n".repeat(32)})).status,404);
  const app=fixture(t);
  const body={email:"reader@example.test",clientNonce:"n".repeat(32)};
  for(const headers of [{authorization:"Bearer wrong"},{origin:"https://example.com"},{origin:undefined},{host:"localhost:4174"}]){
    const response=await app.req("/v1/account/email/request",body,headers);assert.notEqual(response.status,200);
  }
  assert.equal(app.mail.length,0);
  assert.equal((await app.req("/v1/topics/harbor-s2/discussion")).status,200); // Read with no app login.
  assert.equal((await app.req("/v1/account/me")).status,401);
});
test("account client completes code/username/settings/renew/logout without demo authority or DTO leaks",async t=>{
  const app=fixture(t);const version=app.service.catalog().version;
  const challenge=await app.client.requestCode({email:"reader@example.test",clientNonce:"n".repeat(32)});
  assert.deepEqual(Object.keys(challenge).sort(),["challengeId","expiresIn"]);
  const signed=await app.client.verifyCode({challengeId:challenge.challengeId,code:app.mail[0].code,clientNonce:"n".repeat(32)});
  const self=await app.client.setUsername(signed.session.accessToken,{username:"Reader_One"});
  assert.equal(self.username,"Reader_One"); assert.equal(Object.hasOwn(self,"email"),false);
  assert.equal((await app.client.setReplyEmail(signed.session.accessToken,{enabled:true})).replyEmail,true);
  assert.equal((await app.req("/v1/account/me",undefined,{"x-account-session":signed.session.accessToken,"x-demo-actor":"demo-blair"})).status,403);
  await assert.rejects(app.client.verifyCode({challengeId:challenge.challengeId,code:app.mail[0].code,clientNonce:"n".repeat(32)}),e=>e.code==="verification-failed");
  const renewed=await app.client.renew({refreshToken:signed.session.refreshToken});
  await assert.rejects(app.client.me(signed.session.accessToken),e=>e.code==="authentication-required");
  await app.client.logout(renewed.session.accessToken);
  await assert.rejects(app.client.renew({refreshToken:renewed.session.refreshToken}),e=>e.code==="authentication-required");
  assert.deepEqual(app.service.catalog().version,version);
});
test("account API rejects real addresses, unknown owner fields and account credential preflight on legacy routes",async t=>{
  const app=fixture(t);
  assert.equal((await app.req("/v1/account/email/request",{email:"person@example.com",clientNonce:"n".repeat(32)})).status,400);
  assert.equal((await app.req("/v1/account/email/request",{email:"reader@example.test",clientNonce:"n".repeat(32),accountId:"other"})).status,400);
  const preflight=url=>app.handle({method:"OPTIONS",url,headers:{host:config.hostHeader,origin:ORIGIN,"access-control-request-method":"POST","access-control-request-headers":"authorization,content-type,x-account-session"},body:null});
  assert.equal((await preflight("/v1/account/username")).status,204);
  assert.equal((await preflight("/v1/commands")).status,403);
  assert.equal(app.mail.length,0);
});
test("account transport rejects redirects, oversized responses, malformed DTO and unavailable token lookup",async()=>{
  const build=fetchImpl=>createAccountClient({getPairingToken:()=>PAIRING,fetchImpl});
  const json=value=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
  await assert.rejects(build(async()=>json({id:"a",username:"User",state:"active",replyEmail:false,email:"private@example.test"})).me("a".repeat(43)),e=>e.code==="invalid-response");
  await assert.rejects(build(async()=>new Response(" ".repeat(20_000),{headers:{"content-type":"application/json"}})).me("a".repeat(43)),e=>e.code==="invalid-response");
  await assert.rejects(build(async()=>({redirected:true,headers:new Headers({"content-type":"application/json"})})).me("a".repeat(43)),e=>e.code==="invalid-response");
  let fetches=0;const timeout=createAccountClient({getPairingToken:()=>new Promise(()=>{}),fetchImpl:()=>{fetches++;},timeoutMs:10});
  await assert.rejects(timeout.me("a".repeat(43)),e=>e.code==="unavailable");assert.equal(fetches,0);
});

test("actual account service revokes old credential during same-tick controller renewal/logout",async t=>{
  const app=fixture(t);let saved=null;
  const controller=createAccountController({client:app.client,storage:{load:()=>saved,save:value=>{saved=value;},clear:()=>{saved=null;}}});
  controller.open();await controller.refreshCapabilities();await controller.requestCode("reader@example.test");await controller.verifyCode(app.mail[0].code);
  await controller.setUsername("actual_reader");const previous={...saved};
  await Promise.all([controller.renew(),controller.signOut()]);
  assert.equal(saved,null);assert.equal(controller.renderSnapshot().account,null);
  await assert.rejects(app.client.renew({refreshToken:previous.refreshToken}),e=>e.code==="authentication-required");
  assert.equal(app.accounts.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n,0);
  controller.dispose();
});

test("actual account rotation followed by controller cancellation cannot leave a usable fresh session",async t=>{
  const app=fixture(t);let saved=null,release,dispatched,fresh;
  const reached=new Promise(resolve=>{dispatched=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const client={...app.client,renew:async input=>{fresh=await app.client.renew(input);dispatched();await gate;return fresh;}};
  const controller=createAccountController({client,storage:{load:()=>saved,save:value=>{saved=value;},clear:()=>{saved=null;}}});
  controller.open();await controller.refreshCapabilities();await controller.requestCode("reader@example.test");await controller.verifyCode(app.mail[0].code);
  await controller.setUsername("actual_reader");const previous={...saved};
  const rotation=controller.renew();await reached;controller.cancel();release();await rotation;
  assert.equal(saved,null);assert.equal(controller.renderSnapshot().account,null);
  for(const refreshToken of [previous.refreshToken,fresh.session.refreshToken]){
    await assert.rejects(app.client.renew({refreshToken}),e=>e.code==="authentication-required");
  }
  assert.equal(app.accounts.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n,0);
  controller.dispose();
});
