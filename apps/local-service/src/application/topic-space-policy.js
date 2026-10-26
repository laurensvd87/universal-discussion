import { randomUUID } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync,
  renameSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import { ServiceError } from '../domain/errors.js';

const fail = code => { throw new ServiceError(code, 'Topic grouping settings unavailable'); };
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
function record(value, names) {
  if (!value || typeof value !== 'object' || isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
    !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('invalid');
  return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
function specificity(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100) fail('invalid');
  return value;
}
export function normalizeTopicSpacePolicy(value) {
  const input = record(value, ['schema', 'revision', 'defaultSpecificity', 'topicOverrides']);
  if (input.schema !== 'topic-space-policy/v1' || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      !Array.isArray(input.topicOverrides) || isProxy(input.topicOverrides) ||
      Object.getPrototypeOf(input.topicOverrides) !== Array.prototype || input.topicOverrides.length > 256) fail('invalid');
  const descriptors = Object.getOwnPropertyDescriptors(input.topicOverrides);
  if (Reflect.ownKeys(descriptors).length !== input.topicOverrides.length + 1) fail('invalid');
  const seen = new Set(), overrides = [];
  for (let index = 0; index < input.topicOverrides.length; index++) {
    if (!descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], 'value')) fail('invalid');
    const entry = record(descriptors[index].value, ['spaceId', 'specificity', 'title']);
    if (typeof entry.spaceId !== 'string' || !ID.test(entry.spaceId) || seen.has(entry.spaceId) ||
        entry.title !== null && (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 200 ||
          /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(entry.title))) fail('invalid');
    seen.add(entry.spaceId);
    overrides.push(Object.freeze({ spaceId: entry.spaceId, specificity: specificity(entry.specificity), title: entry.title }));
  }
  overrides.sort((a, b) => a.spaceId < b.spaceId ? -1 : a.spaceId > b.spaceId ? 1 : 0);
  return Object.freeze({ schema: input.schema, revision: input.revision,
    defaultSpecificity: specificity(input.defaultSpecificity), topicOverrides: Object.freeze(overrides) });
}
const defaultPolicy = () => normalizeTopicSpacePolicy({ schema: 'topic-space-policy/v1', revision: 0,
  defaultSpecificity: 0, topicOverrides: [] });
function ownerId(value) {
  if (typeof value !== 'string' || !ID.test(value) || value.startsWith('account-')) fail('invalid');
  return value;
}
function stored(value) {
  const input = record(value, ['schema', 'ownerAccountId', 'policy']);
  if (input.schema !== 'topic-space-owner-settings/v1') fail('invalid');
  return { schema: input.schema, ownerAccountId: ownerId(input.ownerAccountId), policy: normalizeTopicSpacePolicy(input.policy) };
}
function nextPolicy(previous, value) {
  const request = record(value, ['expectedRevision', 'defaultSpecificity', 'topicOverrides']);
  if (request.expectedRevision !== previous.revision) fail('conflict');
  if (previous.revision >= Number.MAX_SAFE_INTEGER) fail('capacity');
  return normalizeTopicSpacePolicy({ schema: previous.schema, revision: previous.revision + 1,
    defaultSpecificity: request.defaultSpecificity, topicOverrides: request.topicOverrides });
}
export function createMemoryTopicSpacePolicyStore({ ownerAccountId = null, policy = defaultPolicy() } = {}) {
  let state = { ownerAccountId: ownerAccountId === null ? null : ownerId(ownerAccountId), policy: normalizeTopicSpacePolicy(policy) };
  return Object.freeze({ read: () => structuredClone(state),
    update(value, isCurrent = () => true) {
      if (state.ownerAccountId === null || isCurrent() !== true) fail('forbidden');
      const policy = nextPolicy(state.policy, value);
      if (isCurrent() !== true) fail('forbidden');
      state = { ...state, policy }; return policy;
    } });
}

