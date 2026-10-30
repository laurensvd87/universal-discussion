import test from 'node:test'; import assert from 'node:assert/strict';
import {chooseLabelledTopicAncestor as choose} from './topic-labelled-neighbors.js';
const row = (sourceId,path,similarity) => ({sourceId,path,similarity});
function input(title,neighbors,aliases) { return {neighbors,minimumSimilarity:.8,ambiguityMargin:.015,
  ownerGrouping:{defaultMaxDepth:8,overrides:[]},queryTitle:title,acceptedRootId:null,
  aliases:Object.entries(aliases).map(([nodeId,labels])=>({nodeId,labels}))}; }
const run = value => choose(JSON.stringify(value));
test('a named engine can fall back to its established language while a different engine cannot become its subject', () => {
  const a = input('V8 (JavaScript engine)',[row('a',['domain:technology','topic:javascript','topic:rhino'],.94)],
    {'topic:javascript':['JavaScript'],'topic:rhino':['Rhino']});
  assert.deepEqual(run(a).selectedPath,['domain:technology','topic:javascript']);
});
test('a person surname or troupe component does not become an unrelated single-word subject', () => {
  for (const [title,name] of [['Glen Coffee','Coffee'],['RAFAEL Python','Python'],['Monty Python','Python']]) {
    const a = input(title,[row('a',['domain:technology','topic:wrong'],.95)],{'topic:wrong':[name]});
    assert.deepEqual(run(a).selectedPath,['domain:technology']);
  }
});
test('full names, Unicode aliases and punctuation retain boundaries rather than substring equality', () => {
  for (const [title,alias] of [['The Python Tutorial','Python'],['Monty Python news','Monty Python'],['Ｃ＋＋ guide','C++'],['Delfine','Delfine']]) {
    const a = input(title,[row('a',['domain:technology','topic:chosen'],.94)],{'topic:chosen':[alias]});
    assert.deepEqual(run(a).selectedPath,['domain:technology','topic:chosen']);
  }
  const a = input('JavaScript',[row('a',['domain:technology','topic:chosen'],.94)],{'topic:chosen':['Java']});
  assert.deepEqual(run(a).selectedPath,['domain:technology']);
});
test('a trusted compatible coarse root permits nonfocal aliases but an incompatible root is removed', () => {
  const a = input('KIP KAPSALON (met friet)',[row('a',['domain:cooking','topic:kapsalon'],.94),row('b',['domain:beauty','topic:salon'],.93)],
    {'topic:kapsalon':['Kapsalon'],'topic:salon':['Kapsalon']}); a.acceptedRootId = 'domain:cooking';
  assert.deepEqual(run(a).selectedPath,['domain:cooking','topic:kapsalon']);
});
test('ambiguity still coarsens and owner controls cannot extend beyond label-supported evidence', () => {
  const a = input('Dolphin',[row('a',['domain:technology','topic:software'],.94),row('b',['domain:nature','topic:animal'],.935)],
    {'topic:software':['Dolphin'],'topic:animal':['Dolphin']}); assert.deepEqual(run(a).selectedPath,[]);
  a.neighbors.pop(); a.ownerGrouping.defaultMaxDepth = 1;
  assert.deepEqual(run(a).selectedPath,['domain:technology']); assert.equal(run(a).scope.assignmentAuthority,false);
});
