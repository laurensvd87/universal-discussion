// Frozen baseline captured before optimization on 2026-10-12; synthetic tests only.
import { performance } from 'node:perf_hooks';
import { fail } from '../src/domain/errors.js';

const ADAPTIVE_TOPIC_POLICY = Object.freeze({ version: 'adaptive-supported-partitions/v1',
  floor: 0.90, tight: 0.94, competingMargin: 0.04, duplicateSimilarity: 0.995, minimumSupport: 2 });
const LEARNED = 'owner-local-page-embedding/v1';
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
// Exact current input transform space; an unrelated future extractor must not
// become comparable just because another validation allowlist grows.
const EXTRACTORS = new Set(['main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1']);
const EPSILON = 1e-12;
// A full regrouping runs synchronously on every ingestion. Bound CPU work while
// retaining the snapshot and response byte limits as the data-size guards.
const PLANNING_BUDGET_MS = 10_000;
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
const key = part => part.sourceIds.join('\0');
const invalid = () => { throw new TypeError('Invalid adaptive Topic planner input'); };
const dot = (a,b) => Math.max(-1,Math.min(1,a.reduce((sum,value,i)=>sum+value*b[i],0)));

// No IDs, writes, clocks, inference or semantic claims. Caller owns transactional
// Topic reuse and must preserve Topic-root/manual/legacy containers independently.
// retainTight is one bounded sticky signal: persist it with the caller's Topic
// partition metadata to prevent support removal immediately undoing a split.
function baselinePlanAdaptiveTopics({ sources, sourceLinks, previousPartitions = [] }) {
  if (!Array.isArray(sources) || !Array.isArray(sourceLinks) || !Array.isArray(previousPartitions)) invalid();
  const deadline = performance.now() + PLANNING_BUDGET_MS;
  let checks = 0;
  function checkBudget() {
    if ((++checks & 1023) === 0 && performance.now() > deadline) fail('capacity', 'Matching work budget reached');
  }
  const allIds = new Set();
  for (const source of sources) {
    if (!source || !validId(source.id) || allIds.has(source.id)) invalid();
    allIds.add(source.id);
  }
  const eligible = sources.filter(source=>source.provenance===LEARNED).sort((a,b)=>compare(a.id,b.id));
  for (const source of eligible) {
    const vector=source.embedding?.values;
    if (source.embedding?.modelId!==MODEL || !EXTRACTORS.has(source.extractorVersion) ||
        typeof source.url!=='string' || source.url.length>2048 || !Array.isArray(vector) || vector.length!==384 ||
        vector.some(value=>typeof value!=='number' || !Number.isFinite(value)) ||
        Math.abs(Math.hypot(...vector)-1)>1e-6) invalid();
  }
  const byId=new Map(eligible.map(source=>[source.id,source]));
  const links=new Map();
  for (const link of sourceLinks) {
    if (!link || !validId(link.sourceId) || !validId(link.topicId) || links.has(link.sourceId) || !allIds.has(link.sourceId)) invalid();
    links.set(link.sourceId,link);
    if (byId.has(link.sourceId) && !['learned-provisional','manual-confirmed'].includes(link.method)) invalid();
  }
  const retained=new Set();
  const priorIds=new Set();
  for (const part of previousPartitions) {
    if (!part || !Array.isArray(part.sourceIds) ||
        typeof part.retainTight!=='boolean' || !(part.pinnedTopicId===null || validId(part.pinnedTopicId))) invalid();
    for (const id of part.sourceIds) {
      if (!validId(id) || priorIds.has(id)) invalid();
      priorIds.add(id);
      if (part.retainTight && byId.has(id)) retained.add(id);
    }
  }
  const similarities=new Map();
  function similarity(a,b) {
    if(a===b)return 1;
    const pair=compare(a,b)<0 ? `${a}\0${b}` : `${b}\0${a}`;
    if(!similarities.has(pair)) similarities.set(pair,dot(byId.get(a).embedding.values,byId.get(b).embedding.values));
    return similarities.get(pair);
  }
  function minimum(a,b) {
    let result=Infinity;
    for(const id of a)for(const other of b) { checkBudget(); result=Math.min(result,similarity(id,other)); }
    return result;
  }
  function maximum(a,b) {
    let result=-Infinity;
    for(const id of a)for(const other of b) { checkBudget(); result=Math.max(result,similarity(id,other)); }
    return result;
  }
  function cohesion(ids) {
    if(ids.length<2)return 1;
    let result=Infinity;
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++) {
      checkBudget(); result=Math.min(result,similarity(ids[i],ids[j]));
    }
    return result;
  }
  function support(ids) {
    const representatives=[];
    for(const id of [...ids].sort(compare)) if(!representatives.some(other=>{
      checkBudget();
      return byId.get(id).url===byId.get(other).url ||
        similarity(id,other)+EPSILON>=ADAPTIVE_TOPIC_POLICY.duplicateSimilarity;
    })) representatives.push(id);
    return representatives.length;
  }
  // Intrinsic complete-link neighborhood structure, independent of existing
  // Topic count/partition labels. Lexical IDs break numeric ties deterministically.
  const intrinsic=eligible.map(source=>({sourceIds:[source.id]}));
  for (;;) {
    const candidates=[];
    for(let i=0;i<intrinsic.length;i++)for(let j=i+1;j<intrinsic.length;j++) {
      checkBudget();
      const score=minimum(intrinsic[i].sourceIds,intrinsic[j].sourceIds);
      if(score+EPSILON>=ADAPTIVE_TOPIC_POLICY.tight)candidates.push({i,j,score,key:key(intrinsic[i])+'\0'+key(intrinsic[j])});
    }
    candidates.sort((a,b)=>b.score-a.score || compare(a.key,b.key));
    if(!candidates.length)break;
    const {i,j}=candidates[0];
    intrinsic[i]={sourceIds:[...intrinsic[i].sourceIds,...intrinsic[j].sourceIds].sort(compare)};
    intrinsic.splice(j,1); intrinsic.sort((a,b)=>compare(key(a),key(b)));
  }
  const supported=intrinsic.filter(part=>support(part.sourceIds)>=ADAPTIVE_TOPIC_POLICY.minimumSupport);
  const boundaries=[];
  const markedBlocks=new Map();
  for(let i=0;i<supported.length;i++)for(let j=i+1;j<supported.length;j++) {
    const a=supported[i].sourceIds,b=supported[j].sourceIds;
    if(Math.min(cohesion(a),cohesion(b))-maximum(a,b)+EPSILON>=ADAPTIVE_TOPIC_POLICY.competingMargin) {
      boundaries.push([new Set(a),new Set(b)]);
      for(const id of a)markedBlocks.set(id,key(supported[i]));
      for(const id of b)markedBlocks.set(id,key(supported[j]));
    }
  }
  const crossesBoundary=ids=>boundaries.some(([a,b])=>{
    checkBudget();
    return ids.some(id=>{ checkBudget(); return a.has(id); }) &&
      ids.some(id=>{ checkBudget(); return b.has(id); });
  });
  const decisions=[];
  const initial=new Map();
  for(const source of eligible) {
    const group=links.has(source.id)?`topic:${links.get(source.id).topicId}`:`new:${source.id}`;
    if(!initial.has(group))initial.set(group,[]);
    initial.get(group).push(source.id);
  }
  const partitions=[];
  function append(ids,tight=false) {
    const pins=[...new Set(ids.filter(id=>links.get(id)?.method==='manual-confirmed').map(id=>links.get(id).topicId))];
    if(pins.length>1)invalid();
    partitions.push({sourceIds:[...ids].sort(compare),pinnedTopicId:pins[0]??null,
      retainTight:tight || ids.some(id=>retained.has(id))});
  }
  function floorComponents(ids) {
    if(cohesion(ids)+EPSILON>=ADAPTIVE_TOPIC_POLICY.floor)return [ids];
    const pinned=ids.filter(id=>links.get(id)?.method==='manual-confirmed');
    const components=[...(pinned.length ? [pinned] : []),
      ...ids.filter(id=>!pinned.includes(id)).map(id=>[id])];
    for (;;) {
      const candidates=[];
      for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++) {
        checkBudget();
        // Multiple manual pins may be intentionally incoherent. Preserve them,
        // but never use that incoherent pinned set to absorb provisional members.
        if(cohesion(components[i])+EPSILON<ADAPTIVE_TOPIC_POLICY.floor ||
            cohesion(components[j])+EPSILON<ADAPTIVE_TOPIC_POLICY.floor)continue;
        const score=minimum(components[i],components[j]);
        if(score+EPSILON>=ADAPTIVE_TOPIC_POLICY.floor)candidates.push({i,j,score,key:components[i].join('\0')+'\0'+components[j].join('\0')});
      }
      candidates.sort((a,b)=>b.score-a.score || compare(a.key,b.key));
      if(!candidates.length)break;
      const {i,j}=candidates[0];
      components[i]=[...components[i],...components[j]].sort(compare);
      components.splice(j,1); components.sort((a,b)=>compare(a.join('\0'),b.join('\0')));
    }
    return components;
  }
  for(const original of initial.values()) for(const ids of floorComponents(original)) {
    if(!crossesBoundary(ids)) { append(ids); continue; }
    const pinned=ids.filter(id=>links.get(id)?.method==='manual-confirmed');
    if(crossesBoundary(pinned)) {
      append(ids); decisions.push({reason:'manual-pin-preserved',sourceIds:[...ids]}); continue;
    }
    const blocks=new Map();
    for(const id of ids) {
      const block=markedBlocks.get(id)??'unsupported';
      if(!blocks.has(block))blocks.set(block,[]);
      blocks.get(block).push(id);
    }
    for(const block of blocks.values())append(block,true);
    decisions.push({reason:'supported-tight-split',sourceIds:[...ids]});
  }
  for(const original of initial.values()) if(cohesion(original)+EPSILON<ADAPTIVE_TOPIC_POLICY.floor &&
      !original.every(id=>links.get(id)?.method==='manual-confirmed')) {
    decisions.push({reason:'incompatible-representation-split',sourceIds:[...original]});
  }
  partitions.sort((a,b)=>compare(key(a),key(b)));
  for (;;) {
    const candidates=[];
    for(let i=0;i<partitions.length;i++)for(let j=i+1;j<partitions.length;j++) {
      checkBudget();
      const a=partitions[i],b=partitions[j],ids=[...a.sourceIds,...b.sourceIds];
      // A manually anchored Topic is owner-selected, not an automatic expansion
      // target, even when the other partition has a high-scoring vector.
      if(a.pinnedTopicId!==null || b.pinnedTopicId!==null)continue;
      if(crossesBoundary(ids))continue;
      const score=minimum(a.sourceIds,b.sourceIds);
      const threshold=a.retainTight || b.retainTight ? ADAPTIVE_TOPIC_POLICY.tight : ADAPTIVE_TOPIC_POLICY.floor;
      if(cohesion(a.sourceIds)+EPSILON<threshold || cohesion(b.sourceIds)+EPSILON<threshold)continue;
      if(score+EPSILON<threshold)continue;
      const outside=eligible.map(source=>source.id).filter(id=>!ids.includes(id));
      if(outside.length && score-maximum(ids,outside)+EPSILON<ADAPTIVE_TOPIC_POLICY.competingMargin)continue;
      candidates.push({i,j,score,key:key(a)+'\0'+key(b)});
    }
    candidates.sort((a,b)=>b.score-a.score || compare(a.key,b.key));
    if(!candidates.length)break;
    const {i,j}=candidates[0],a=partitions[i],b=partitions[j];
    partitions[i]={sourceIds:[...a.sourceIds,...b.sourceIds].sort(compare),
      pinnedTopicId:a.pinnedTopicId??b.pinnedTopicId,retainTight:a.retainTight || b.retainTight};
    partitions.splice(j,1); partitions.sort((a,b)=>compare(key(a),key(b)));
  }
  return {policyVersion:ADAPTIVE_TOPIC_POLICY.version,partitions,decisions};
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { planAdaptiveTopics } from '../src/domain/adaptive-topics.js';

