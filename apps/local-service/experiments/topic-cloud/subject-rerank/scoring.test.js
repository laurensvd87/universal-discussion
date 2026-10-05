import test from 'node:test';
import assert from 'node:assert/strict';
import { titleTerms, titleCues, scorePair, evaluate } from './scoring.js';

test('negations, numbers and months survive tokenization', () => {
  assert.deepEqual(titleTerms('Not May 2026: no Route 7 closure'), ['not','may','2026','no','route','7','closure']);
  assert.equal(titleCues('May Route 7 vote', 'July Route 7 vote').conflict, 1);
  assert.equal(titleCues('May vote', 'July vote').conflict, 1);
  assert.equal(titleCues('Slate 2 battery', 'Slate 3 battery').conflict, 1);
  assert.ok(titleCues('no toll', 'no toll').lexical > titleCues('no toll', 'toll').lexical);
});
test('fixed variants preserve body score and deterministic lexical adjustment', () => {
  assert.equal(scorePair(0.9, 'June Vale flood', 'August Vale flood', 'body'), 0.9);
  assert.ok(scorePair(0.9, 'June Vale flood', 'June Vale flood', 'title05') > 0.9);
  assert.ok(scorePair(0.9, 'June Vale flood', 'August Vale flood', 'title05') < 0.9);
  assert.throws(() => scorePair(0.9, 'x','y','tuned'));
});
test('ranking is stable under input order and report contains no text or vectors', () => {
  const documents = [
    { id:'a', family:'x', topicLabel:'same', title:'June Vale flood' },
    { id:'b', family:'x', topicLabel:'same', title:'June Vale flood criticized' },
    { id:'c', family:'x', topicLabel:'other', title:'August Vale flood' },
    { id:'d', family:'x', topicLabel:'other', title:'August Vale flood criticized' },
  ];
  const corpus = { documents, split:{development:['x'],heldOut:[]} };
  const similarities = { 'a|b':0.9, 'a|c':0.95, 'a|d':0.8, 'b|c':0.8, 'b|d':0.7, 'c|d':0.9 };
  const first = evaluate(corpus, similarities);
  const second = evaluate({...corpus,documents:[...documents].reverse()}, similarities);
  const byId = rows => [...rows].sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(byId(first.title05.development.ranks), byId(second.title05.development.ranks));
  assert.ok(!JSON.stringify(first).includes('Vale'));
  assert.ok(!JSON.stringify(first).includes('0.95'));
});
