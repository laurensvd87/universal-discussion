import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateScopeAllowed } from './scope.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../..');

test('rejects repository and ancestor roots before file inspection', () => {
  const repoFile = path.join(repo, 'AGENTS.md');
  assert.equal(privateScopeAllowed(repo, repo, repoFile), false);
  assert.equal(privateScopeAllowed(repo, path.dirname(repo), repoFile), false);
  assert.equal(privateScopeAllowed(repo, path.dirname(path.dirname(repo)), repoFile), false);
});

test('rejects roots inside repository and relative path arguments', () => {
  assert.equal(privateScopeAllowed(repo, path.join(repo, 'plans'),
    path.join(repo, 'plans', 'STATUS.md')), false);
  assert.equal(privateScopeAllowed(repo, '.', path.join(repo, 'AGENTS.md')), false);
});

test('allows only a file under a separate private root', () => {
  const privateRoot = path.join(path.parse(repo).root, 'private-corpus-example');
  assert.equal(privateScopeAllowed(repo, privateRoot,
    path.join(privateRoot, 'news_only.json')), true);
  assert.equal(privateScopeAllowed(repo, privateRoot,
    path.join(path.dirname(privateRoot), 'outside.json')), false);
});
