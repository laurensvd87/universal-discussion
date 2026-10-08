import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePage, cosine, trainEncoder, SCHEMA } from './model.js';
import { encodeLearnedPage, LEARNED_SCHEMA } from './learned.js';
import artifact from './model.generated.json' with { type:'json' };

const base = Float32Array.from({length:384}, (_, i) => i === 0 ? 1 : 0);
const head = { schema:SCHEMA, lexicalShare:0.6, titleWeight:2, secondSentenceWeight:0.5 };

test('one page produces a finite unit vector without a pair input', () => {
  const document = { title:'Linden bridge repair approved',
    body:'The city approved Linden bridge repairs on Tuesday. Engineers will reinforce the eastern span. It is not a flood barrier project.' };
  const encoded = encodePage(document, base, head);
  assert.equal(encoded.length, 768);
  assert.ok(Math.abs(cosine(encoded, encoded) - 1) < 1e-5);
  assert.ok([...encoded].every(Number.isFinite));
  assert.deepEqual(encoded, encodePage(document, base, head));
});

test('invalid model, page, and vectors are rejected', () => {
  assert.throws(() => encodePage({title:'x',body:'y'}, base, {...head,lexicalShare:2}));
  assert.throws(() => encodePage({title:'',body:'y'}, base, head));
  assert.throws(() => encodePage({title:'x',body:'y'}, [NaN,...base.slice(1)], head));
});

test('training rejects family overlap', () => {
  const d = {id:'x',family:'same',topicLabel:'a',viewpoint:'first',title:'A',body:'A story.'};
  assert.throws(() => trainEncoder([d],new Map([['x',base]]),[d],new Map([['x',base]])), /Family leakage/);
});

test('frozen supervised projection returns one 384D unit vector', () => {
  assert.equal(artifact.schema, LEARNED_SCHEMA);
  assert.equal(artifact.trainingDigest.length,64);
  assert.equal(artifact.validationDigest.length,64);
  assert.equal(artifact.denseWeights.length+artifact.lexicalWeights.length,768);
  assert.ok(artifact.denseWeights.some((weight)=>Math.abs(weight-1)>1e-4));
  const vector=encodeLearnedPage({title:'Bridge repair approved',
    body:'The council approved repairs to the Linden bridge. Engineers will reinforce the span.'},base,artifact);
  assert.equal(vector.length,384);
  assert.ok(Math.abs(cosine(vector,vector)-1)<1e-5);
});
