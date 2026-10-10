import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha } from './core.js';

test('development freeze is content-free and binds the current source/calibration',async()=>{
  const {freezeHash,...freeze}=JSON.parse(await readFile(new URL('./freeze.json',import.meta.url),'utf8'));
  assert.equal(sha(JSON.stringify(freeze)),freezeHash);
  assert.equal(freeze.selected,'within-shrink-50');
  assert.equal(freeze.settings[freeze.selected].threshold,0);
  for(const [name,digest]of Object.entries(freeze.sourceSha256))assert.equal(sha(await readFile(new URL(`../../../../../${name}`,import.meta.url))),digest);
  assert.equal(Object.keys(freeze).some(key=>/vector|weights|parameters|articlesText|url/iu.test(key)),false);
});
