// Two independent synthetic production worker pipelines: complete accepted
// canonical state, not only grouping labels, must match the unchanged path.
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {Worker} from 'node:worker_threads';
import {createSqliteDemoService} from '../src/application/create-sqlite-demo-service.js';
import {createNormalizedSqliteRepository} from '../src/adapters/normalized-sqlite-repository.js';
import {createDemoState} from '../src/domain/demo-state.js';
import {BROWSER_MODEL_ID} from '../src/domain/learned-sources.js';

const stamp='2026-10-13T12:00:00Z';
const angleVector=angle=>[Math.cos(angle),Math.sin(angle),...Array(382).fill(0)];
test('Trust: actual incremental ingestion workers preserve full accepted lineage through visits, bridges, splits and deletion',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'murmingle-incremental-ingestion-trust-'));
  const applications=[],paths=[];
  try {
    for(const enabled of [false,true]) {
      const databasePath=path.join(directory,`${enabled?'incremental':'full'}.sqlite`);paths.push(databasePath);
      const repository=createNormalizedSqliteRepository(databasePath,createDemoState({generation:'synthetic-ingestion-differential',
        createdAt:stamp,sources:[],topicSeeds:[]}));repository.close();
      let serial=0;
      applications.push(createSqliteDemoService({databasePath,storageMode:'normalized',asyncIngest:true,asyncReads:true,
        incrementalMatching:enabled,nextId:kind=>`${kind}-exact-${++serial}`,now:()=>stamp,
        ingestionWorkerOptions:{workerFactory:()=>new Worker(new URL('./fixtures/deterministic-ingestion-worker.js',import.meta.url),{
          workerData:{databasePath,incrementalMatching:enabled},
          execArgv:process.execArgv.filter(value=>!value.startsWith('--test')),
          resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32,stackSizeMb:4}})}}));
    }
    function snapshots() {
      return paths.map(databasePath=>{const repository=createNormalizedSqliteRepository(databasePath,null,{readOnly:true});
        try{return repository.load();}finally{repository.close();}});
    }
    function exact() {const [full,incremental]=snapshots();assert.deepEqual(incremental,full);}
    let operation=0;
    async function ingest(label,angle) {
      const operationId=`synthetic-operation-${++operation}`;
      const results=[];
      for(const application of applications)results.push(await application.service.ingest({expected:application.service.version(),
        operationId,url:`https://example.org/ingestion-differential/${label}`,title:`Synthetic ${label}`,
        extractorVersion:'crawler-static-html-prefix/v1',embedding:{modelId:BROWSER_MODEL_ID,values:angleVector(angle)}}));
      assert.deepEqual(results[1],results[0]);exact();return results[0];
    }
    async function command(value) {
      const results=applications.map(application=>application.service.command(application.service.version(),value,'demo-alex'));
      assert.deepEqual(results[1],results[0]);exact();return results[0];
    }
    const a=await ingest('a',0),b=await ingest('b',.1),c=await ingest('c',.9),d=await ingest('d',1);
    await ingest('a',0); // same retained vector, different receipt/revision
    const root=(await command({type:'create-root',topicId:a.topicId,originSourceId:a.sourceId,body:'Synthetic retained lineage'})).result.contributionId;
    await command({type:'edit',contributionId:root,body:'Synthetic current lineage'});
    const bridge=await ingest('bridge',.45);
    await ingest('bridge',2.5); // replaced geometry must split old affected dependency
    await command({type:'correct-source',sourceId:b.sourceId,topicId:c.topicId});
    await command({type:'correct-source',sourceId:b.sourceId,topicId:d.topicId});
    await command({type:'forget-source',sourceId:bridge.sourceId});
    await ingest('local-new',.04);
    const [current]=snapshots();assert.ok(current.contributions.some(value=>value.id===root && value.revisions.at(-1)?.body==='Synthetic current lineage'));
    for(const application of applications) {
      const version=application.service.version();
      await assert.rejects(application.service.ingest({expected:{...version,revision:version.revision-1},operationId:'synthetic-stale',
        url:'https://example.org/ingestion-differential/stale',title:'Synthetic stale',extractorVersion:'crawler-static-html-prefix/v1',
        embedding:{modelId:BROWSER_MODEL_ID,values:angleVector(0)}}),error=>error.code==='conflict');
      assert.deepEqual(application.service.version(),version);
    }
    exact();
  }finally{await Promise.all(applications.map(application=>application.close()));rmSync(directory,{recursive:true,force:true});}
});
