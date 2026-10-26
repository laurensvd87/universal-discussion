// Only the two public Kapsalon URLs explicitly supplied by the owner. Snapshot
// existing body vectors/title metadata; never read discussions or account data.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPgDatabase } from '../portable/src/database.js';
import { createWindowsDpapiPasswordProvider } from '../portable/src/windows-dpapi-password.js';
import { PAGE_CONTENT_EXTRACTOR_VERSIONS } from '../../../spikes/topic-resolution/browser/core/page-content-policy.js';

if (process.argv.length !== 2) throw new Error('Unexpected example arguments');
const urls = ['https://www.leukerecepten.nl/recepten/kapsalon-maken/',
  'https://www.youtube.com/watch?v=rd5EWR83AGs'];
let database;
try {
  const password = await createWindowsDpapiPasswordProvider({ role: 'murmingle_app' })();
  database = await createPgDatabase({ config: { host: '127.0.0.1', port: 55432,
    database: 'murmingle_canonical', user: 'murmingle_app', password, ssl: false,
    max: 1, application_name: 'murmingle-owner-public-examples',
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000 } });
  const rows = await database.transaction(async tx => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await tx.query("SET LOCAL statement_timeout='3000ms'");
    await tx.query("SET LOCAL lock_timeout='250ms'");
    await tx.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
    const identity = (await tx.query(`SELECT current_database() AS database,current_user AS role,
      host(inet_server_addr()) AS address,inet_server_port() AS port,
      current_setting('transaction_read_only') AS read_only`)).rows[0];
    if (identity?.database !== 'murmingle_canonical' || identity.role !== 'murmingle_app' ||
        identity.address !== '127.0.0.1' || Number(identity.port) !== 55432 || identity.read_only !== 'on')
      throw new Error('Example database identity mismatch');
    return (await tx.query(`SELECT s.id,s.url,s.title,s.extractor_version,s.write_version,
      e.model_id,e.dimensions,e.values_double FROM canonical_v4.sources s
      JOIN canonical_v4.embeddings e ON e.source_id=s.id
      WHERE s.url=ANY($1::text[]) AND s.provenance=$2 AND e.model_id=$3
        AND s.extractor_version=ANY($4::text[]) AND e.dimensions=384
      ORDER BY s.id LIMIT 3`, [urls, 'owner-local-page-embedding/v1',
      'e5-small-q8-browser-main-prefix-v1', [...PAGE_CONTENT_EXTRACTOR_VERSIONS, 'crawler-static-html-prefix/v1']])).rows;
  });
  if (rows.length > 2 || new Set(rows.map(row => row.url)).size !== rows.length ||
      rows.some(row => !Array.isArray(row.values_double) || row.values_double.length !== 384 ||
        row.values_double.some(value => !Number.isFinite(value)) ||
        Math.abs(Math.hypot(...row.values_double) - 1) > 0.00001)) throw new Error('Invalid example vectors');
  await database.close(); database = null;
  const bytes = JSON.stringify({ schema: 'owner-public-matching-example-snapshot/v1',
    capturedAt: new Date().toISOString(), construction: 'stored-body-embedding-with-stored-title-metadata',
    titleEmbeddingAbsent: true, freshCapture: false, nativeObservation: false,
    requestedUrls: urls, observations: rows, missingUrls: urls.filter(url => !rows.some(row => row.url === url)) });
  await writeFile(new URL('../data/hierarchy-owner-matching-examples-20261026.json', import.meta.url), bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({ observations: rows.length,
    missing: urls.length - rows.length, sha256: createHash('sha256').update(bytes).digest('hex') }) + '\n');
} catch {
  process.stderr.write('Public owner examples unavailable.\n'); process.exitCode = 1;
} finally {
  if (database) try { await database.close(); } catch { process.stderr.write('Example cleanup unavailable.\n'); process.exitCode = 1; }
}
