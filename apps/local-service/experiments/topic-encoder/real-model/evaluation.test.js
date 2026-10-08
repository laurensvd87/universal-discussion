import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strictValidationThreshold, evaluateLabeled } from './evaluation.js';

const docs=[
  {id:'a1',family:'x',topicLabel:'a',viewpoint:'report'},
  {id:'a2',family:'x',topicLabel:'a',viewpoint:'critique'},
  {id:'b1',family:'x',topicLabel:'b',viewpoint:'report'},
  {id:'b2',family:'x',topicLabel:'b',viewpoint:'critique'},
  {id:'c1',family:'x',topicLabel:'c'},
  {id:'d1',family:'y',topicLabel:'d'},
];
const unit=(x,y)=>{
  const norm=Math.hypot(x,y);
  return [x/norm,y/norm];
};
const vectors=new Map([
  ['a1',unit(1,0)],['a2',unit(.99,.1)],
  ['b1',unit(0,1)],['b2',unit(.1,.99)],
  ['c1',unit(-1,0)],['d1',unit(0,-1)],
]);

test('strict cutoff comes from validation negatives only',()=>{
  const selected=strictValidationThreshold(docs,vectors);
  assert.ok(selected.threshold>selected.maximumNegative);
  assert.equal(selected.validationPositivePairs,2);
  const result=evaluateLabeled(docs,vectors,selected.threshold);
  assert.equal(result.matchedQueries,4);
  assert.equal(result.top1,4);
  assert.equal(result.crossViewQueries,4);
  assert.equal(result.crossViewTop1,4);
  assert.equal(result.singletonQueries,2);
  assert.equal(result.singletonAbstentions,2);
  assert.equal(result.falsePairsAccepted,0);
  assert.ok(result.hardNegativePairs>0);
});

test('duplicate IDs and missing vectors are rejected',()=>{
  assert.throws(()=>strictValidationThreshold([docs[0],docs[0],...docs.slice(2)],vectors));
  assert.throws(()=>evaluateLabeled(docs,new Map(),.9));
});
