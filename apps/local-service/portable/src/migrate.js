import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function migrate(database) {
  const sql = await readFile(new URL('../migrations/001-foundation.sql', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(sql).digest('hex');
  return database.transaction(async (tx) => {
    // Real PostgreSQL serializes independent migration processes. PGlite has one
    // embedded connection and does not implement PostgreSQL advisory locks.
    if (tx.dialect === 'pg') await tx.query('SELECT pg_advisory_xact_lock(914092001)');
    await tx.exec('CREATE TABLE IF NOT EXISTS portable_migrations (version integer PRIMARY KEY, hash text NOT NULL)');
    const { rows } = await tx.query('SELECT version, hash FROM portable_migrations ORDER BY version');
    if (rows.some((row) => row.version !== 1 || row.hash !== hash)) throw new Error('Migration version/hash mismatch');
    if (!rows.length) {
      await tx.exec(sql);
      await tx.query('INSERT INTO portable_migrations(version, hash) VALUES (1, $1)', [hash]);
    }
    return { schemaVersion: 1 };
  });
}
