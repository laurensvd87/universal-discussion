// Synthetic production queues + HTTP only on fixed loopback4175. No owner store.
import './concurrency-only-capabilities.js';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {createSqliteDemoService} from '../src/application/create-sqlite-demo-service.js';
import {createNormalizedSqliteRepository} from '../src/adapters/normalized-sqlite-repository.js';
import {createDemoState} from '../src/domain/demo-state.js';
import {BROWSER_MODEL_ID} from '../src/domain/learned-sources.js';
import {ADAPTIVE_TOPIC_POLICY} from '../src/domain/adaptive-topics.js';
import {operationDigestFor} from '../src/domain/source-threads.js';
import {makeRidgeTopicAdapter} from '../src/domain/ridge-topic-adapter.js';
import {createPracticalTopicPlanner as fullOracle} from '../test/fixtures/ridge-topic-planner-prior.js';
import {createRequestHandler} from '../src/http/request-handler.js';
import {createLoopbackServer} from '../src/http/loopback-listener.js';

const stamp='2026-10-13T12:00:00Z',port=4175,count=768;
const origin=`chrome-extension://${'a'.repeat(32)}`,capability='synthetic-incremental-reuse-capability';
const vector=axis=>Array.from({length:384},(_,i)=>i===axis?1:0);
export async function checkIncrementalMatchingReuse() {
  const directory=mkdtempSync(path.join(tmpdir(),'murmingle-incremental-reuse-'));
  const databasePath=path.join(directory,'canonical.sqlite');
  let application,server,serial=0;
  const timings=[],sockets=[];
  function request(route,body,connection=null) {
    const began=performance.now(),bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
    return new Promise((resolve,reject)=>{
      const outgoing=http.request({host:'127.0.0.1',port,path:route,method:bytes?'POST':'GET',
        agent:connection?undefined:false,...(connection?{createConnection:()=>connection}:{}),
        headers:{host:`127.0.0.1:${port}`,origin,authorization:`Bearer ${capability}`,
          ...(bytes?{'content-type':'application/json','content-length':bytes.length}:{})}},incoming=>{
        const chunks=[];let size=0;
        incoming.on('data',chunk=>{size+=chunk.length;if(size>1048576)outgoing.destroy(new Error('Response bound'));else chunks.push(chunk);});
        incoming.on('error',reject);incoming.on('end',()=>resolve({status:incoming.statusCode,
          body:JSON.parse(Buffer.concat(chunks)),ms:performance.now()-began}));
      });
      outgoing.setTimeout(30000,()=>outgoing.destroy(new Error('Synthetic deadline')));
      outgoing.on('error',reject);outgoing.end(bytes);
    });
  }
  const state=createDemoState({generation:'synthetic-incremental-reuse',createdAt:stamp,sources:[],topicSeeds:[]});
  state.topics=Array.from({length:count},(_,i)=>({id:`topic-${i}`,title:'Synthetic Topic',kind:'general',createdAt:stamp,
    provenance:'owner-local-learned-topic/v1',retainTight:false}));
  state.discussions=state.topics.map(topic=>({id:`discussion-${topic.id}`,topicId:topic.id}));
  state.sources=state.topics.map((topic,i)=>{
    const source={id:`source-${i}`,url:`https://example.org/incremental-reuse/${i}`,title:'Synthetic article',
      embedding:{modelId:BROWSER_MODEL_ID,values:vector(i%256)},extractorVersion:'crawler-static-html-prefix/v1',
      provenance:'owner-local-page-embedding/v1',operationId:`operation-${i}`,policyVersion:ADAPTIVE_TOPIC_POLICY.version};
    return {...source,operationDigest:operationDigestFor(source)};
  });
  state.sourceLinks=state.sources.map((source,i)=>({sourceId:source.id,topicId:`topic-${i}`,method:'learned-provisional'}));
  const seed=createNormalizedSqliteRepository(databasePath,state);seed.close();
  const weights=Array(384*384).fill(0);for(let i=0;i<384;i++)weights[i*384+i]=1;
  const artifact=makeRidgeTopicAdapter({weights,meanX:Array(384).fill(0),meanY:Array(384).fill(0)});
  const execArgv=[...process.execArgv.filter(value=>!value.startsWith('--test')),'--import',
    new URL('./concurrency-only-capabilities.js',import.meta.url).href];
  function worker(module,workerData) {return ()=>new Worker(new URL(module,import.meta.url),{
    workerData:{databasePath,...workerData},execArgv,
    resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32,stackSizeMb:4}});}
  const oracle=()=>{
    const repository=createNormalizedSqliteRepository(databasePath,null,{readOnly:true});
    try {const snapshot=repository.load();return fullOracle({representation:'synthetic-identity',floor:.8639003810829322,
      transform:values=>values}).plan(snapshot).partitions.find(part=>part.sourceIds.includes('source-0'))?.sourceIds;}
    finally{repository.close();}
  };
  async function projection(label) {
    const topicId=application.service.exactSource('source-0').topicId;
    const response=await request('/v1/sources/enrichment',{sourceId:'source-0',topicId,includeAlternate:true});
    assert.equal(response.status,200,label);assert.deepEqual(response.body.catalog.version,application.service.version());
    assert.deepEqual(response.body.discussion.version,response.body.catalog.version);
    assert.deepEqual(response.body.alternateDiscussion.sourceIds,oracle());
    timings.push({phase:label,projectionMs:Math.round(response.ms)});
    process.stdout.write(`${JSON.stringify(timings.at(-1))}\n`);return response.body;
  }
  try {
    application=createSqliteDemoService({databasePath,storageMode:'normalized',asyncReads:true,asyncIngest:true,
      incrementalMatching:true,alternateRidgeAdapter:artifact,nextId:kind=>`${kind}-reuse-${++serial}`,now:()=>stamp,
      ingestionWorkerOptions:{workerFactory:worker('../src/application/ingestion-worker.js',{incrementalMatching:true})},
      readWorkerOptions:{workerFactory:worker('../src/application/canonical-read-worker.js',{
        allowedMethods:['catalog','catalogContext','catalogPage','discussion','discussionPage','exactSource']})},
      projectionWorkerOptions:{workerFactory:worker('../src/application/canonical-read-worker.js',{
        allowedMethods:['enrichment','related','priorDiscussions','alternateDiscussion','warmMatching'],
        incrementalMatching:true,alternateRidgeAdapter:artifact})}});
    server=createLoopbackServer({handle:createRequestHandler({service:application.service,
      config:{hostHeader:`127.0.0.1:${port}`,origin,capability}})});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port,exclusive:true,backlog:4096},resolve);});
    await projection('cold-production-worker');
    const topicId=application.service.exactSource('source-0').topicId;
    const command=operation=>application.service.command(application.service.version(),operation,'demo-alex');
    const root=command({type:'create-root',topicId,originSourceId:'source-0',body:'Synthetic current body'}).result.contributionId;
    let bundle=await projection('warm-comment');
    assert.equal(bundle.discussion.roots.find(value=>value.id===root)?.body,'Synthetic current body');
    command({type:'edit',contributionId:root,body:'Synthetic accepted new body'});
    bundle=await projection('warm-edited-comment');assert.equal(JSON.stringify(bundle).includes('Synthetic current body'),false);
    assert.equal(bundle.discussion.roots.find(value=>value.id===root)?.body,'Synthetic accepted new body');
    async function ingest(url,operationId) {
      const before=application.service.version(),response=await request('/v1/sources/ingest',{expected:before,operationId,url,
        title:'Synthetic article',extractorVersion:'crawler-static-html-prefix/v1',embedding:{modelId:BROWSER_MODEL_ID,values:vector(0)}});
      assert.equal(response.status,200);assert.deepEqual(response.body.version,{...before,revision:before.revision+1});
      timings.push({phase:operationId,ingestionMs:Math.round(response.ms)});
      process.stdout.write(`${JSON.stringify(timings.at(-1))}\n`);return response.body;
    }
    const duplicate=await ingest('https://example.org/incremental-reuse/0','same-vector-visit');
    assert.equal(duplicate.sourceId,'source-0');await projection('warm-same-vector-visit');
    const addition=await ingest('https://example.org/incremental-reuse/local-addition','local-addition');
    bundle=await projection('changed-local-component');assert.ok(bundle.alternateDiscussion.sourceIds.includes(addition.sourceId));
    const beforeDelete=application.service.version();
    command({type:'forget-source',sourceId:addition.sourceId});
    bundle=await projection('fresh-after-source-deletion');assert.ok(!bundle.alternateDiscussion.sourceIds.includes(addition.sourceId));
    assert.notDeepEqual(bundle.catalog.version,beforeDelete);
    const missing=await request('/v1/sources/enrichment',{sourceId:addition.sourceId,topicId,includeAlternate:true});
    assert.equal(missing.status,404,'deleted Source cannot inherit cached enrichment');
    for(let offset=0;offset<500;offset+=16)await Promise.all(Array.from({length:Math.min(16,500-offset)},()=>
      new Promise((resolve,reject)=>{
        const socket=net.createConnection({host:'127.0.0.1',port});sockets.push(socket);
        socket.on('error',()=>{});socket.once('error',reject);socket.once('connect',resolve);
      })));
    const core=await Promise.all(sockets.map((connection,i)=>request(i%2?'/v1/version':'/v1/catalog/context',
      i%2?undefined:{sourceId:'source-0',topicId:application.service.exactSource('source-0').topicId},connection)));
    assert.ok(core.every(value=>value.status===200 && value.ms<5000));
    assert.ok(core.every(value=>JSON.stringify(value.body.version)===JSON.stringify(application.service.version())));
    process.stdout.write(`${JSON.stringify({phase:'500-fresh-core-readers',accepted:core.length,maxMs:Math.round(Math.max(...core.map(v=>v.ms)))})}\n`);
    return timings;
  } finally {
    for(const socket of sockets)socket.destroy();
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
    await application?.close();rmSync(directory,{recursive:true,force:true});
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  await checkIncrementalMatchingReuse();
