import { lstatSync, realpathSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ServiceError } from '../domain/errors.js';
import { createFileTopicSpacePolicyStore } from '../application/topic-space-policy.js';

const RAW_ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RESERVED = new Set(['admin', 'administrator', 'system', 'support', 'moderator', 'root', 'robot',
  'ai', 'deleted', 'anonymous']);
const MESSAGE = 'Topic grouping owner configuration unavailable.';
const USAGE = 'Usage: node topic-space-owner-cli.js --account-database ABSOLUTE/accounts.sqlite --policy-file ABSOLUTE/policy.json --account-id RAW_ACCOUNT_ID --confirm-owner\n';
const fail = code => { throw new ServiceError(code, MESSAGE); };

export function parseTopicSpaceOwnerArguments(args) {
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) fail('invalid');
  if (!args.length || args.length === 1 && args[0] === '--help') return null;
  const names = new Map([['--account-database', 'accountDatabase'], ['--policy-file', 'policyFile'],
    ['--account-id', 'accountId']]);
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--confirm-owner') {
      if (result.confirmOwner) fail('invalid');
      result.confirmOwner = true;
    } else {
      const key = names.get(flag);
      if (!key || Object.hasOwn(result, key) || index + 1 >= args.length || args[index + 1].startsWith('--')) fail('invalid');
      result[key] = args[++index];
    }
  }
  if (Object.keys(result).length !== 4) fail('invalid');
  return result;
}

function accountDatabasePath(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || path.basename(filename) !== 'accounts.sqlite' ||
      filename.includes('\0')) fail('invalid');
  const resolved = path.resolve(filename), info = lstatSync(resolved);
  const normalized = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
      normalized(realpathSync(resolved)) !== normalized(resolved)) fail('invalid');
  return resolved;
}

// Deliberate operator action only. This never creates, migrates, searches, or
// infers an account and never opens a canonical/private/provider store.
export function bootstrapTopicSpaceOwner({ accountDatabase, policyFile, accountId, confirmOwner } = {}) {
  let database;
  try {
    if (confirmOwner !== true || typeof accountId !== 'string' || !RAW_ACCOUNT_ID.test(accountId) ||
        typeof policyFile !== 'string' || !path.isAbsolute(policyFile) || path.extname(policyFile) !== '.json') fail('invalid');
    const filename = accountDatabasePath(accountDatabase);
    const store = createFileTopicSpacePolicyStore({ filename: policyFile });
    database = new DatabaseSync(filename, { readOnly: true });
    const version = database.prepare('PRAGMA user_version').get().user_version;
    const meta = database.prepare("SELECT key,value FROM auth_meta WHERE key='schema' LIMIT 2").all();
    if (![1, 2].includes(version) || meta.length !== 1 ||
        meta[0].value !== (version === 1 ? 'synthetic-accounts-v1' : 'discussion-accounts-v2')) fail('unavailable');
    const rows = database.prepare('SELECT id,username,username_key,state FROM accounts WHERE id=? LIMIT 2').all(accountId);
    const account = rows[0], name = account?.username, key = account?.username_key;
    if (rows.length !== 1 || account.id !== accountId || account.state !== 'active' ||
        typeof name !== 'string' || !/^[A-Za-z0-9_]{3,24}$/u.test(name) || key !== name.toLowerCase() ||
        RESERVED.has(key) || key.startsWith('ai_') || key.startsWith('_ai')) fail('forbidden');
    store.initialize(accountId);
    return Object.freeze({ configured: true });
  } catch (error) {
    throw new ServiceError(error instanceof ServiceError ? error.code : 'unavailable', MESSAGE);
  } finally { database?.close(); }
}

export function runTopicSpaceOwnerCli(args = process.argv.slice(2), { output = text => process.stdout.write(text) } = {}) {
  const request = parseTopicSpaceOwnerArguments(args);
  if (request === null) { output(USAGE); return null; }
  const result = bootstrapTopicSpaceOwner(request);
  output('Topic grouping owner configured.\n');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runTopicSpaceOwnerCli(); }
  catch { process.stderr.write(`${MESSAGE}\n`); process.exitCode = 1; }
}
