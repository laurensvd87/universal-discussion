// Independent service-boundary checks. No sockets, providers or actual owner files.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { prepareIngestion } from '../src/application/ingestion-plan.js';
import { BROWSER_MODEL_ID } from '../src/domain/learned-sources.js';

function fixture(t) {
  const directory=mkdtempSync(path.join(tmpdir(),'murmingle-core-projection-trust-'));
  const repository=createNormalizedSqliteRepository(path.join(directory,'canonical.sqlite'),createDemoState({
    generation:'synthetic-projection-trust',createdAt:'2026-10-13T12:00:00Z',sources:[],topicSeeds:[]}));
  t.after(()=>{repository.close();rmSync(directory,{recursive:true,force:true});});
  let serial=0,release,prepareCoreCommitCalls=0,projectionDispatches=0;
  const dependencies={repository,ranking:createFixtureRankingAdapter(),sources:[],topicSeeds:[],
    nextId:kind=>`${kind}-projection-trust-${++serial}`,now:()=> '2026-10-13T12:00:00Z'};
  const sync=createDiscussionService(dependencies);
  const ingest=suffix=>({expected:sync.version(),operationId:`operation-${suffix}`,title:`Synthetic ${suffix}`,
    url:`https://example.org/projection-trust/${suffix}`,extractorVersion:'main-text-prefix/v1',
    embedding:{modelId:BROWSER_MODEL_ID,values:[1,...Array(383).fill(0)]}});
  const accepted=sync.ingest(ingest('selected'));
  const input={sourceId:accepted.sourceId,topicId:accepted.topicId,includeAlternate:false};
  const oldBundle=()=>({catalog:sync.catalogContext({sourceId:accepted.sourceId,topicId:accepted.topicId}),
    discussion:sync.discussion(accepted.topicId),related:null,priorDiscussions:null,alternateDiscussion:null,
    errors:{related:null,prior:null,alternate:null}});
  const readExecutor={read(method,value){return Promise.resolve(method==='catalogContext' ? sync.catalogContext(value) : sync.discussion(value));},
    withCommit(work){prepareCoreCommitCalls++;return Promise.resolve().then(work);}};
  const projectionExecutor={read(){projectionDispatches++;return new Promise(resolve=>{release=resolve;});},
    withCommit(){throw new Error('Optional projection must never gate canonical ingestion');}};
  const service=createDiscussionService({...dependencies,readExecutor,projectionExecutor,
    ingestionExecutor:{prepare(value){return Promise.resolve(prepareIngestion(repository.load(),value,dependencies));}}});
  return {sync,service,accepted,input,ingest,oldBundle,release:value=>release(value),
    coreCommits:()=>prepareCoreCommitCalls,projectionDispatches:()=>projectionDispatches};
}

test('Trust: held optional result does not prevent canonical reads or exact scoped ingestion commit',async t=>{
  const f=fixture(t),before=f.sync.version(),old=f.oldBundle();
  const optional=f.service.readPublic('enrichment',f.input);
  const context=await f.service.readPublic('catalogContext',{sourceId:f.accepted.sourceId,topicId:f.accepted.topicId});
  assert.deepEqual(context.version,before);assert.equal(f.projectionDispatches(),1);
  const accepted=await f.service.ingest(f.ingest('concurrent'),{isCurrent:()=>true});
  assert.deepEqual(accepted.version,{...before,revision:before.revision+1});assert.equal(f.coreCommits(),1);
  assert.ok(f.sync.exactSource(accepted.sourceId));
  const stale=assert.rejects(optional,error=>error.code==='conflict');f.release(old);await stale;
});

test('Trust: deletion during a held optional read rejects all earlier content without changing deleted state',async t=>{
  const f=fixture(t),old=f.oldBundle();
  const optional=f.service.readPublic('enrichment',f.input);
  f.sync.command(f.sync.version(),{type:'forget-source',sourceId:f.accepted.sourceId},'demo-alex');
  const expected=f.sync.version(),stale=assert.rejects(optional,error=>error.code==='conflict');
  f.release(old);await stale;
  assert.deepEqual(f.sync.version(),expected);assert.throws(()=>f.sync.exactSource(f.accepted.sourceId),error=>error.code==='not-found');
  assert.equal(f.coreCommits(),0);
});

test('Trust: expired optional authority cannot publish even with an unchanged canonical version',async t=>{
  const f=fixture(t),old=f.oldBundle();let current=true;
  const optional=f.service.readPublic('enrichment',f.input,{isCurrent:()=>current});
  current=false;
  const blocked=assert.rejects(optional,error=>error.code==='unavailable');f.release(old);await blocked;
  const core=await f.service.readPublic('catalogContext',{sourceId:f.accepted.sourceId,topicId:f.accepted.topicId});
  assert.deepEqual(core.version,f.sync.version());assert.equal(f.coreCommits(),0);
});

test('Trust: an aborted optional delivery leaves its independent core lane usable',async t=>{
  const f=fixture(t),old=f.oldBundle(),controller=new AbortController();
  const optional=f.service.readPublic('enrichment',f.input,{signal:controller.signal});
  controller.abort();
  const aborted=assert.rejects(optional,error=>error.code==='unavailable');f.release(old);await aborted;
  const core=await f.service.readPublic('discussion',f.accepted.topicId);
  assert.deepEqual(core.version,f.sync.version());assert.equal(f.coreCommits(),0);
});
