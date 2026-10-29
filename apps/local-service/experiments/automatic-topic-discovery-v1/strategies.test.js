import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDiscoveryStrategies as compare} from './strategies.js';
const vector=degrees=>{const v=Array(384).fill(0),r=degrees*Math.PI/180;v[0]=Math.cos(r);v[1]=Math.sin(r);return v;};
const run=(degrees,minimumSimilarity=.9,minimumMargin=.01)=>compare(JSON.stringify({observations:degrees.map((d,i)=>({sourceId:'source-'+i,vector:vector(d)})),minimumSimilarity,minimumMargin}));
const sizes=r=>r.results.map(x=>x.groups.map(g=>g.members.length));

test('compares centroid and graph drift with complete pair cohesion on the same invented geometry',()=>{
 const r=run([0,20,30]);assert.deepEqual(sizes(r),[[2,1],[3],[3]]);
 assert.ok(r.results[0].groups.every(g=>g.minimumPairSimilarity>=.9));
 assert.ok(r.results[1].groups[0].minimumPairSimilarity<.9);assert.ok(r.results[2].groups[0].minimumPairSimilarity<.9);
 assert.equal(r.assignmentAuthority,false);assert.equal(r.semanticQualityMeasured,false);
});
test('competing incremental matches abstain while threshold graph connects through the ambiguous page',()=>{
 const r=run([-20,20,0]);assert.deepEqual(sizes(r),[[1,1,1],[1,1,1],[3]]);assert.equal(r.results[0].ambiguous,1);assert.equal(r.results[1].ambiguous,1);
});
test('empty, singleton, separated and coherent observations keep every ID exactly once per strategy',()=>{
 for(const values of [[],[0],[0,90,180],[0,1,2,3]]){
  const r=run(values);for(const result of r.results)assert.deepEqual(result.groups.flatMap(g=>g.members).sort(),values.map((_,i)=>'source-'+i).sort());
 }
 assert.deepEqual(sizes(run([0,90,180])),[[1,1,1],[1,1,1],[1,1,1]]);
 assert.deepEqual(sizes(run([0,1,2,3])),[[4],[4],[4]]);
});
test('maximum cohort retains bounded matrix and measured work; no labels or parent are accepted',()=>{
 const r=run(Array(64).fill(0));assert.equal(r.work.pairs,2016);assert.equal(r.work.coordinateProducts,774144);assert.equal(r.work.matrixBytes,32768);
 for(const result of r.results)assert.equal(result.groups[0].members.length,64);
 assert.throws(()=>run(Array(65).fill(0)));
 assert.throws(()=>compare(JSON.stringify({observations:[],minimumSimilarity:.9,minimumMargin:.01,gold:'anything'})));
});
test('untrusted objects, malformed/nonunit vectors, duplicate identities and invalid policy fail before comparison',()=>{
 let hooks=0;assert.throws(()=>compare(new Proxy({}, {get(){hooks++;throw Error();}})));assert.equal(hooks,0);
 for(const raw of ['{}','null','[]','not-json','x'.repeat(1048577)])assert.throws(()=>compare(raw));
 for(const patch of [{minimumSimilarity:.79},{minimumSimilarity:'0.9'},{minimumMargin:-1},{observations:[{sourceId:'a',vector:Array(384).fill(0)}]},{observations:[{sourceId:'a',vector:vector(0)},{sourceId:'a',vector:vector(20)}]}])assert.throws(()=>compare(JSON.stringify({observations:[],minimumSimilarity:.9,minimumMargin:.01,...patch})));
});
