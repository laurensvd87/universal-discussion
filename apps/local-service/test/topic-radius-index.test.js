import assert from 'node:assert/strict';
import test from 'node:test';
import {createTopicRadiusIndex} from '../src/domain/topic-radius-index.js';

const floor=.8639003810829322;
function vector(angle=0,axis=0,scale=1) {
  const values=Array(384).fill(0);values[axis]=Math.cos(angle)*scale;values[axis+1]=Math.sin(angle)*scale;
  values[383]=-0;return values;
}
const dot=(a,b)=>{let sum=0;for(let index=0;index<384;index++)sum+=a[index]*b[index];return Math.max(-1,Math.min(1,sum));};
const exact=(entries,query,threshold=floor)=>[...entries].filter(([,values])=>dot(query,values)>=threshold).map(([id])=>id).sort();
test('all exact radius matches survive dense duplicates, threshold boundaries and accepted norm drift',()=>{
  for(const threshold of [floor,.9,.94,.995,1,-1]) {
    const index=createTopicRadiusIndex({floor:threshold}),entries=new Map();
    for(const scale of [1-8e-7,1,1+8e-7])for(const delta of [-2e-12,-1e-14,0,1e-14,2e-12]) {
      const angle=Math.acos(Math.max(-1,Math.min(1,threshold+delta))),id=`id-${entries.size}`;
      const values=vector(angle,0,scale);entries.set(id,values);index.insert({id,values});
    }
    for(let duplicate=0;duplicate<12;duplicate++){const id=`duplicate-${duplicate}`,values=vector();entries.set(id,values);index.insert({id,values});}
    for(const query of [vector(),vector(1e-8),vector(.04),vector(0,2),vector(0,0,1+8e-7)])
      assert.deepEqual(index.query(query).ids,exact(entries,query,threshold),`floor${threshold}`);
  }
});
test('seeded exhaustive scan differential stays exact across insert/update/delete and tree compaction',()=>{
  let seed=19937;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  function dense() {
    const values=Array.from({length:384},()=>random()-.5),norm=Math.hypot(...values);
    return values.map(value=>value/norm);
  }
  const index=createTopicRadiusIndex(),entries=new Map();
  for(let step=0;step<240;step++) {
    const id=`source-${step%64}`;
    if(step%7===0 && entries.has(id)){assert.equal(index.delete(id),true);entries.delete(id);}
    else {
      const values=step%3?vector(random()*.8,2*Math.floor(random()*8)):dense();
      if(entries.has(id))index.update({id,values});else index.insert({id,values});entries.set(id,values);
    }
    for(const query of [vector(random()*.8,2*Math.floor(random()*8)),dense()])
      assert.deepEqual(index.query(query).ids,exact(entries,query),`step${step}`);
    const diagnostics=index.diagnostics();
    assert.ok(diagnostics.staleEntries<=Math.max(32,Math.floor(entries.size/4)));
    assert.ok(diagnostics.retainedBytes<=32*1024*1024);assert.ok(diagnostics.peakBytes<=64*1024*1024);
  }
  for(const id of [...entries.keys()])index.delete(id);
  assert.equal(index.diagnostics().retainedBytes,0);assert.deepEqual(index.query(vector()).ids,[]);
});
test('private immutable copies never expose mutable caller vectors; results include every matching current ID',()=>{
  const index=createTopicRadiusIndex(),values=vector();
  index.insert({id:'a',values});values[0]=0;values[2]=1;
  const typed=Float64Array.from(vector(.1));index.insert({id:'b',values:typed});typed.fill(0);
  assert.deepEqual(index.query(vector()).ids,['a','b']);
  const result=index.query(vector());result.ids.length=0;result.diagnostics.liveEntries=999;
  assert.deepEqual(index.query(vector()).ids,['a','b']);
  index.update({id:'a',values:vector(0,2)});assert.deepEqual(index.query(vector()).ids,['b']);
  index.delete('b');assert.deepEqual(index.query(vector()).ids,[]);assert.equal(index.delete('b'),false);
});
test('resource admission fails atomically rather than returning incomplete matches',()=>{
  const index=createTopicRadiusIndex({maxEntries:2});index.insert({id:'a',values:vector()});index.insert({id:'b',values:vector(.1)});
  const before=index.query(vector()).ids;
  assert.throws(()=>index.insert({id:'c',values:vector()}),error=>error.code==='capacity');assert.deepEqual(index.query(vector()).ids,before);
  const tiny=createTopicRadiusIndex({maxBytes:0,maxPeakBytes:0});
  assert.throws(()=>tiny.insert({id:'a',values:vector()}),error=>error.code==='capacity');assert.equal(tiny.diagnostics().liveEntries,0);
  const peak=createTopicRadiusIndex({maxBytes:1024*1024,maxPeakBytes:1024*1024});
  for(let count=0;count<100;count++)peak.insert({id:`id-${count}`,values:vector(count*.001)});
  assert.ok(peak.diagnostics().peakBytes<=1024*1024);
});
test('malformed representations reject without invoking proxy/accessor hooks or altering the inventory',()=>{
  const index=createTopicRadiusIndex();index.insert({id:'safe',values:vector()});let hooks=0;
  const sparse=vector();delete sparse[12];
  const accessor=vector();Object.defineProperty(accessor,'12',{get(){hooks++;return 0;},enumerable:true});
  const decorated=vector();Object.defineProperty(decorated,'map',{value:()=>{hooks++;return vector();}});
  const proxy=new Proxy(vector(),{get(){hooks++;return 0;},getOwnPropertyDescriptor(){hooks++;return undefined;}});
  const nan=vector();nan[5]=NaN;
  const infinity=vector();infinity[5]=Infinity;
  for(const values of [sparse,accessor,decorated,proxy,nan,infinity,Array(384).fill(0),vector(0,0,1.00001)])
    assert.throws(()=>index.insert({id:'invalid',values}));
  assert.throws(()=>index.insert({id:'safe',values:vector()}));
  assert.throws(()=>index.update({id:'missing',values:vector()}));
  assert.throws(()=>index.insert({id:'hook',get values(){hooks++;return vector();}}));
  assert.equal(hooks,0);assert.deepEqual(index.query(vector()).ids,['safe']);
});
test('metric branches prune separated evidence while exhaustive comparison still agrees',()=>{
  const index=createTopicRadiusIndex(),entries=new Map();
  for(let axis=0;axis<128;axis++)for(let duplicate=0;duplicate<3;duplicate++) {
    const id=`axis-${String(axis).padStart(3,'0')}-${duplicate}`,values=vector(duplicate*.001,axis*2);
    entries.set(id,values);index.insert({id,values});
  }
  const result=index.query(vector());assert.deepEqual(result.ids,exact(entries,vector()));
  assert.equal(result.complete,true);
  assert.ok(result.diagnostics.prunedBranches>0);assert.ok(result.diagnostics.candidatesCompared<entries.size);
});
test('full384-coordinate near-boundary roundoff cannot hide an exact accepted match',()=>{
  let seed=481;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000-.5;};
  const unit=values=>{const norm=Math.hypot(...values);return values.map(value=>value/norm);};
  for(const threshold of [floor,.999999999999,1]) {
    const query=unit(Array.from({length:384},random)),noise=unit(Array.from({length:384},random));
    let projection=0;for(let axis=0;axis<384;axis++)projection+=noise[axis]*query[axis];
    const orthogonal=unit(noise.map((value,axis)=>value-projection*query[axis]));
    const entries=new Map(),index=createTopicRadiusIndex({floor:threshold});
    for(let item=0;item<64;item++) {
      const cosine=Math.max(-1,Math.min(1,threshold+(item-32)*1e-14)),sine=Math.sqrt(1-cosine*cosine);
      const scale=1+[-8e-7,0,8e-7][item%3];
      const values=query.map((value,axis)=>(value*cosine+orthogonal[axis]*sine)*scale),id=`dense-${item}`;
      entries.set(id,values);index.insert({id,values});
    }
    assert.deepEqual(index.query(query).ids,exact(entries,query,threshold));
    const drifted=query.map(value=>value*(1+8e-7));
    assert.deepEqual(index.query(drifted).ids,exact(entries,drifted,threshold));
  }
});
