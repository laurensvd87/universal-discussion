import test from 'node:test';
import assert from 'node:assert/strict';
import {rankRootScores,fitPooledRootRankPolicy,compilePooledRootRankPolicy,classifyPooledRootRankPolicy,pooledRankWorkUpperBound} from './rank-policy.js';
const nodeIds=Array.from({length:16},(_,i)=>'root-'+String(i).padStart(2,'0'));
const scores=(winner,score=-.8,gap=.15)=>nodeIds.map(nodeId=>({nodeId,score:nodeId===winner?score:score-gap}));
const row=(i,patch={})=>({id:'case-'+i,groupId:'independent-'+i,expectedRootId:nodeIds[i%16],scores:scores(nodeIds[i%16]),...patch});
const input=rows=>({modelHash:'1'.repeat(64),representationHash:'2'.repeat(64),inputConstructionHash:'3'.repeat(64),nodeIds,rows});
const witness=s=>({modelHash:'1'.repeat(64),representationHash:'2'.repeat(64),inputConstructionHash:'3'.repeat(64),sourceId:'source',sourceVersion:'v1',scores:s});
test('unique negative-valued winner and exact ties abstain without probability claims',()=>{
  const r=rankRootScores({nodeIds,scores:scores(nodeIds[0])});assert.equal(r.winnerId,nodeIds[0]);assert(r.winnerScore<0);assert(r.winnerGap>0);
  const s=scores(nodeIds[0]);s[1].score=s[0].score;const t=rankRootScores({nodeIds,scores:s});assert.equal(t.winnerId,null);assert.equal(t.tied,true);
});
test('pooled observed cuts can accept reliable -.8 winners while excluding lower wrong ranks',()=>{
  const rows=Array.from({length:24},(_,i)=>row(i));
  rows.push(...Array.from({length:8},(_,i)=>row(24+i,{scores:scores(nodeIds[(25+i)%16],-.9,.1)})));
  const p=fitPooledRootRankPolicy(input(rows));assert.equal(p.enabled,true);assert.equal(p.acceptedGroups,24);assert.equal(p.correctGroups,24);
  assert.equal(p.minWinnerScore,-.8);const h=compilePooledRootRankPolicy(p);
  assert.equal(classifyPooledRootRankPolicy(h,witness(scores(nodeIds[0]))).selectedPath[0],nodeIds[0]);
  assert.deepEqual(classifyPooledRootRankPolicy(h,witness(scores(nodeIds[0],-.9,.1))).selectedPath,[]);
  const tied=scores(nodeIds[0]);tied[1].score=tied[0].score;assert.equal(classifyPooledRootRankPolicy(h,witness(tied)).reason,'rank-tie');
  assert.equal(p.perClassPrecisionGuaranteed,false);assert.equal(p.assignmentAuthority,false);
});
test('score/gap ties processed inclusively, cannot split an error from identical correct scores',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i));rows.push(row(20,{expectedRootId:nodeIds[1],scores:scores(nodeIds[0])}));
  const p=fitPooledRootRankPolicy(input(rows));assert.equal(p.enabled,false);assert.equal(p.acceptedGroups,0);
  assert.equal(fitPooledRootRankPolicy(input(Array.from({length:19},(_,i)=>row(i)))).enabled,false);
  assert.equal(fitPooledRootRankPolicy(input([])).enabled,false);
});
test('gap cut excludes higher-scoring wrong winners that score-only cuts cannot remove',()=>{
  const rows=Array.from({length:24},(_,i)=>row(i,{scores:scores(nodeIds[i%16],.5,.2)}));
  rows.push(...Array.from({length:8},(_,i)=>row(24+i,{scores:scores(nodeIds[(25+i)%16],.9,.05)})));
  const p=fitPooledRootRankPolicy(input(rows));assert.equal(p.acceptedGroups,24);assert.equal(p.minWinnerScore,.5);assert(Math.abs(p.minWinnerGap-.2)<1e-12);
  const h=compilePooledRootRankPolicy(p);assert.equal(classifyPooledRootRankPolicy(h,witness(scores(nodeIds[0],.9,.05))).selectedPath.length,0);
});
test('maximum coverage selected before conservative gap/score, permutation deterministic',()=>{
  const rows=Array.from({length:32},(_,i)=>row(i,{scores:scores(nodeIds[i%16],i<24?.8:.7,i<24?.3:.2)}));
  const p=fitPooledRootRankPolicy(input(rows));assert.equal(p.acceptedGroups,32);
  const reversed=rows.toReversed().map(r=>({...r,scores:r.scores.toReversed()}));assert.equal(fitPooledRootRankPolicy({...input(reversed),nodeIds:nodeIds.toReversed()}).policyHash,p.policyHash);
  assert(p.work.countedUnits<=p.work.preflightUpperBound);assert(p.work.preflightUpperBound<=1000000);
});
test('immutable private compile, model/representation/construction fence and hashes',()=>{
  const p=JSON.parse(JSON.stringify(fitPooledRootRankPolicy(input(Array.from({length:24},(_,i)=>row(i)))))),h=compilePooledRootRankPolicy(p);
  p.enabled=false;p.nodeIds[0]='changed';const r=classifyPooledRootRankPolicy(h,witness(scores(nodeIds[0])));assert(Object.isFrozen(r.selectedPath));assert.equal(r.selectedPath[0],nodeIds[0]);
  for(const key of ['modelHash','representationHash','inputConstructionHash'])assert.throws(()=>classifyPooledRootRankPolicy(h,{...witness(scores(nodeIds[0])),[key]:'4'.repeat(64)}));
  const q=JSON.parse(JSON.stringify(fitPooledRootRankPolicy(input(Array.from({length:24},(_,i)=>row(i))))));q.minWinnerGap=0;assert.throws(()=>compilePooledRootRankPolicy(q));
});
test('caps, duplicate origins, hostile shape/accessors and nonfinite scores rejected',()=>{
  assert.throws(()=>fitPooledRootRankPolicy(input(Array.from({length:49},(_,i)=>row(i)))));
  assert.throws(()=>pooledRankWorkUpperBound(49,16));assert.throws(()=>rankRootScores({nodeIds:Array(17).fill('x'),scores:[]}));
  const rows=[row(0),row(1,{groupId:'independent-0'})];assert.throws(()=>fitPooledRootRankPolicy(input(rows)));
  let called=false;const a=input([]);Object.defineProperty(a,'rows',{enumerable:true,get(){called=true;throw Error();}});assert.throws(()=>fitPooledRootRankPolicy(a));assert.equal(called,false);
  assert.throws(()=>fitPooledRootRankPolicy(new Proxy(input([]),{})));
  for(const bad of [NaN,Infinity,-Infinity]){const s=scores(nodeIds[0]);s[0].score=bad;assert.throws(()=>rankRootScores({nodeIds,scores:s}));}
  const sparse=scores(nodeIds[0]);delete sparse[1];assert.throws(()=>rankRootScores({nodeIds,scores:sparse}));
});
