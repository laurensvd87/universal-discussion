import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { performance } from 'node:perf_hooks';
import { ExactCosineIndex, bruteForce } from './index.js';

const dimensions = 384;
function vector(angle) {
  const values = Array(dimensions).fill(0);
  values[0] = Math.cos(angle);
  values[1] = Math.sin(angle);
  return values;
}
function corpus(size) {
  return Array.from({ length: size }, (_, i) => {
    const fraction = i / size;
    const angle = fraction < 0.6 ? (i % 601) / 6000
      : fraction < 0.8 ? 0.32 + (i % 199) / 3000
        : 0.9 + (i % 193) / 120;
    return { id: `s${String(i).padStart(5, '0')}`, vector: vector(angle) };
  });
}
for (const size of [100, 1000, 5000]) {
  const sources = corpus(size), query = vector(0.05);
  const memoryStart = process.memoryUsage().heapUsed;
  let start = performance.now();
  const index = new ExactCosineIndex(sources);
  const buildMs = performance.now() - start;
  const heapDeltaMiB = (process.memoryUsage().heapUsed - memoryStart) / 2 ** 20;
  start = performance.now();
  const cursor = index.search(query);
  const ranked = [];
  while (ranked.length < Math.min(150, size)) {
    const batch = cursor.nextBatch(16);
    ranked.push(...batch.items);
    if (batch.status === 'complete') break;
  }
  const indexedMs = performance.now() - start;
  start = performance.now();
  const brute = bruteForce(sources, query);
  const bruteMs = performance.now() - start;
  const sameOrder = ranked.every((item, i) => item.id === brute[i].id);
  process.stdout.write(`${JSON.stringify({ size, dimensions, buildMs: +buildMs.toFixed(2),
    indexedTop150Ms: +indexedMs.toFixed(2), bruteForceAllMs: +bruteMs.toFixed(2),
    heapDeltaMiB: +heapDeltaMiB.toFixed(2), exactScores: cursor.work.exactScores,
    nodeBounds: cursor.work.nodeBounds, sameOrder })}\n`);
}
