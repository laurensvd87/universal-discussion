import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { matchEventV7 } from './matcher.js';

const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const make = (id, angle, title, host = id) => ({ id, title,
  url: `https://${host}.test/story`, embedding: { values: vector(angle) } });
const originals = [make('a', 0, 'Selva gate trial reported'),
  make('b', 0.02, 'Selva gate trial examined'),
  make('c', 0.04, 'Selva gate trial disputed')];
const copies = [make('copy1', 0.001, originals[0].title),
  make('copy2', 0.002, originals[0].title),
  make('sameHost', 0.003, 'Selva gate trial syndicated', 'a')];
const rivals = [make('x', 0.5, 'Selva battery inspection reported'),
  make('y', 0.52, 'Selva battery inspection examined')];
const all = [...originals, ...copies, ...rivals];
const facets = new Map(all.map(item => [item.id, {
  terms: new Set(item.id === 'x' || item.id === 'y' ?
    ['selva', 'battery', 'inspection'] : ['selva', 'gate', 'trial']),
  products: new Map(), actions: new Set(item.id === 'x' || item.id === 'y' ?
    ['recall'] : ['launch']) }]));
const result = matchEventV7(all, facets);
assert.deepEqual(matchEventV7([...all].reverse(), facets).partitions, result.partitions);
assert.ok(result.partitions.some(group => originals.every(item => group.includes(item.id))));
assert.ok(result.partitions.every(group => !group.some(id => id === 'x' || id === 'y') ||
  !group.some(id => id === 'a' || id === 'b' || id === 'c')));
const onlyCopies = matchEventV7(copies.slice(0, 2), facets);
assert.deepEqual(onlyCopies.partitions, [['copy1'], ['copy2']]);
assert.throws(() => matchEventV7([all[0], all[0]], facets), /Duplicate Source ID/u);
process.stdout.write('v7 focused checks passed\n');
