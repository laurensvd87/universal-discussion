import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createPortableHandler } from '../src/handler.js';

const readToken = 'read-fixture-'.padEnd(48, 'x');
const ownToken = 'own-fixture-'.padEnd(48, 'x');
const config = { mode: 'synthetic-rehearsal', allowedHost: '127.0.0.1:4185', allowedOrigin: 'https://client.example', readToken, maxHeaderBytes:16384, maxBodyBytes:16384 };
async function invoke({ method = 'GET', url = '/portable/v1/topics', headers = {}, data = '', repository = {}, rawHeaders } = {}) {
  const calls = []; const logs = [];
  const repo = { health:async()=>true, authenticate:async token=>token===ownToken?{id:'alex',username:'Alex'}:null,
    listTopics:async page=>({items:[{id:'topic'}],nextCursor:null}), command:async command=>{ calls.push(command); return {version:1}; }, ...repository };
  const request = Readable.from([data]); Object.assign(request,{method,url,headers:{host:config.allowedHost, authorization:`Bearer ${readToken}`, ...headers},rawHeaders});
  let status; let result;
  await createPortableHandler({repository:repo,config,logger:entry=>logs.push(entry)})(request, {writeHead: code=>{status=code;},end:body=>{result=JSON.parse(body);}});
  return {status,result,calls,logs};
}
test('minimal health and bearer authenticated paginated reads', async () => {
  assert.equal((await invoke({url:'/health/live',headers:{authorization:undefined}})).status,200);
  assert.equal((await invoke({url:'/health/ready',repository:{health:async()=>false}})).status,503);
  assert.equal((await invoke()).status,200);
  assert.equal((await invoke({headers:{authorization:undefined}})).status,401);
  assert.equal((await invoke({headers:{authorization:`Bearer ${'unknown'.padEnd(32,'x')}`}})).status,401);
  for (const query of ['limit=51','limit=0','limit=3&limit=4','cursor=%3Bdrop','extra=x']) assert.equal((await invoke({url:`/portable/v1/topics?${query}`})).status,400);
});
test('exact Host Origin path boundaries and forwarded headers confer no trust', async () => {
  assert.equal((await invoke({headers:{host:'remote.example','x-forwarded-host':config.allowedHost}})).status,403);
  assert.equal((await invoke({headers:{origin:'https://other.example'}})).status,403);
  assert.equal((await invoke({rawHeaders:['Host',config.allowedHost,'Host',config.allowedHost]})).status,400);
  assert.equal((await invoke({url:'//evil.example/portable/v1/topics'})).status,400);
  assert.equal((await invoke({url:'/portable/v1/%74opics'})).status,400);
  for (const url of ['/portable/v1/nope/../topics', '/health/../portable/v1/topics', '/portable/v1/./topics']) {
    assert.equal((await invoke({url})).status,400);
  }
  assert.equal((await invoke({method:'DELETE'})).status,405);
});
test('command principal is repository derived; guest and actor/provenance injection denied', async () => {
  const request = {method:'POST',url:'/portable/v1/commands/create-root',headers:{authorization:`Bearer ${ownToken}`,origin:config.allowedOrigin,'content-type':'application/json'},data:JSON.stringify({requestId:'once',payload:{discussionId:'discussion',sourceId:'source',body:'Synthetic root',expectedVersion:0}})};
  const result = await invoke(request); assert.equal(result.status,200); assert.deepEqual(result.calls[0].principal,{id:'alex',username:'Alex'});
  assert.equal((await invoke({...request,headers:{...request.headers,authorization:`Bearer ${readToken}`}})).status,403);
  assert.equal((await invoke({...request,headers:{...request.headers,origin:undefined}})).status,403);
  for (const extra of [{actorId:'blair'},{provenance:'ai'},{author:'blair'},{topicId:'other'}]) {
    const body = JSON.parse(request.data);Object.assign(body.payload,extra);
    assert.equal((await invoke({...request,data:JSON.stringify(body)})).status,400);
  }
  const body=JSON.parse(request.data);body.payload.expectedVersion=0.5;
  assert.equal((await invoke({...request,data:JSON.stringify(body)})).status,400);
  body.payload.expectedVersion=0;body.payload.sourceId=123;
  assert.equal((await invoke({...request,data:JSON.stringify(body)})).status,400);
});
test('body headers and errors are bounded and content free', async () => {
  const headers={authorization:`Bearer ${ownToken}`,origin:config.allowedOrigin,'content-type':'application/json'};
  assert.equal((await invoke({method:'POST',url:'/portable/v1/commands/edit',headers,data:'x'.repeat(16385)})).status,413);
  assert.equal((await invoke({headers:{'x-oversized':'x'.repeat(17000)}})).status,431);
  const result=await invoke({repository:{listTopics:async()=>{throw new Error('postgres password private body');}}});
  assert.equal(result.status,503); assert.equal(result.result.error,'unavailable');
  assert.deepEqual(Object.keys(result.logs[0]).sort(),['code','requestId']);
  assert.ok(!JSON.stringify(result).includes('password'));
});
test('HTTP contract integrates synthetic SQL auth reads commands replay and worker', async () => {
  const [{ createPGliteDatabase }, { createPortableRepository }, { migrate }, { seedFixture }, { processOneJob }] = await Promise.all([
    import('../src/database.js'), import('../src/repository.js'), import('../src/migrate.js'), import('../src/fixture.js'), import('../src/worker.js'),
  ]);
  const database = await createPGliteDatabase();
  try {
    await migrate(database);
    const repository = createPortableRepository({ database });
    const alex = 'synthetic-alex-'.padEnd(48, 'x'); const blair = 'synthetic-blair-'.padEnd(48, 'x');
    const ids = await seedFixture(repository, { tokens: {alex, blair} });
    assert.equal((await invoke({repository})).status,200);
    const read = await invoke({repository,url:`/portable/v1/sources?topicId=${ids.topic}`});
    assert.equal(read.result.items[0].id,ids.source); assert.equal(Object.hasOwn(read.result.items[0],'vector'),false);
    assert.equal((await invoke({repository,url:`/portable/v1/source/resolve?url=${encodeURIComponent('https://transport.example/article')}`})).status,200);
    assert.equal((await invoke({repository,url:`/portable/v1/related?sourceId=${ids.source}`})).status,200);
    assert.equal((await invoke({repository,url:`/portable/v1/related?sourceId=${ids.source}&limit=21`})).status,400);
    assert.equal((await invoke({repository,url:`/portable/v1/source/resolve?url=${encodeURIComponent('https://not-synthetic.com/article')}`})).status,400);
    const request={repository,method:'POST',url:'/portable/v1/commands/create-root',headers:{authorization:`Bearer ${alex}`,origin:config.allowedOrigin,'content-type':'application/json'},
      data:JSON.stringify({requestId:'synthetic-first-root',payload:{discussionId:ids.discussion,sourceId:ids.source,body:'Synthetic transport question',expectedVersion:0}})};
    const created=await invoke(request);assert.equal(created.status,200);assert.equal(created.result.version,1);
    assert.deepEqual((await invoke(request)).result,created.result);
    const reply=await invoke({...request,url:'/portable/v1/commands/reply',headers:{...request.headers,authorization:`Bearer ${blair}`},data:JSON.stringify({requestId:'synthetic-reply',payload:{discussionId:ids.discussion,sourceId:ids.source,replyToId:created.result.contributionId,body:'Synthetic response',expectedVersion:1}})});
    assert.equal(reply.status,200);assert.equal(reply.result.version,2);
    const denied=await invoke({...request,url:'/portable/v1/commands/edit',headers:{...request.headers,authorization:`Bearer ${blair}`},data:JSON.stringify({requestId:'synthetic-denied',payload:{discussionId:ids.discussion,contributionId:created.result.contributionId,body:'Alter Alex',expectedVersion:2}})});
    assert.equal(denied.status,403);
    const discussion=await invoke({repository,url:`/portable/v1/discussions/${ids.discussion}`});
    assert.equal(discussion.result.items.length,2);assert.equal(discussion.result.discussion.version,2);
    assert.equal(await processOneJob(repository,{workerId:'synthetic-worker'}),true);
  } finally { await database.close(); }
});
