// Real normalized synthetic store: grouping reuse never retains old public posts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createNormalizedSqliteRepository } from '../src/adapters/normalized-sqlite-repository.js';
import { createDemoState } from '../src/domain/demo-state.js';
import { createDiscussionService } from '../src/application/discussion-service.js';
import { createFixtureRankingAdapter } from '../src/adapters/fixture-ranking.js';
import { makeRidgeTopicAdapter } from '../src/domain/ridge-topic-adapter.js';
import { createPracticalTopicPlanner as frozenPractical } from './fixtures/ridge-topic-planner-prior.js';
import { BROWSER_MODEL_ID } from '../src/domain/learned-sources.js';

const stamp='2026-10-13T12:00:00Z';
const identityWeights=Array(384*384).fill(0);
for(let i=0;i<384;i++)identityWeights[i*384+i]=1;
const artifact=makeRidgeTopicAdapter({weights:identityWeights,meanX:Array(384).fill(0),meanY:Array(384).fill(0)});
const vector=(x,y=0,z=0)=>[x,y,z,...Array(381).fill(0)];
function fixture(t) {
  const directory=mkdtempSync(path.join(tmpdir(),'murmingle-matching-reuse-trust-'));
  const raw=createNormalizedSqliteRepository(path.join(directory,'canonical.sqlite'),createDemoState({
    generation:'synthetic-reuse',createdAt:stamp,sources:[],topicSeeds:[]}));
  t.after(()=>{raw.close();rmSync(directory,{recursive:true,force:true});});
  let serial=0,sourcePages=0;
  const repository={...raw,readCatalogPage(options){if(options.kind==='sources')sourcePages++;return raw.readCatalogPage(options);}};
  const service=createDiscussionService({repository,ranking:createFixtureRankingAdapter(),sources:[],topicSeeds:[],
    alternateRidgeAdapter:artifact,incrementalMatching:true,nextId:kind=>`${kind}-reuse-${++serial}`,now:()=>stamp});
  const ingest=(label,values,title=`Synthetic article ${label}`)=>service.ingest({expected:service.version(),
    operationId:`operation-${label}-${++serial}`,url:`https://example.org/reuse/${label}`,title,
    extractorVersion:'main-text-prefix/v1',embedding:{modelId:BROWSER_MODEL_ID,values}});
  const a=ingest('a',vector(1)),b=ingest('b',vector(.998,Math.sqrt(1-.998**2))),c=ingest('c',vector(0,0,1));
  const view=()=>service.enrichment({sourceId:a.sourceId,topicId:service.exactSource(a.sourceId).topicId,includeAlternate:true});
  function oracle(sourceId) {
    const snapshot=raw.load();
    return frozenPractical({representation:'synthetic-identity',floor:.8639003810829322,transform:values=>values}).plan({
      sources:snapshot.sources,sourceLinks:snapshot.sourceLinks}).partitions.find(part=>part.sourceIds.includes(sourceId))?.sourceIds;
  }
  const command=operation=>service.command(service.version(),operation,'demo-alex');
  return {raw,service,a,b,c,view,ingest,oracle,command,sourcePages:()=>sourcePages};
}

