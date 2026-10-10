import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { planAlternateTopics } from '../../../src/domain/alternate-topic-planner.js';
import { planIndexedAlternateTopics } from '../../../src/domain/alternate-topic-planner-indexed.js';

const random = seed => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
  value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};
const normalized = values => { const norm = Math.hypot(...values); return values.map(value => value / norm); };
function fixture(count, shape) {
  const draw = random(918);
  const sources = Array.from({ length: count }, (_, i) => {
    const values = Array(384).fill(0);
    if (shape === 'unrelated') for (let d = 0; d < 384; d++) values[d] = draw() - 0.5;
    else if (shape === 'clusters') {
      values[Math.floor(i / 20) % 256] = 1;
      for (let d = 256; d < 384; d++) values[d] = (draw() - 0.5) * 0.012;
    } else {
      values[0] = 1;
      if (shape !== 'duplicates') for (let d = 1; d < 9; d++) values[d] = (draw() - 0.5) * 0.02;
    }
    return { id: `s${String(i).padStart(6, '0')}`, provenance: 'owner-local-page-embedding/v1',
      extractorVersion: 'main-text-prefix/v1', embedding: {
        modelId: 'e5-small-q8-browser-main-prefix-v1', values: normalized(values),
      } };
  });
  return { sources, sourceLinks: sources.map(source => ({ sourceId: source.id, method: 'learned-provisional' })) };
}

const cases = process.argv.slice(2);
const requests = cases.length ? cases : ['legacy:1000:unrelated', 'indexed:1000:unrelated',
  'indexed:5000:unrelated', 'indexed:1000:clusters', 'indexed:5000:clusters',
  'legacy:1000:cloud', 'indexed:1000:cloud', 'indexed:5000:duplicates'];
for (const request of requests) {
  const [planner, rawCount, shape] = request.split(':');
  const count = Number(rawCount);
  if (!['legacy', 'indexed'].includes(planner) || !Number.isSafeInteger(count) || count < 1 ||
      !['unrelated', 'clusters', 'cloud', 'duplicates'].includes(shape)) throw new TypeError('Invalid case');
  const data = fixture(count, shape);
  globalThis.gc?.();
  const before = process.memoryUsage(), start = performance.now();
  let result, error;
  try {
    result = planner === 'legacy' ? planAlternateTopics(data) : planIndexedAlternateTopics(data);
    const ids = result.partitions.flatMap(part => part.sourceIds);
    assert.equal(ids.length, count);
    assert.equal(new Set(ids).size, count);
    assert.deepEqual([...ids].sort(), data.sources.map(source => source.id).sort());
    assert.equal(result.partitions.length, shape === 'unrelated' ? count :
      shape === 'clusters' ? Math.ceil(count / 20) : 1);
    if (shape === 'clusters') for (const partition of result.partitions) {
      assert.equal(new Set(partition.sourceIds.map(id => Math.floor(Number(id.slice(1)) / 20))).size, 1);
    }
  }
  catch (failure) {
    error = { name: failure.name, code: failure.code, message: failure.message };
    result = undefined;
    if (failure.code !== 'capacity') process.exitCode = 1;
  }
  const after = process.memoryUsage();
  console.log(JSON.stringify({ request, elapsedMs: Math.round(performance.now() - start),
    extraRssMiB: Math.round((after.rss - before.rss) / 1048576 * 10) / 10,
    extraHeapMiB: Math.round((after.heapUsed - before.heapUsed) / 1048576 * 10) / 10,
    extraArrayBuffersMiB: Math.round((after.arrayBuffers - before.arrayBuffers) / 1048576 * 10) / 10,
    partitions: result?.partitions.length, largest: result ? Math.max(...result.partitions.map(part => part.sourceIds.length)) : undefined,
    diagnostics: result?.diagnostics, error }));
}
