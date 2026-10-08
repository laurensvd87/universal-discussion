import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { matchEventV5 } from './matcher.js';

const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const all = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `same${String(i).padStart(2, '0')}`,
    title: `Selva gate trial report ${i}`,
    embedding: { values: vector(i * 0.01) } })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `adjacent${i}`,
    title: `Selva battery inspection report ${i}`,
    embedding: { values: vector(0.5 + i * 0.01) } })),
].map(item => ({ ...item, url: `https://${item.id}.test/article` }));
const facets = new Map(all.map(item => [item.id, {
  terms: new Set(item.id.startsWith('same')
    ? ['selva', 'gate', 'trial', 'report'] : ['selva', 'battery', 'inspection', 'report']),
  products: new Map(),
  actions: new Set(item.id.startsWith('same') ? ['launch'] : ['recall']),
}]));
const idf = Object.assign(new Map(), { unknownWeight: 1 });
const output = {};
for (const count of [3, 7, 20]) {
  const selected = all.filter(item => item.id.startsWith('adjacent') ||
    Number(item.id.slice(4)) < count);
  const groups = matchEventV5(selected, facets, idf).partitions;
  output[count] = { sameGroups: groups.filter(group => group.some(id => id.startsWith('same')))
    .map(group => group.filter(id => id.startsWith('same')).length),
    mixed: groups.some(group => group.some(id => id.startsWith('same')) &&
      group.some(id => id.startsWith('adjacent'))) };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
