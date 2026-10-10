import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyDiagonalAdapter, loadDiagonalAdapter, makeDiagonalAdapter,
  readDiagonalAdapter } from './diagonal-adapter.js';

const parameters = () => Array(384).fill(0);
const unit = () => Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);

test('strict manifest hash, model identity, and bounded 384 coordinates', () => {
  const manifest = makeDiagonalAdapter(parameters(), { triplets: 200 });
  assert.deepEqual(readDiagonalAdapter(manifest).parameters, parameters());
  for (const variant of [
    { ...manifest, modelId: 'other-model' },
    { ...manifest, manifestSha256: '0'.repeat(64) },
    { ...manifest, parameters: [...parameters().slice(1)] },
    { ...manifest, parameters: [0.51, ...parameters().slice(1)] },
    { ...manifest, parameters: [Infinity, ...parameters().slice(1)] },
    { ...manifest, extra: true },
  ]) assert.throws(() => readDiagonalAdapter(variant), TypeError);
});

test('transform normalizes and leaves browser E5 vector untouched', () => {
  const factors = parameters(); factors[0] = 0.5;
  const manifest = makeDiagonalAdapter(factors, { triplets: 200 });
  const input = Array(384).fill(0); input[0] = input[1] = Math.SQRT1_2;
  const snapshot = [...input];
  const adapted = applyDiagonalAdapter(input, manifest);
  assert.deepEqual(input, snapshot);
  assert.ok(Math.abs(Math.hypot(...adapted) - 1) < 1e-12);
  assert.ok(adapted[0] > adapted[1]);
  assert.throws(() => applyDiagonalAdapter(input.map(value => value * 2), manifest), TypeError);
  assert.deepEqual(applyDiagonalAdapter(unit(), makeDiagonalAdapter(parameters(), { triplets: 200 })), unit());
});

test('loader rejects changed and oversized local files', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'udl-adapter-test-'));
  try {
    const filename = path.join(folder, 'adapter.json');
    const manifest = makeDiagonalAdapter(parameters(), { triplets: 200 });
    await writeFile(filename, `${JSON.stringify(manifest)}\n`);
    assert.equal((await loadDiagonalAdapter(filename)).manifestSha256, manifest.manifestSha256);
    await writeFile(filename, JSON.stringify({ ...manifest, parameters: [1, ...parameters().slice(1)] }));
    await assert.rejects(loadDiagonalAdapter(filename), TypeError);
    await writeFile(filename, 'x'.repeat(20_000));
    await assert.rejects(loadDiagonalAdapter(filename), TypeError);
  } finally {
    assert.equal(path.dirname(path.resolve(folder)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('udl-adapter-test-'));
    await rm(folder, { recursive: true, force: true });
  }
});
