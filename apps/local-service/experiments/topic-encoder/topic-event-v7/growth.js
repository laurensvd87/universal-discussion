import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { matchEventV7 } from './matcher.js';

const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const same = Array.from({ length: 100 }, (_, i) => ({ id: `same${String(i).padStart(3, '0')}`,
  title: `Selva gate trial report ${i}`, url: `https://author${i}.test/article`,
  embedding: { values: vector(i * 0.002) } }));
const adjacent = Array.from({ length: 3 }, (_, i) => ({ id: `adjacent${i}`,
  title: `Selva battery inspection report ${i}`, url: `https://adjacent${i}.test/article`,
  embedding: { values: vector(0.5 + i * 0.002) } }));
const outliers = [0.54, 0.55].map((angle, i) => ({ id: `sameOutlier${i}`,
  title: `Selva gate trial dissenting report ${i}`, url: `https://outlier${i}.test/article`,
  embedding: { values: vector(angle) } }));
const facets = new Map([...same, ...adjacent, ...outliers].map(item => [item.id, {
  terms: new Set(item.id.startsWith('adjacent') ? ['selva', 'battery', 'inspection', 'report'] :
    ['selva', 'gate', 'trial', 'report']), products: new Map(),
  actions: new Set(item.id.startsWith('adjacent') ? ['recall'] : ['launch']) }]));
const output = {};
for (const count of [3, 7, 20, 100]) {
  const sources = [...same.slice(0, count), ...adjacent];
  const start = performance.now();
  const partitions = matchEventV7(sources, facets).partitions;
  output[count] = { sameGroups: partitions.filter(g => g.some(id => id.startsWith('same')))
    .map(g => g.filter(id => id.startsWith('same')).length),
    adjacentGroups: partitions.filter(g => g.some(id => id.startsWith('adjacent')))
      .map(g => g.filter(id => id.startsWith('adjacent')).length),
    mixed: partitions.some(g => g.some(id => id.startsWith('same')) &&
      g.some(id => id.startsWith('adjacent'))), ms: performance.now() - start };
  assert.deepEqual(output[count].sameGroups, [count]);
  assert.equal(output[count].mixed, false);
}
const partitions = matchEventV7([...same, ...adjacent, ...outliers], facets).partitions;
output.weakTrueOutlier = { sameGroups: partitions.filter(g => g.some(id => id.startsWith('same')))
  .map(g => g.filter(id => id.startsWith('same')).length),
  mixed: partitions.some(g => g.some(id => id.startsWith('same')) &&
    g.some(id => id.startsWith('adjacent'))) };
assert.deepEqual(output.weakTrueOutlier.sameGroups, [102]);
assert.equal(output.weakTrueOutlier.mixed, false);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