// Frozen pre-optimization planner above. Keep its arithmetic, tie ordering,
// thresholds and veto sequence intact: differential checks must be independent.
function source(id,values,url=`https://example.test/${id}`) {
  const vector=[...values,...Array(384-values.length).fill(0)];
  const norm=Math.hypot(...vector);
  return {id,url,provenance:'owner-local-page-embedding/v1',
    extractorVersion:'crawler-static-html-prefix/v1',
    embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:vector.map(value=>value/norm)}};
}
const link=(sourceId,topicId,method='learned-provisional')=>({sourceId,topicId,method});
function random(seed) {
  let state=seed>>>0;
  return ()=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
}
function heterogeneous(count,seed=103) {
  const rng=random(seed);
  return Array.from({length:count},(_,index)=>{
    const values=Array(384).fill(0);
    const group=Math.floor(index/3);
    values[group%300]=Math.sqrt(.965);
    values[300+index%84]=Math.sqrt(.035)*(index%2 ? -1 : 1);
    // Deterministic nonzero axes make the arithmetic exercise full vectors.
    for(let axis=0;axis<384;axis++)values[axis]+=(rng()-.5)*.00001;
    return source(`s${String(index).padStart(4,'0')}`,values);
  });
}
function comparePlans(input,label) {
  const expected=baselinePlanAdaptiveTopics(input);
  const actual=planAdaptiveTopics(input);
  assert.deepEqual(actual,expected,label);
  return actual;
}
function permute(input,seed) {
  const rng=random(seed),sources=[...input.sources],sourceLinks=[...input.sourceLinks];
  for(const list of [sources,sourceLinks])for(let index=list.length-1;index>0;index--) {
    const other=Math.floor(rng()*(index+1));
    [list[index],list[other]]=[list[other],list[index]];
  }
  return {...input,sources,sourceLinks};
}

