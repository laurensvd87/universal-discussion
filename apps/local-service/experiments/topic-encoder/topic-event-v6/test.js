import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { matchEventV6 } from './matcher.js';

const vector = region => {
  const values = Array(384).fill(0);
  values[0] = Math.sqrt(0.91);
  values[region + 1] = Math.sqrt(0.09);
  return values;
};
const build = (id, region, title, host = id) => ({
  id, title, url: `https://${host}.test/story`, embedding: { values: vector(region) },
});
const pages = Array.from({ length: 6 }, (_, i) => build(`p${i}`, Math.floor(i / 2),
  `Selva gate trial perspective ${i}`));
const facets = new Map(pages.map(page => [page.id, {
  terms: new Set(['selva', 'gate', 'trial']), products: new Map(),
  actions: new Set(['launch']),
}]));
const result = matchEventV6(pages, facets);
assert.equal(result.partitions.length, 6, 'without a supported seed, remain related');
assert.deepEqual(matchEventV6([...pages].reverse(), facets).partitions, result.partitions);
const seeded = matchEventV6(pages, facets, { seedPartitions: [pages.map(page => page.id)] });
assert.ok(seeded.exemplarCounts[0] >= 3, 'semantic cover should grow by region');

// Same-publisher articles may represent different evidence regions; exact
// syndicated headlines on different hosts do not create new exemplars.
const sameHost = pages.map(page => ({ ...page, url: 'https://one-publisher.test/story' }));
assert.ok(matchEventV6(sameHost, facets,
  { seedPartitions: [pages.map(page => page.id)] }).exemplarCounts[0] >= 3);
const copies = pages.map(page => ({ ...page, title: 'Selva gate trial wire copy' }));
assert.equal(matchEventV6(copies, facets,
  { seedPartitions: [pages.map(page => page.id)] }).exemplarCounts[0], 1);

const nearby = [build('near0', 3, 'Selva battery inspection 0'),
  build('near1', 3, 'Selva battery inspection 1'),
  build('near2', 3, 'Selva battery inspection 2')];
for (const page of nearby) facets.set(page.id, {
  terms: new Set(['selva', 'battery', 'inspection']), products: new Map(),
  actions: new Set(['recall']),
});
const withNearby = matchEventV6([...pages, ...nearby], facets);
assert.ok(withNearby.partitions.every(group =>
  !group.some(id => id.startsWith('p')) || !group.some(id => id.startsWith('near'))));
process.stdout.write('v6 focused checks passed\n');
