import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncrementalPracticalTopicPlanner } from '../src/domain/ridge-topic-planner.js';
import { createPracticalTopicPlanner as frozenPractical } from './fixtures/ridge-topic-planner-prior.js';

const floor=.8639003810829322;
function source(id,angle,axis=0) {
  const values=Array(384).fill(0);values[axis]=Math.cos(angle);values[axis+1]=Math.sin(angle);
  return {id,url:`https://example.org/incremental/${id}`,title:`Synthetic article ${id}`,
    provenance:'owner-local-page-embedding/v1',extractorVersion:'crawler-static-html-prefix/v1',
    embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values}};
}
function snapshot(sources) {
  return {generation:'synthetic-incremental',revision:1,sources,
    sourceLinks:sources.map(value=>({sourceId:value.id,topicId:`topic-${value.id}`,method:'learned-provisional'}))};
}
function fixture(options={}) {
  let transforms=0;
  const transform=values=>{transforms++;return [...values];};
  const parameters={representation:'synthetic-identity',floor,transform,artifactKey:'synthetic-identity-v1',...options};
  const planner=createIncrementalPracticalTopicPlanner(parameters);
  const oracle=frozenPractical({...parameters,transform:values=>values});
  function compare(input,label) {
    const before=structuredClone(input),expected=oracle.plan(input),actual=planner.plan(input);
    assert.deepEqual(actual.partitions,expected.partitions,label);
    assert.deepEqual(actual.diagnostics.qualificationReasons,expected.diagnostics.qualificationReasons,label);
    assert.equal(actual.policyVersion,expected.policyVersion);assert.equal(actual.diagnostics.floor,floor);
    assert.deepEqual(input,before,'input is immutable');
    return actual;
  }
  return {planner,compare,transforms:()=>transforms};
}
function groups() {
  return [source('a',-.1),source('aa',0),source('ab',.1),source('b',1),source('ba',1.1),source('bb',1.2),
    source('z',0,2),source('za',.05,2),source('zz',.1,2)];
}

test('Trust: identical geometry across comments/receipts/routing uses cached groups without copying old version authority',()=>{
  const f=fixture(),input=snapshot(groups());f.compare(input,'cold');const transforms=f.transforms();
  const changed=structuredClone(input);changed.revision++;
  changed.contributions=[{id:'synthetic-post',body:'Fresh current post'}];
  changed.sources[0].operationId='new-visit';changed.sources[0].operationDigest='0'.repeat(64);
  changed.sourceLinks[0].topicId='owner-current-routing';
  const warm=f.compare(changed,'comment and receipt only');
  assert.equal(f.transforms(),transforms);assert.equal(warm.diagnostics.incremental.transformedSources,0);
  assert.equal(warm.diagnostics.incremental.replannedSources,0);
  assert.ok(warm.diagnostics.incremental.reusedComponents>0);
});

test('Trust: bridge insertion and deletion rebuild affected complete components, preserving independent groups exactly',()=>{
  const f=fixture(),input=snapshot(groups());f.compare(input,'cold separated components');
  input.sources.push(source('bridge',.55));input.sourceLinks.push({sourceId:'bridge',topicId:'topic-bridge',method:'learned-provisional'});input.revision++;
  const connected=f.compare(input,'bridge crosses original two components');
  assert.equal(connected.diagnostics.incremental.transformedSources,1);
  assert.ok(connected.diagnostics.incremental.reusedComponents>=1,'independent third component remains reusable');
  assert.ok(connected.diagnostics.incremental.replannedSources>=7,'all members on both sides of bridge must be reconsidered');
  input.sources=input.sources.filter(value=>value.id!=='bridge');input.sourceLinks=input.sourceLinks.filter(value=>value.sourceId!=='bridge');input.revision++;
  const split=f.compare(input,'bridge deletion splits exact adjacency');
  assert.ok(split.diagnostics.incremental.reusedComponents>=1);
  assert.ok(split.partitions.every(part=>!(part.sourceIds.some(id=>['a','aa','ab'].includes(id)) && part.sourceIds.some(id=>['b','ba','bb'].includes(id)))));
});

