import { mkdir, open, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const name = process.argv[2];
if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}\.dump$/.test(name)) throw new Error('Usage: node ops/backup.js unique-name.dump');
const cwd = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${cwd}/backups`, { recursive: true, mode: 0o700 });
const directoryInfo = await lstat(`${cwd}/backups`);
if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Backup directory must not be a symbolic link');
if (process.platform !== 'win32' && (directoryInfo.mode & 0o077) !== 0) throw new Error('Backup directory requires owner-only permissions');
const file = await open(`${cwd}/backups/${name}`, 'wx', 0o600);
// Arguments contain only commands and file paths. Credentials stay inside the
// private DB container and are never printed by this wrapper.
const child = spawn('docker', ['compose', 'exec', '-T', 'db', '/bin/sh', '-c',
  'PGPASSWORD="$(cat /run/murmingle-db-secrets/owner_db_password)" exec pg_dump --host=127.0.0.1 --username=murmingle_owner --dbname=murmingle_synthetic --format=custom --no-owner'],
{ cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
child.stderr.resume();
const completion = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error('Synthetic dump failed; the reserved backup file may be incomplete')));
});
const copy = pipeline(child.stdout, file.createWriteStream());
const results = await Promise.allSettled([completion, copy]);
for (const result of results) if (result.status === 'rejected') throw result.reason;
console.log(`Created private synthetic dump backups/${name}. Encryption and independent storage are separate operator steps.`);
