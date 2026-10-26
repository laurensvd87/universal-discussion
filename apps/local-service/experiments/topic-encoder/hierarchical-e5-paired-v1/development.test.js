import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFeatures } from './development.js';

const nodes=[{id:'alpha',parentId:null},{id:'beta',parentId:null},{id:'child',parentId:'alpha'}];
test('development root rankers differ explicitly and report ranking paths, not assignments',()=>{
  const result=summarizeFeatures([
    {nodeId:'alpha',directScore:.6,subtreeScore:.95},
    {nodeId:'beta',directScore:.8,subtreeScore:.8},
    {nodeId:'child',directScore:.95,subtreeScore:.95}],nodes);
  assert.equal(result['direct-descriptor'].topRoots[0].nodeId,'beta');
  assert.deepEqual(result['direct-descriptor'].forcedRankingPathNotAssignment,['beta']);
  assert.equal(result['descendant-union'].topRoots[0].nodeId,'alpha');
  assert.deepEqual(result['descendant-union'].forcedRankingPathNotAssignment,['alpha','child']);
  assert.equal('primaryNodeId' in result,false);
  assert.equal('confidence' in result,false);
});
test('development tied roots retain a zero margin and stable lexical order, never confidence',()=>{
  const rows=[{nodeId:'beta',directScore:-.2,subtreeScore:-.2},
    {nodeId:'child',directScore:-.4,subtreeScore:-.4},
    {nodeId:'alpha',directScore:-.2,subtreeScore:-.2}];
  const first=summarizeFeatures(rows,nodes),second=summarizeFeatures([...rows].reverse(),[...nodes].reverse());
  assert.deepEqual(first,second);
  assert.equal(first['descendant-union'].rootMargin,0);
  assert.equal(first['descendant-union'].topRoots[0].nodeId,'alpha');
});
