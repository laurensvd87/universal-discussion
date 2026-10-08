import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTopicDocumentsV3 } from './matcher-v3.js';

const page = (id, title, angle) => ({ id, title, url: `https://${id}.example.test/story`,
  embedding: { values: [Math.cos(angle), Math.sin(angle)] } });
const groups = pages => matchTopicDocumentsV3(pages).partitions.map(part => part.sourceIds);

test('a stronger cosine neighbor about another dated action triggers local ambiguity abstention', () => {
  const near = Math.acos(0.90963);
  const wrong = near + Math.acos(0.914);
  const pages = [page('a', 'Leader announces reciprocal tariffs on April 2', 0),
    page('b', 'Leader promises relief in tariff announcement', near),
    page('c', 'Tariff exemptions announced on April 9', wrong)];
  const result = matchTopicDocumentsV3(pages);
  assert.deepEqual(result.partitions.map(part => part.sourceIds), [['a'], ['b'], ['c']]);
  assert.ok(result.relatedEdges.some(edge => edge.sourceIds.includes('c')));
});

test('shared brand and model alone do not join distinct actions', () => {
  const pages = [page('a', 'Cobalt Q8 charging port inspections begin', 0),
    page('b', 'Cobalt Q8 navigation maps freeze during update', 0.1)];
  assert.deepEqual(groups(pages), [['a'], ['b']]);
});

test('explicit conflicting models block an otherwise matching title pair', () => {
  const pages = [page('a', 'Cobalt Q8 tracking update reaches owners', 0),
    page('b', 'Cobalt Q9 tracking update reaches owners', 0.1)];
  assert.deepEqual(groups(pages), [['a'], ['b']]);
});

test('direct event cues can join two viewpoints and input order is stable', () => {
  const pages = [page('a', 'Cobalt Q8 lens coating repair urged', 0),
    page('b', 'Cobalt Q8 lens coating repair questioned', 0.2)];
  assert.deepEqual(groups(pages), [['a', 'b']]);
  assert.deepEqual(groups([...pages].reverse()), [['a', 'b']]);
});

test('unsupported language cues abstain even with a high cosine', () => {
  const pages = [page('a', 'Nueva decisión sobre el puerto', 0),
    page('b', 'Bericht über eine neue Entscheidung', 0.05)];
  assert.deepEqual(groups(pages), [['a'], ['b']]);
});
