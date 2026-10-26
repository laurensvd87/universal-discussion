// V2 changes capture construction only. Original gold/model/policy loader stays pinned.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

export const BASELINE_SOURCE_HASHES = Object.freeze({
  '../hierarchical-e5-real-root-v1/manifest.js': '2a07fb2628ddd4fdbaa855d34290bd04835660333d3d1eb6d09c80a82b1c384e',
  '../hierarchical-e5-real-root-v1/assessment.js': '8891055b201286e4f01dd630703c0c6d36cb765f4862dff8b164073e294605b2',
});
export const GOLD_FILES = Object.freeze({
  '../../../data/hierarchy-real-root-training-gold-adr136.json': '62ff96d3b98d197c4c90ea2db7f5a9adb7615bf8e18fce7f66c3c1681b1f53e8',
  '../../../data/hierarchy-real-root-calibration-gold-adr136.json': '8b755d8ae214de78f51005f547cb074655382cd2fb0fc0cf99b8f2e9bba76cfc',
  '../../../data/hierarchy-curated-web-gold-adr134.json': '4119a66986e9d73fd564eb83637ba92f7c5305c316037b7c609b27ca78488933',
  '../../../data/hierarchy-real-root-test-supplement-adr136.json': '76cd1484c84e6305e1b2cd283d389eb6d1f8c9fdfbb86e72d31cb04d8067bd86',
});
async function original() {
  for (const [name, expected] of Object.entries(BASELINE_SOURCE_HASHES)) {
    const url = new URL(name, import.meta.url), stat = await lstat(url);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 8 * 1024 * 1024);
    const bytes = await readFile(url); assert.equal(bytes.length, stat.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, 'Frozen v1 dependency changed');
  }
  const module = await import('../hierarchical-e5-real-root-v1/manifest.js');
  assert.deepEqual(module.GOLD_FILES, GOLD_FILES);
  return module;
}
export async function loadGoldManifest() { return (await original()).loadGoldManifest(); }
export async function loadManifest() {
  const manifest = await (await original()).loadManifest();
  return Object.freeze({ ...manifest, sourceHashes: Object.freeze({ ...manifest.sourceHashes, ...BASELINE_SOURCE_HASHES }) });
}
