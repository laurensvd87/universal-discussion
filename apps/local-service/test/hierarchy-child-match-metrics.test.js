import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeChildMatchRows} from '../harness/hierarchy-child-match-metrics.js';
test('unavailable pages and root abstentions stay separate from child correctness and hard negatives',()=>{
 const labels={'video-games':false,animals:false,koalas:false},r=summarizeChildMatchRows([
  {status:'unavailable',labels},
  {status:'scored',labels:{...labels,'video-games':true},expectedRootId:'games',rootPath:[],after:[]},
  {status:'scored',labels,expectedRootId:'nature',rootPath:['nature'],after:['nature','animals']},
  {status:'scored',labels:{...labels,animals:true,koalas:true},expectedRootId:'nature',rootPath:['nature'],after:['nature','animals','koalas']}
 ]);
 assert.equal(r.declared,4);assert.equal(r.scored,3);assert.equal(r.unavailable,1);assert.equal(r.rootAbstained,1);
 assert.equal(r.metrics['video-games'].knownPositive,1);assert.equal(r.metrics['video-games'].rootGatePositive,0);
 assert.equal(r.metrics.animals.acceptedPositive,1);assert.equal(r.metrics.animals.acceptedNegative,1);assert.equal(r.metrics.animals.insideParentNegative,1);
 assert.equal(r.metrics.koalas.acceptedPositive,1);assert.equal(r.metrics.koalas.insideParentNegative,0);
});
test('a nature-themed board game wrongly routed to Animals remains a false refinement outside the expected parent',()=>{
 const r=summarizeChildMatchRows([{status:'scored',labels:{'video-games':false,animals:false,koalas:false},expectedRootId:'games',rootPath:['nature'],after:['nature','animals']}]);
 assert.equal(r.rootCorrect,0);assert.equal(r.metrics.animals.insideParentNegative,0);assert.equal(r.metrics.animals.acceptedNegative,1);
 assert.equal(r.metrics['video-games'].insideParentNegative,1);assert.equal(r.metrics['video-games'].rootGateNegative,0);
});
