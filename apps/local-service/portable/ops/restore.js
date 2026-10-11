import { open, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const name = process.argv[2];
if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}\.dump$/.test(name)) throw new Error('Usage: node ops/restore.js existing-name.dump');
const cwd = fileURLToPath(new URL('../', import.meta.url));
const directoryInfo = await lstat(`${cwd}/backups`);
if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Backup directory must not be a symbolic link');
const path = `${cwd}/backups/${name}`;
const info = await lstat(path);
if (!info.isFile() || info.isSymbolicLink() || info.size === 0) throw new Error('Expected a non-empty private dump file');
if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('Dump file requires owner-only permissions');
const compose = (args, stdio) => spawn('docker', ['compose', '--profile', 'restore', 'exec', '-T', 'restore-db', ...args], { cwd, stdio, shell: false });
const wait = (child) => new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error('Fresh-target restore check or operation failed')));
});
// This command cannot name the active database/service. Refuse a previously
// restored or migrated target; never DROP databases or reset named volumes.
const check = compose(['/bin/sh', '-c', 'PGPASSWORD="$(cat /run/udl-db-secrets/admin_db_password)" exec psql --host=127.0.0.1 --username=udl_admin --dbname=udl_synthetic_restore --tuples-only --no-align --command="SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN (\'pg_catalog\', \'information_schema\') AND n.nspname NOT LIKE \'pg_toast%\' AND c.relkind IN (\'r\', \'p\');"'], ['ignore', 'pipe', 'pipe']);
let count = '';
check.stdout.on('data', (data) => { count += data; });
check.stderr.resume();
await wait(check);
if (count.trim() !== '0') throw new Error('Restore target is not fresh; create a separate new rehearsal project rather than overwriting it');
const file = await open(path, 'r');
// vector is preinstalled by the DB administrator. The application owner cannot
// restore the extension's COMMENT; omit SQL comments, not discussion content.
const child = compose(['/bin/sh', '-c', 'PGPASSWORD="$(cat /run/udl-db-secrets/admin_db_password)" exec pg_restore --host=127.0.0.1 --username=udl_admin --dbname=udl_synthetic_restore --role=udl_owner --no-owner --no-comments --exit-on-error --single-transaction'], ['pipe', 'ignore', 'pipe']);
child.stderr.resume();
const results = await Promise.allSettled([wait(child), pipeline(file.createReadStream(), child.stdin)]);
for (const result of results) if (result.status === 'rejected') throw result.reason;
console.log('Restored synthetic dump into the separate restore-db volume. API and worker remain pointed at db; validate records before any further use.');