// The operator, never an HTTP caller, supplies this fixed trusted local path.
export function createFileTopicSpacePolicyStore({ filename }) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || path.extname(filename) !== '.json') fail('invalid');
  const parent = path.dirname(filename), lock = `${filename}.lock`;
  function check(target = filename) {
    let current = parent;
    for (let index = 0; index < 64; index++) {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory()) fail('unavailable');
      const next = path.dirname(current); if (next === current) break; current = next;
    }
    const normalized = value => process.platform === 'win32' ? value.toLowerCase() : value;
    if (normalized(realpathSync(parent)) !== normalized(parent)) fail('unavailable');
    const info = lstatSync(target, { throwIfNoEntry: false });
    if (info) {
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 131072) fail('unavailable');
    }
  }
  function read() {
    try {
      check();
      if (!lstatSync(filename, { throwIfNoEntry: false })) return { ownerAccountId: null, policy: defaultPolicy() };
      return stored(JSON.parse(readFileSync(filename, 'utf8')));
    } catch (error) { if (error instanceof ServiceError) throw error; fail('unavailable'); }
  }
  const witness = () => {
    check();
    const info = lstatSync(filename, { throwIfNoEntry: false });
    return info ? { dev: info.dev, ino: info.ino, bytes: readFileSync(filename, 'utf8') } : null;
  };
  function removeOwned(target, identity) {
    if (!identity) return;
    try {
      check(target);
      const current = lstatSync(target, { throwIfNoEntry: false });
      if (current && current.dev === identity.dev && current.ino === identity.ino) unlinkSync(target);
    } catch { /* Never unlink through a replaced/redirected path. */ }
  }
  function publish(state, isCurrent, previous) {
    const temporary = path.join(parent, `.topic-grouping-${randomUUID()}.partial`);
    let descriptor, identity;
    try {
      check();
      const bytes = Buffer.from(JSON.stringify(state), 'utf8');
      if (bytes.length > 131072) fail('capacity');
      descriptor = openSync(temporary, 'wx', 0o600);
      identity = fstatSync(descriptor);
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
        if (written <= 0) fail('unavailable'); offset += written;
      }
      fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
      if (isCurrent() !== true) fail('forbidden');
      const current = witness();
      if (JSON.stringify(current) !== JSON.stringify(previous)) fail('conflict');
      check(temporary);
      const temporaryInfo = lstatSync(temporary);
      if (temporaryInfo.dev !== identity.dev || temporaryInfo.ino !== identity.ino) fail('conflict');
      renameSync(temporary, filename);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      removeOwned(temporary, identity);
    }
  }
  function locked(work) {
    let descriptor, identity;
    try { check(lock); descriptor = openSync(lock, 'wx', 0o600); identity = fstatSync(descriptor); return work(); }
    catch (error) { if (error instanceof ServiceError) throw error; fail(error?.code === 'EEXIST' ? 'conflict' : 'unavailable'); }
    finally { if (descriptor !== undefined) { closeSync(descriptor); removeOwned(lock, identity); } }
  }
  return Object.freeze({ read,
    initialize(accountId) { return locked(() => {
      if (lstatSync(filename, { throwIfNoEntry: false })) fail('conflict');
      const state = { schema: 'topic-space-owner-settings/v1', ownerAccountId: ownerId(accountId),
        policy: normalizeTopicSpacePolicy({ ...defaultPolicy(), revision: 1 }) };
      publish(state, () => true, null); return state.policy;
    }); },
    update(value, isCurrent = () => true) { return locked(() => {
      const disk = witness();
      const previous = read();
      if (JSON.stringify(witness()) !== JSON.stringify(disk)) fail('conflict');
      if (previous.ownerAccountId === null || isCurrent() !== true) fail('forbidden');
      const policy = nextPolicy(previous.policy, value);
      publish({ schema: 'topic-space-owner-settings/v1', ownerAccountId: previous.ownerAccountId, policy }, isCurrent, disk);
      return policy;
    }); } });
}
