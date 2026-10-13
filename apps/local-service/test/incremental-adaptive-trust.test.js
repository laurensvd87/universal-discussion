import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncrementalAdaptiveTopicPlanner } from '../src/domain/incremental-adaptive-topics.js';
import { planAdaptiveTopics } from '../src/domain/adaptive-topics.js';

function source(id,angle) {
  const values=Array(384).fill(0);values[0]=Math.cos(angle);values[1]=Math.sin(angle);
  return {id,url:`https://example.org/adaptive-trust/${id}`,title:`Synthetic ${id}`,provenance:'owner-local-page-embedding/v1',
    extractorVersion:'main-text-prefix/v1',embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values}};
}
function fixture(sources) {
  return {generation:'synthetic-adaptive-trust',sources,sourceLinks:sources.map(value=>({sourceId:value.id,topicId:`topic-${value.id}`,method:'learned-provisional'})),previousPartitions:[]};
}

test('Trust: a caller-overridden vector map cannot impersonate older cached geometry',()=>{
  const incremental=createIncrementalAdaptiveTopicPlanner(),input=fixture([source('a',0),source('b',.4)]);
  const before=planAdaptiveTopics(input);assert.deepEqual(incremental(input),before);
  const old=[...input.sources[1].embedding.values];input.sources[1].embedding.values=source('b',.5).embedding.values;
  // Both geometries remain within the conservative .86 dependency component,
  // but .5 radians crosses the canonical .90 admission floor.
  Object.defineProperty(input.sources[1].embedding.values,'map',{value:()=>old,enumerable:true});
  const expected=planAdaptiveTopics(input);assert.notDeepEqual(expected.partitions,before.partitions);
  assert.deepEqual(incremental(input),expected,'cache must use actual coordinate values or original full fallback');
});

test('Trust: a nonlocal competing outsider at .86/.90 epsilon boundaries is never omitted',()=>{
  for(const delta of [-2e-10,-2e-12,0,2e-12,2e-10]) {
    const a=source('a',0),b=source('b',Math.acos(.9)),outside=source('outside',0),value=.86+delta;
    outside.embedding.values[0]=value;outside.embedding.values[1]=0;outside.embedding.values[2]=Math.sqrt(1-value*value);
    const input=fixture([a,b,outside]),incremental=createIncrementalAdaptiveTopicPlanner();
    assert.deepEqual(incremental(input),planAdaptiveTopics(input));
    input.sources[2].embedding.values[0]=.87;input.sources[2].embedding.values[2]=Math.sqrt(1-.87**2);
    assert.deepEqual(incremental(input),planAdaptiveTopics(input));
  }
});

test('Trust: cross-component URL support and sticky/manual original Topic dependencies stay exact',()=>{
  const input=fixture([source('a',0),source('aa',.1),source('b',1),source('bb',1.1),source('far',2.8)]);
  input.sourceLinks[0].topicId='owner-pinned';input.sourceLinks[0].method='manual-confirmed';
  input.sourceLinks[4].topicId='owner-pinned';input.sourceLinks[4].method='manual-confirmed';
  input.previousPartitions=[{sourceIds:['aa'],pinnedTopicId:null,retainTight:true}];
  const incremental=createIncrementalAdaptiveTopicPlanner();assert.deepEqual(incremental(input),planAdaptiveTopics(input));
  input.sources[1].url=input.sources[0].url;assert.deepEqual(incremental(input),planAdaptiveTopics(input));
  input.sourceLinks[4].topicId='other-owner';assert.deepEqual(incremental(input),planAdaptiveTopics(input));
  input.previousPartitions=[];assert.deepEqual(incremental(input),planAdaptiveTopics(input));
});