test('Trust: source replacement, duplicate flood, qualification and manual eligibility remain full-oracle exact',()=>{
  const f=fixture(),input=snapshot(groups());f.compare(input);
  input.sources[0]=source('a',1.15);input.revision++;f.compare(input,'vector replacement can move to another component');
  for(let i=0;i<8;i++) {
    const duplicate={...source(`duplicate-${i}`,0),embedding:structuredClone(input.sources[1].embedding)};
    input.sources.push(duplicate);input.sourceLinks.push({sourceId:duplicate.id,topicId:`topic-${duplicate.id}`,method:'learned-provisional'});
  }
  input.revision++;f.compare(input,'exact duplicates cannot manufacture independent evidence');
  input.sources[1].title='Search results';input.sources[1].url='https://example.org/search?q=synthetic';input.revision++;
  f.compare(input,'negative qualification cannot witness a reused group');
  input.sourceLinks.find(value=>value.sourceId==='ab').method='manual-confirmed';input.revision++;
  const pinned=f.compare(input,'manual confirmed Source leaves provisional grouping');
  assert.ok(!pinned.partitions.some(part=>part.sourceIds.includes('ab')));
  input.sourceLinks.find(value=>value.sourceId==='ab').method='learned-provisional';input.revision++;f.compare(input,'manual removal restores eligible evidence');
});

test('Trust: distant insertions and source-ID prefixes cannot change existing floating-only tie decisions',()=>{
  for(const seed of [2,39,281]) {
    let rng=seed;
    const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    const input=snapshot(Array.from({length:32},(_,i)=>{
      const values=Array.from({length:384},(_,k)=>k===70+Math.floor(i/8) ? 1 : k>=90 ? (random()-.5)*.03 : 0);
      const norm=Math.hypot(...values),base=source(['a','aa','aaa','ab'][Math.floor(i/8)]+`-${i}`,0);
      return {...base,embedding:{...base.embedding,values:values.map(value=>value/norm)}};
    }));
    const f=fixture();f.compare(input,`dense seed ${seed}`);
    input.sources.push(source('0-distant',0,6));input.sourceLinks.push({sourceId:'0-distant',topicId:'topic-distant',method:'learned-provisional'});
    input.revision++;f.compare(input,`global rank offsets seed ${seed}`);
    input.sources.reverse();input.sourceLinks.reverse();f.compare(input,`input permutation seed ${seed}`);
  }
});

test('Trust: zero/tiny cache budgets fall back without weakening grouping or leaking unbounded cache entries',()=>{
  for(const cacheLimits of [{transformBytes:0,graphBytes:0,componentBytes:0},{transformBytes:4096,graphBytes:1024,componentBytes:128}]) {
    const f=fixture({cacheLimits}),input=snapshot(groups());const result=f.compare(input,'bounded fallback');
    const counts=result.diagnostics.incremental;
    assert.ok(counts.transformBytes<=cacheLimits.transformBytes);assert.ok(counts.graphBytes<=cacheLimits.graphBytes);
    assert.ok(counts.componentBytes<=cacheLimits.componentBytes);
    input.revision++;f.compare(input,'fallback repeated');
  }
});

test('Trust: generation changes and failures flush reuse; malformed inputs never return a cached partial grouping',()=>{
  const f=fixture(),input=snapshot(groups());f.compare(input);const before=f.transforms();
  input.generation='fresh-generation';input.revision=0;const fresh=f.compare(input);
  assert.ok(f.transforms()>before);assert.equal(fresh.diagnostics.incremental.reusedComponents,0);
  assert.throws(()=>f.planner.plan({...input,limits:{maxWorkUnits:1}}),error=>error.code==='capacity');
  f.compare(input,'after failed planning');
  let invoked=false;const unsafe=structuredClone(input);
  Object.defineProperty(unsafe.sources[0],'embedding',{get(){invoked=true;return input.sources[0].embedding;},enumerable:true});
  assert.throws(()=>f.planner.plan(unsafe),TypeError);assert.equal(invoked,false);
  const duplicate=structuredClone(input);duplicate.sources.push(duplicate.sources[0]);
  assert.throws(()=>f.planner.plan(duplicate),TypeError);
  f.compare(input,'after invalid input');
});
