import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspect, loadLocalCorpus, privateRoot, validate, MAX_PAIRS } from './core.js';

const iso = ms => new Date(ms).toISOString();
function fixture(t, now = Date.parse('2026-10-09T12:00:00.000Z')) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rights-corpus-test-'));
  fs.mkdirSync(path.join(root, 'raw'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const content = 'Fictional test record with no source article text. '.repeat(3);
  const bytes = Buffer.from(content);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  function item(id, host) {
    fs.writeFileSync(path.join(root, 'raw', `${id}.txt`), bytes);
    return {
      id, url: `https://${host}/fictional-test-${id}`, publisher: 'Fixture publisher', language: 'en',
      publishedAt: iso(now - 5 * 86_400_000), capturedAt: iso(now - 1000),
      textFile: `raw/${id}.txt`, sha256,
      rights: { noticeUrl: `https://${host}/fictional-rights-test`, license: 'Fixture license',
        pageOwner: 'Fixture owner', attribution: 'Fixture attribution', reviewer: 'Fixture reviewer',
        reviewedAt: iso(now - 2000), localResearchAllowed: true, collectionAllowed: true,
        thirdPartyMaterialExcluded: true }
    };
  }
  const manifest = { version: 1, createdAt: iso(now - 86_400_000), items: [
    item('a', 'globalvoices.org'), item('b', 'en.wikinews.org')], pairs: [{
    left: 'a', right: 'b', label: 'same', evidence: 'Fixture review evidence',
    reviewer: 'Fixture reviewer', reviewedAt: iso(now - 500)
  }] };
  const file = path.join(root, 'manifest.json');
  const save = () => fs.writeFileSync(file, JSON.stringify(manifest));
  save();
  return { root, manifest, file, save, now, item };
}

test('accepts a bounded reviewed local increment and prints counts only', t => {
  const f = fixture(t);
  assert.deepEqual(inspect(f.root, f.file, f.now).labels, { same: 1, different: 0, uncertain: 0 });
  const summary = JSON.stringify(inspect(f.root, f.file, f.now));
  assert.doesNotMatch(summary, /fictional|globalvoices\.org|wikinews\.org|Fixture/);
  const local = loadLocalCorpus(f.root, f.file, f.now);
  assert.equal(local.items.length, 2);
  assert.match(local.items[0].text, /Fictional test record/);
});

test('rejects rights gaps, out-of-scope origin and changed text', t => {
  const f = fixture(t);
  f.manifest.items[0].rights.collectionAllowed = false;
  assert.throws(() => validate(f.manifest, f.root, f.now), /RIGHTS_NOT_CLEARED/);
  f.manifest.items[0].rights.collectionAllowed = true;
  f.manifest.items[0].url = 'https://example.test/fixture';
  assert.throws(() => validate(f.manifest, f.root, f.now), /SOURCE_OUT_OF_SCOPE/);
  f.manifest.items[0].url = 'https://globalvoices.org/fictional-test-a';
  fs.appendFileSync(path.join(f.root, 'raw', 'a.txt'), 'changed');
  assert.throws(() => validate(f.manifest, f.root, f.now), /INVALID_TEXT/);
});

test('accepts 250 pairs and rejects duplicate or oversized pair sets', t => {
  const f = fixture(t);
  f.manifest.pairs.push({ ...f.manifest.pairs[0], left: 'b', right: 'a' });
  assert.throws(() => validate(f.manifest, f.root, f.now), /DUPLICATE_PAIR/);
  const hosts = ['globalvoices.org', 'en.wikinews.org'];
  for (let n = 0; n < 22; n++) f.manifest.items.push(f.item(`extra_${n}`, hosts[n % 2]));
  const pairs = [];
  for (let left = 0; left < 24; left++) for (let right = left + 1; right < 24; right++)
    pairs.push({ ...f.manifest.pairs[0], left: f.manifest.items[left].id, right: f.manifest.items[right].id });
  f.manifest.pairs = pairs.slice(0, MAX_PAIRS);
  assert.equal(validate(f.manifest, f.root, f.now).pairs, MAX_PAIRS);
  f.manifest.pairs.push(pairs[MAX_PAIRS]);
  assert.throws(() => validate(f.manifest, f.root, f.now), /INVALID_SIZE/);
});

test('rejects items that are not in a reviewed pair', t => {
  const f = fixture(t);
  f.manifest.items.push(f.item('unpaired', 'globalvoices.org'));
  assert.throws(() => validate(f.manifest, f.root, f.now), /UNPAIRED_ITEM/);
});

test('rejects repository as private root and oversized files before reading', t => {
  const f = fixture(t);
  assert.throws(() => privateRoot(path.resolve(import.meta.dirname, '../../../../..')), /PRIVATE_DIR_UNSAFE/);
  fs.appendFileSync(path.join(f.root, 'raw', 'a.txt'), Buffer.alloc(100_001));
  assert.throws(() => validate(f.manifest, f.root, f.now), /INVALID_TEXT/);
  fs.writeFileSync(f.file, Buffer.alloc(500_001));
  assert.throws(() => inspect(f.root, f.file, f.now), /INVALID_SIZE/);
});

test('rejects a symlink escaping the private directory', t => {
  const f = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'rights-corpus-escape-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const target = path.join(external, 'outside.txt');
  fs.writeFileSync(target, 'Fictional external test record. '.repeat(3));
  fs.unlinkSync(path.join(f.root, 'raw', 'a.txt'));
  try { fs.symlinkSync(target, path.join(f.root, 'raw', 'a.txt')); }
  catch { t.skip('Symlink creation is unavailable'); return; }
  assert.throws(() => validate(f.manifest, f.root, f.now), /TEXT_PATH_UNSAFE/);
});

test('rejects traversal and a manifest outside the private root', t => {
  const f = fixture(t);
  f.manifest.items[0].textFile = '../outside.txt';
  assert.throws(() => validate(f.manifest, f.root, f.now), /INVALID_TEXT_PATH/);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'rights-corpus-manifest-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const file = path.join(external, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(f.manifest));
  assert.throws(() => inspect(f.root, file, f.now), /MANIFEST_PATH_UNSAFE/);
});

test('refuses expired data without deleting it', t => {
  const f = fixture(t);
  const expired = Date.parse(f.manifest.createdAt) + 30 * 86_400_000;
  assert.throws(() => inspect(f.root, f.file, expired), /RETENTION_EXPIRED/);
  assert.equal(fs.existsSync(f.file), true);
  assert.equal(fs.readdirSync(path.join(f.root, 'raw')).length, 2);
});