test('exact differential: heterogeneous dense vectors, manual pins, sticky partitions and permutations',()=>{
  for(const seed of [1,19,103,771]) {
    const sources=heterogeneous(36,seed);
    // Mixed old representations force the floor-components path; other Sources
    // remain unlinked and some manual destinations are deliberately incoherent.
    const sourceLinks=sources.filter((_,index)=>index%3!==2).map((item,index)=>
      link(item.id,`old-${index%5}`,index%7===0 ? 'manual-confirmed' : 'learned-provisional'));
    const previousPartitions=sources.filter((_,index)=>index%4===0).map(item=>
      ({sourceIds:[item.id],pinnedTopicId:null,retainTight:true}));
    const input={sources,sourceLinks,previousPartitions};
    const expected=comparePlans(input,`seed ${seed}`);
    for(const order of [8,43]) {
      const shuffled=permute(input,order);
      assert.deepEqual(comparePlans(shuffled,`seed ${seed}/permutation ${order}`),expected);
    }
  }
});

test('exact differential: floor/tight/duplicate/competing edges, ties and duplicate URL support',()=>{
  for(const threshold of [.90,.94,.995])for(const delta of [-2e-12,-.5e-12,0,.5e-12,2e-12]) {
    const score=threshold+delta;
    const sources=[source('a',[1,0]),source('b',[score,Math.sqrt(1-score*score)])];
    for(const retainTight of [false,true])comparePlans({
      sources,sourceLinks:[],
      previousPartitions:[{sourceIds:['a'],pinnedTopicId:null,retainTight}]
    },`threshold ${threshold} delta ${delta} sticky ${retainTight}`);
  }
  const v=Math.sqrt(.985),noise=Math.sqrt(.015);
  for(const between of [.94-2e-12,.94,.94+2e-12]) {
    const sources=[source('a1',[v,0,noise,0]),source('a2',[v,0,-noise,0]),
      source('b1',[v*between,v*Math.sqrt(1-between*between),0,noise]),
      source('b2',[v*between,v*Math.sqrt(1-between*between),0,-noise])];
    const old=sources.map(item=>link(item.id,'old'));
    for(const duplicateUrls of [false,true]) {
      const variant=sources.map(item=>({...item,url:duplicateUrls ? 'https://example.test/duplicate' : item.url}));
      const input={sources:variant,sourceLinks:old};
      const expected=comparePlans(input);
      assert.deepEqual(comparePlans(permute(input,9)),expected);
      comparePlans({...input,sourceLinks:old.map((item,index)=>index%2===0 ? {...item,method:'manual-confirmed'} : item)});
    }
  }
  // Equal scores require the original lexical candidate tie ordering.
  const tied=[source('a',[1,0]),source('aa',[1,0]),source('b',[1,0]),source('z',[-1,0])];
  comparePlans({sources:tied,sourceLinks:[]});
  for(const delta of [-2e-12,0,2e-12]) {
    const rival=.94-.04+delta;
    comparePlans({sources:[source('a',[1,0]),source('b',[.94,Math.sqrt(1-.94**2)]),
      source('c',[rival,-Math.sqrt(1-rival**2)])],sourceLinks:[link('c','pin','manual-confirmed')]});
  }
});

