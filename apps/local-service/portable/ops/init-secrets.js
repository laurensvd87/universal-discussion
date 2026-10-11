import { mkdir, open, chmod, lstat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../secrets/', import.meta.url));
const names = ['admin_db_password', 'owner_db_password', 'app_db_password', 'read_token', 'alex_token', 'blair_token'];
await mkdir(directory, { recursive: true, mode: 0o700 });
if ((await lstat(directory)).isSymbolicLink()) throw new Error('Secret directory must not be a symbolic link');
if (process.platform !== 'win32') await chmod(directory, 0o700);
// Exclusive creation deliberately refuses replacement; partial initialization
// remains visible and must be resolved by the operator, never silently rotated.
for (const name of names) {
  const handle = await open(new URL(`../secrets/${name}`, import.meta.url), 'wx', 0o600);
  try { await handle.writeFile(`${randomBytes(32).toString('hex')}\n`); }
  finally { await handle.close(); }
}
console.log('Created six private synthetic secret files. On Windows, restrict the secrets directory ACL to the current operator before use.');
