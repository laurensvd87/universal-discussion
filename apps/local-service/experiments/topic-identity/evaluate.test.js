import test from 'node:test';
import assert from 'node:assert/strict';
import { corpus } from './corpus.js';
import { validateCorpus, digest, inputFor, cosine, evaluate, sequential } from './evaluate.js';
const expectedDigest = '0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950';
test('frozen invented corpus and independent family split',()=>{
  assert.equal(digest(validateCorpus(corpus)),expectedDigest);
  assert.equal(corpus.documents.length,32);
  assert.throws(()=>validateCorpus({...corpus,documents:corpus.documents.slice(1)}));
  assert.throws(()=>validateCorpus({...corpus,split:{...corpus.split,heldOut:['bridge','energy','rail']}}));
});
test('title lead has one combined character bound and retains negation',()=>{
  const doc={title:'  A\nquestion  ',body:' not '.repeat(2000)};
  const input=inputFor(doc,'title-lead');
  assert.equal(input.length,4096); assert.ok(input.startsWith('A question not not'));
  assert.throws(()=>inputFor(doc,'unrecognized'));
});
test('topic labels score opposing claims together, never model inputs',()=>{
  const doc=corpus.documents.find(d=>d.id==='study-a2');
  assert.equal(doc.topicLabel,'maris-adult-trial');
  assert.ok(!inputFor(doc,'title-lead').includes(doc.topicLabel));
});
test('perfect independent topic vectors give perfect recall and no false joins',()=>{
  const labels=[...new Set(corpus.documents.map(d=>d.topicLabel))];
  const vectors=Object.fromEntries(corpus.documents.map(d=>[d.id,labels.map(label=>Number(d.topicLabel===label))]));
  const result=evaluate(corpus,vectors);
  assert.equal(result.heldOut.recallAt1,1); assert.equal(result.heldOut.overlap,false);
  assert.equal(result.heldOutSelected.falsePositives,0);
  for(const order of result.selectedSequential) { assert.equal(order.falseJoinedPairs,0); assert.equal(order.joinedPositivePairs,6); }
});
test('indistinguishable subjects expose overlap and fail closed under margin',()=>{
  const vectors=Object.fromEntries(corpus.documents.map(d=>[d.id,[1,0]]));
  const result=evaluate(corpus,vectors);
  assert.equal(result.selectedThreshold,null); assert.equal(result.heldOut.overlap,true);
  // A single candidate Topic cannot be rejected for competition that is not yet present.
  assert.ok(result.baselineSequential.some(order=>order.falseJoinedPairs>0));
});
test('nearest competing member vetoes a superficially eligible cluster',()=>{
  const docs=corpus.documents.slice(0,4);
  const vectors={};
  vectors[docs[0].id]=[1,0]; vectors[docs[1].id]=[0,1];
  vectors[docs[2].id]=[Math.SQRT1_2,Math.SQRT1_2]; vectors[docs[3].id]=[-1,0];
  const result=sequential({...corpus,documents:docs},vectors,['bridge'],0.7,0.04);
  assert.equal(result[0].topicCount,4);
  assert.throws(()=>cosine([1],[1,2]));
});
