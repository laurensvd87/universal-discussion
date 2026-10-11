import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDormantLocalApplication } from "../src/startup.js";
import { deterministicDependencies } from "./helpers.js";
import { AccountRepository } from "../src/accounts/account-repository.js";
import { AccountService } from "../src/accounts/account-service.js";

const ORIGIN = `chrome-extension://${"c".repeat(32)}`;
const CAPABILITY = "private-trust-fixture-pairing-capability";
const SOURCE = "reserved-example-com", TOPIC = "reserved-domain-demo", URL = "https://example.com/";
const PRIVATE = "PrivateTrustNeedle";
const page = {after:null,limit:25};
const settle = async () => {for(let i=0;i<8;i++) await Promise.resolve();};

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(),"private-trust-"));
  const databasePath = path.join(dir,"canonical.sqlite");
  let subject="alice", app, release=null, providerCalls=[];
  const identity = () => ({issuer:"https://auth.openai.com",clientId:"private-trust-fixture",subject});
  const open = () => openDormantLocalApplication({databasePath,accountsEnabled:true,accountHmacKey:Buffer.alloc(32,19),
    config:{host:"127.0.0.1",port:4174,origin:ORIGIN,capability:CAPABILITY},...deterministicDependencies(),
    ai:{accountIdentity:identity,cancelAccount(){},dispose(){},generatePrivate(input,actorId,options) {
      providerCalls.push({input,actorId,options});return new Promise(resolve=>{release=resolve;});
    }} });
  app = open();
  t.after(()=>{app?.close();rmSync(dir,{recursive:true,force:true});});
  async function request(url,body,token,extra={}) {
    const headers={host:"127.0.0.1:4174",origin:ORIGIN,authorization:`Bearer ${CAPABILITY}`,
      ...(body===undefined?{}:{"content-type":"application/json"}),...(token?{"x-account-session":token}:{}),...extra};
    if(headers.origin===null)delete headers.origin;
    const response=await app.handle({url,method:body===undefined?"GET":"POST",headers,body:body===undefined?null:JSON.stringify(body)});
    return {...response,value:JSON.parse(response.body)};
  }
  async function login(name) {
    subject=name.toLowerCase();const response=await request("/v1/account/chatgpt",{});assert.equal(response.status,200);
    const token=response.value.session.accessToken;
    assert.equal((await request("/v1/account/username",{username:name},token)).status,200);
    return {token,id:response.value.account.id};
  }
  const create = token => request("/v1/private/create",{operationId:"create-private",body:PRIVATE,sourceId:SOURCE,sourceUrl:URL},token);
  const generation = async () => ({model:"fixture",context:{currentSource:{id:SOURCE,url:URL},topic:{id:TOPIC}},
    articleText:"Public fixture article",allowWebResearch:false,expected:(await request("/v1/catalog")).value.version});
  return {dir,databasePath,request,login,create,generation,providerCalls,
    select(name){subject=name;},release(value){release(value);},close(){app?.close();app=null;},reopen(){app=open();}};
}

test("Trust: actual startup private routes require named session, pairing and exact Origin across every operation",async t=>{
  const f=fixture(t),alice=await f.login("Alice"),bob=await f.login("Bob");
  const root=await f.create(alice.token);assert.equal(root.status,200);
  const inputs={create:{operationId:"guard-create",body:"Guard",sourceId:SOURCE,sourceUrl:URL},list:page,
    read:{conversationId:root.value.conversationId,...page},send:{operationId:"guard-send",conversationId:root.value.conversationId,
      replyToId:root.value.messageId,body:"Guard",expectedRevision:root.value.revision},
    generate:{conversationId:root.value.conversationId,messageId:root.value.messageId,expectedRevision:root.value.revision,generation:await f.generation()},
    delete:{conversationId:root.value.conversationId}};
  for(const [action,input] of Object.entries(inputs)) {
    const route=`/v1/private/${action}`;
    for(const [token,extra] of [[undefined,{}],[alice.token,{origin:null}],[alice.token,{origin:"https://attacker.example.net"}],
      [alice.token,{authorization:"Bearer wrong"}],[alice.token,{"x-demo-actor":"demo-alex"}]]) {
      const response=await f.request(route,input,token,extra);assert.notEqual(response.status,200,route);
      assert.equal(response.body.includes(PRIVATE),false);
    }
    if(action!=="create" && action!=="list")assert.equal((await f.request(route,input,bob.token)).status,404,route);
  }
  assert.equal((await f.request("/v1/private/list",page,bob.token)).value.conversations.length,0);
  assert.equal((await f.request("/v1/private/create",{...inputs.create,ownerId:alice.id},alice.token)).status,400);
  assert.equal((await f.request("/v1/private/send",{...inputs.send,visibility:"public"},alice.token)).status,400);
  assert.equal(f.providerCalls.length,0);
  assert.equal((await f.request("/v1/discover/search",{query:"example",limit:20,cursor:null})).status,200,"paired guest discovery remains available");
});

