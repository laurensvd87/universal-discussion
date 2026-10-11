import { Pool } from 'pg';

function adapter(client, dialect) {
  return { dialect, query: (sql, parameters = []) => client.query(sql, parameters), exec: (sql) => client.exec ? client.exec(sql) : client.query(sql) };
}

export async function createPgDatabase({ config, connectionString }) {
  const pool = new Pool(config || { connectionString });
  const database = adapter(pool, 'pg');
  database.transaction = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(adapter(client, 'pg'));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
  database.close = () => pool.end();
  return database;
}

export async function createPGliteDatabase({ dataDir } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const client = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { vector } });
  await client.waitReady;
  const database = adapter(client, 'pglite');
  database.transaction = (callback) => client.transaction((tx) => callback(adapter(tx, 'pglite')));
  database.close = () => client.close();
  return database;
}
