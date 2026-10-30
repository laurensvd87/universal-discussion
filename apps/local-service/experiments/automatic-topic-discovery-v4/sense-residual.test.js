import test from 'node:test';import assert from 'node:assert/strict';
import {residualVector,completeLinkResidualGroups,compareNamedSenseResiduals} from './sense-residual.js';
import {scoreResidualDevelopment,main} from '../../harness/run-stored-topic-residual-development.js';
const vector=entries=>{const v=Array(384).fill(0);for(const [i,x]of entries)v[i]=x;return v;};
const axis=i=>vector([[i,1]]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
test('orthogonal projection removes both common and name directions without reintroducing them',()=>{
 const common=axis(0),name=vector([[0,Math.SQRT1_2],[1,Math.SQRT1_2]]),doc=vector([[0,.6],[1,.48],[2,.64]]);
 const r=residualVector(doc,common,name,'common-and-name');assert.ok(r);assert.ok(Math.abs(dot(r,common))<1e-12);assert.ok(Math.abs(dot(r,name))<1e-12);assert.equal(r[2],1);
 assert.equal(residualVector(axis(0),common,axis(0),'name'),null);
 assert.equal(residualVector(axis(0),common,axis(0),'common-and-name'),null);
});
test('complete linkage refuses a similarity chain as one sense and retains two independent members',()=>{
 const matrix=[[1,.9,.3],[.9,1,.8],[.3,.8,1]];
 assert.deepEqual(completeLinkResidualGroups(['a','b','c'],matrix,.7),[['a','b']]);
 assert.deepEqual(completeLinkResidualGroups(['a','b'],[[1,null],[null,1]],0),[]);
 assert.throws(()=>completeLinkResidualGroups(['a','b'],[[1,.2],[.8,1]],0));
 assert.throws(()=>completeLinkResidualGroups(['a','b'],[[1,null],[0,1]],0));
});
test('common-plus-name residuals separate distinct contexts despite the same original name',()=>{
 const doc=(id,sense)=>({sourceId:id,body:vector([[0,.8],[1,.3],[sense,Math.sqrt(.27)]])});
 const observations=[doc('a',2),doc('b',2),doc('c',3),doc('d',3)],labels=[{key:'shared',label:'Same name',vector:axis(1),members:['a','b','c','d']}];
 const r=compareNamedSenseResiduals(observations,labels),v=r.variants.find(v=>v.mode==='name'&&v.threshold===.6);
 // Their common direction remains, so the name-only method still merges them.
 assert.equal(v.groups.length,1);
 const separated=r.variants.find(v=>v.mode==='common-and-name'&&v.threshold===.2);assert.deepEqual(separated.groups.map(g=>g.members),[['a','b'],['c','d']]);
 assert.equal(r.scope.parenthoodAsserted,false);assert.equal(r.scope.goldUsed,false);
});
test('same-member-set resolution preserves the more qualified name; no duplicate parent is invented',()=>{
 const body=vector([[0,.8],[1,.6]]),observations=[{sourceId:'a',body},{sourceId:'b',body}],members=['a','b'];
 const r=compareNamedSenseResiduals(observations,[{key:'x',label:'Python',vector:axis(0),members},{key:'y',label:'Monty Python',vector:axis(0),members}]);
 const v=r.variants.find(v=>v.mode==='name'&&v.threshold===.6);assert.equal(v.groups.length,1);assert.equal(v.groups[0].label,'Monty Python');
});
test('duplicate IDs, foreign members and corrupt vectors refuse before a comparison',()=>{
 const body=axis(0),a={sourceId:'a',body},b={sourceId:'b',body},p={key:'x',label:'X',vector:axis(1),members:['a','b']};
 assert.throws(()=>compareNamedSenseResiduals([a,a],[p]));assert.throws(()=>compareNamedSenseResiduals([a,b],[{...p,members:['a','foreign']}]));
 assert.throws(()=>residualVector(Array(384).fill(0),body,body,'name'));
});
test('separate gold scoring detects a wrong sense pair even when both literal labels are allowed',()=>{
 const result=scoreResidualDevelopment({variants:[{mode:'name',threshold:.2,groups:[{key:'x',label:'Dolphin'}],
  selections:[{sourceId:'a',key:'x'},{sourceId:'b',key:'x'},{sourceId:'c',key:null}],unavailableResiduals:0}]},
  [{sourceId:'a',subjects:[{key:'animal',labels:['Dolphin']}]},{sourceId:'b',subjects:[{key:'software',labels:['Dolphin']}]},{sourceId:'c',subjects:[]}])[0];
 assert.equal(result.correct,2);assert.equal(result.wrong,0);assert.equal(result.wrongPairs,1);assert.equal(result.correctPairs,0);
});
test('closed no-output calculation rejects additional selectors without reading private data',async()=>{
 for(const args of [null,[],['--capture'],['--compare-residual-development','other']])assert.equal(await main(args),2);
});
