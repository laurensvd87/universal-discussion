import test from 'node:test';import assert from 'node:assert/strict';
import {compareLabelGrounding,LABEL_GROUNDING_GRID} from './label-grounding.js';
const v=angle=>Array.from({length:384},(_,i)=>i===0?Math.cos(angle):i===1?Math.sin(angle):0);
const doc=(id,angle)=>({sourceId:id,body:v(angle),title:v(angle),paired:v(angle)});
test('local label competition separates two lexical homonyms with distinct context vectors',()=>{
 const observations=[doc('a',0),doc('b',.1),doc('c',1.1),doc('d',1.2)],labels=[{key:'animal',label:'Dolphin',vector:v(0),members:['a','b','c','d']},
  {key:'software',label:'Dolphin file manager',vector:v(1.2),members:['c','d']}];
 const r=compareLabelGrounding(observations,labels),out=r.variants.find(x=>x.view==='body'&&x.threshold===.9&&x.margin===.03);
 assert.deepEqual(out.selections.map(s=>s.key),['animal','animal','software','software']);
 assert.equal(r.variants.length,LABEL_GROUNDING_GRID.views.length*LABEL_GROUNDING_GRID.thresholds.length*LABEL_GROUNDING_GRID.margins.length);
 assert.equal(r.coordinateProducts,4*2*384*3);assert.equal(r.scope.goldUsed,false);
});
test('a stronger unlicensed alternative refuses the lexical assignment; a singleton cannot create a subject',()=>{
 const r=compareLabelGrounding([doc('a',0),doc('b',1)], [{key:'x',label:'X',vector:v(0),members:['a','b']},{key:'y',label:'Y',vector:v(1),members:['a','b']}]);
 assert.ok(r.variants.every(x=>x.assigned===0));
 const stronger=compareLabelGrounding([doc('a',1),doc('b',1),doc('c',1),doc('d',1)],
  [{key:'x',label:'X',vector:v(0),members:['a','b']},{key:'y',label:'Y',vector:v(1),members:['c','d']}]);
 assert.ok(stronger.variants.every(x=>x.selections[0].key===null));
});
test('unit vector corruption, duplicate sources and foreign label members are refused',()=>{
 const a=doc('a',0),b=doc('b',.1),p={key:'x',label:'X',vector:v(0),members:['a','b']};
 assert.throws(()=>compareLabelGrounding([a,a],[p]));assert.throws(()=>compareLabelGrounding([a,b],[{...p,members:['a','foreign']}]));
 assert.throws(()=>compareLabelGrounding([{...a,body:Array(384).fill(0)},b],[p]));
});
