import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, linkSync, symlinkSync, renameSync } from 'node:fs';
import { createFileTopicSpacePolicyStore, createMemoryTopicSpacePolicyStore, normalizeTopicSpacePolicy } from '../src/application/topic-space-policy.js';

const policy = (extra = {}) => ({ schema: 'topic-space-policy/v1', revision: 0, defaultSpecificity: 0, topicOverrides: [], ...extra });
const request = (expectedRevision, defaultSpecificity = 50) => ({ expectedRevision, defaultSpecificity, topicOverrides: [] });
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-topic-policy-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const parent = path.join(directory, 'settings');
  mkdirSync(parent);
  const filename = path.join(parent, 'topic-space.json');
  return { directory, parent, filename, store: createFileTopicSpacePolicyStore({ filename }) };
}

test('absent owner stays unassigned; only explicit operator bootstrap enables updates', t => {
  const { store } = fixture(t);
  assert.equal(store.read().ownerAccountId, null);
  assert.equal(store.read().policy.defaultSpecificity, 0);
  assert.throws(() => store.update(request(0)), { code: 'forbidden' });
  assert.throws(() => store.initialize('account-owner'), { code: 'invalid' });
  assert.equal(store.initialize('owner-raw-id').revision, 1);
  assert.equal(store.read().ownerAccountId, 'owner-raw-id');
  assert.throws(() => store.initialize('other'), { code: 'conflict' });
});

test('memory policies have no implicit owner and return isolated snapshots', () => {
  const absent = createMemoryTopicSpacePolicyStore();
  assert.throws(() => absent.update(request(0)), { code: 'forbidden' });
  const store = createMemoryTopicSpacePolicyStore({ ownerAccountId: 'owner' });
  store.read().policy.defaultSpecificity = 100;
  assert.equal(store.read().policy.defaultSpecificity, 0);
  assert.equal(store.update(request(0)).revision, 1);
  assert.throws(() => store.update(request(0)), { code: 'conflict' });
  let checks = 0;
  assert.throws(() => store.update(request(1), () => ++checks < 2), { code: 'forbidden' });
  assert.equal(store.read().policy.revision, 1);
});

test('file CAS persists atomically, blocks lock collisions, and retains state on lost authority', t => {
  const { store, filename, parent } = fixture(t);
  store.initialize('owner');
  const previous = readFileSync(filename, 'utf8');
  let checks = 0;
  assert.throws(() => store.update(request(1), () => ++checks < 2), { code: 'forbidden' });
  assert.equal(readFileSync(filename, 'utf8'), previous);
  assert.deepEqual(readdirSync(parent), ['topic-space.json']);
  writeFileSync(`${filename}.lock`, 'synthetic competing writer', { flag: 'wx' });
  assert.throws(() => store.update(request(1)), { code: 'conflict' });
  rmSync(`${filename}.lock`);
  assert.equal(store.update(request(1), () => true).revision, 2);
  assert.equal(JSON.parse(readFileSync(filename, 'utf8')).policy.defaultSpecificity, 50);
  assert.throws(() => store.update(request(1)), { code: 'conflict' });
  assert.deepEqual(readdirSync(parent), ['topic-space.json']);
});

