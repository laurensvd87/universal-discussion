import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { performance } from 'node:perf_hooks';
import { matchEventV6 } from './matcher.js';

const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const all = [
  ...Array.from({ length: 100 }, (_, i) => ({ id: `same${String(i).padStart(3, '0')}`,
    title: `Selva gate trial report ${i}`,
    embedding: { values: vector(i * 0.002) } })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `adjacent${i}`,
    title: `Selva battery inspection report ${i}`,
    embedding: { values: vector(0.5 + i * 0.002) } })),
].map(item => ({ ...item, url: `https://${item.id}.test/article` }));
const facets = new Map(all.map(item => [item.id, {
  terms: new Set(item.id.startsWith('same')
    ? ['selva', 'gate', 'trial', 'report'] : ['selva', 'battery', 'inspection', 'report']),
  products: new Map(),
  actions: new Set(item.id.startsWith('same') ? ['launch'] : ['recall']),
}]));
const output = {};
for (const count of [3, 7, 20, 100]) {
  const selected = all.filter(item => item.id.startsWith('adjacent') ||
    Number(item.id.slice(4)) < count);
  const started = performance.now();
  const matched = matchEventV6(selected, facets);
  output[count] = { sameGroups: matched.partitions.filter(group =>
    group.some(id => id.startsWith('same'))).map(group =>
    group.filter(id => id.startsWith('same')).length),
  mixed: matched.partitions.some(group => group.some(id => id.startsWith('same')) &&
    group.some(id => id.startsWith('adjacent'))),
  maxExemplars: Math.max(...matched.exemplarCounts),
  matchingMs: performance.now() - started };
}
const outliers = [0.54, 0.55].map((angle, i) => ({
  id: `sameOutlier${i}`, title: `Selva gate trial dissenting report ${i}`,
  url: `https://outlier${i}.test/article`, embedding: { values: vector(angle) },
}));
for (const item of outliers) facets.set(item.id, {
  terms: new Set(['selva', 'gate', 'trial', 'report']), products: new Map(),
  actions: new Set(['launch']),
});
const withOutlier = matchEventV6([...all, ...outliers], facets);
output.weakTrueOutlier = {
  sameGroups: withOutlier.partitions.filter(group =>
    group.some(id => id.startsWith('same'))).map(group =>
    group.filter(id => id.startsWith('same')).length),
  mixed: withOutlier.partitions.some(group =>
    group.some(id => id.startsWith('same')) && group.some(id => id.startsWith('adjacent'))),
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
