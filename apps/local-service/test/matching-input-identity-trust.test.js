import assert from 'node:assert/strict';
import test from 'node:test';
import { matchingInputIdentity, createSnapshotTopicPlanner } from '../src/domain/alternate-topic-cache.js';

function snapshot() {
  const values=Array(384).fill(0);values[0]=1;
  return {schema:'demo-state/v2',generation:'synthetic-matching-generation',revision:1,
    topics:[{id:'topic-a',title:'Synthetic A',kind:'general'},{id:'topic-b',title:'Synthetic B',kind:'general'}],
    discussions:[{id:'discussion-a',topicId:'topic-a'},{id:'discussion-b',topicId:'topic-b'}],contributions:[],
    sources:['a','b'].map(id=>({id:`source-${id}`,url:`https://example.org/article-${id}`,title:`Synthetic article ${id}`,
      provenance:'owner-local-page-embedding/v1',extractorVersion:'crawler-static-html-prefix/v1',
      embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:[...values]},operationId:`operation-${id}`,
      operationDigest:'1'.repeat(64),policyVersion:'adaptive-supported-partitions/v1'})),
    sourceLinks:[{sourceId:'source-a',topicId:'topic-a',method:'learned-provisional'},
      {sourceId:'source-b',topicId:'topic-b',method:'learned-provisional'}]};
}

test('Trust: exact matching identities exclude posts, receipt churn and catalog version',()=>{
  const input=snapshot(),expected=matchingInputIdentity(input);
  assert.deepEqual(Object.keys(expected).sort(),['grouping','ranking','routing']);
  for(const value of Object.values(expected))assert.match(value,/^[a-f0-9]{64}$/u);
  const changed=structuredClone(input);changed.revision+=1;
  changed.contributions.push({id:'synthetic-post',body:'Current synthetic published body'});
  changed.topics[0].title='Fresh Topic title';changed.sources[0].operationId='operation-new-visit';
  changed.sources[0].operationDigest='2'.repeat(64);
  assert.deepEqual(matchingInputIdentity(changed),expected);
  assert.deepEqual(matchingInputIdentity({...input,sources:[...input.sources].reverse(),sourceLinks:[...input.sourceLinks].reverse()}),expected);
});

test('Trust: provisional routing is independent from grouping; manual ranking authority is separate',()=>{
  const input=snapshot(),expected=matchingInputIdentity(input),rerouted=structuredClone(input);
  rerouted.sourceLinks[0].topicId='topic-b';
  const next=matchingInputIdentity(rerouted);
  assert.equal(next.grouping,expected.grouping);assert.equal(next.ranking,expected.ranking);assert.notEqual(next.routing,expected.routing);
  input.sourceLinks[0].method='manual-confirmed';
  const manual=matchingInputIdentity(input),changed=structuredClone(input);changed.sourceLinks[0].topicId='topic-b';
  const redirected=matchingInputIdentity(changed);
  assert.equal(redirected.grouping,manual.grouping);assert.notEqual(redirected.ranking,manual.ranking);assert.notEqual(redirected.routing,manual.routing);
  assert.notEqual(manual.grouping,expected.grouping);
});

test('Trust: source geometry, qualification inputs and eligibility always invalidate their dependencies',()=>{
  const original=snapshot(),expected=matchingInputIdentity(original);
  for(const mutate of [
    input=>{input.sources[0].title='Search results';},input=>{input.sources[0].url='https://example.org/search?q=synthetic';},
    input=>{input.sources[0].embedding.modelId='different-model';},input=>{input.sources[0].extractorVersion='main-text-prefix/v1';},
    input=>{input.sources[0].provenance='hand-authored-fixture';},input=>{input.sources[0].embedding.values[0]=.99;},
    input=>{input.sources.pop();input.sourceLinks.pop();},input=>{input.sourceLinks[0].method='manual-confirmed';},
  ]) {
    const changed=structuredClone(original);mutate(changed);
    assert.notEqual(matchingInputIdentity(changed).grouping,expected.grouping);
    assert.notEqual(matchingInputIdentity(changed).ranking,expected.ranking);
  }
  assert.deepEqual(original,snapshot());
});

test('Trust: matching identity rejects hooks, symbols, proxies and sparse vectors before executing caller code',()=>{
  let invoked=false;
  const malicious=snapshot();malicious.sources[0].embedding.toJSON=()=>{invoked=true;return snapshot().sources[0].embedding;};
  assert.throws(()=>matchingInputIdentity(malicious),TypeError);assert.equal(invoked,false);
  const getter=snapshot();Object.defineProperty(getter.sources[0],'embedding',{get(){invoked=true;return snapshot().sources[0].embedding;},enumerable:true});
  assert.throws(()=>matchingInputIdentity(getter),TypeError);assert.equal(invoked,false);
  const symbol=snapshot();symbol.sources[0][Symbol('untrusted')]=1;
  assert.throws(()=>matchingInputIdentity(symbol),TypeError);
  const proxy=snapshot();proxy.sources[0].embedding.values=new Proxy(proxy.sources[0].embedding.values,{});
  assert.throws(()=>matchingInputIdentity(proxy),TypeError);
  const sparse=snapshot();delete sparse.sources[0].embedding.values[17];
  assert.throws(()=>matchingInputIdentity(sparse),TypeError);
  const arrayProxy=snapshot();arrayProxy.sources=new Proxy(arrayProxy.sources,{});
  assert.throws(()=>matchingInputIdentity(arrayProxy),TypeError);
  const arrayGetter=snapshot();Object.defineProperty(arrayGetter.sources,0,{get(){invoked=true;return snapshot().sources[0];},enumerable:true});
  assert.throws(()=>matchingInputIdentity(arrayGetter),TypeError);assert.equal(invoked,false);
});

test('Trust: warmed mathematical cache cannot be hit by serialization hooks impersonating valid matching input',()=>{
  const input=snapshot();let builds=0,invoked=false;
  const plan=createSnapshotTopicPlanner(()=>{builds++;return {partitions:[{sourceIds:['source-a','source-b']}]};});
  const original=plan(input);assert.equal(plan({...input,revision:2}),original);assert.equal(builds,1);
  for(const mutate of [
    value=>{value.sources[0].embedding={modelId:'wrong-model',values:[...input.sources[0].embedding.values],
      toJSON(){invoked=true;return input.sources[0].embedding;}};},
    value=>{value.sources[0].url={toJSON(){invoked=true;return input.sources[0].url;}};},
    value=>{value.sourceLinks[0].method={toJSON(){invoked=true;return 'learned-provisional';}};},
    value=>{value.sources[0][Symbol('hidden-input')]=1;},
  ]) {
    const changed=structuredClone(input);changed.revision=3;mutate(changed);
    assert.throws(()=>plan(changed),TypeError);assert.equal(invoked,false);assert.equal(builds,1);
  }
  assert.equal(plan({...input,revision:4}),original);
});