test('policy schema rejects accessors, proxies, duplicate IDs, controls and oversized arrays', () => {
  let calls = 0;
  const bad = policy();
  Object.defineProperty(bad, 'defaultSpecificity', { enumerable: true, get() { calls++; return 50; } });
  assert.throws(() => normalizeTopicSpacePolicy(bad), { code: 'invalid' });
  assert.throws(() => normalizeTopicSpacePolicy(new Proxy({}, { get() { calls++; throw Error('must not run'); } })), { code: 'invalid' });
  const override = { spaceId: 'space-a', specificity: 100, title: null };
  assert.throws(() => normalizeTopicSpacePolicy(policy({ topicOverrides: [override, override] })), { code: 'invalid' });
  assert.throws(() => normalizeTopicSpacePolicy(policy({ topicOverrides: [{ ...override, title: 'bad\u202e' }] })), { code: 'invalid' });
  assert.throws(() => normalizeTopicSpacePolicy(policy({ topicOverrides: Array(257).fill(override) })), { code: 'invalid' });
  assert.throws(() => normalizeTopicSpacePolicy(policy({ topicOverrides: [{ ...override, spaceId: '../bad' }] })), { code: 'invalid' });
  assert.throws(() => normalizeTopicSpacePolicy(policy({ defaultSpecificity: NaN })), { code: 'invalid' });
  assert.equal(calls, 0);
  const normalized = normalizeTopicSpacePolicy(policy({ topicOverrides: [override] }));
  assert.ok(Object.isFrozen(normalized.topicOverrides[0]));
});

test('hardlinks, malformed storage, and existing destination directories fail closed', t => {
  const { store, filename, directory } = fixture(t);
  store.initialize('owner');
  const linked = path.join(directory, 'linked.json');
  linkSync(filename, linked);
  assert.throws(() => store.read(), { code: 'unavailable' });
  assert.throws(() => store.update(request(1)), { code: 'unavailable' });
  rmSync(linked);
  writeFileSync(filename, '{broken json');
  assert.throws(() => store.read(), { code: 'unavailable' });
  rmSync(filename);
  mkdirSync(filename);
  assert.throws(() => store.initialize('owner'), { code: 'conflict' });
});

test('redirected parent is rejected before any read or bootstrap', t => {
  const { store, filename, parent, directory } = fixture(t);
  const destination = path.join(directory, 'redirected');
  mkdirSync(destination);
  rmSync(parent, { recursive: true });
  symlinkSync(destination, parent, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => store.read(), { code: 'unavailable' });
  assert.throws(() => store.initialize('owner'), { code: 'unavailable' });
  assert.deepEqual(readdirSync(destination), []);
});

test('dangling destination symlinks are rejected instead of treated as missing settings', t => {
  const { store, filename, directory } = fixture(t);
  try { symlinkSync(path.join(directory, 'missing.json'), filename, 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Platform requires privilege for file symlinks'); return; }
    throw error;
  }
  assert.throws(() => store.read(), { code: 'unavailable' });
  assert.throws(() => store.initialize('owner'), { code: 'unavailable' });
});

test('authority renewal cannot redirect publication into another directory', t => {
  const { store, filename, parent, directory } = fixture(t);
  store.initialize('owner');
  const moved = path.join(directory, 'moved-settings');
  const victim = path.join(directory, 'victim');
  mkdirSync(victim);
  const victimFile = path.join(victim, path.basename(filename));
  writeFileSync(victimFile, 'synthetic protected destination');
  let checks = 0;
  let redirected = false;
  assert.throws(() => store.update(request(1), () => {
    if (++checks === 2) {
      const temporary = readdirSync(parent).find(name => name.endsWith('.partial'));
      renameSync(parent, moved);
      symlinkSync(victim, parent, process.platform === 'win32' ? 'junction' : 'dir');
      redirected = true;
      writeFileSync(path.join(victim, temporary), 'synthetic injected replacement');
    }
    return true;
  }));
  if (!redirected) { t.skip('Platform prevents renaming a directory containing the open lock'); return; }
  assert.equal(readFileSync(victimFile, 'utf8'), 'synthetic protected destination');
});

test('concurrent destination replacement during authority renewal is not overwritten', t => {
  const { store, filename } = fixture(t);
  store.initialize('owner');
  let checks = 0;
  assert.throws(() => store.update(request(1), () => {
    if (++checks === 2) writeFileSync(filename, JSON.stringify({ synthetic: 'external replacement' }));
    return true;
  }));
  assert.deepEqual(JSON.parse(readFileSync(filename, 'utf8')), { synthetic: 'external replacement' });
});