test('600 heterogeneous Sources keep exact coverage and report runtime without a machine-speed assertion',t=>{
  const input={sources:heterogeneous(600),sourceLinks:[]};
  const before=performance.now();
  const actual=planAdaptiveTopics(input);
  const elapsed=performance.now()-before;
  const ids=actual.partitions.flatMap(part=>part.sourceIds);
  assert.equal(ids.length,600);
  assert.equal(new Set(ids).size,600);
  // The third close competitor vetoes the final singleton merge, even though
  // the intrinsic supported blocks each contain three members.
  assert.equal(actual.partitions.length,600);
  assert.ok(actual.partitions.every(part=>part.sourceIds.length===1));
  t.diagnostic(`600 generated 384-axis Sources: ${elapsed.toFixed(1)}ms; unchanged planner budget 10000ms`);
});

test('exact differential: multiple boundary neighbors, unsupported members and boundary-spanning pins',()=>{
  const sources=heterogeneous(15,22);
  sources.push(source('unsupported',[...Array(383).fill(0),1]));
  const sourceLinks=sources.map(item=>link(item.id,'old'));
  for(const pins of [[],['s0000'],['s0000','s0003'],['s0000','s0003','s0006']]) {
    const input={sources,sourceLinks:sourceLinks.map(item=>pins.includes(item.sourceId) ?
      {...item,method:'manual-confirmed'} : item),
      previousPartitions:[{sourceIds:['s0012','s0013','s0014'],pinnedTopicId:null,retainTight:true}]};
    const expected=comparePlans(input);
    assert.deepEqual(comparePlans(permute(input,42)),expected);
  }
});

