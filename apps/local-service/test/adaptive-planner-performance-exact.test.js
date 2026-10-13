import assert from 'node:assert/strict';
import test from 'node:test';
import {planAdaptiveTopics} from '../src/domain/adaptive-topics.js';
import {priorPlanAdaptiveTopics as frozen} from './fixtures/adaptive-topics-prior.js';
import {createBoundedEvidenceGraph,readEvidencePairCache} from '../src/domain/bounded-evidence-graph.js';

function source(id,angle,axis=0) {
  const values=Array(384).fill(0);values[axis]=Math.cos(angle);values[axis+1]=Math.sin(angle);values[383]=-0;
  return {id,url:`https://example.org/exact-performance/${id}`,title:'Synthetic article',
    provenance:'owner-local-page-embedding/v1',extractorVersion:'main-text-prefix/v1',
    embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values}};
}
function input(sources) {return {sources,sourceLinks:sources.map(value=>({sourceId:value.id,
  topicId:`topic-${value.id}`,method:'learned-provisional'})),previousPartitions:[]};}
function cache(snapshot) {
  return createBoundedEvidenceGraph({edgeFloor:.86-1e-10}).prepare(snapshot.sources.map(value=>({
    key:value.id,center:value.embedding.values,sourceIds:[value.id]})),{memoPairs:true}).pairCache;
}
test('dense/indexed arithmetic and shared exact pairs preserve frozen decisions at all admission boundaries',()=>{
  for(const threshold of [.86,.9,.94,.995])for(const delta of [-2e-12,-1e-14,0,1e-14,2e-12]) {
    const value=input([source('a',0),source('aa',Math.acos(threshold+delta)),source('b',.08),
      source('bb',.18),source('far',0,2)]);
    value.sourceLinks[0].topicId=value.sourceLinks[1].topicId='current';
    value.previousPartitions=[{sourceIds:['a','aa'],pinnedTopicId:null,retainTight:threshold===.94}];
    const expected=frozen(value);
    assert.deepEqual(planAdaptiveTopics(value),expected);
    assert.deepEqual(planAdaptiveTopics(value,{pairCache:cache(value)}),expected);
  }
});
test('deterministic dense mutation differential preserves pins, URLs, support and lexical ties',()=>{
  let seed=177013;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  for(let step=0;step<100;step++) {
    const values=Array.from({length:4+step%16},(_,index)=>source(`${['a','aa','aaa','ab'][index%4]}-${index}`,
      random()*1.2,2*Math.floor(random()*3)));
    const value=input(values);
    for(let index=0;index<values.length;index++) {
      value.sourceLinks[index].topicId=`topic-${index%4}`;
      if(random()<.12)value.sourceLinks[index].method='manual-confirmed';
      if(random()<.15)values[index].url=values[0].url;
    }
    value.previousPartitions=[{sourceIds:values.filter((_,index)=>index%3===0).map(source=>source.id),
      pinnedTopicId:null,retainTight:step%2===0}];
    if(step%2) {value.sources.reverse();value.sourceLinks.reverse();}
    const expected=frozen(value);
    assert.deepEqual(planAdaptiveTopics(value),expected,`dense step${step}`);
    assert.deepEqual(planAdaptiveTopics(value,{pairCache:cache(value)}),expected,`shared step${step}`);
  }
});
test('legacy sparse/decorated/accessor inputs retain original floating arithmetic and NaN fallback',()=>{
  for(const kind of ['sparse','decorated','accessor']) {
    const value=input([source('a',0),source('b',.1),source('c',.8)]),values=value.sources[1].embedding.values;
    if(kind==='sparse')delete values[12];
    if(kind==='decorated')Object.defineProperty(values,'map',{value:()=>Array(384).fill(0),enumerable:true});
    if(kind==='accessor')Object.defineProperty(values,'12',{get:()=>0,enumerable:true});
    assert.deepEqual(planAdaptiveTopics(value),frozen(value),kind);
  }
});
test('pair-cache authority is opaque; wrong IDs or coordinates fall back without invoking caller hooks',()=>{
  const value=input([source('a',0),source('b',.1),source('c',.8)]),token=cache(value),expected=frozen(value);
  const exposed=readEvidencePairCache(token);
  assert.ok(Object.isFrozen(exposed));assert.ok(Object.isFrozen(exposed.keys));
  assert.equal('values' in exposed,false);assert.equal('centers' in exposed,false);
  let hooks=0;
  const fake={get keys(){hooks++;return exposed.keys;},matches(){hooks++;return true;},score(){hooks++;return 1;}};
  assert.deepEqual(planAdaptiveTopics(value,{pairCache:fake}),expected);assert.equal(hooks,0);
  value.sources[1].embedding.values=source('b',.5).embedding.values;
  assert.deepEqual(planAdaptiveTopics(value,{pairCache:token}),frozen(value),'old coordinates cannot spoof new input');
  value.sources[1].id='replacement';value.sourceLinks[1].sourceId='replacement';
  assert.deepEqual(planAdaptiveTopics(value,{pairCache:token}),frozen(value),'old Source identity cannot spoof replacement');
  assert.throws(()=>planAdaptiveTopics(value,{workBudgetMs:10001}));
  assert.throws(()=>planAdaptiveTopics(value,{workBudgetMs:0}));
});
test('tiny trusted budgets include dense preparation and shared-cache coordinate validation',()=>{
  const value=input(Array.from({length:160},(_,index)=>source(`budget-${index}`,index*.001)));
  const token=cache(value),before=structuredClone(value);
  for(const pairCache of [null,token])assert.throws(()=>planAdaptiveTopics(value,{pairCache,workBudgetMs:.00001}),
    error=>error.code==='capacity');
  assert.deepEqual(value,before);
});
