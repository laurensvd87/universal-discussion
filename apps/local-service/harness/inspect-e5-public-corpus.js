// Read-only inventory of public static-crawler vectors. Never reads posts,
// accounts, payloads, credentials into output, or interactive browsing sources.
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createPgDatabase } from '../portable/src/database.js';
import { createWindowsDpapiPasswordProvider } from '../portable/src/windows-dpapi-password.js';
import { PUBLIC_HIERARCHY_PROBES } from './hierarchy-public-probes.js';

const started = performance.now();
let database;
try {
  const snapshot = process.argv.length === 3 && process.argv[2] === '--snapshot';
  if (process.argv.length !== (snapshot ? 3 : 2)) throw new Error('Invalid inventory invocation');
  const password = await createWindowsDpapiPasswordProvider({ role: 'murmingle_app' })();
  database = await createPgDatabase({ config: {
    host: '127.0.0.1', port: 55432, database: 'murmingle_canonical',
    user: 'murmingle_app', password, ssl: false, max: 1,
    application_name: 'murmingle-public-corpus-inventory',
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
  } });
  const result = await database.transaction(async tx => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await tx.query("SET LOCAL statement_timeout='3000ms'");
    await tx.query("SET LOCAL lock_timeout='250ms'");
    await tx.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
    const identity = (await tx.query(`SELECT current_database() AS database,
      current_user AS role,host(inet_server_addr()) AS address,
      inet_server_port() AS port,current_setting('transaction_read_only') AS read_only`)).rows;
    if (identity.length !== 1 || identity[0].database !== 'murmingle_canonical' ||
        identity[0].role !== 'murmingle_app' || identity[0].address !== '127.0.0.1' ||
        Number(identity[0].port) !== 55432 || identity[0].read_only !== 'on')
      throw new Error('Inventory identity mismatch');
    const parameters = ['owner-local-page-embedding/v1', 'crawler-static-html-prefix/v1',
      'e5-small-q8-browser-main-prefix-v1'];
    const predicate = `s.provenance=$1 AND s.extractor_version=$2
      AND e.model_id=$3 AND e.dimensions=384
      AND s.url ~ '^https://(en|de|fr|es)\\.wikipedia\\.org/wiki/[^?#]+$'`;
    if (snapshot) {
      const rows = (await tx.query(`SELECT s.id,s.url,s.title,s.extractor_version,
        e.model_id,e.dimensions,e.values_double
        FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
        WHERE ${predicate} AND s.url=ANY($4::text[]) ORDER BY s.id LIMIT 65`,
      [...parameters, PUBLIC_HIERARCHY_PROBES.map(row => row.url)])).rows;
      if (rows.length > 32 || new Set(rows.map(row => row.url)).size !== rows.length)
        throw new Error('Ambiguous public corpus observations');
      for (const row of rows) {
        if (!Array.isArray(row.values_double) || row.values_double.length !== 384 ||
            row.values_double.some(value => !Number.isFinite(value)) ||
            Math.abs(Math.hypot(...row.values_double) - 1) > 0.00001)
          throw new Error('Invalid public vector');
      }
      return { identity, observations: rows,
        missing: PUBLIC_HIERARCHY_PROBES.filter(probe => !rows.some(row => row.url === probe.url))
          .map(probe => probe.id) };
    }
    const counts = (await tx.query(`SELECT split_part(s.url,'/',3) AS host,
      count(*)::integer AS pages FROM canonical_v4.sources s
      JOIN canonical_v4.embeddings e ON e.source_id=s.id
      WHERE ${predicate} GROUP BY host ORDER BY host`, parameters)).rows;
    const samples = (await tx.query(`SELECT s.url,s.title,split_part(s.url,'/',3) AS host
      FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
      WHERE ${predicate} ORDER BY s.ordinal LIMIT 40`, parameters)).rows;
    return { identity, counts, samples };
  });
  await database.close();
  database = null;
  if (snapshot) {
    const output = JSON.stringify({ schema: 'e5-public-probe-snapshot/v1',
      capturedAt: new Date().toISOString(), construction: 'stored-static-body-embedding-with-title-metadata',
      titleEmbeddingAbsent: true,
      nativeDocumentWitness: false, observations: result.observations, missing: result.missing });
    const target = new URL('../data/hierarchy-public-probes-snapshot-20261026.json', import.meta.url);
    await writeFile(target, output, { flag: 'wx' });
    process.stdout.write(JSON.stringify({ status: 'snapshotted',
      observations: result.observations.length, missing: result.missing,
      bytes: Buffer.byteLength(output), sha256: createHash('sha256').update(output).digest('hex'),
      elapsedMilliseconds: Math.round(performance.now() - started), readOnly: true }) + '\n');
  } else {
  process.stdout.write(JSON.stringify({ schema: 'e5-public-corpus-inventory/v1',
    ...result, elapsedMilliseconds: Math.round(performance.now() - started),
    readOnly: true, vectorExported: false, contributionsRead: false }) + '\n');
  }
} catch (error) {
  // Never print PostgreSQL messages, connection configuration or credentials.
  const code = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)
    ? error.code : null;
  process.stderr.write(JSON.stringify({ status: 'unavailable', sqlState: code }) + '\n');
  process.exitCode = 1;
} finally {
  if (database) {
    try { await database.close(); }
    catch {
      process.stderr.write(JSON.stringify({ status: 'cleanup-unavailable' }) + '\n');
      process.exitCode = 1;
    }
  }
}
