import test from 'node:test'; import assert from 'node:assert/strict';
import {chooseTopicAncestor as choose} from './topic-ancestor-neighbors.js';
const input = neighbors => ({neighbors,minimumSimilarity:.8,ambiguityMargin:.015,ownerGrouping:{defaultMaxDepth:8,overrides:[]}});
const row = (sourceId,path,similarity) => ({sourceId,path,similarity});
const run = value => choose(JSON.stringify(value));
test('ambiguous sibling subjects resolve to their semantic ancestor instead of an arbitrary leaf', () => {
  const value = run(input([row('a',['games','gta','gta-v'],.92),row('b',['games','gta','gta-vi'],.915)]));
  assert.deepEqual(value.selectedPath,['games','gta']); assert.equal(value.reason,'shared-ancestor');
  assert.equal(value.scope.assignmentAuthority,false);
});
test('clearer nearest evidence reaches the leaf; conflicting senses in different roots abstain', () => {
  const a = input([row('a',['technology','dolphin-app'],.94),row('b',['nature','dolphin-animal'],.90)]);
  assert.deepEqual(run(a).selectedPath,['technology','dolphin-app']);
  a.neighbors[1].similarity = .935; assert.deepEqual(run(a).selectedPath,[]); assert.equal(run(a).reason,'different-roots');
});
test('owner-wide depth and deepest topic-specific override choose a prefix of supported evidence only', () => {
  const a = input([row('a',['nature','animals','mammals','koalas'],.94)]); a.ownerGrouping.defaultMaxDepth = 1;
  assert.deepEqual(run(a).selectedPath,['nature']);
  a.ownerGrouping.overrides = [{nodeId:'animals',maxDepth:4}];
  assert.deepEqual(run(a).selectedPath,['nature','animals','mammals','koalas']);
  a.ownerGrouping.overrides.push({nodeId:'mammals',maxDepth:3}); assert.deepEqual(run(a).selectedPath,['nature','animals','mammals']);
  assert.equal(run(a).reason,'owner-depth-cut');
});
test('one broad neighbor limits confidence, and repeated examples do not outvote a conflicting branch', () => {
  const a = input([row('a',['nature','animals'],.93),row('b',['nature','animals','koalas'],.935)]);
  assert.deepEqual(run(a).selectedPath,['nature','animals']);
  for (let i = 0; i < 20; i++) a.neighbors.push(row('copy'+i,['nature','animals','koalas'],.934));
  assert.deepEqual(run(a).selectedPath,['nature','animals']);
});
test('work bounds, fixed tree identity, unique Sources, minimum floor and finite scores are enforced', () => {
  for (const neighbors of [Array.from({length:129},(_,i)=>row('s'+i,['root'],.9)),
    [row('a',['r','leaf'],.9),row('b',['other','leaf'],.9)], [row('a',['r'],.9),row('a',['r'],.91)],
    [row('a',['r','r'],.9)], [row('a',['r'],null)]]) assert.throws(()=>run(input(neighbors)));
  const a = input([]); a.minimumSimilarity = .79; assert.throws(()=>run(a));
  assert.deepEqual(run(input([row('a',['root'],.799)])).selectedPath,[]);
});
