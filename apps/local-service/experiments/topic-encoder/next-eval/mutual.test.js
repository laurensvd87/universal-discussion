import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mutualMarginPairs, strictValidationMargin, evaluateMutualMargin } from './mutual.js';

const docs = [
  { id:'a', topicLabel:'same' }, { id:'b', topicLabel:'same' },
  { id:'c', topicLabel:'other' }, { id:'d', topicLabel:'fourth' },
];
const vectors = new Map([
  ['a', Float32Array.of(1,0)], ['b', Float32Array.of(.98,.2)],
  ['c', Float32Array.of(0,1)], ['d', Float32Array.of(.2,.98)],
]);

test('mutual neighbors nominate positives and false near-neighbors but validation gates the latter', () => {
  const candidates = mutualMarginPairs(docs,vectors);
  assert.equal(candidates.length,2);
  assert.equal(candidates.filter(p=>p.positive).length,1);
  const threshold = strictValidationMargin(docs,vectors);
  const evaluated = evaluateMutualMargin(docs,vectors,threshold);
  assert.equal(evaluated.falseJoins,0);
});

test('bad or missing vectors fail closed', () => {
  assert.throws(()=>mutualMarginPairs(docs,new Map()));
  assert.throws(()=>mutualMarginPairs(docs.slice(0,3),new Map([['a',[1,0]],['b',[0,1]],['c',[1,0,0]]])));
});
