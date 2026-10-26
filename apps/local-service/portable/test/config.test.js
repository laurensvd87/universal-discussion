import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, readSecretFile } from '../src/config.js';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const env = { MURMINGLE_MODE: 'synthetic-rehearsal', MURMINGLE_READ_TOKEN_FILE: 'read', MURMINGLE_DATABASE_PASSWORD_FILE: 'password' };
const options = { readSecret: async filename => `${filename}-`.padEnd(48, 'x') };
test('config requires explicit rehearsal and separate protected secrets', async () => {
  const config = await loadConfig(env, options);
  assert.equal(config.port, 4185); assert.equal(config.database.user, 'murmingle_app');
  assert.equal(config.allowedOrigin, 'https://client.example');
  for (const patch of [{ MURMINGLE_MODE: undefined }, { MURMINGLE_PORT: '4174' }, { DATABASE_URL: 'secret' }, { PGPASSWORD: 'secret' }, { MURMINGLE_DATABASE_HOST: 'remote.example' }, { MURMINGLE_DATABASE_NAME: 'owner_data' }, { MURMINGLE_ALLOWED_HOST: '*' }, { MURMINGLE_ALLOWED_ORIGIN: 'https://real.example' }, { MURMINGLE_BIND: '::' }, { MURMINGLE_DATABASE_USER: 'postgres' }]) {
    await assert.rejects(loadConfig({ ...env, ...patch }, options), /portable-config-invalid/);
  }
  await assert.rejects(loadConfig(env, { readSecret: async () => 'same-secret' }), /portable-config-invalid/);
  const worker = await loadConfig({ MURMINGLE_MODE:'synthetic-rehearsal', MURMINGLE_DATABASE_PASSWORD_FILE:'password' },{...options,role:'worker'});
  assert.equal(worker.readToken,null); assert.deepEqual(worker.fixtureTokens,{alex:null,blair:null});
});
test('secret reading rejects relative files, short values, and Linux broad access', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'murmingle-portable-secret-'));
  const filename = path.join(dir, 'secret');
  try {
    await assert.rejects(readSecretFile('relative'), /portable-config-invalid/);
    await writeFile(filename, 'x'.repeat(32));
    assert.equal(await readSecretFile(filename, { platform: 'win32' }), 'x'.repeat(32));
    await writeFile(filename, 'short');
    await assert.rejects(readSecretFile(filename, { platform: 'win32' }), /portable-config-invalid/);
    if (process.platform !== 'win32') {
      await writeFile(filename, 'x'.repeat(32)); await chmod(filename, 0o644);
      await assert.rejects(readSecretFile(filename), /portable-config-invalid/);
      await chmod(filename, 0o600); assert.equal(await readSecretFile(filename), 'x'.repeat(32));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
