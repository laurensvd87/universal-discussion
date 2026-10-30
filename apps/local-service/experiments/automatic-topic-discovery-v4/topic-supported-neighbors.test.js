import test from 'node:test'; import assert from 'node:assert/strict';
import {chooseSupportedTopicAncestor as choose} from './topic-supported-neighbors.js';
const run = (neighbors,ownerGrouping = {defaultMaxDepth:8,overrides:[]}) => choose(JSON.stringify({
  neighbors,minimumSimilarity:.8,ambiguityMargin:.015,ownerGrouping}));
const row = (sourceId,path,similarity) => ({sourceId,path,similarity});
test('one neighboring engine cannot overrule a sufficiently supported common language', () => {
  const result = run([row('a',['technology','javascript','rhino'],.95),row('b',['technology','javascript','jsc'],.90)]);
  assert.deepEqual(result.selectedPath,['technology','javascript']); assert.equal(result.supportPrunedNeighbors,2);
});
test('an established child remains available while a niche sibling falls back to their parent', () => {
  const neighbors = [row('a',['nature','animals','koalas'],.95),row('b',['nature','animals','koalas'],.94),
    row('c',['nature','animals','wombats'],.85)];
  assert.deepEqual(run(neighbors).selectedPath,['nature','animals','koalas']);
  neighbors[2].similarity = .949; assert.deepEqual(run(neighbors).selectedPath,['nature','animals']);
});
test('unsupported single roots abstain, and Source count does not bypass parent consistency or unique identities', () => {
  assert.deepEqual(run([row('a',['nature','animals'],.95)]).selectedPath,[]);
  assert.throws(()=>run([row('a',['r','leaf'],.9),row('b',['other','leaf'],.91)]));
  assert.throws(()=>run([row('a',['r'],.9),row('a',['r'],.91)]));
});
test('owner override still cannot invent evidence; its cap remains applied after support pruning', () => {
  const neighbors = [row('a',['nature','animals','koalas'],.95),row('b',['nature','animals','wombats'],.94)];
  const result = run(neighbors,{defaultMaxDepth:1,overrides:[{nodeId:'animals',maxDepth:4}]});
  assert.deepEqual(result.selectedPath,['nature','animals']); assert.equal(result.scope.assignmentAuthority,false);
});
