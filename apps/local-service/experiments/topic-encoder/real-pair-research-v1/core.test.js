import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCorpus } from '../real-event-eval/core.js';
import { view, features, makePairs, fit, scorePairs, admit } from './core.js';

const vector = (x, y) => Float32Array.from({ length: 384 }, (_, i) => i === 0 ? x : i === 1 ? y : 0);
const event = (description, category, titles) => ({ date: '2030-01-01', description, category,
  news: titles.map((title, i) => ({ lang_abbr: i ? 'fr' : 'en', title,
    article: `Invented context for ${title}.` })) });

test('features use only two Source views, and gold fields cannot influence them', () => {
  const a = { id: 'a', title: 'Atlas 42 launches', lead: 'Fictional market report' };
  const b = { id: 'b', title: 'Atlas 42 opens', lead: 'Fictional market update' };
  const first = features(view(a, vector(1, 0)), view(b, vector(.8, .6)));
  const poisoned = features(view({ ...a, eventKey: 'secret', category: 'secret', lang: 'xx' }, vector(1, 0)),
    view({ ...b, eventKey: 'other', category: 'other', lang: 'yy' }, vector(.8, .6)));
  assert.deepEqual(first, poisoned);
  assert.equal(first.length, 6);
  assert.ok(first[0] > .79 && first[0] < .81);
  assert.equal(first[4], 1);
  assert.throws(() => view(a, vector(0, 0)));
});

test('train-only precision margin rejects every train negative and validation reports counts', () => {
  const docs = parseCorpus(Buffer.from(JSON.stringify([
    event('Fictional ferry opening', 'transport', ['Copper ferry opens 42', 'Cuivre ferry 42']),
    event('Fictional ferry strike', 'transport', ['Copper ferry closes 43', 'Cuivre ferry 43']),
    event('Fictional museum opening', 'culture', ['Museum opens 18']),
  ]))).documents;
  const vectors = new Map(docs.map((d, i) => [d.id, i < 2 ? vector(1, 0) : i < 4 ? vector(.95, .3122499) : vector(0, 1)]));
  const pairs = makePairs(docs, vectors);
  const fitted = fit(pairs);
  assert.ok(fitted.threshold >= .95);
  assert.ok(pairs.filter(p => !p.same).every(p => !admit(fitted, p)));
  assert.equal(fitted.trainPositivePairs, 2);
  assert.ok(fitted.trainHardNegativePairs > 0);
  const counts = scorePairs(pairs, p => p.f[0] >= .94);
  assert.equal(counts.tp, 2);
  assert.ok(counts.fp > 0);
  assert.ok(counts.sameCategoryFp > 0);
  assert.equal(counts.crossLanguageTotal, 2);
  assert.equal(counts.crossLanguageTp, 2);
  assert.equal(JSON.stringify(counts).includes('Copper'), false);
});