test('Trust: comments/replies/edits/deletion reuse matching geometry while every bundle reads fresh canonical bodies',t=>{
  const f=fixture(t),warm=f.view(),pages=f.sourcePages();
  assert.ok(warm.alternateDiscussion);assert.deepEqual(warm.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  const topicId=f.service.exactSource(f.a.sourceId).topicId;
  const root=f.command({type:'create-root',topicId,originSourceId:f.a.sourceId,body:'Synthetic current root'}).result.contributionId;
  let current=f.view();
  assert.deepEqual(current.catalog.version,f.service.version());assert.ok(current.discussion.roots.some(value=>value.id===root && value.body==='Synthetic current root'));
  const reply=f.command({type:'reply',discussionId:current.discussion.discussionId,rootId:root,replyToId:root,
    originSourceId:f.a.sourceId,body:'Synthetic current reply'}).result.contributionId;
  current=f.view();assert.ok(current.discussion.roots.find(value=>value.id===root).replies.some(value=>value.id===reply));
  f.command({type:'edit',contributionId:root,body:'Synthetic newly accepted edit'});
  current=f.view();assert.equal(current.discussion.roots.find(value=>value.id===root).body,'Synthetic newly accepted edit');
  assert.equal(JSON.stringify(current).includes('Synthetic current root'),false);
  f.command({type:'withdraw',contributionId:reply});
  current=f.view();assert.equal(current.discussion.roots.find(value=>value.id===root).replies.find(value=>value.id===reply).state,'deleted');
  assert.deepEqual(current.catalog.version,f.service.version());assert.deepEqual(current.discussion.version,current.catalog.version);
  assert.deepEqual(current.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.equal(f.sourcePages(),pages,'comment-only revisions must not decode the whole embedding catalog again');
});

test('Trust: a same-vector revisit changes receipt/version but retains exact grouping and vector preparation',t=>{
  const f=fixture(t),warm=f.view(),pages=f.sourcePages(),before=f.service.version();
  const accepted=f.ingest('a',vector(1));
  assert.equal(accepted.sourceId,f.a.sourceId);assert.equal(accepted.version.revision,before.revision+1);
  const current=f.view();assert.deepEqual(current.catalog.version,accepted.version);
  assert.deepEqual(current.alternateDiscussion.sourceIds,warm.alternateDiscussion.sourceIds);
  assert.deepEqual(current.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.equal(f.sourcePages(),pages,'receipt churn must not reread every retained vector');
});

test('Trust: source replacement, qualification, manual routing and forget never reuse stale membership',t=>{
  const f=fixture(t);f.view();
  f.ingest('b',vector(0,0,1));
  let current=f.view();assert.deepEqual(current.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.ok(!current.alternateDiscussion.sourceIds.includes(f.b.sourceId));
  f.ingest('b',vector(.998,Math.sqrt(1-.998**2)),'Checking your browser');
  current=f.view();assert.deepEqual(current.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.ok(!current.alternateDiscussion.sourceIds.includes(f.b.sourceId),'negative title cannot witness a cached join');
  f.ingest('b',vector(.998,Math.sqrt(1-.998**2)),'Synthetic article b');
  current=f.view();assert.deepEqual(current.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.ok(current.alternateDiscussion.sourceIds.includes(f.b.sourceId));
  const destination=f.service.exactSource(f.c.sourceId).topicId;
  f.command({type:'correct-source',sourceId:f.b.sourceId,topicId:destination});
  current=f.view();assert.deepEqual(current.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.ok(!current.alternateDiscussion.sourceIds.includes(f.b.sourceId));
  f.command({type:'forget-source',sourceId:f.b.sourceId});
  current=f.view();assert.deepEqual(current.alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.ok(!current.catalog.sources.some(source=>source.id===f.b.sourceId));
  assert.deepEqual(current.catalog.version,f.service.version());
});

test('Trust: manual-to-manual repin renews related authority and routing without decoding unchanged vectors',t=>{
  const f=fixture(t),original=f.service.exactSource(f.a.sourceId).topicId,manual=f.service.exactSource(f.c.sourceId).topicId;
  f.command({type:'correct-source',sourceId:f.c.sourceId,topicId:manual});
  f.command({type:'correct-source',sourceId:f.b.sourceId,topicId:manual});
  const before=f.service.related(f.c.sourceId,20);
  assert.equal(before.results.find(value=>value.id===f.b.sourceId)?.relationship,'same-topic');
  f.view();const pages=f.sourcePages();
  const changed=f.command({type:'correct-source',sourceId:f.b.sourceId,topicId:original});
  const current=f.service.related(f.c.sourceId,20);
  assert.deepEqual(current.version,changed.version);assert.ok(!current.results.some(value=>value.id===f.b.sourceId));
  assert.equal(f.service.exactSource(f.b.sourceId).topicId,original);
  const near=f.service.related(f.a.sourceId,20).results.find(value=>value.id===f.b.sourceId);
  assert.equal(near.topicId,original);assert.equal(near.relationship,'related');
  assert.deepEqual(f.view().alternateDiscussion.sourceIds,f.oracle(f.a.sourceId));
  assert.equal(f.sourcePages(),pages,'manual Topic metadata can refresh without rereading retained embedding vectors');
});
