import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AccountRepository } from '../src/accounts/account-repository.js';
import { bootstrapTopicSpaceOwner, parseTopicSpaceOwnerArguments, runTopicSpaceOwnerCli }
  from '../src/ops/topic-space-owner-cli.js';
import { createFileTopicSpacePolicyStore } from '../src/application/topic-space-policy.js';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const code = wanted => error => error.code === wanted;
function fixture(t, { username = 'SyntheticOwner', state = 'active' } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'murmingle-topic-owner-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const accountDatabase = path.join(directory, 'accounts.sqlite'), policyFile = path.join(directory, 'topic-space-policy.json');
  const repository = new AccountRepository({ filename: accountDatabase });
  repository.database.prepare('INSERT INTO accounts(id,username,username_key,state,created_at) VALUES(?,?,?,?,0)')
    .run(ACCOUNT, username, username?.toLowerCase() ?? null, state);
  repository.close();
  return { directory, accountDatabase, policyFile, accountId: ACCOUNT, confirmOwner: true };
}

test('owner CLI defaults to usage only and requires every explicit flag and confirmation', () => {
  const output = [];
  assert.equal(runTopicSpaceOwnerCli([], { output: value => output.push(value) }), null);
  assert.equal(parseTopicSpaceOwnerArguments(['--help']), null);
  assert.match(output[0], /^Usage:/u);
  assert.equal(output[0].includes(ACCOUNT), false);
  for (const args of [[], ['--account-id', ACCOUNT], ['--confirm-owner'],
    ['--account-id', ACCOUNT, '--account-id', OTHER], ['--unknown'],
    ['--account-database', 'x', '--policy-file', 'y', '--account-id', ACCOUNT],
    ['--account-database', 'x', '--policy-file', 'y', '--account-id', ACCOUNT, '--confirm-owner', '--confirm-owner']]) {
    if (!args.length) continue;
    assert.throws(() => parseTopicSpaceOwnerArguments(args), code('invalid'));
  }
});

test('owner CLI verifies one exact active named account readonly and initializes only explicit policy', t => {
  const f = fixture(t), before = readFileSync(f.accountDatabase);
  const output = [];
  const result = runTopicSpaceOwnerCli(['--policy-file', f.policyFile, '--account-id', ACCOUNT,
    '--confirm-owner', '--account-database', f.accountDatabase], { output: value => output.push(value) });
  assert.deepEqual(result, { configured: true });
  assert.deepEqual(output, ['Topic grouping owner configured.\n']);
  assert.deepEqual(readFileSync(f.accountDatabase), before, 'account DB bytes are never migrated or changed');
  const stored = createFileTopicSpacePolicyStore({ filename: f.policyFile }).read();
  assert.equal(stored.ownerAccountId, ACCOUNT);
  assert.equal(stored.policy.revision, 1);
  assert.equal(stored.policy.topicOverrides.length, 0);
  const policyBefore = readFileSync(f.policyFile);
  assert.throws(() => bootstrapTopicSpaceOwner(f), code('conflict'));
  assert.deepEqual(readFileSync(f.policyFile), policyBefore, 'bootstrap cannot replace an existing owner');
});

test('owner CLI rejects absent, inactive, unnamed, reserved and AI namespace accounts without policy writes', t => {
  for (const options of [{ state: 'deleted' }, { state: 'deleting' }, { state: 'blocked' },
    { username: null }, { username: 'AI_helper' }, { username: '_AIperson' }, { username: 'admin' }]) {
    const f = fixture(t, options), before = readFileSync(f.accountDatabase);
    assert.throws(() => bootstrapTopicSpaceOwner(f), code('forbidden'));
    assert.equal(existsSync(f.policyFile), false);
    assert.deepEqual(readFileSync(f.accountDatabase), before);
  }
  const f = fixture(t);
  assert.throws(() => bootstrapTopicSpaceOwner({ ...f, accountId: OTHER }), code('forbidden'));
  assert.equal(existsSync(f.policyFile), false);
});

test('owner CLI never creates account databases or opens canonical paths and masks account material in errors', t => {
  const f = fixture(t), before = readFileSync(f.accountDatabase);
  const missing = path.join(f.directory, 'missing', 'accounts.sqlite');
  for (const change of [{ accountDatabase: missing }, { accountDatabase: ':memory:' },
    { accountDatabase: path.join(f.directory, 'demo.sqlite') }, { accountDatabase: 'accounts.sqlite' },
    { policyFile: 'relative.json' }, { policyFile: path.join(f.directory, 'policy.sqlite') },
    { confirmOwner: false }, { accountId: `account-${ACCOUNT}` }, { accountId: 'subject@example.test' }]) {
    assert.throws(() => bootstrapTopicSpaceOwner({ ...f, ...change }), error => {
      assert.equal(error.message, 'Topic grouping owner configuration unavailable.');
      assert.equal(error.message.includes(ACCOUNT), false);
      return true;
    });
    assert.equal(existsSync(f.policyFile), false);
  }
  assert.equal(existsSync(missing), false);
  assert.deepEqual(readFileSync(f.accountDatabase), before);
});

test('owner CLI rejects wrong schema without migration and never repairs a malformed owner file', t => {
  const f = fixture(t);
  const database = new DatabaseSync(f.accountDatabase);
  database.exec('PRAGMA user_version=99'); database.close();
  const before = readFileSync(f.accountDatabase);
  assert.throws(() => bootstrapTopicSpaceOwner(f), code('unavailable'));
  assert.deepEqual(readFileSync(f.accountDatabase), before);
  assert.equal(existsSync(f.policyFile), false);
  const valid = fixture(t);
  writeFileSync(valid.policyFile, 'MALFORMED_PRESERVED_SENTINEL', { flag: 'wx' });
  assert.throws(() => bootstrapTopicSpaceOwner(valid), code('conflict'));
  assert.equal(readFileSync(valid.policyFile, 'utf8'), 'MALFORMED_PRESERVED_SENTINEL');
});
