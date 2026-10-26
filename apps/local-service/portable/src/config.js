import { open, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

function invalid() { throw new Error('portable-config-invalid'); }
export async function readSecretFile(filename, { platform = process.platform } = {}) {
  if (!filename || !path.isAbsolute(filename)) invalid();
  const before = await lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size > 4096) invalid();
  if (platform !== 'win32' && (before.mode & 0o077) !== 0) invalid();
  if (await realpath(filename) !== path.resolve(filename)) invalid();
  const handle = await open(filename, 'r');
  try {
    const after = await handle.stat();
    if (after.dev !== before.dev || after.ino !== before.ino || !after.isFile()) invalid();
    const value = (await handle.readFile('utf8')).trim();
    if (!/^[\x21-\x7e]{24,256}$/.test(value)) invalid();
    return value;
  } finally { await handle.close(); }
}

export async function loadConfig(env = process.env, { readSecret = readSecretFile, role = 'api' } = {}) {
  if (process.getuid?.() === 0 || process.getgid?.() === 0) invalid();
  if (env.MURMINGLE_MODE !== 'synthetic-rehearsal' || env.DATABASE_URL || env.PGPASSWORD) invalid();
  const port = Number(env.MURMINGLE_PORT ?? '4185');
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 4174) invalid();
  const bind = env.MURMINGLE_BIND ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(bind)) invalid();
  const allowedHost = env.MURMINGLE_ALLOWED_HOST ?? `127.0.0.1:${port}`;
  if (allowedHost !== `127.0.0.1:${port}`) invalid();
  const allowedOrigin = env.MURMINGLE_ALLOWED_ORIGIN ?? 'https://client.example';
  if (allowedOrigin !== 'https://client.example') invalid();
  const host = env.MURMINGLE_DATABASE_HOST ?? 'db';
  const database = env.MURMINGLE_DATABASE_NAME ?? 'murmingle_synthetic';
  const user = env.MURMINGLE_DATABASE_USER ?? 'murmingle_app';
  if (!['db', '127.0.0.1', 'localhost'].includes(host) || !/^murmingle_synthetic(?:_[a-z0-9_]+)?$/.test(database) || !['murmingle_app', 'murmingle_owner'].includes(user) || (env.MURMINGLE_DATABASE_PORT && env.MURMINGLE_DATABASE_PORT !== '5432')) invalid();
  const readToken = role === 'api' ? await readSecret(env.MURMINGLE_READ_TOKEN_FILE) : null;
  const password = await readSecret(env.MURMINGLE_DATABASE_PASSWORD_FILE);
  const alex = role === 'seed-fixture' && env.MURMINGLE_ALEX_TOKEN_FILE ? await readSecret(env.MURMINGLE_ALEX_TOKEN_FILE) : null;
  const blair = role === 'seed-fixture' && env.MURMINGLE_BLAIR_TOKEN_FILE ? await readSecret(env.MURMINGLE_BLAIR_TOKEN_FILE) : null;
  if ([readToken, alex, blair].filter(Boolean).some(token => !/^[A-Za-z0-9_-]{43,128}$/.test(token))) invalid();
  const secrets = [readToken, password, alex, blair].filter(Boolean);
  if (new Set(secrets).size !== secrets.length) invalid();
  return Object.freeze({ mode: 'synthetic-rehearsal', port, bind, allowedHost, allowedOrigin, readToken, fixtureTokens: Object.freeze({alex, blair}),
    maxBodyBytes: 16384, maxHeaderBytes: 16384,
    database: Object.freeze({ host, port: 5432, database, user, password, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 }) });
}
