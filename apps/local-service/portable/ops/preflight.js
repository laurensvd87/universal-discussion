import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../', import.meta.url));
const names = ['admin_db_password', 'owner_db_password', 'app_db_password', 'read_token', 'alex_token', 'blair_token'];
const values = new Set();
let settings = {};
try {
  const env = await readFile(`${directory}/.env`, 'utf8');
  settings = Object.fromEntries(env.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split('=')));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
if (process.platform !== 'win32') {
  const uid = Number(process.env.MURMINGLE_RUNTIME_UID ?? settings.MURMINGLE_RUNTIME_UID ?? 1000);
  const gid = Number(process.env.MURMINGLE_RUNTIME_GID ?? settings.MURMINGLE_RUNTIME_GID ?? 1000);
  if (uid <= 0 || gid <= 0 || uid !== process.getuid() || gid !== process.getgid()) throw new Error('MURMINGLE_RUNTIME_UID/GID must match a non-root Linux operator');
}
for (const name of names) {
  const path = `${directory}/secrets/${name}`;
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Expected a regular secret file');
  if (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())) throw new Error('Secrets require operator ownership and owner-only permissions');
  const value = (await readFile(path, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(value) || values.has(value)) throw new Error('Expected distinct 256-bit generated secrets');
  values.add(value);
}
console.log('Synthetic configuration preflight passed. No Docker engine or listener was started.');
if (process.platform === 'win32') console.log('Windows ACLs and Docker Desktop mounted-secret ownership need operator verification; Linux preflight is required before rehearsal.');
