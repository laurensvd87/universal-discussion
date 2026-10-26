import test from 'node:test';
import assert from 'node:assert/strict';
import {DEVELOPMENT_GRID,developmentNodeTruth,developmentFeatureAccepts,fitDevelopmentNodeCuts} from './development-fit.js';

const feature=(nodeId,similarity,rival=null)=>({nodeId,bestSimilarity:similarity,
  positiveSimilarities:[{groupId:'one',similarity},{groupId:'two',similarity:similarity===null?-1:similarity-.01}],
  negativeSimilarity:null,bestIncompatiblePositive:rival});
const cut={minSimilarity:.8,minRivalMargin:.01,minNegativeMargin:0,minSupport:1};
test('partial root truth never invents same-root child negatives',()=>{
  const r={completePath:null,expectedRootId:'games'};
  assert.equal(developmentNodeTruth(r,['games']),true);
  assert.equal(developmentNodeTruth(r,['games','gta']),null);
  assert.equal(developmentNodeTruth(r,['nature','koalas']),false);
  assert.equal(developmentNodeTruth({completePath:['games']},['games','gta']),false);
  assert.equal(developmentNodeTruth({completePath:[]},['games']),false);
});
test('cut support, strict negative and non-strict rival semantics',()=>{
  assert.equal(developmentFeatureAccepts(feature('games',.9,.8),cut),true);
  assert.equal(developmentFeatureAccepts(feature('games',null),cut),false);
  assert.equal(developmentFeatureAccepts(feature('games',.79),cut),false);
  assert.equal(developmentFeatureAccepts({...feature('games',.9),negativeSimilarity:.9},{...cut,minNegativeMargin:0}),false);
  assert.equal(developmentFeatureAccepts(feature('games',.9,.9),{...cut,minRivalMargin:0}),true);
  assert.equal(developmentFeatureAccepts(feature('games',.9,.9),cut),false);
  assert.equal(developmentFeatureAccepts(feature('games',.805),{...cut,minSupport:2}),false);
});
test('grid and tie-break are declared and deterministic',()=>{
  assert.equal(DEVELOPMENT_GRID.minSimilarity.length,15);assert.equal(DEVELOPMENT_GRID.minSimilarity.at(-1),.98);
  const rows=Array.from({length:3},(_,i)=>({groupId:`g${i}`,completePath:null,expectedRootId:'games',features:[feature('games',.9)]}));
  const r=fitDevelopmentNodeCuts({nodes:[{id:'games',parentId:null}],rows});
  assert.equal(r.policies[0].enabled,true);assert.equal(r.policies[0].minSimilarity,.9);
  assert.equal(r.policies[0].minRivalMargin,.05);assert.equal(r.policies[0].minNegativeMargin,.03);
  assert.equal(r.policies[0].minSupport,1);assert.equal(r.countedFeatureEvaluations,1620);
  assert.equal(r.independentValidation,false);
});
test('sparse groups disable a cut rather than certify one observation',()=>{
  const rows=Array.from({length:2},(_,i)=>({groupId:`g${i}`,completePath:['games'],features:[feature('games',.9)]}));
  const r=fitDevelopmentNodeCuts({nodes:[{id:'games',parentId:null}],rows});assert.equal(r.policies[0].enabled,false);
  assert.throws(()=>fitDevelopmentNodeCuts({nodes:[{id:'games',parentId:null}],rows:[rows[0],rows[0]]}));
});
test('development search refuses oversized Cartesian work before reading row features',()=>{
  const nodes=Array.from({length:512},(_,i)=>({id:`n${i}`,parentId:null}));
  const rows=Array(512).fill(null);
  assert.throws(()=>fitDevelopmentNodeCuts({nodes,rows}),/Development search capacity/u);
});
