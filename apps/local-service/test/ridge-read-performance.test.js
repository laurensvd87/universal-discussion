import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRidgeTopicAdapter, createRidgeTopicTransform } from '../src/domain/ridge-topic-adapter.js';
import { createRidgeTopicTransform as priorTransform } from './fixtures/ridge-topic-adapter-prior.js';
import { createPracticalTopicPlanner } from '../src/domain/ridge-topic-planner.js';
import { createPracticalTopicPlanner as priorPractical } from './fixtures/ridge-topic-planner-prior.js';
import { planIndexedAlternateTopics } from '../src/domain/alternate-topic-planner-indexed.js';
import { planIndexedAlternateTopics as priorIndexed } from './fixtures/alternate-topic-planner-indexed-prior.js';

function random(seed) {
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function unit(values) { const norm=Math.hypot(...values);return values.map(value=>value/norm); }
function snapshot(count,seed) {
  const rng=random(seed);
  const sources=Array.from({length:count},(_,i)=>{
    const values=Array(384).fill(0),group=i%5;
    // Geometry wholly outside the old first-48-coordinate projection.
    values[70+group]=1;
    for(let k=90;k<384;k++)values[k]=(rng()-.5)*.026;
    return {id:`s-${String(i).padStart(4,'0')}`,title:`Fictional article ${i}`,
      url:`https://example.org/article-${i}`,provenance:'owner-local-page-embedding/v1',
      extractorVersion:'crawler-static-html-prefix/v1',
      embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:unit(values)}};
  });
  return {sources,sourceLinks:sources.map(source=>({sourceId:source.id,method:'learned-provisional'}))};
}

test('Ridge numeric coefficient copies and centered terms are bit-identical to frozen transform',()=>{
  const rng=random(371);
  const weights=Array.from({length:384*384},(_,index)=>(index%385===0 ? 1 : 0)+(rng()-.5)*.03);
  const artifact=makeRidgeTopicAdapter({weights,meanX:Array.from({length:384},()=> (rng()-.5)*.02),
    meanY:Array.from({length:384},()=> (rng()-.5)*.02)});
  const before=JSON.stringify(artifact),old=priorTransform(artifact),current=createRidgeTopicTransform(artifact);
  for(let i=0;i<45;i++) {
    const vector=unit(Array.from({length:384},()=>rng()-.5));
    if(i%3===0)vector[3]=-0;
    const normalized=unit(vector),expected=old(normalized),actual=current(normalized);
    assert.ok(Object.isFrozen(actual));
    for(let axis=0;axis<384;axis++)assert.ok(Object.is(actual[axis],expected[axis]),`case ${i}/axis ${axis}`);
  }
  assert.equal(JSON.stringify(artifact),before);
  for(const values of [Array(384).fill(0),Array(384).fill(1e308),Array(383).fill(0)]) {
    assert.throws(()=>old(values),TypeError);assert.throws(()=>current(values),TypeError);
  }
});

test('full metric pruning retains frozen indexed decisions across dense, duplicated and manual inputs',()=>{
  for(const seed of [1,31,479,1007]) {
    const input=snapshot(55,seed);
    input.sources[4].embedding.values=[...input.sources[0].embedding.values];
    input.sourceLinks[3].method='manual-confirmed';
    const before=JSON.stringify(input),expected=priorIndexed(input);
    for(const order of [input,{sources:[...input.sources].reverse(),sourceLinks:[...input.sourceLinks].reverse()}]) {
      assert.deepEqual(planIndexedAlternateTopics(order).partitions,expected.partitions);
    }
    for(const maxCachedPairs of [0,7,65536]) {
      const options={...input,limits:{maxCachedPairs}};
      assert.deepEqual(planIndexedAlternateTopics(options).partitions,priorIndexed(options).partitions);
    }
    assert.equal(JSON.stringify(input),before);
  }
});