test("Trust: dormant startup completes interrupted account erasure in the separate private database",async t=>{
  const f=fixture(t),alice=await f.login("Alice");
  const root=(await f.create(alice.token)).value;f.close();
  const repository=new AccountRepository({filename:path.join(f.dir,"accounts.sqlite")});
  try {
    const accounts=new AccountService({repository,hmacKey:Buffer.alloc(32,19),fixtureOnly:false,mailSink:null,
      chatgptIdentity:()=>({issuer:"https://auth.openai.com",clientId:"private-trust-fixture",subject:"alice"})});
    accounts.beginDeletion(alice.token);
  } finally {repository.close();}
  f.reopen();
  assert.equal((await f.request("/v1/private/read",{conversationId:root.conversationId,...page},alice.token)).status,401);
  const db=new DatabaseSync(path.join(f.dir,"private-conversations.sqlite"));
  try {
    for(const table of ["private_conversations","private_messages","private_operations","private_claims","private_owner_versions"])
      assert.equal(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count,0,table);
  } finally {db.close();}
  const accountDb=new DatabaseSync(path.join(f.dir,"accounts.sqlite"));
  try {
    const tombstone=accountDb.prepare("SELECT state,username,username_key FROM accounts WHERE id=?").get(alice.id);
    assert.deepEqual({...tombstone},{state:"deleted",username:null,username_key:null});
    assert.equal(accountDb.prepare("SELECT count(*) AS count FROM external_identities WHERE account_id=?").get(alice.id).count,0);
  }finally{accountDb.close();}
});

test("Trust: public APIs/index omit private identity/text; export is own-only and deletion defeats late assistant insertion",async t=>{
  const f=fixture(t),alice=await f.login("Alice"),bob=await f.login("Bob");f.select("alice");
  const root=(await f.create(alice.token)).value;
  const own=await f.request("/v1/account/private-data",{after:null,expectedVersion:null},alice.token);
  assert.equal(own.status,200);assert.equal(own.value.messages[0].body,PRIVATE);
  const foreign=await f.request("/v1/account/private-data",{after:root.messageId,expectedVersion:null},bob.token);
  assert.equal(foreign.status,409);assert.equal(foreign.body.includes(PRIVATE),false);
  const publicValues=[await f.request("/v1/catalog"),await f.request(`/v1/topics/${TOPIC}/discussion`),
    await f.request("/v1/discover/search",{query:PRIVATE,limit:20,cursor:null}),await f.request("/v1/account/data",{after:null},alice.token)];
  for(const value of publicValues) {
    const visible={...value.value};delete visible.query;
    assert.equal(value.status,200);assert.equal(JSON.stringify(visible).includes(PRIVATE),false);assert.equal(value.body.includes(root.conversationId),false);
  }
  assert.equal(publicValues[2].value.results.length,0);
  const dispatched=await f.request("/v1/private/generate",{conversationId:root.conversationId,messageId:root.messageId,
    expectedRevision:root.revision,generation:await f.generation()},alice.token);assert.equal(dispatched.status,200);
  assert.equal(f.providerCalls.length,1);
  const deleted=await f.request("/v1/account/delete",{confirmation:"DELETE MY ACCOUNT"},alice.token);assert.equal(deleted.status,200);
  assert.equal(f.providerCalls[0].options.signal.aborted,true);
  f.release({body:"PrivateLateAnswerNeedle",citations:[],model:"fixture"});await settle();
  assert.equal((await f.request("/v1/private/read",{conversationId:root.conversationId,...page},alice.token)).status,401);
  const privateDb=new DatabaseSync(path.join(f.dir,"private-conversations.sqlite"));
  try {
    for(const table of ["private_conversations","private_messages","private_operations","private_claims","private_owner_versions"]) {
      const rows=privateDb.prepare(`SELECT * FROM ${table}`).all();assert.equal(JSON.stringify(rows).includes(alice.id),false,table);
      assert.equal(JSON.stringify(rows).includes(PRIVATE),false,table);assert.equal(JSON.stringify(rows).includes("PrivateLateAnswerNeedle"),false,table);
    }
  } finally {privateDb.close();}
  const canonicalDb=new DatabaseSync(f.databasePath);
  try {assert.equal(canonicalDb.prepare("SELECT document FROM demo_state").get().document.includes(PRIVATE),false);}finally{canonicalDb.close();}
  const indexDb=new DatabaseSync(`${f.databasePath}.discovery.sqlite`);
  try {assert.equal(indexDb.prepare("SELECT count(*) AS count FROM public_fts WHERE public_fts MATCH ?").get(`"${PRIVATE}"`).count,0);}finally{indexDb.close();}
});