test('frozen validation and accepted sparse-array edge behavior remain exact',()=>{
  for(const sparseFirst of [true,false]) {
    const a=source('a',[1,0]),b=source('b',[.91,Math.sqrt(1-.91**2)]);
    const sparse=Array(384); sparse[0]=1;
    (sparseFirst ? a : b).embedding.values=sparse;
    comparePlans({sources:[a,b],sourceLinks:[]});
  }
  const a=source('a',[1,0]);
  for(const input of [
    {sources:[a,a],sourceLinks:[]},
    {sources:[{...a,extractorVersion:'future-extractor'}],sourceLinks:[]},
    {sources:[a],sourceLinks:[link('a','t','unsupported-method')]},
    {sources:[a],sourceLinks:[],previousPartitions:[{sourceIds:['a'],pinnedTopicId:null,retainTight:'yes'}]}
  ]) {
    assert.throws(()=>baselinePlanAdaptiveTopics(input),TypeError);
    assert.throws(()=>planAdaptiveTopics(input),TypeError);
  }
});

test('CPU deadline still fails closed while repeated immutable relations are cached',t=>{
  const input={sources:heterogeneous(600,17),sourceLinks:[]};
  const before=JSON.stringify(input);
  let reads=0;
  // Allow the initial pair materialization and repeated merge scans to run,
  // then expire the same 10000ms budget without a slow wall-clock test.
  const clock=t.mock.method(performance,'now',()=>++reads<=500 ? 0 : 10001);
  try {
    assert.throws(()=>planAdaptiveTopics(input),error=>error.code==='capacity');
    assert.ok(reads>500);
    assert.equal(JSON.stringify(input),before);
  } finally { clock.mock.restore(); }
});