test('frozen practical pipeline keeps qualification, source ties and complete-link refinement exact',()=>{
  for(const seed of [4,17,209]) {
    const input=snapshot(70,seed);
    input.sources[0].title='Search results';input.sources[0].url='https://example.org/search?q=fiction';
    input.sourceLinks[2].method='manual-confirmed';
    input.sources[8].embedding.values=[...input.sources[7].embedding.values];
    const options={representation:'synthetic-identity',floor:.8639003810829322,transform:values=>values};
    const expected=priorPractical(options).plan(input),actual=createPracticalTopicPlanner(options).plan(input);
    assert.deepEqual(actual.partitions,expected.partitions);
    assert.equal(actual.policyVersion,expected.policyVersion);
    assert.deepEqual(actual.diagnostics.qualificationReasons,expected.diagnostics.qualificationReasons);
    assert.equal(actual.diagnostics.floor,expected.diagnostics.floor);
    assert.equal(actual.diagnostics.candidateEdges,expected.diagnostics.candidateEdges);
  }
});

test('full metric retains exact near-unit and admission edge decisions',()=>{
  for(const threshold of [.8639003810829322,.94,.95])for(const delta of [-2e-10,-1e-12,0,1e-12,2e-10]) {
    const input=snapshot(5,71),value=threshold+delta;
    const a=Array(384).fill(0),b=Array(384).fill(0);a[200]=1;b[200]=value;b[201]=Math.sqrt(1-value*value);
    input.sources[0].embedding.values=a;input.sources[1].embedding.values=b;
    input.sources[2].embedding.values=unit(b.map((x,i)=>x+(i===202 ? .005 : 0)));
    for(const drift of [1-4e-6,1,1+4e-6]) {
      input.sources[0].embedding.values=a.map(x=>x*drift);
      assert.deepEqual(planIndexedAlternateTopics(input).partitions,priorIndexed(input).partitions);
      const admission={version:'alternate-indexed-body-metric/v1',seedSimilarity:threshold,
        supportedSimilarity:threshold,weakestCrossSimilarity:threshold,crowdedNeighborCount:3};
      assert.deepEqual(planIndexedAlternateTopics({...input,admission}).partitions,priorIndexed({...input,admission}).partitions);
    }
  }
});

test('384-coordinate metric rounding preserves frozen Ridge-floor decisions within original EPS padding',()=>{
  const floor=.8639003810829322;
  const admission={version:'alternate-indexed-body-metric/v1',seedSimilarity:floor,
    supportedSimilarity:floor,weakestCrossSimilarity:floor,crowdedNeighborCount:3};
  for(const seed of [2,29,377]) {
    const rng=random(seed),a=unit(Array.from({length:384},()=>rng()-.5));
    const raw=Array.from({length:384},()=>rng()-.5),projection=raw.reduce((sum,value,i)=>sum+value*a[i],0);
    const perpendicular=unit(raw.map((value,i)=>value-projection*a[i]));
    for(const delta of [-2e-10,-2e-12,0,2e-12,2e-10]) {
      const score=floor+delta,b=a.map((value,i)=>value*score+perpendicular[i]*Math.sqrt(1-score*score));
      const input=snapshot(8,seed);
      input.sources[0].embedding.values=a;
      input.sources[1].embedding.values=unit(b);
      input.sources[2].embedding.values=unit(b.map((value,i)=>value+(i===383 ? 1e-7 : 0)));
      for(const drift of [1-4e-6,1,1+4e-6]) {
        input.sources[0].embedding.values=a.map(value=>value*drift);
        const options={...input,admission};
        assert.deepEqual(planIndexedAlternateTopics(options).partitions,priorIndexed(options).partitions,
          `dense seed ${seed}/delta ${delta}/norm ${drift}`);
      }
    }
  }
});

test('existing work and memory limits still fail closed without partial results',()=>{
  const input=snapshot(40,94);
  assert.throws(()=>planIndexedAlternateTopics({...input,limits:{maxWorkUnits:1}}),e=>e.code==='capacity');
  assert.throws(()=>createPracticalTopicPlanner({representation:'identity',floor:.864,transform:values=>values})
    .plan({...input,limits:{maxWorkUnits:1}}),e=>e.code==='capacity');
});
